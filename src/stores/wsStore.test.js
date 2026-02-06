import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWsStore } from './wsStore'
import { useAlertStore } from './alertStore'
import { useTaskStore } from './taskStore'
import * as vmlogApi from '../api/vmlog'
import * as config from '../utils/config'

vi.mock('../api/vmlog')
vi.mock('../utils/config')

describe('wsStore', () => {
  let wsStore
  let alertStore
  let taskStore

  beforeEach(() => {
    setActivePinia(createPinia())
    wsStore = useWsStore()
    alertStore = useAlertStore()
    taskStore = useTaskStore()

    // Reset mocks
    vi.clearAllMocks()

    // Mock config
    vi.spyOn(config, 'getCurrentServiceConfig').mockImplementation((path, fallback) => {
      const configs = {
        'alert.level': 'ERROR',
        'logLevels.mapping': {
          'ERROR': ['ERROR'],
          'WARN': ['ERROR', 'WARN'],
          'INFO': ['ERROR', 'WARN', 'INFO'],
          'DEBUG': ['ERROR', 'WARN', 'INFO', 'DEBUG']
        },
        'vmlog.fixedLabels.service': 'Test Service',
        'vmlog.websocket.initializationDelay': 100
      }
      return configs[path] ?? fallback
    })

    // Mock getLogLevelMapping
    vi.spyOn(config, 'getLogLevelMapping').mockReturnValue({
      'ERROR': ['ERROR'],
      'WARN': ['ERROR', 'WARN'],
      'INFO': ['ERROR', 'WARN', 'INFO'],
      'DEBUG': ['ERROR', 'WARN', 'INFO', 'DEBUG']
    })

    // Mock alert level enabled
    vi.spyOn(config, 'isAlertLevelEnabled').mockReturnValue(true)

    // Mock buildTaskQuery
    vi.spyOn(vmlogApi, 'buildTaskQuery').mockReturnValue('mocked-query')

    // Mock tailLogs
    vi.spyOn(vmlogApi, 'tailLogs').mockImplementation((query, callbacks) => {
      // Store callbacks for testing
      wsStore._testCallbacks = callbacks
      return {
        close: vi.fn()
      }
    })

    // Mock taskStore
    taskStore.watchedTasks = new Set(['task-1'])
  })

  describe('Alert Level Configuration', () => {
    it('should trigger alert for ERROR level when alert level is ERROR', async () => {
      const triggerAlertSpy = vi.spyOn(alertStore, 'triggerAlert')
      const incrementUnreadSpy = vi.spyOn(taskStore, 'incrementUnreadAlerts')

      // Connect to initialize
      wsStore.connect()

      // Simulate WebSocket open
      wsStore._testCallbacks.onOpen()

      // Wait for initialization delay
      await new Promise(resolve => setTimeout(resolve, 150))

      // Simulate ERROR log
      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          level: 'ERROR',
          message: 'Test error'
        }
      ])

      expect(triggerAlertSpy).toHaveBeenCalledWith('error')
      expect(incrementUnreadSpy).toHaveBeenCalledWith('task-1')
    })

    it('should NOT trigger alert for WARN level when alert level is ERROR', async () => {
      const triggerAlertSpy = vi.spyOn(alertStore, 'triggerAlert')

      wsStore.connect()
      wsStore._testCallbacks.onOpen()
      await new Promise(resolve => setTimeout(resolve, 150))

      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          level: 'WARN',
          message: 'Test warning'
        }
      ])

      expect(triggerAlertSpy).not.toHaveBeenCalled()
    })

    it('should trigger alert for WARN and ERROR when alert level is WARN', async () => {
      // Change config to WARN level
      config.getCurrentServiceConfig.mockImplementation((path, fallback) => {
        if (path === 'alert.level') return 'WARN'
        if (path === 'logLevels.mapping') {
          return {
            'ERROR': ['ERROR'],
            'WARN': ['ERROR', 'WARN'],
            'INFO': ['ERROR', 'WARN', 'INFO'],
            'DEBUG': ['ERROR', 'WARN', 'INFO', 'DEBUG']
          }
        }
        if (path === 'vmlog.websocket.initializationDelay') return 100
        return fallback
      })

      const triggerAlertSpy = vi.spyOn(alertStore, 'triggerAlert')

      wsStore.connect()
      wsStore._testCallbacks.onOpen()
      await new Promise(resolve => setTimeout(resolve, 150))

      // Test WARN
      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          level: 'WARN',
          message: 'Test warning'
        }
      ])

      expect(triggerAlertSpy).toHaveBeenCalledWith('error')
      triggerAlertSpy.mockClear()

      // Test ERROR
      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          level: 'ERROR',
          message: 'Test error'
        }
      ])

      expect(triggerAlertSpy).toHaveBeenCalledWith('error')
    })

    it('should NOT trigger alert for INFO when alert level is WARN', async () => {
      config.getCurrentServiceConfig.mockImplementation((path, fallback) => {
        if (path === 'alert.level') return 'WARN'
        if (path === 'logLevels.mapping') {
          return {
            'ERROR': ['ERROR'],
            'WARN': ['ERROR', 'WARN'],
            'INFO': ['ERROR', 'WARN', 'INFO'],
            'DEBUG': ['ERROR', 'WARN', 'INFO', 'DEBUG']
          }
        }
        if (path === 'vmlog.websocket.initializationDelay') return 100
        return fallback
      })

      const triggerAlertSpy = vi.spyOn(alertStore, 'triggerAlert')

      wsStore.connect()
      wsStore._testCallbacks.onOpen()
      await new Promise(resolve => setTimeout(resolve, 150))

      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          level: 'INFO',
          message: 'Test info'
        }
      ])

      expect(triggerAlertSpy).not.toHaveBeenCalled()
    })

    it('should trigger alert for all levels when alert level is DEBUG', async () => {
      config.getCurrentServiceConfig.mockImplementation((path, fallback) => {
        if (path === 'alert.level') return 'DEBUG'
        if (path === 'logLevels.mapping') {
          return {
            'ERROR': ['ERROR'],
            'WARN': ['ERROR', 'WARN'],
            'INFO': ['ERROR', 'WARN', 'INFO'],
            'DEBUG': ['ERROR', 'WARN', 'INFO', 'DEBUG']
          }
        }
        if (path === 'vmlog.websocket.initializationDelay') return 100
        return fallback
      })

      const triggerAlertSpy = vi.spyOn(alertStore, 'triggerAlert')

      wsStore.connect()
      wsStore._testCallbacks.onOpen()
      await new Promise(resolve => setTimeout(resolve, 150))

      const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR']
      for (const level of levels) {
        triggerAlertSpy.mockClear()
        wsStore._testCallbacks.onLog([
          {
            taskName: 'task-1',
            level,
            message: `Test ${level}`
          }
        ])
        expect(triggerAlertSpy).toHaveBeenCalledWith('error')
      }
    })

    it('should use default mapping when config mapping is not provided', async () => {
      config.getCurrentServiceConfig.mockImplementation((path, fallback) => {
        if (path === 'alert.level') return 'WARN'
        if (path === 'logLevels.mapping') return null // No custom mapping
        if (path === 'vmlog.websocket.initializationDelay') return 100
        return fallback
      })

      const triggerAlertSpy = vi.spyOn(alertStore, 'triggerAlert')

      wsStore.connect()
      wsStore._testCallbacks.onOpen()
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should still work with default mapping
      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          level: 'WARN',
          message: 'Test warning'
        }
      ])

      expect(triggerAlertSpy).toHaveBeenCalledWith('error')
    })

    it('should handle custom mapping configuration', async () => {
      // Custom mapping: WARN includes only WARN and ERROR (not cascading)
      const customMapping = {
        'ERROR': ['ERROR'],
        'WARN': ['WARN'], // Custom: only WARN, not ERROR
        'INFO': ['INFO'],
        'DEBUG': ['DEBUG']
      }

      config.getCurrentServiceConfig.mockImplementation((path, fallback) => {
        if (path === 'alert.level') return 'WARN'
        if (path === 'logLevels.mapping') return customMapping
        if (path === 'vmlog.websocket.initializationDelay') return 100
        return fallback
      })

      // Mock getLogLevelMapping to return custom mapping
      config.getLogLevelMapping.mockReturnValue(customMapping)

      const triggerAlertSpy = vi.spyOn(alertStore, 'triggerAlert')

      wsStore.connect()
      wsStore._testCallbacks.onOpen()
      await new Promise(resolve => setTimeout(resolve, 150))

      // WARN should trigger
      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          level: 'WARN',
          message: 'Test warning'
        }
      ])
      expect(triggerAlertSpy).toHaveBeenCalled()
      triggerAlertSpy.mockClear()

      // ERROR should NOT trigger with custom mapping
      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          level: 'ERROR',
          message: 'Test error'
        }
      ])
      expect(triggerAlertSpy).not.toHaveBeenCalled()
    })
  })

  describe('Alert Behavior', () => {
    it('should only trigger alert for watched tasks', async () => {
      const triggerAlertSpy = vi.spyOn(alertStore, 'triggerAlert')

      wsStore.connect()
      wsStore._testCallbacks.onOpen()
      await new Promise(resolve => setTimeout(resolve, 150))

      // Unwatched task
      wsStore._testCallbacks.onLog([
        {
          taskName: 'unwatched-task',
          level: 'ERROR',
          message: 'Test error'
        }
      ])

      expect(triggerAlertSpy).not.toHaveBeenCalled()
    })

    it('should increment unread count for all tasks regardless of watched status', async () => {
      const incrementUnreadSpy = vi.spyOn(taskStore, 'incrementUnreadAlerts')

      wsStore.connect()
      wsStore._testCallbacks.onOpen()
      await new Promise(resolve => setTimeout(resolve, 150))

      // Unwatched task should still increment unread count
      wsStore._testCallbacks.onLog([
        {
          taskName: 'unwatched-task',
          level: 'ERROR',
          message: 'Test error'
        }
      ])

      expect(incrementUnreadSpy).toHaveBeenCalledWith('unwatched-task')
    })

    it('should NOT increment unread count for currently viewing task', async () => {
      const incrementUnreadSpy = vi.spyOn(taskStore, 'incrementUnreadAlerts')

      // Set current viewing task
      wsStore.setCurrentViewingTask('task-1')

      wsStore.connect()
      wsStore._testCallbacks.onOpen()
      await new Promise(resolve => setTimeout(resolve, 150))

      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          level: 'ERROR',
          message: 'Test error'
        }
      ])

      expect(incrementUnreadSpy).not.toHaveBeenCalled()
    })

    it('should NOT trigger alerts during initialization', async () => {
      const triggerAlertSpy = vi.spyOn(alertStore, 'triggerAlert')

      wsStore.connect()
      wsStore._testCallbacks.onOpen()

      // Before initialization delay completes
      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          level: 'ERROR',
          message: 'Test error'
        }
      ])

      expect(triggerAlertSpy).not.toHaveBeenCalled()

      // After initialization delay
      await new Promise(resolve => setTimeout(resolve, 150))

      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          level: 'ERROR',
          message: 'Test error'
        }
      ])

      expect(triggerAlertSpy).toHaveBeenCalled()
    })

    it('should handle logs with uppercase and lowercase levels', async () => {
      const triggerAlertSpy = vi.spyOn(alertStore, 'triggerAlert')

      wsStore.connect()
      wsStore._testCallbacks.onOpen()
      await new Promise(resolve => setTimeout(resolve, 150))

      // Lowercase
      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          level: 'error',
          message: 'Test error'
        }
      ])
      expect(triggerAlertSpy).toHaveBeenCalled()
      triggerAlertSpy.mockClear()

      // Uppercase
      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          level: 'ERROR',
          message: 'Test error'
        }
      ])
      expect(triggerAlertSpy).toHaveBeenCalled()
    })

    it('should default to INFO level for logs without level', async () => {
      config.getCurrentServiceConfig.mockImplementation((path, fallback) => {
        if (path === 'alert.level') return 'INFO'
        if (path === 'logLevels.mapping') {
          return {
            'ERROR': ['ERROR'],
            'WARN': ['ERROR', 'WARN'],
            'INFO': ['ERROR', 'WARN', 'INFO'],
            'DEBUG': ['ERROR', 'WARN', 'INFO', 'DEBUG']
          }
        }
        if (path === 'vmlog.websocket.initializationDelay') return 100
        return fallback
      })

      const triggerAlertSpy = vi.spyOn(alertStore, 'triggerAlert')

      wsStore.connect()
      wsStore._testCallbacks.onOpen()
      await new Promise(resolve => setTimeout(resolve, 150))

      // Log without level field
      wsStore._testCallbacks.onLog([
        {
          taskName: 'task-1',
          message: 'Test message without level'
        }
      ])

      // Should trigger because default INFO matches alert level INFO
      expect(triggerAlertSpy).toHaveBeenCalled()
    })
  })

  describe('Connection Management', () => {
    it('should set isConnected to true on WebSocket open', () => {
      expect(wsStore.isConnected).toBe(false)

      wsStore.connect()
      wsStore._testCallbacks.onOpen()

      expect(wsStore.isConnected).toBe(true)
    })

    it('should set isConnected to false on WebSocket close', () => {
      wsStore.connect()
      wsStore._testCallbacks.onOpen()
      expect(wsStore.isConnected).toBe(true)

      wsStore._testCallbacks.onClose()
      expect(wsStore.isConnected).toBe(false)
    })

    it('should trigger disconnect alert only if had previous connection', () => {
      const triggerAlertSpy = vi.spyOn(alertStore, 'triggerAlert')

      wsStore.connect()

      // First close without ever being connected - should NOT trigger alert
      wsStore._testCallbacks.onClose()
      expect(triggerAlertSpy).not.toHaveBeenCalledWith('disconnect')

      // Open connection
      wsStore._testCallbacks.onOpen()

      // Now close after being connected - should trigger alert
      wsStore._testCallbacks.onClose()
      expect(triggerAlertSpy).toHaveBeenCalledWith('disconnect')
    })
  })

  describe('setCurrentViewingTask', () => {
    it('should set current viewing task', () => {
      expect(wsStore.currentViewingTask).toBe(null)

      wsStore.setCurrentViewingTask('task-1')
      expect(wsStore.currentViewingTask).toBe('task-1')

      wsStore.setCurrentViewingTask(null)
      expect(wsStore.currentViewingTask).toBe(null)
    })
  })
})
