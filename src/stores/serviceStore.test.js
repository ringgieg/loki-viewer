import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useServiceStore } from './serviceStore'

// Mock config utility
vi.mock('../utils/config', () => ({
  getServices: vi.fn(() => [
    {
      id: 'batch-sync',
      displayName: 'Batch-Sync Service',
      type: 'vmlog-multitask'
    },
    {
      id: 'data-service',
      displayName: 'Data Service',
      type: 'vmlog-multitask'
    },
    {
      id: 'vmalert-alerts',
      displayName: 'VMAlert Alerts',
      type: 'vmalert-multitask'
    }
  ]),
  getCurrentServiceId: vi.fn(() => 'batch-sync'),
  getServiceById: vi.fn((id) => {
    const services = [
      { id: 'batch-sync', displayName: 'Batch-Sync Service', type: 'vmlog-multitask' },
      { id: 'data-service', displayName: 'Data Service', type: 'vmlog-multitask' },
      { id: 'vmalert-alerts', displayName: 'VMAlert Alerts', type: 'vmalert-multitask' }
    ]
    return services.find(s => s.id === id)
  }),
  setCurrentServiceIdGetter: vi.fn()
}))

describe('serviceStore', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useServiceStore()
  })

  describe('initialization', () => {
    it('should initialize with null currentServiceId', () => {
      expect(store.currentServiceId).toBeNull()
    })

    it('should set currentServiceId after initialize()', () => {
      store.initialize()
      expect(store.currentServiceId).toBe('batch-sync')
    })

    it('should load all services from config', () => {
      store.initialize()
      expect(store.services).toHaveLength(3)
      expect(store.services[0].id).toBe('batch-sync')
      expect(store.services[1].id).toBe('data-service')
      expect(store.services[2].id).toBe('vmalert-alerts')
    })
  })

  describe('setCurrentService()', () => {
    beforeEach(() => {
      store.initialize()
    })

    it('should switch to a valid service', () => {
      const result = store.setCurrentService('data-service')

      expect(result).toBe(true)
      expect(store.currentServiceId).toBe('data-service')
      expect(store.getCurrentServiceId()).toBe('data-service')
    })

    it('should return false for invalid service ID', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = store.setCurrentService('invalid-service')

      expect(result).toBe(false)
      expect(store.currentServiceId).toBe('batch-sync') // Should not change
      expect(consoleWarn).toHaveBeenCalledWith('Service invalid-service not found')

      consoleWarn.mockRestore()
    })

    it('should switch between vmlog and vmalert services', () => {
      // Switch to vmalert
      store.setCurrentService('vmalert-alerts')
      expect(store.currentServiceId).toBe('vmalert-alerts')
      expect(store.currentService.type).toBe('vmalert-multitask')

      // Switch back to vmlog
      store.setCurrentService('data-service')
      expect(store.currentServiceId).toBe('data-service')
      expect(store.currentService.type).toBe('vmlog-multitask')
    })
  })

  describe('currentService computed', () => {
    beforeEach(() => {
      store.initialize()
    })

    it('should return current service object', () => {
      expect(store.currentService).toEqual({
        id: 'batch-sync',
        displayName: 'Batch-Sync Service',
        type: 'vmlog-multitask'
      })
    })

    it('should update when currentServiceId changes', () => {
      store.setCurrentService('vmalert-alerts')

      expect(store.currentService).toEqual({
        id: 'vmalert-alerts',
        displayName: 'VMAlert Alerts',
        type: 'vmalert-multitask'
      })
    })

    it('should handle missing service gracefully', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Force invalid service ID
      store.currentServiceId = 'non-existent'

      expect(store.currentService).toBeUndefined()
      expect(consoleError).toHaveBeenCalledWith(
        '[ServiceStore] Service not found for ID:',
        'non-existent'
      )

      consoleError.mockRestore()
    })
  })

  describe('currentServiceDisplayName computed', () => {
    beforeEach(() => {
      store.initialize()
    })

    it('should return display name of current service', () => {
      expect(store.currentServiceDisplayName).toBe('Batch-Sync Service')
    })

    it('should update when service changes', () => {
      store.setCurrentService('data-service')
      expect(store.currentServiceDisplayName).toBe('Data Service')
    })

    it('should return "Unknown Service" for invalid service', () => {
      store.currentServiceId = 'invalid'
      expect(store.currentServiceDisplayName).toBe('Unknown Service')
    })
  })

  describe('getCurrentServiceId()', () => {
    it('should return currentServiceId after initialization', () => {
      store.initialize()
      expect(store.getCurrentServiceId()).toBe('batch-sync')
    })

    it('should return updated serviceId after switching', () => {
      store.initialize()
      store.setCurrentService('vmalert-alerts')
      expect(store.getCurrentServiceId()).toBe('vmalert-alerts')
    })

    it('should fall back to config default if currentServiceId is null', () => {
      // Don't initialize, currentServiceId should be null
      expect(store.getCurrentServiceId()).toBe('batch-sync') // Falls back to config
    })
  })

  describe('multi-service isolation', () => {
    beforeEach(() => {
      store.initialize()
    })

    it('should maintain separate state for each service', () => {
      // Start with batch-sync
      expect(store.getCurrentServiceId()).toBe('batch-sync')

      // Switch to data-service
      store.setCurrentService('data-service')
      expect(store.getCurrentServiceId()).toBe('data-service')

      // Switch to vmalert
      store.setCurrentService('vmalert-alerts')
      expect(store.getCurrentServiceId()).toBe('vmalert-alerts')

      // Each switch should be isolated
      expect(store.currentService.id).toBe('vmalert-alerts')
    })
  })
})
