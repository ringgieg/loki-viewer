import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getConfig } from './config.js'

describe('config.js', () => {
  let originalConfig

  beforeEach(() => {
    // Save original config
    originalConfig = window.APP_CONFIG
  })

  afterEach(() => {
    // Restore original config
    window.APP_CONFIG = originalConfig
  })

  describe('getConfig()', () => {
    it('should return entire config when path is empty', () => {
      window.APP_CONFIG = {
        defaultService: 'Test-Service',
        logsPerPage: 1000
      }

      const config = getConfig()
      expect(config).toEqual({
        defaultService: 'Test-Service',
        logsPerPage: 1000
      })
    })

    it('should return top-level config value', () => {
      window.APP_CONFIG = {
        defaultService: 'Batch-Sync',
        logsPerPage: 500
      }

      expect(getConfig('defaultService')).toBe('Batch-Sync')
      expect(getConfig('logsPerPage')).toBe(500)
    })

    it('should return nested config value using dot notation', () => {
      window.APP_CONFIG = {
        websocket: {
          maxReconnectAttempts: 5,
          reconnectDelay: 3000
        }
      }

      expect(getConfig('websocket.maxReconnectAttempts')).toBe(5)
      expect(getConfig('websocket.reconnectDelay')).toBe(3000)
    })

    it('should return deeply nested config value', () => {
      window.APP_CONFIG = {
        virtualScroll: {
          estimatedItemHeight: 60,
          bufferSize: 10,
          loadMoreThreshold: 0.2
        }
      }

      expect(getConfig('virtualScroll.loadMoreThreshold')).toBe(0.2)
    })

    it('should return fallback value when path does not exist', () => {
      window.APP_CONFIG = {
        defaultService: 'Batch-Sync'
      }

      expect(getConfig('nonexistent', 'fallback')).toBe('fallback')
      expect(getConfig('nested.nonexistent', 'fallback')).toBe('fallback')
    })

    it('should return default config value when window.APP_CONFIG is undefined', () => {
      window.APP_CONFIG = undefined

      expect(getConfig('defaultService')).toBe('Batch-Sync')
      expect(getConfig('logsPerPage')).toBe(500)
      expect(getConfig('websocket.maxReconnectAttempts')).toBe(5)
    })

    it('should prioritize window.APP_CONFIG over default config', () => {
      window.APP_CONFIG = {
        defaultService: 'Custom-Service',
        logsPerPage: 1000
      }

      expect(getConfig('defaultService')).toBe('Custom-Service')
      expect(getConfig('logsPerPage')).toBe(1000)
    })

    it('should handle missing intermediate keys gracefully', () => {
      window.APP_CONFIG = {
        defaultService: 'Batch-Sync'
      }

      expect(getConfig('websocket.maxReconnectAttempts', 10)).toBe(10)
    })

    it('should return undefined when no fallback provided for missing key', () => {
      window.APP_CONFIG = {
        defaultService: 'Batch-Sync'
      }

      expect(getConfig('nonexistent')).toBeUndefined()
    })

    it('should return null when config value is explicitly null', () => {
      window.APP_CONFIG = {
        defaultService: null
      }

      // null is a valid config value, different from "not set"
      expect(getConfig('defaultService', 'fallback')).toBe(null)
    })
  })
})
