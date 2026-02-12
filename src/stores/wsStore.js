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

function resolveTaskName(log, taskLabel) {
  if (!log || typeof log !== 'object') return null

  const normalizedTaskLabel = typeof taskLabel === 'string' && taskLabel.trim()
    ? taskLabel.trim()
    : 'task_name'

  const candidate =
    log.taskName ??
    log.labels?.[normalizedTaskLabel] ??
    log.labels?.task_name

  if (candidate == null) return null

  const text = String(candidate).trim()
  return text ? text : null
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

  // Initialization delay timer (avoid leaking timers across disconnect/reconnect)
  let initializationTimer = null

  function clearInitializationTimer() {
    if (initializationTimer) {
      clearTimeout(initializationTimer)
      initializationTimer = null
    }
  }

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
    clearInitializationTimer()

    // Query for all logs (no task_name filter, uses fixedLabels from config)
    const query = buildTaskQuery(null)
    const taskLabel = getCurrentServiceConfig('vmlog.taskLabel', 'task_name')

    // Get configured alert level
    const alertLevelConfigured = isAlertLevelEnabled()
    const rawAlertLevel = alertLevelConfigured ? getCurrentServiceConfig('alert.level', null) : null
    const alertLevel = typeof rawAlertLevel === 'string'
      ? rawAlertLevel.trim().toUpperCase()
      : rawAlertLevel

    // Precompute which log levels are considered "alert-worthy" for this service.
    // We use this both for alerting and for dropping noisy logs from non-viewing tasks.
    const alertLevels = alertLevelConfigured
      ? (getLogLevelMapping()[alertLevel] || ['ERROR'])
      : []
    const alertLevelSet = new Set((alertLevels || []).map(l => String(l).toUpperCase()))

    wsController = tailLogs(query, {
      onLog: (logs) => {
        const viewingTask = currentViewingTask.value
        const logsToDistribute = []

        // Single pass:
        // - Only distribute logs for tasks that currently have subscribers (typically the viewing task).
        // - For non-viewing tasks, drop low-severity noise early; only keep alert-worthy logs for unread/alerts.
        for (const log of logs) {
          const taskName = resolveTaskName(log, taskLabel)

          const level = String(log.level || 'INFO').toUpperCase()
          const isViewing = taskName && viewingTask && taskName === viewingTask
          const hasTaskSubscribers = taskName && subscribers.has(taskName)
          const shouldDistribute = isViewing || hasTaskSubscribers || globalSubscribers.size > 0

          if (shouldDistribute) {
            logsToDistribute.push(log)
          }

          if (!taskName) continue

          // Skip alert triggering during initial connection to avoid false alerts
          if (isInitializing || !alertLevelConfigured) continue

          // Prefer the mapping-based set (fast) to decide alert-worthiness.
          // Fallback to shouldTriggerAlert for safety if mapping is missing.
          const isAlertWorthy = alertLevelSet.size > 0
            ? alertLevelSet.has(level)
            : shouldTriggerAlert(level, alertLevel)

          // For non-viewing tasks: drop low-severity logs entirely (do nothing)
          if (!isAlertWorthy) continue

          const isWatched = taskStore.watchedTasks.has(taskName)
          console.log(`${level} log detected for task: ${taskName} (watched: ${isWatched}, alert level: ${alertLevel})`)

          // Only trigger global alert overlay for watched tasks
          if (isWatched) {
            alertStore.triggerAlert('error')
          }

          // Increment unread count for ALL tasks (watched or not) if not currently viewing this task
          if (viewingTask !== taskName) {
            taskStore.incrementUnreadAlerts(taskName)
            console.log(`Unread alert count for ${taskName}:`, taskStore.getUnreadAlertCount(taskName))
          }
        }

        if (logsToDistribute.length > 0) {
          distributeLogs(logsToDistribute)
        }
      },
      onOpen: () => {
        isConnected.value = true
        hadConnection = true
        const serviceName = getCurrentServiceConfig('vmlog.fixedLabels.service') ||
          getCurrentServiceConfig('displayName', 'service')
        console.log(`WebSocket connected to service: ${serviceName}`)
        // Remove disconnect alert when reconnected
        alertStore.removeAlertReason('disconnect')

        // Delay marking initialization as complete to allow initial historical logs to load
        // This prevents false alerts from historical logs on page load
        const delay = getCurrentServiceConfig('vmlog.tail.initializationDelay', 2000)
        clearInitializationTimer()
        initializationTimer = setTimeout(() => {
          // If we disconnected (or controller was cleared), do nothing.
          if (!wsController) return
          isInitializing = false
          console.log('Initialization complete, now monitoring for new errors')
        }, delay)
      },
      onClose: (event) => {
        isConnected.value = false
        if (event && event.manual) {
          console.log('WebSocket disconnected manually; skipping disconnect alert')
          return
        }
        const serviceName = getCurrentServiceConfig('vmlog.fixedLabels.service') ||
          getCurrentServiceConfig('displayName', 'service')
        console.log(`WebSocket disconnected from service: ${serviceName}, hadConnection:`, hadConnection)
        // Trigger disconnect alert only if we had a connection before
        // For streaming tail, normal completion may happen during reconnect loops.
        // Only alert on actual errors to avoid false disconnect alarms.
        if (hadConnection && alertLevelConfigured && event && event.error) {
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
    clearInitializationTimer()
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
    // Group logs by configured task label (fallback to task_name)
    const logsByTask = new Map()
    const taskLabel = getCurrentServiceConfig('vmlog.taskLabel', 'task_name')

    for (const log of logs) {
      const taskName = resolveTaskName(log, taskLabel)
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
