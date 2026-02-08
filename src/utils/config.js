/**
 * Runtime configuration utility
 * Provides type-safe access to window.APP_CONFIG with fallbacks
 */

const defaultConfig = {
  pageTitle: '',
  appTitle: '',
  activeService: 'batch-sync',
  // Schedule configuration (theme switching + optional maintenance refresh)
  // Backward-compatible with legacy key: themeSchedule
  schedule: {
    mode: 'auto',
    timeZone: 'Asia/Shanghai',
    dayStart: '08:25',
    nightStart: '16:25',
    // Optional: page auto-refresh time points (HH:MM) to mitigate long-running memory issues
    // Only triggers when there is no global alert overlay.
    autoRefresh: []
  },
  // Global VMLog defaults (can be overridden per-service)
  vmlog: {
    apiBasePath: '/select/logsql',
    api: {
      tailDelayFor: '0',
      maxRetries: 3,
      retryBaseDelay: 1000
    },
    // VictoriaLogs tailing uses streaming HTTP (fetch stream), not WebSocket.
    // `tail.*` controls reconnect and tail polling behavior.
    tail: {
      reconnectDelay: 3000,
      initializationDelay: 2000
    }
  },
  services: [
    {
      id: 'batch-sync',
      displayName: 'Batch-Sync Service',
      type: 'vmlog-multitask',
      vmlog: {
        apiBasePath: '/select/logsql',
        api: {
          tailDelayFor: '0',
          maxRetries: 3,
          retryBaseDelay: 1000
        },
        fixedLabels: {
          job: 'tasks',
          service: 'Batch-Sync'
        },
        taskLabel: 'task_name',
        tail: {
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
 * @param {string} path - Dot-separated path (e.g., 'vmlog.tail.reconnectDelay')
 * @param {*} fallback - Fallback value if path not found
 * @returns {*} Configuration value
 */
export function getConfig(path, fallback) {
  const config = window.APP_CONFIG || defaultConfig

  if (!path) return config

  const direct = tryGetPath(config, path)
  if (direct.found) return direct.value

  const aliasedPath = getAliasedPath(config, path)
  if (aliasedPath) {
    const aliased = tryGetPath(config, aliasedPath)
    if (aliased.found) return aliased.value
  }

  return fallback !== undefined ? fallback : getDefaultValue(path)
}

/**
 * Get default value from default config
 */
function getDefaultValue(path) {
  const direct = tryGetPath(defaultConfig, path)
  if (direct.found) return direct.value

  const aliasedPath = getAliasedPath(defaultConfig, path)
  if (aliasedPath) {
    const aliased = tryGetPath(defaultConfig, aliasedPath)
    if (aliased.found) return aliased.value
  }

  return undefined
}

function tryGetPath(obj, path) {
  if (!obj || !path) return { found: false, value: undefined }
  const keys = String(path).split('.')
  let value = obj

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    } else {
      return { found: false, value: undefined }
    }
  }

  return { found: true, value }
}

function getAliasedPath(obj, path) {
  if (!obj || !path) return null

  const p = String(path)

  // vmlog.websocket <-> vmlog.tail (historical naming; tailing is streaming HTTP)
  if (p.startsWith('vmlog.websocket.')) {
    const current = `vmlog.tail.${p.slice('vmlog.websocket.'.length)}`
    if (hasConfigPath(obj, current)) return current
  }
  if (p.startsWith('vmlog.tail.')) {
    const legacy = `vmlog.websocket.${p.slice('vmlog.tail.'.length)}`
    if (hasConfigPath(obj, legacy)) return legacy
  }

  // vmlog <-> loki
  if (p.startsWith('vmlog.')) {
    const legacy = `loki.${p.slice('vmlog.'.length)}`
    if (hasConfigPath(obj, legacy)) return legacy
  }
  if (p.startsWith('loki.')) {
    const current = `vmlog.${p.slice('loki.'.length)}`
    if (hasConfigPath(obj, current)) return current
  }

  // vmalert <-> prometheus
  if (p.startsWith('vmalert.')) {
    const legacy = `prometheus.${p.slice('vmalert.'.length)}`
    if (hasConfigPath(obj, legacy)) return legacy
  }
  if (p.startsWith('prometheus.')) {
    const current = `vmalert.${p.slice('prometheus.'.length)}`
    if (hasConfigPath(obj, current)) return current
  }

  return null
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
 * @param {string} path - Dot-separated path (e.g., 'vmlog.fixedLabels.service')
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
    const direct = tryGetPath(service, path)
    if (direct.found) return direct.value

    const aliasedPath = getAliasedPath(service, path)
    if (aliasedPath) {
      const aliased = tryGetPath(service, aliasedPath)
      if (aliased.found) return aliased.value
    }

    // Not found in service config, try global config (which also supports aliases)
    return getConfig(path, fallback)
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
 * Check if VMAlert alert.level is explicitly configured and enabled for current service
 * @returns {boolean} True if vmalert.alert.level is configured and non-empty
 */
export function isVmalertAlertLevelEnabled() {
  if (!hasCurrentServiceConfig('vmalert.alert.level') && !hasCurrentServiceConfig('prometheus.alert.level')) return false

  const value = getCurrentServiceConfig('vmalert.alert.level', getCurrentServiceConfig('prometheus.alert.level', null))
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  return value !== null && value !== undefined
}

/**
 * Get VMAlert alert level for current service
 * @returns {string} Alert level value (default: '')
 */
export function getVmalertAlertLevel() {
  return getCurrentServiceConfig('vmalert.alert.level', getCurrentServiceConfig('prometheus.alert.level', ''))
}

// Legacy Prometheus-named wrappers (kept for compatibility)
export function isPrometheusAlertLevelEnabled() {
  return isVmalertAlertLevelEnabled()
}

export function getPrometheusAlertLevel() {
  return getVmalertAlertLevel()
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
 * @returns {string} Service type ('vmlog-multitask' or 'vmalert-multitask')
 */
export function getServiceType(serviceId = null) {
  const id = serviceId || getCurrentServiceId()
  const service = getServiceById(id)
  return service?.type || 'vmlog-multitask' // Default to vmlog-multitask
}

/**
 * Get current service type
 * @returns {string} Service type ('vmlog-multitask' or 'vmalert-multitask')
 */
export function getCurrentServiceType() {
  return getServiceType(getCurrentServiceId())
}

/**
 * Check if current service is VMLog type
 * @returns {boolean} True if current service is vmlog-multitask
 */
export function isVmlogService() {
  const t = getCurrentServiceType()
  return t === 'vmlog-multitask' || t === 'loki-multitask'
}

/**
 * Check if current service is VMAlert type
 * @returns {boolean} True if current service is vmalert-multitask
 */
export function isVmalertService() {
  const t = getCurrentServiceType()
  return t === 'vmalert-multitask' || t === 'prometheus-multitask'
}

// Backward-compatible aliases
export function isLokiService() {
  return isVmlogService()
}

export function isPrometheusService() {
  return isVmalertService()
}

// ============================================================
// VMAlert Configuration Helpers (preferred)
// ============================================================

export function getVmalertApiBasePath() {
  // Default points to VMAlert's unified alert API base. Override per service in public/config.js.
  return getCurrentServiceConfig('vmalert.apiBasePath', getCurrentServiceConfig('prometheus.apiBasePath', '/api/v1'))
}

export function getVmalertTaskLabel() {
  return getCurrentServiceConfig('vmalert.taskLabel', getCurrentServiceConfig('prometheus.taskLabel', 'job'))
}

export function getVmalertFixedLabels() {
  return getCurrentServiceConfig('vmalert.fixedLabels', getCurrentServiceConfig('prometheus.fixedLabels', {}))
}

export function getVmalertColumns() {
  return getCurrentServiceConfig('vmalert.columns', getCurrentServiceConfig('prometheus.columns', []))
}

export function getVmalertPollingInterval() {
  const value = getCurrentServiceConfig('polling.interval', null)
  if (value !== null && value !== undefined) {
    return value
  }
  return getCurrentServiceConfig('vmalert.polling.interval', getCurrentServiceConfig('prometheus.polling.interval', 5000))
}

export function getVmalertMaxRetries() {
  return getCurrentServiceConfig('vmalert.maxRetries', getCurrentServiceConfig('prometheus.maxRetries', 3))
}

export function getVmalertRetryBaseDelay() {
  return getCurrentServiceConfig('vmalert.retryBaseDelay', getCurrentServiceConfig('prometheus.retryBaseDelay', 1000))
}

// Legacy Prometheus helpers (kept for compatibility)
export function getPrometheusApiBasePath() {
  return getVmalertApiBasePath()
}

export function getPrometheusTaskLabel() {
  return getVmalertTaskLabel()
}

export function getPrometheusFixedLabels() {
  return getVmalertFixedLabels()
}

export function getPrometheusColumns() {
  return getVmalertColumns()
}

export function getPrometheusPollingInterval() {
  return getVmalertPollingInterval()
}

export function getPrometheusMaxRetries() {
  return getVmalertMaxRetries()
}

export function getPrometheusRetryBaseDelay() {
  return getVmalertRetryBaseDelay()
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

  return getCurrentServiceConfig(
    'vmalert.alertmanagerBasePath',
    getCurrentServiceConfig('prometheus.alertmanagerBasePath', '/alertmanager/api/v2')
  )
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

  const legacyReceivers = normalize(
    getCurrentServiceConfig(
      'vmalert.alertmanagerReceivers',
      getCurrentServiceConfig('prometheus.alertmanagerReceivers', null)
    )
  )
  if (legacyReceivers.length > 0) {
    return legacyReceivers
  }

  return normalize(
    getCurrentServiceConfig(
      'vmalert.alertmanagerReceiver',
      getCurrentServiceConfig('prometheus.alertmanagerReceiver', null)
    )
  )
}

/**
 * Check if DeadManSwitch is enabled for current service
 * DeadManSwitch is enabled if alertName is configured (not empty)
 * @returns {boolean} True if DeadManSwitch is enabled
 */
export function isDeadManSwitchEnabled() {
  const alertName = getCurrentServiceConfig(
    'vmalert.deadManSwitch.alertName',
    getCurrentServiceConfig('prometheus.deadManSwitch.alertName', '')
  )
  return alertName !== null && alertName !== undefined && alertName.trim() !== ''
}

/**
 * Get DeadManSwitch alert name for current service
 * @returns {string} DeadManSwitch alert name (default: '')
 */
export function getDeadManSwitchAlertName() {
  return getCurrentServiceConfig(
    'vmalert.deadManSwitch.alertName',
    getCurrentServiceConfig('prometheus.deadManSwitch.alertName', '')
  )
}

/**
 * Get VMAlert severity levels configuration for current service
 * @returns {Array<string>} Severity levels order (default: ['critical', 'warning', 'info'])
 */
export function getVmalertSeverityLevels() {
  return getCurrentServiceConfig(
    'vmalert.severityLevels',
    getCurrentServiceConfig('prometheus.severityLevels', ['critical', 'warning', 'info'])
  )
}

/**
 * Get VMAlert severity label name for current service
 * @returns {string} Severity label name (default: 'severity')
 */
export function getVmalertSeverityLabel() {
  return getCurrentServiceConfig(
    'vmalert.severityLabel',
    getCurrentServiceConfig('prometheus.severityLabel', 'severity')
  )
}

// Legacy Prometheus-named wrappers (kept for compatibility)
export function getPrometheusSeverityLevels() {
  return getVmalertSeverityLevels()
}

export function getPrometheusSeverityLabel() {
  return getVmalertSeverityLabel()
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
  return getCurrentServiceConfig(
    'vmalert.alertmanagerAlertMuteMinutes',
    getCurrentServiceConfig('prometheus.alertmanagerAlertMuteMinutes', 10)
  )
}
