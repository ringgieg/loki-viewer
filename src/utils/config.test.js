import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getConfig,
  getServices,
  getCurrentServiceId,
  getServiceById,
  getCurrentServiceConfig,
  getServiceConfig,
  setCurrentServiceIdGetter
} from './config.js'

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
        pageTitle: 'Test Service',
        logsPerPage: 1000
      }

      const config = getConfig()
      expect(config).toEqual({
        pageTitle: 'Test Service',
        logsPerPage: 1000
      })
    })

    it('should return top-level config value', () => {
      window.APP_CONFIG = {
        pageTitle: 'My Log Viewer',
        logsPerPage: 500
      }

      expect(getConfig('pageTitle')).toBe('My Log Viewer')
      expect(getConfig('logsPerPage')).toBe(500)
    })

    it('should return nested config value using dot notation', () => {
      window.APP_CONFIG = {
        vmlog: {
          websocket: {
            reconnectDelay: 3000
          }
        }
      }

      expect(getConfig('vmlog.websocket.reconnectDelay')).toBe(3000)
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
        pageTitle: 'Batch-Sync'
      }

      expect(getConfig('nonexistent', 'fallback')).toBe('fallback')
      expect(getConfig('nested.nonexistent', 'fallback')).toBe('fallback')
    })

    it('should return default config value when window.APP_CONFIG is undefined', () => {
      window.APP_CONFIG = undefined

      // Test global config values
      expect(getConfig('virtualScroll.estimatedItemHeight')).toBe(60)
      expect(getConfig('virtualScroll.bufferSize')).toBe(10)
      // Test that services array exists in default config
      expect(getConfig('services')).toBeDefined()
      expect(getConfig('services').length).toBeGreaterThan(0)
    })

    it('should prioritize window.APP_CONFIG over default config', () => {
      window.APP_CONFIG = {
        pageTitle: 'Custom Service',
        logsPerPage: 1000
      }

      expect(getConfig('pageTitle')).toBe('Custom Service')
      expect(getConfig('logsPerPage')).toBe(1000)
    })

    it('should handle missing intermediate keys gracefully', () => {
      window.APP_CONFIG = {
        pageTitle: 'Batch-Sync'
      }

      expect(getConfig('vmlog.websocket.reconnectDelay', 3000)).toBe(3000)
    })

    it('should return undefined when no fallback provided for missing key', () => {
      window.APP_CONFIG = {
        pageTitle: 'Batch-Sync'
      }

      expect(getConfig('nonexistent')).toBeUndefined()
    })

    it('should return null when config value is explicitly null', () => {
      window.APP_CONFIG = {
        pageTitle: null
      }

      // null is a valid config value, different from "not set"
      expect(getConfig('pageTitle', 'fallback')).toBe(null)
    })

    it('should support new config structure', () => {
      window.APP_CONFIG = {
        pageTitle: 'My Log Viewer',
        virtualScroll: {
          estimatedItemHeight: 80
        }
      }

      expect(getConfig('pageTitle')).toBe('My Log Viewer')
      expect(getConfig('virtualScroll.estimatedItemHeight')).toBe(80)
    })
  })

  describe('Service management', () => {
    beforeEach(() => {
      // Reset service ID getter
      setCurrentServiceIdGetter(null)
    })

    it('should return configured services', () => {
      window.APP_CONFIG = {
        services: [
          {
            id: 'batch-sync',
            displayName: 'Batch-Sync Service',
            vmlog: {
              fixedLabels: { service: 'Batch-Sync' }
            }
          },
          {
            id: 'data-service',
            displayName: 'Data Service',
            vmlog: {
              fixedLabels: { service: 'Data-Service' }
            }
          }
        ]
      }

      const services = getServices()
      expect(services).toHaveLength(2)
      expect(services[0].id).toBe('batch-sync')
      expect(services[1].id).toBe('data-service')
    })

    it('should get current service ID from config', () => {
      window.APP_CONFIG = {
        activeService: 'data-service',
        services: [
          { id: 'batch-sync', displayName: 'Batch-Sync' },
          { id: 'data-service', displayName: 'Data Service' }
        ]
      }

      expect(getCurrentServiceId()).toBe('data-service')
    })

    it('should fallback to first service if activeService not set', () => {
      window.APP_CONFIG = {
        services: [
          { id: 'batch-sync', displayName: 'Batch-Sync' },
          { id: 'data-service', displayName: 'Data Service' }
        ]
      }

      expect(getCurrentServiceId()).toBe('batch-sync')
    })

    it('should use dynamic service ID getter if set', () => {
      window.APP_CONFIG = {
        activeService: 'batch-sync',
        services: [
          { id: 'batch-sync', displayName: 'Batch-Sync' },
          { id: 'data-service', displayName: 'Data Service' }
        ]
      }

      setCurrentServiceIdGetter(() => 'data-service')
      expect(getCurrentServiceId()).toBe('data-service')
    })

    it('should get service by ID', () => {
      window.APP_CONFIG = {
        services: [
          {
            id: 'batch-sync',
            displayName: 'Batch-Sync Service',
            vmlog: {
              fixedLabels: { service: 'Batch-Sync' }
            }
          },
          {
            id: 'data-service',
            displayName: 'Data Service',
            vmlog: {
              fixedLabels: { service: 'Data-Service' }
            }
          }
        ]
      }

      const service = getServiceById('data-service')
      expect(service).toBeDefined()
      expect(service.displayName).toBe('Data Service')
      expect(service.vmlog.fixedLabels.service).toBe('Data-Service')
    })

    it('should return null for non-existent service ID', () => {
      window.APP_CONFIG = {
        services: [
          { id: 'batch-sync', displayName: 'Batch-Sync' }
        ]
      }

      const service = getServiceById('non-existent')
      expect(service).toBeNull()
    })

    it('should get service config by ID', () => {
      window.APP_CONFIG = {
        services: [
          {
            id: 'batch-sync',
            displayName: 'Batch-Sync Service',
            vmlog: {
              fixedLabels: { service: 'Batch-Sync', job: 'tasks' },
              taskLabel: 'task_name'
            },
            logsPerPage: 500
          },
          {
            id: 'data-service',
            displayName: 'Data Service',
            vmlog: {
              fixedLabels: { service: 'Data-Service', job: 'api' },
              taskLabel: 'endpoint'
            },
            logsPerPage: 1000
          }
        ]
      }

      expect(getServiceConfig('data-service', 'vmlog.fixedLabels.service')).toBe('Data-Service')
      expect(getServiceConfig('data-service', 'vmlog.taskLabel')).toBe('endpoint')
      expect(getServiceConfig('data-service', 'logsPerPage')).toBe(1000)
    })

    it('should fallback to global config if not in service config', () => {
      window.APP_CONFIG = {
        logsPerPage: 500,
        vmlog: {
          apiBasePath: '/select/logsql'
        },
        services: [
          {
            id: 'batch-sync',
            displayName: 'Batch-Sync Service',
            vmlog: {
              fixedLabels: { service: 'Batch-Sync' }
            }
          }
        ]
      }

      expect(getServiceConfig('batch-sync', 'vmlog.apiBasePath')).toBe('/select/logsql')
      expect(getServiceConfig('batch-sync', 'logsPerPage')).toBe(500)
    })

    it('should get current service config', () => {
      window.APP_CONFIG = {
        activeService: 'data-service',
        services: [
          {
            id: 'batch-sync',
            displayName: 'Batch-Sync Service',
            vmlog: {
              fixedLabels: { service: 'Batch-Sync' }
            }
          },
          {
            id: 'data-service',
            displayName: 'Data Service',
            vmlog: {
              fixedLabels: { service: 'Data-Service' },
              taskLabel: 'endpoint'
            }
          }
        ]
      }

      expect(getCurrentServiceConfig('vmlog.fixedLabels.service')).toBe('Data-Service')
      expect(getCurrentServiceConfig('vmlog.taskLabel')).toBe('endpoint')
    })

    it('should use dynamic service ID in getCurrentServiceConfig', () => {
      window.APP_CONFIG = {
        activeService: 'batch-sync',
        services: [
          {
            id: 'batch-sync',
            displayName: 'Batch-Sync Service',
            vmlog: {
              fixedLabels: { service: 'Batch-Sync' }
            }
          },
          {
            id: 'data-service',
            displayName: 'Data Service',
            vmlog: {
              fixedLabels: { service: 'Data-Service' }
            }
          }
        ]
      }

      setCurrentServiceIdGetter(() => 'data-service')
      expect(getCurrentServiceConfig('vmlog.fixedLabels.service')).toBe('Data-Service')
    })
  })
})
