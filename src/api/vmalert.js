import axios from 'axios'
import {
  getVmalertApiBasePath,
  getVmalertMaxRetries,
  getVmalertRetryBaseDelay
} from '../utils/config'

/**
 * Retry wrapper with fixed delay
 */
async function retryWithBackoff(fn, maxRetries = null, baseDelay = null) {
  const finalMaxRetries = maxRetries ?? getVmalertMaxRetries()
  const finalBaseDelay = baseDelay ?? getVmalertRetryBaseDelay()

  for (let i = 0; i < finalMaxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      const isTooManyRequests = error.response?.status === 429
      const isServerError = error.response?.status >= 500

      if ((isTooManyRequests || isServerError) && i < finalMaxRetries - 1) {
        const delay = finalBaseDelay
        console.log(`[VMAlert] Request failed, retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        throw error
      }
    }
  }
}

/**
 * Get all alerts from unified /api/v1/alerts/all endpoint
 * This endpoint returns alerts with complete metric labels already included
 * @returns {Promise<Array>} Array of alert objects with rule metadata and metric labels
 */
export async function getAlerts() {
  const apiBasePath = getVmalertApiBasePath()

  const requestFn = async () => {
    const response = await axios.get(`${apiBasePath}/alerts/all`)
    return response
  }

  try {
    const response = await retryWithBackoff(requestFn)

    if (response.data?.status === 'success') {
      const alerts = response.data.data?.alerts || []

      // Enrich alerts: copy top-level 'name' field to Prometheus-conventional label keys
      // VMAlert unified endpoint returns the rule name as top-level `name`.
      // Prometheus/Alertmanager expects it as label `alertname`.
      alerts.forEach(alert => {
        if (!alert || typeof alert !== 'object') return
        if (!alert.labels || typeof alert.labels !== 'object') alert.labels = {}

        if (alert.name) {
          if (!alert.labels.alertname) {
            alert.labels.alertname = alert.name
          }
          // Backward compatibility: some UIs/configs may still group by `name`
          if (!alert.labels.name) {
            alert.labels.name = alert.name
          }
        }
      })

      console.log(`[VMAlert] Fetched ${alerts.length} alerts from unified endpoint`)

      return alerts
    } else {
      console.error('[VMAlert] Invalid response format:', response.data)
      return []
    }
  } catch (error) {
    console.error('[VMAlert] Failed to fetch alerts:', error)
    throw error
  }
}

/**
 * Get values for a specific label
 * @param {string} labelName - Label name to query
 * @param {Object} matchers - Optional label matchers to filter results
 * @returns {Promise<Array<string>>} Array of label values
 */
export async function getLabelValues(labelName, matchers = {}) {
  const apiBasePath = getVmalertApiBasePath()

  const requestFn = async () => {
    const params = {}

    // Add label matchers if provided
    if (Object.keys(matchers).length > 0) {
      const matcherStrings = Object.entries(matchers).map(
        ([key, value]) => `${key}="${value}"`
      )
      params['match[]'] = `{${matcherStrings.join(',')}}`
    }

    const response = await axios.get(
      `${apiBasePath}/label/${labelName}/values`,
      { params }
    )
    return response
  }

  try {
    const response = await retryWithBackoff(requestFn)

    if (response.data?.status === 'success') {
      return response.data.data || []
    } else {
      console.error('[VMAlert] Invalid response format:', response.data)
      return []
    }
  } catch (error) {
    console.error(`[VMAlert] Failed to fetch label values for ${labelName}:`, error)
    throw error
  }
}

/**
 * Query VMAlert for instant vector
 * @param {string} query - PromQL query
 * @param {number} time - Evaluation timestamp (optional)
 * @returns {Promise<Object>} Query result
 */
export async function queryInstant(query, time = null) {
  const apiBasePath = getVmalertApiBasePath()

  const requestFn = async () => {
    const params = { query }
    if (time) {
      params.time = time
    }

    const response = await axios.get(`${apiBasePath}/query`, { params })
    return response
  }

  try {
    const response = await retryWithBackoff(requestFn)

    if (response.data?.status === 'success') {
      return response.data.data
    } else {
      console.error('[VMAlert] Invalid response format:', response.data)
      return null
    }
  } catch (error) {
    console.error('[VMAlert] Failed to execute query:', error)
    throw error
  }
}

/**
 * Build alert matchers from fixed labels and dynamic filters
 * @param {Object} fixedLabels - Fixed labels from config
 * @param {Object} filters - Dynamic filters (e.g., { job: 'api-server' })
 * @returns {Object} Combined matchers
 */
export function buildAlertMatchers(fixedLabels = {}, filters = {}) {
  return { ...fixedLabels, ...filters }
}

/**
 * Filter alerts by label matchers
 * @param {Array} alerts - Array of alert objects
 * @param {Object} matchers - Label matchers
 * @returns {Array} Filtered alerts
 */
export function filterAlerts(alerts, matchers = {}) {
  if (!matchers || Object.keys(matchers).length === 0) {
    return alerts
  }

  return alerts.filter(alert => {
    return Object.entries(matchers).every(([key, value]) => {
      return alert.labels?.[key] === value
    })
  })
}

/**
 * Group alerts by label value
 * @param {Array} alerts - Array of alert objects
 * @param {string} labelName - Label name to group by
 * @param {string} labelSource - Source of label ('alertLabels' | 'metricLabels')
 * @returns {Map<string, Array>} Map of label value to alerts
 */
export function groupAlertsByLabel(alerts, labelName, labelSource = 'alertLabels') {
  const groups = new Map()

  alerts.forEach(alert => {
    let labelValue

    // Determine label source
    if (labelSource === 'metricLabels') {
      // Use metricLabels only, skip if not available
      labelValue = alert.metricLabels?.[labelName]

      // Skip this alert if metricLabels don't have the required label
      if (!labelValue) {
        return
      }
    } else {
      // Use alert labels only
      labelValue = alert.labels?.[labelName]

      // Use 'unknown' for missing alert labels
      if (!labelValue) {
        labelValue = 'unknown'
      }
    }

    if (!groups.has(labelValue)) {
      groups.set(labelValue, [])
    }
    groups.get(labelValue).push(alert)
  })

  return groups
}

/**
 * Get alert state color (for UI display)
 * @param {string} state - Alert state ('firing', 'pending', 'inactive')
 * @returns {string} Color name or hex code
 */
export function getAlertStateColor(state) {
  const colorMap = {
    'firing': '#f56c6c',    // Red (critical)
    'pending': '#e6a23c',   // Yellow (warning)
    'inactive': '#67c23a'   // Green (normal)
  }
  return colorMap[state] || '#909399' // Gray (unknown)
}

/**
 * Get alert state display name
 * @param {string} state - Alert state
 * @returns {string} Display name
 */
export function getAlertStateDisplayName(state) {
  const nameMap = {
    'firing': '告警中',
    'pending': '待触发',
    'inactive': '正常'
  }
  return nameMap[state] || '未知'
}
