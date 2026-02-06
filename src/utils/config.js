/**
 * Runtime configuration utility
 * Provides type-safe access to window.APP_CONFIG with fallbacks
 */

const defaultConfig = {
  pageTitle: '',
  activeService: 'batch-sync',
  services: [
    {
      id: 'batch-sync',
      displayName: 'Batch-Sync Service',
      loki: {
        apiBasePath: '/loki/api/v1',
        api: {
          tailLimit: 100,
          tailDelayFor: '0',
          maxRetries: 3,
          retryBaseDelay: 1000
        },
        fixedLabels: {
          job: 'tasks',
          service: 'Batch-Sync'
        },
        taskLabel: 'task_name',
        websocket: {
          reconnectDelay: 3000,
          initializationDelay: 2000
        }
      },
      defaultLogLevel: '',
      logsPerPage: 500,
      alert: {
        level: 'ERROR',
        newLogHighlightDuration: 3000
      },
      query: {
        defaultTimeRangeDays: 7
      },
      logLevels: ['ERROR', 'WARN', 'INFO', 'DEBUG']
    },
    {
      id: 'data-service',
      displayName: 'Data Service',
      loki: {
        apiBasePath: '/loki/api/v1',
        api: {
          tailLimit: 100,
          tailDelayFor: '0',
          maxRetries: 3,
          retryBaseDelay: 1000
        },
        fixedLabels: {
          job: 'api',
          service: 'Data-Service'
        },
        taskLabel: 'endpoint',
        websocket: {
          reconnectDelay: 3000,
          initializationDelay: 2000
        }
      },
      defaultLogLevel: 'WARN',
      logsPerPage: 1000,
      alert: {
        level: 'ERROR',
        newLogHighlightDuration: 3000
      },
      query: {
        defaultTimeRangeDays: 7
      }
    }
  ],
  virtualScroll: {
    estimatedItemHeight: 60,
    bufferSize: 10,
    loadMoreThreshold: 0.2
  }
}

/**
 * Get configuration value with fallback
 * @param {string} path - Dot-separated path (e.g., 'loki.websocket.reconnectDelay')
 * @param {*} fallback - Fallback value if path not found
 * @returns {*} Configuration value
 */
export function getConfig(path, fallback) {
  const config = window.APP_CONFIG || defaultConfig

  if (!path) return config

  const keys = path.split('.')
  let value = config

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    } else {
      return fallback !== undefined ? fallback : getDefaultValue(path)
    }
  }

  return value
}

/**
 * Get default value from default config
 */
function getDefaultValue(path) {
  const keys = path.split('.')
  let value = defaultConfig

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    } else {
      return undefined
    }
  }

  return value
}

/**
 * Current service ID getter (can be set by serviceStore for dynamic service switching)
 */
let currentServiceIdGetter = null

/**
 * Set the current service ID getter function
 * This allows serviceStore to control which service is currently active
 * @param {Function} getter - Function that returns current service ID
 */
export function setCurrentServiceIdGetter(getter) {
  currentServiceIdGetter = getter
}

/**
 * Get all services
 * @returns {Array} Array of service configurations
 */
export function getServices() {
  const config = window.APP_CONFIG || defaultConfig
  const services = config.services || []

  // Debug: log what we found
  if (services.length === 0 && window.APP_CONFIG) {
    console.error('[Config] getServices() found 0 services!')
    console.error('[Config] window.APP_CONFIG:', window.APP_CONFIG)
    console.error('[Config] window.APP_CONFIG.services:', window.APP_CONFIG.services)
    console.error('[Config] config.services:', config.services)
  }

  return services
}

/**
 * Get current active service ID
 * Uses dynamic getter if set (by serviceStore), otherwise reads from config
 * @returns {string} Active service ID
 */
export function getCurrentServiceId() {
  // Use dynamic getter if available (set by serviceStore)
  if (currentServiceIdGetter) {
    return currentServiceIdGetter()
  }

  const config = window.APP_CONFIG || defaultConfig
  const activeService = config.activeService

  // Validate activeService exists in services array
  const services = config.services || []

  // Check for empty services array
  if (services.length === 0) {
    console.error('[Config] No services configured! Please check your configuration.')
    return null
  }

  if (activeService && services.some(s => s.id === activeService)) {
    return activeService
  }

  // Fallback to first service
  const firstServiceId = services[0]?.id
  if (firstServiceId) {
    console.warn(`[Config] Active service "${activeService}" not found, using first service: ${firstServiceId}`)
  }
  return firstServiceId || null
}

/**
 * Get service configuration by ID
 * @param {string} serviceId - Service ID
 * @returns {object|null} Service configuration or null if not found
 */
export function getServiceById(serviceId) {
  const services = getServices()
  return services.find(s => s.id === serviceId) || null
}

/**
 * Get configuration value for a specific service
 * Merges service-specific config with global config (service config takes precedence)
 * @param {string} serviceId - Service ID
 * @param {string} path - Dot-separated path (e.g., 'loki.fixedLabels.service')
 * @param {*} fallback - Fallback value if path not found
 * @returns {*} Configuration value
 */
export function getServiceConfig(serviceId, path, fallback) {
  const service = getServiceById(serviceId)
  if (!service) {
    return fallback !== undefined ? fallback : getDefaultValue(path)
  }

  // Try to get value from service-specific config first
  if (path) {
    const keys = path.split('.')
    let value = service

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key]
      } else {
        // Not found in service config, try global config
        return getConfig(path, fallback)
      }
    }

    return value
  }

  return service
}

/**
 * Get configuration value for current active service
 * @param {string} path - Dot-separated path
 * @param {*} fallback - Fallback value if path not found
 * @returns {*} Configuration value
 */
export function getCurrentServiceConfig(path, fallback) {
  const serviceId = getCurrentServiceId()
  return getServiceConfig(serviceId, path, fallback)
}

function hasConfigPath(target, path) {
  if (!target || !path) return false
  const keys = path.split('.')
  let value = target

  for (const key of keys) {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)) {
      value = value[key]
    } else {
      return false
    }
  }

  return true
}

/**
 * Check whether the current service has a config path explicitly defined
 * (only considers window.APP_CONFIG, does not fall back to default config)
 * @param {string} path - Dot-separated path
 * @returns {boolean} True if path exists on current service config
 */
export function hasCurrentServiceConfig(path) {
  if (!path) return false
  const config = window.APP_CONFIG
  if (!config || !Array.isArray(config.services)) return false

  const serviceId = getCurrentServiceId()
  const service = config.services.find(s => s.id === serviceId)
  if (!service) return false

  return hasConfigPath(service, path)
}

/**
 * Check if alert.level is explicitly configured and enabled for current service
 * @returns {boolean} True if alert.level is configured and non-empty
 */
export function isAlertLevelEnabled() {
  if (!hasCurrentServiceConfig('alert.level')) return false
  const value = getCurrentServiceConfig('alert.level', null)
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  return value !== null && value !== undefined
}

/**
 * Get alert mute duration in minutes for current service
 * @returns {number} Mute duration in minutes (default: 0)
 */
export function getAlertMuteMinutes() {
  return getCurrentServiceConfig('alert.alertMuteMinutes', 0)
}

/**
 * Check if Prometheus alert.level is explicitly configured and enabled for current service
 * @returns {boolean} True if prometheus.alert.level is configured and non-empty
 */
export function isPrometheusAlertLevelEnabled() {
  if (!hasCurrentServiceConfig('prometheus.alert.level')) return false
  const value = getCurrentServiceConfig('prometheus.alert.level', null)
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  return value !== null && value !== undefined
}

/**
 * Get Prometheus alert level for current service
 * @returns {string} Alert level value (default: '')
 */
export function getPrometheusAlertLevel() {
  return getCurrentServiceConfig('prometheus.alert.level', '')
}

/**
 * Get log level order for current service
 * @returns {Array<string>} Log level order (e.g., ['ERROR', 'WARN', 'INFO', 'DEBUG'])
 */
const DEFAULT_LOG_LEVEL_ORDER = ['ERROR', 'WARN', 'INFO', 'DEBUG']

function buildLogLevelMappingFromOrder(order) {
  const normalizedOrder = Array.isArray(order) && order.length > 0
    ? order
    : DEFAULT_LOG_LEVEL_ORDER

  const mapping = {}
  for (let i = 0; i < normalizedOrder.length; i++) {
    const level = normalizedOrder[i]
    mapping[level] = normalizedOrder.slice(0, i + 1)
  }
  return mapping
}

export function getLogLevelOrder() {
  const logLevels = getCurrentServiceConfig('logLevels', null)
  if (Array.isArray(logLevels)) {
    return logLevels
  }
  if (logLevels && Array.isArray(logLevels.order)) {
    return logLevels.order
  }
  return getCurrentServiceConfig('logLevels.order', DEFAULT_LOG_LEVEL_ORDER)
}

/**
 * Get log level mapping for current service
 * @returns {Object} Log level mapping (e.g., { 'ERROR': ['ERROR'], 'WARN': ['ERROR', 'WARN'], ... })
 */
export function getLogLevelMapping() {
  const logLevels = getCurrentServiceConfig('logLevels', null)
  if (logLevels && !Array.isArray(logLevels) && logLevels.mapping) {
    return logLevels.mapping
  }

  const mapping = getCurrentServiceConfig('logLevels.mapping', null)
  if (mapping) {
    return mapping
  }

  return buildLogLevelMappingFromOrder(getLogLevelOrder())
}

/**
 * Get log level regex pattern for LogQL query
 * @param {string} level - Log level
 * @returns {string} Regex pattern for LogQL (e.g., 'ERROR|WARN|INFO')
 */
export function getLogLevelRegex(level) {
  const mapping = getLogLevelMapping()
  const levels = mapping[level] || [level]
  return levels.join('|')
}

/**
 * Get service type
 * @param {string} serviceId - Service ID (optional, defaults to current service)
 * @returns {string} Service type ('loki-multitask' or 'prometheus-multitask')
 */
export function getServiceType(serviceId = null) {
  const id = serviceId || getCurrentServiceId()
  const service = getServiceById(id)
  return service?.type || 'loki-multitask' // Default to loki-multitask for backward compatibility
}

/**
 * Get current service type
 * @returns {string} Service type ('loki-multitask' or 'prometheus-multitask')
 */
export function getCurrentServiceType() {
  return getServiceType(getCurrentServiceId())
}

/**
 * Check if current service is Loki type
 * @returns {boolean} True if current service is loki-multitask
 */
export function isLokiService() {
  return getCurrentServiceType() === 'loki-multitask'
}

/**
 * Check if current service is Prometheus type
 * @returns {boolean} True if current service is prometheus-multitask
 */
export function isPrometheusService() {
  return getCurrentServiceType() === 'prometheus-multitask'
}

/**
 * Check if service is external link type
 * @param {string} serviceId - Service ID (optional, defaults to current service)
 * @returns {boolean} True if service is external-link
 */
export function isExternalLinkService(serviceId = null) {
  const id = serviceId || getCurrentServiceId()
  const type = getServiceType(id)
  return type === 'external-link'
}

/**
 * Get external URL for a service
 * @param {string} serviceId - Service ID
 * @returns {string|null} External URL or null if not an external link service
 */
export function getExternalUrl(serviceId) {
  const service = getServiceById(serviceId)
  if (!service || service.type !== 'external-link') {
    return null
  }
  return service.externalUrl || null
}

// ============================================================
// Prometheus Configuration Helpers
// ============================================================

/**
 * Get Prometheus API base path for current service
 * @returns {string} Prometheus API base path (default: '/prometheus/api/v1')
 */
export function getPrometheusApiBasePath() {
  return getCurrentServiceConfig('prometheus.apiBasePath', '/prometheus/api/v1')
}

/**
 * Get Alertmanager API base path for current service
 * @returns {string} Alertmanager API base path (default: '/alertmanager/api/v2')
 */
export function getAlertmanagerApiBasePath() {
  const basePath = getCurrentServiceConfig('alertmanager.basePath', null)
  if (basePath !== null && basePath !== undefined) {
    if (typeof basePath === 'string') {
      const trimmed = basePath.trim()
      if (trimmed) {
        return trimmed
      }
    } else {
      return basePath
    }
  }

  return getCurrentServiceConfig('prometheus.alertmanagerBasePath', '/alertmanager/api/v2')
}

/**
 * Get Alertmanager receiver names for current service
 * @returns {Array<string>} Receiver names (default: [])
 */
export function getAlertmanagerReceivers() {
  const receiverConfig = getCurrentServiceConfig('alertmanager.receiver', null)
  const receiversConfig = getCurrentServiceConfig('alertmanager.receivers', null)

  const normalize = (value) => {
    if (Array.isArray(value)) {
      return value.map(item => String(item).trim()).filter(Boolean)
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed ? [trimmed] : []
    }
    return []
  }

  const receivers = normalize(receiversConfig)
  if (receivers.length > 0) {
    return receivers
  }

  const receiver = normalize(receiverConfig)
  if (receiver.length > 0) {
    return receiver
  }

  const legacyReceivers = normalize(getCurrentServiceConfig('prometheus.alertmanagerReceivers', null))
  if (legacyReceivers.length > 0) {
    return legacyReceivers
  }

  return normalize(getCurrentServiceConfig('prometheus.alertmanagerReceiver', null))
}

/**
 * Get Prometheus task label for current service
 * @returns {string} Task label (default: 'job')
 */
export function getPrometheusTaskLabel() {
  return getCurrentServiceConfig('prometheus.taskLabel', 'job')
}

/**
 * Get Prometheus fixed labels for current service
 * @returns {Object} Fixed labels for filtering (default: {})
 */
export function getPrometheusFixedLabels() {
  return getCurrentServiceConfig('prometheus.fixedLabels', {})
}

/**
 * Get Prometheus column configurations for current service
 * @returns {Array} Column configurations (default: [])
 */
export function getPrometheusColumns() {
  return getCurrentServiceConfig('prometheus.columns', [])
}

/**
 * Get Prometheus polling interval for current service
 * @returns {number} Polling interval in milliseconds (default: 5000)
 */
export function getPrometheusPollingInterval() {
  const value = getCurrentServiceConfig('polling.interval', null)
  if (value !== null && value !== undefined) {
    return value
  }
  return getCurrentServiceConfig('prometheus.polling.interval', 5000)
}

/**
 * Get Prometheus max retries for current service
 * @returns {number} Max retries (default: 3)
 */
export function getPrometheusMaxRetries() {
  return getCurrentServiceConfig('prometheus.maxRetries', 3)
}

/**
 * Get Prometheus retry base delay for current service
 * @returns {number} Retry base delay in milliseconds (default: 1000)
 */
export function getPrometheusRetryBaseDelay() {
  return getCurrentServiceConfig('prometheus.retryBaseDelay', 1000)
}

/**
 * Check if DeadManSwitch is enabled for current service
 * DeadManSwitch is enabled if alertName is configured (not empty)
 * @returns {boolean} True if DeadManSwitch is enabled
 */
export function isDeadManSwitchEnabled() {
  const alertName = getCurrentServiceConfig('prometheus.deadManSwitch.alertName', '')
  return alertName !== null && alertName !== undefined && alertName.trim() !== ''
}

/**
 * Get DeadManSwitch alert name for current service
 * @returns {string} DeadManSwitch alert name (default: '')
 */
export function getDeadManSwitchAlertName() {
  return getCurrentServiceConfig('prometheus.deadManSwitch.alertName', '')
}

/**
 * Get Prometheus severity levels configuration for current service
 * @returns {Array<string>} Severity levels order (default: ['critical', 'warning', 'info'])
 */
export function getPrometheusSeverityLevels() {
  return getCurrentServiceConfig('prometheus.severityLevels', ['critical', 'warning', 'info'])
}

/**
 * Get Prometheus severity label name for current service
 * @returns {string} Severity label name (default: 'severity')
 */
export function getPrometheusSeverityLabel() {
  return getCurrentServiceConfig('prometheus.severityLabel', 'severity')
}

/**
 * Get Alertmanager global alert mute duration in minutes
 * @returns {number} Mute duration in minutes (default: 10)
 */
export function getAlertmanagerAlertMuteMinutes() {
  const value = getCurrentServiceConfig('alertmanager.alertMuteMinutes', null)
  if (value !== null && value !== undefined) {
    return value
  }
  return getCurrentServiceConfig('prometheus.alertmanagerAlertMuteMinutes', 10)
}
