/**
 * Runtime configuration utility
 * Provides type-safe access to window.APP_CONFIG with fallbacks
 */

const defaultConfig = {
  defaultService: 'Batch-Sync',
  services: ['Batch-Sync', 'Data-Service'],
  defaultLogLevel: '',
  logsPerPage: 500,
  virtualScroll: {
    estimatedItemHeight: 60,
    bufferSize: 10,
    loadMoreThreshold: 0.2
  },
  websocket: {
    maxReconnectAttempts: 5,
    reconnectDelay: 3000
  },
  alert: {
    newLogHighlightDuration: 3000
  }
}

/**
 * Get configuration value with fallback
 * @param {string} path - Dot-separated path (e.g., 'websocket.reconnectDelay')
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
