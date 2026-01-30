import { defineStore } from 'pinia'
import { ref } from 'vue'
import { tailLogs, buildTaskQuery } from '../api/loki'
import { useAlertStore } from './alertStore'
import { useTaskStore } from './taskStore'

export const useWsStore = defineStore('ws', () => {
  // Connection state
  const isConnected = ref(false)

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
   * Start the WebSocket connection for entire batch-sync service
   */
  function connect() {
    if (wsController) return

    // Get stores inside connect() to ensure Pinia is initialized
    const alertStore = useAlertStore()
    const taskStore = useTaskStore()

    // Set initialization flag
    isInitializing = true

    // Query for all batch-sync logs (no task_name filter)
    const query = buildTaskQuery(null, { service: 'Batch-Sync' })

    wsController = tailLogs(query, {
      onLog: (logs) => {
        // Check for ERROR logs on watched tasks
        for (const log of logs) {
          const taskName = log.taskName || log.labels?.task_name
          const level = (log.level || 'INFO').toUpperCase()

          // Skip alert triggering during initial connection to avoid false alerts
          if (!isInitializing && level === 'ERROR' && taskName && taskStore.watchedTasks.has(taskName)) {
            console.log('ERROR log detected for watched task:', taskName)

            // Trigger global alert overlay
            alertStore.triggerAlert('error')

            // Increment unread count if not viewing this task
            const currentPath = window.location.pathname
            const taskPath = `/batch-sync/${taskName}`
            if (currentPath !== taskPath) {
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
        console.log('WebSocket connected to batch-sync service')
        // Remove disconnect alert when reconnected
        alertStore.removeAlertReason('disconnect')

        // Delay marking initialization as complete to allow initial historical logs to load
        // This prevents false alerts from historical ERROR logs on page load
        setTimeout(() => {
          isInitializing = false
          console.log('Initialization complete, now monitoring for new errors')
        }, 2000)
      },
      onClose: () => {
        isConnected.value = false
        console.log('WebSocket disconnected from batch-sync service, hadConnection:', hadConnection)
        // Trigger disconnect alert only if we had a connection before
        if (hadConnection) {
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

  return {
    // State
    isConnected,

    // Actions
    connect,
    disconnect,
    subscribe,
    subscribeAll
  }
})
