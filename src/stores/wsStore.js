import { defineStore } from 'pinia'
import { ref } from 'vue'
import { tailLogs, buildTaskQuery } from '../api/vmlog'
import { useAlertStore } from './alertStore'
import { useTaskStore } from './taskStore'
import {
  getCurrentServiceConfig,
  getLogLevelMapping,
  isAlertLevelEnabled
} from '../utils/config'

/**
 * Check if a log level should trigger an alert based on configured alert level and mapping
 * @param {string} logLevel - Log level from the log entry
 * @param {string} alertLevel - Configured alert level threshold
 * @returns {boolean} True if should trigger alert
 */
function shouldTriggerAlert(logLevel, alertLevel) {
  const mapping = getLogLevelMapping()
  const alertLevels = mapping[alertLevel] || ['ERROR']
  return alertLevels.includes(logLevel)
}

export const useWsStore = defineStore('ws', () => {
  // Connection state
  const isConnected = ref(false)

  // Currently viewing task (to prevent incrementing unread count for active task)
  const currentViewingTask = ref(null)

  // WebSocket controller
  let wsController = null

  // Subscribers: Map<taskName, Set<callback>>
  const subscribers = new Map()

  // Global subscribers (receive all logs)
  const globalSubscribers = new Set()

  // Track if we had a connection before (to detect disconnection vs initial state)
  let hadConnection = false

  // Track if this is the first connection (to avoid triggering alerts on initial load)
  let isInitializing = true

  /**
   * Start the WebSocket connection for the configured service
   */
  function connect() {
    if (wsController) return

    // Get stores inside connect() to ensure Pinia is initialized
    const alertStore = useAlertStore()
    const taskStore = useTaskStore()

    // Set initialization flag
    isInitializing = true

    // Query for all logs (no task_name filter, uses fixedLabels from config)
    const query = buildTaskQuery(null)

    // Get configured alert level
    const alertLevelConfigured = isAlertLevelEnabled()
    const rawAlertLevel = alertLevelConfigured ? getCurrentServiceConfig('alert.level', null) : null
    const alertLevel = typeof rawAlertLevel === 'string'
      ? rawAlertLevel.trim().toUpperCase()
      : rawAlertLevel

    wsController = tailLogs(query, {
      onLog: (logs) => {
        // Check for logs that meet alert level threshold
        for (const log of logs) {
          const taskName = log.taskName || log.labels?.task_name
          const level = (log.level || 'INFO').toUpperCase()

          // Skip alert triggering during initial connection to avoid false alerts
          if (!isInitializing && alertLevelConfigured && shouldTriggerAlert(level, alertLevel) && taskName) {
            const isWatched = taskStore.watchedTasks.has(taskName)

            console.log(`${level} log detected for task: ${taskName} (watched: ${isWatched}, alert level: ${alertLevel})`)

            // Only trigger global alert overlay for watched tasks
            if (isWatched) {
              alertStore.triggerAlert('error')
            }

            // Increment unread count for ALL tasks (watched or not) if not currently viewing this task
            if (currentViewingTask.value !== taskName) {
              taskStore.incrementUnreadAlerts(taskName)
              console.log(`Unread alert count for ${taskName}:`, taskStore.getUnreadAlertCount(taskName))
            }
          }
        }

        distributeLogs(logs)
      },
      onOpen: () => {
        isConnected.value = true
        hadConnection = true
        const serviceName = getCurrentServiceConfig('vmlog.fixedLabels.service', 'service')
        console.log(`WebSocket connected to service: ${serviceName}`)
        // Remove disconnect alert when reconnected
        alertStore.removeAlertReason('disconnect')

        // Delay marking initialization as complete to allow initial historical logs to load
        // This prevents false alerts from historical logs on page load
        const delay = getCurrentServiceConfig('vmlog.websocket.initializationDelay', 2000)
        setTimeout(() => {
          isInitializing = false
          console.log('Initialization complete, now monitoring for new errors')
        }, delay)
      },
      onClose: () => {
        isConnected.value = false
        const serviceName = getCurrentServiceConfig('vmlog.fixedLabels.service', 'service')
        console.log(`WebSocket disconnected from service: ${serviceName}, hadConnection:`, hadConnection)
        // Trigger disconnect alert only if we had a connection before
        if (hadConnection && alertLevelConfigured) {
          console.log('Triggering disconnect alert')
          alertStore.triggerAlert('disconnect')
          console.log('Alert store hasAlert:', alertStore.hasAlert)
        }
      },
      onError: (error) => {
        console.error('WebSocket error:', error)
      }
    })
  }

  /**
   * Disconnect the WebSocket
   */
  function disconnect() {
    if (wsController) {
      wsController.close()
      wsController = null
    }
    isConnected.value = false
  }

  /**
   * Distribute incoming logs to appropriate subscribers
   */
  function distributeLogs(logs) {
    // Group logs by task_name
    const logsByTask = new Map()

    for (const log of logs) {
      const taskName = log.taskName || log.labels?.task_name
      if (taskName) {
        if (!logsByTask.has(taskName)) {
          logsByTask.set(taskName, [])
        }
        logsByTask.get(taskName).push(log)
      }
    }

    // Notify task-specific subscribers
    for (const [taskName, taskLogs] of logsByTask) {
      const taskSubscribers = subscribers.get(taskName)
      if (taskSubscribers) {
        for (const callback of taskSubscribers) {
          callback(taskLogs)
        }
      }
    }

    // Notify global subscribers with all logs
    for (const callback of globalSubscribers) {
      callback(logs)
    }
  }

  /**
   * Subscribe to logs for a specific task
   * @param {string} taskName - Task name to subscribe to
   * @param {function} callback - Function to call with new logs
   * @returns {function} Unsubscribe function
   */
  function subscribe(taskName, callback) {
    if (!subscribers.has(taskName)) {
      subscribers.set(taskName, new Set())
    }
    subscribers.get(taskName).add(callback)

    // Return unsubscribe function
    return () => {
      const taskSubscribers = subscribers.get(taskName)
      if (taskSubscribers) {
        taskSubscribers.delete(callback)
        if (taskSubscribers.size === 0) {
          subscribers.delete(taskName)
        }
      }
    }
  }

  /**
   * Subscribe to all logs (global subscriber)
   * @param {function} callback - Function to call with new logs
   * @returns {function} Unsubscribe function
   */
  function subscribeAll(callback) {
    globalSubscribers.add(callback)

    // Return unsubscribe function
    return () => {
      globalSubscribers.delete(callback)
    }
  }

  /**
   * Set the currently viewing task (to prevent incrementing unread count for active task)
   * @param {string|null} taskName - Task name being viewed, or null if not viewing any task
   */
  function setCurrentViewingTask(taskName) {
    currentViewingTask.value = taskName
  }

  return {
    // State
    isConnected,
    currentViewingTask,

    // Actions
    connect,
    disconnect,
    subscribe,
    subscribeAll,
    setCurrentViewingTask
  }
})
