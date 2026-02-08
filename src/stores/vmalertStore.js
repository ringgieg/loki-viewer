import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getAlerts, filterAlerts, groupAlertsByLabel } from '../api/vmalert'
import { getAlertmanagerAlerts, getAlertmanagerSilences } from '../api/alertmanager'
import {
  getPrometheusTaskLabel,
  getPrometheusFixedLabels,
  getPrometheusPollingInterval,
  getPrometheusColumns,
  isDeadManSwitchEnabled,
  getDeadManSwitchAlertName,
  getAlertmanagerReceivers,
  getPrometheusSeverityLevels,
  getPrometheusSeverityLabel,
  getPrometheusAlertLevel,
  isPrometheusAlertLevelEnabled
} from '../utils/config'
import {
  applyAlertmanagerReceiverMapping,
  filterAlertmanagerAlertsByReceivers,
  resolveAlertmanagerState
} from '../utils/alertmanager'
import { useServiceStore } from './serviceStore'
import { useAlertStore } from './alertStore'

const STORAGE_KEY_PREFIX = 'dashboard-watched-vmalert-tasks'

export const useVmalertStore = defineStore('vmalert', () => {
  // State
  const alerts = ref([])
  const alertmanagerAlerts = ref([])
  const alertmanagerReceiverAlerts = ref([])
  const alertmanagerSilences = ref([])
  const tasks = ref([])
  // We store *unwatched* tasks so the default behavior is "watched".
  const unwatchedTasks = ref(new Set())
  const selectedTask = ref(null)
  const loading = ref(false)
  const polling = ref(false)
  const pollingCountdown = ref(0)
  const deadManSwitchOk = ref(true) // DeadManSwitch status

  // Countdown timer (UI only; actual polling is driven by vue-query)
  let countdownTimer = null
  const lastPolledAt = ref(0)

  // Get storage key for current service
  function getStorageKey() {
    const serviceStore = useServiceStore()
    const serviceId = serviceStore.getCurrentServiceId()
    return `${STORAGE_KEY_PREFIX}-${serviceId}`
  }

  // Check if alert is DeadManSwitch alert
  function isDeadManSwitchAlert(alert) {
    if (!isDeadManSwitchEnabled()) return false
    const deadManSwitchName = getDeadManSwitchAlertName()
    return alert.labels?.alertname === deadManSwitchName
  }

  // Load watched tasks from localStorage
  function loadWatchedTasks() {
    try {
      const saved = localStorage.getItem(getStorageKey())
      if (saved) {
        unwatchedTasks.value = new Set(JSON.parse(saved))
      } else {
        unwatchedTasks.value = new Set()
      }
    } catch (e) {
      console.error('[PrometheusStore] Error loading watched tasks:', e)
    }
  }

  // Save watched tasks to localStorage
  function saveWatchedTasks() {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify([...unwatchedTasks.value]))
    } catch (e) {
      console.error('[PrometheusStore] Error saving watched tasks:', e)
    }
  }

  function isTaskWatched(taskName) {
    return !unwatchedTasks.value.has(taskName)
  }

  // Computed: Filtered tasks (watched tasks first, then others)
  const sortedTasks = computed(() => {
    return [...tasks.value].sort((a, b) => {
      if (a.watched && !b.watched) return -1
      if (!a.watched && b.watched) return 1
      return a.name.localeCompare(b.name)
    })
  })

  // Computed: Alerts for selected task
  const selectedTaskAlerts = computed(() => {
    if (!selectedTask.value) {
      return alerts.value
    }

    const taskLabel = getPrometheusTaskLabel()
    return filterAlerts(alerts.value, { [taskLabel]: selectedTask.value })
  })

  // Computed: Alert counts by state (excluding DeadManSwitch)
  const alertCounts = computed(() => {
    // Filter out DeadManSwitch alerts
    const regularAlerts = alerts.value.filter(alert => !isDeadManSwitchAlert(alert))

    const counts = {
      firing: 0,
      pending: 0,
      inactive: 0,
      total: regularAlerts.length
    }

    regularAlerts.forEach(alert => {
      const state = alert.state || 'inactive'
      if (state in counts) {
        counts[state]++
      }
    })

    return counts
  })

  // Initialize store
  async function initialize() {
    loadWatchedTasks()

    await fetchAlerts({ showLoading: true })
    updateTasksFromAlerts()
    startPolling()
  }

  // Update tasks from alerts (extract unique task label values from alerts)
  function updateTasksFromAlerts() {
    try {
      const taskLabel = getPrometheusTaskLabel()

      // Extract unique task names from alerts
      const taskNamesFromAlerts = new Set()
      alerts.value.forEach(alert => {
        const taskName = alert.labels?.[taskLabel]
        if (taskName) {
          taskNamesFromAlerts.add(taskName)
        }
      })

      // Merge with watched tasks
      const allTaskNames = new Set([...taskNamesFromAlerts, ...unwatchedTasks.value])

      tasks.value = Array.from(allTaskNames).map(name => ({
        name,
        watched: isTaskWatched(name),
        existsInVmalert: taskNamesFromAlerts.has(name)
      }))

      console.log(`[PrometheusStore] Updated ${tasks.value.length} tasks from ${alerts.value.length} alerts`)
    } catch (e) {
      console.error('[PrometheusStore] Error updating tasks:', e)
    }
  }

  async function refreshAlertmanagerSilences(receiverNames = null) {
    const names = Array.isArray(receiverNames) ? receiverNames : getAlertmanagerReceivers()
    if (!names || names.length === 0) {
      alertmanagerSilences.value = []
      return []
    }

    try {
      const response = await getAlertmanagerSilences()
      const silences = Array.isArray(response)
        ? response
        : (Array.isArray(response?.data) ? response.data : [])
      alertmanagerSilences.value = silences
      return silences
    } catch (error) {
      console.warn('[PrometheusStore] Alertmanager silences fetch failed:', error)
      alertmanagerSilences.value = []
      return []
    }
  }

  // Fetch alerts
  async function fetchAlerts(options = {}) {
    const { showLoading = false } = options
    if (showLoading) {
      loading.value = true
    }
    try {
      const receiverNames = getAlertmanagerReceivers()
      const alertmanagerPromise = receiverNames.length > 0
        ? getAlertmanagerAlerts().catch(error => {
          console.warn('[PrometheusStore] Alertmanager fetch failed:', error)
          return []
        })
        : Promise.resolve([])
      const silencesPromise = receiverNames.length > 0
        ? refreshAlertmanagerSilences(receiverNames)
        : Promise.resolve([])

      const allAlerts = await getAlerts()
      const fixedLabels = getPrometheusFixedLabels()

      // Filter by fixed labels
      alerts.value = filterAlerts(allAlerts, fixedLabels)

      const fetchedAlertmanagerAlerts = await alertmanagerPromise
      alertmanagerAlerts.value = fetchedAlertmanagerAlerts
      await silencesPromise
      const receiverAlerts = receiverNames.length > 0
        ? filterAlertmanagerAlertsByReceivers(fetchedAlertmanagerAlerts, receiverNames)
        : []
      alertmanagerReceiverAlerts.value = receiverAlerts

      // Map receiver alerts back to vmalert alerts for UI use
      applyAlertmanagerReceiverMapping(alerts.value, receiverAlerts)

      console.log(`[PrometheusStore] Fetched ${alerts.value.length} alerts`)

      // Update tasks from alerts
      updateTasksFromAlerts()

      // Check DeadManSwitch first
      checkDeadManSwitch()

      // Trigger alert if there are firing alerts (excluding DeadManSwitch)
      checkForFiringAlerts()
      checkForFiringAlertsByLevel()
    } catch (e) {
      console.error('[PrometheusStore] Error fetching alerts:', e)
      ElMessage.error('获取告警列表失败')
    } finally {
      if (showLoading) {
        loading.value = false
      }
    }
  }

  // Check for firing alerts and trigger alert overlay (excluding DeadManSwitch)
  function checkForFiringAlerts() {
    const alertStore = useAlertStore()
    const receiverNames = getAlertmanagerReceivers()
    const useAlertmanager = receiverNames.length > 0

    // Only Alertmanager alerts are allowed to trigger global alert overlay
    if (!useAlertmanager) {
      return
    }

    const sourceAlerts = alertmanagerReceiverAlerts.value

    const firingAlerts = sourceAlerts.filter(alert => {
      if (isDeadManSwitchAlert(alert)) {
        return false
      }

      const state = resolveAlertmanagerState(alert)
      if (state !== 'active' && state !== 'firing') {
        return false
      }

      const fingerprint = alert.fingerprint || alert.labels?.fingerprint
      if (fingerprint && alertStore.isAlertmanagerFingerprintMuted(fingerprint)) {
        return false
      }

      return true
    })

    if (firingAlerts.length > 0) {
      const reasons = firingAlerts.map(alert => {
        const alertname = alert.labels?.alertname || alert.labels?.name || alert.name || 'Unknown'
        const instance = alert.labels?.instance || alert.labels?.job || ''
        const fingerprint = alert.fingerprint || alert.labels?.fingerprint
        if (fingerprint) {
          alertStore.addAlertFingerprint(fingerprint)
        }
        return instance ? `${alertname} (${instance})` : alertname
      })

      // Trigger alert with all firing alert names
      reasons.forEach(reason => {
        alertStore.triggerAlert(reason)
      })
    }
  }

  function resolvePrometheusState(alert) {
    if (!alert) return 'inactive'
    if (alert.state) return alert.state
    const statusState = alert.status?.state
    if (statusState) return statusState
    return 'inactive'
  }

  function normalizeAlertLevel(value) {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value.trim().toUpperCase()
    return String(value).trim().toUpperCase()
  }

  function getAllowedSeverityLevels(alertLevel) {
    const severityLevels = getPrometheusSeverityLevels()
    if (!Array.isArray(severityLevels) || severityLevels.length === 0) {
      return []
    }

    const normalizedLevels = severityLevels.map(level => String(level).toLowerCase())
    const levelIndex = normalizedLevels.indexOf(String(alertLevel).toLowerCase())
    if (levelIndex === -1) {
      return []
    }

    return normalizedLevels.slice(0, levelIndex + 1)
  }

  // Check for firing alerts and trigger alert overlay based on alert.level (excluding DeadManSwitch)
  function checkForFiringAlertsByLevel() {
    if (!isPrometheusAlertLevelEnabled()) {
      return
    }

    const alertLevel = normalizeAlertLevel(getPrometheusAlertLevel())
    if (!alertLevel) {
      return
    }

    const allowedSeverities = getAllowedSeverityLevels(alertLevel)
    if (allowedSeverities.length === 0) {
      return
    }

    const severityLabel = getPrometheusSeverityLabel()
    const sourceAlerts = Array.isArray(alerts.value) ? alerts.value : []

    const firingAlerts = sourceAlerts.filter(alert => {
      if (isDeadManSwitchAlert(alert)) {
        return false
      }

      const state = resolvePrometheusState(alert)
      if (state !== 'active' && state !== 'firing') {
        return false
      }

      const severity = alert.labels?.[severityLabel]
      if (!severity) {
        return false
      }

      return allowedSeverities.includes(String(severity).toLowerCase())
    })

    if (firingAlerts.length > 0) {
      const alertStore = useAlertStore()
      const reasons = firingAlerts.map(alert => {
        const alertname = alert.labels?.alertname || alert.labels?.name || alert.name || 'Unknown'
        const instance = alert.labels?.instance || alert.labels?.job || ''
        return instance ? `${alertname} (${instance})` : alertname
      })

      reasons.forEach(reason => {
        alertStore.triggerAlert(reason)
      })
    }
  }

  // Check DeadManSwitch status
  function checkDeadManSwitch() {
    if (!isDeadManSwitchEnabled()) {
      deadManSwitchOk.value = true
      return
    }

    const deadManSwitchName = getDeadManSwitchAlertName()
    const deadManSwitchAlert = alerts.value.find(alert =>
      alert.labels?.alertname === deadManSwitchName
    )

    const wasOk = deadManSwitchOk.value

    if (!deadManSwitchAlert || deadManSwitchAlert.state !== 'firing') {
      // DeadManSwitch is missing or not firing - CRITICAL!
      deadManSwitchOk.value = false

      // Trigger critical alert if this is a new failure
      if (wasOk) {
        const alertStore = useAlertStore()
        alertStore.triggerAlert('⚠️ 监控系统异常: 监控链路告警丢失!')
        console.error('[PrometheusStore] CRITICAL: DeadManSwitch alert is missing or not firing!')
      }
    } else {
      // DeadManSwitch is working normally
      deadManSwitchOk.value = true
      if (!wasOk) {
        console.log('[PrometheusStore] DeadManSwitch is back to normal')
      }
    }
  }

  // Start polling
  function startPolling() {
    if (polling.value) return

    polling.value = true
    const interval = getPrometheusPollingInterval()

    console.log(`[PrometheusStore] Starting polling (interval: ${interval}ms)`)

    // Mark as just-polled so countdown starts immediately.
    lastPolledAt.value = Date.now()

    // Start countdown timer (UI only). The actual refetch happens in vue-query.
    pollingCountdown.value = Math.floor(interval / 1000)
    countdownTimer = setInterval(() => {
      if (!polling.value) return

      const elapsed = Date.now() - (lastPolledAt.value || Date.now())
      const remainingMs = Math.max(0, interval - elapsed)
      pollingCountdown.value = Math.floor(remainingMs / 1000)
    }, 1000)
  }

  // Stop polling
  function stopPolling() {
    if (!polling.value) return

    polling.value = false

    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }

    pollingCountdown.value = 0
    console.log('[PrometheusStore] Polling stopped')
  }

  // Mark that a poll has completed (called by vue-query polling driver)
  function markPolled(at = Date.now()) {
    lastPolledAt.value = at
    const interval = getPrometheusPollingInterval()
    pollingCountdown.value = Math.floor(interval / 1000)
  }

  // Refresh (fetch alerts which will also update tasks)
  async function refresh() {
    await fetchAlerts({ showLoading: true })
    markPolled()
  }

  // Toggle task watch status
  function toggleTaskWatch(taskName) {
    // Default is watched; toggling means add/remove from the *unwatched* set.
    if (unwatchedTasks.value.has(taskName)) {
      unwatchedTasks.value.delete(taskName)
    } else {
      unwatchedTasks.value.add(taskName)
    }

    // Update tasks array
    const task = tasks.value.find(t => t.name === taskName)
    if (task) {
      task.watched = isTaskWatched(taskName)
    }

    saveWatchedTasks()
  }

  // Select task
  function selectTask(taskName) {
    selectedTask.value = taskName
  }

  // Clear tasks (called when switching services)
  function clearTasks() {
    tasks.value = []
    selectedTask.value = null
  }

  // Build hierarchical alert structure for display
  function buildAlertHierarchy(alerts = null) {
    const columns = getPrometheusColumns()
    const taskAlerts = alerts || selectedTaskAlerts.value

    // If no columns configured, return flat structure
    if (!columns || columns.length === 0) {
      return buildFlatStructure(taskAlerts)
    }

    // Build hierarchical structure based on column config
    return buildHierarchicalStructure(taskAlerts, columns)
  }

  // Build flat structure (no columns)
  function buildFlatStructure(alerts) {
    return [{
      type: 'flat',
      alerts: alerts
    }]
  }

  // Get display value from annotation if configured
  function getDisplayValue(alerts, originalValue, annotationKey) {
    if (!annotationKey || !alerts || alerts.length === 0) {
      return originalValue
    }

    // Traverse alerts to find the first one with the annotation value
    for (const alert of alerts) {
      const annotationValue = alert.annotations?.[annotationKey]
      if (annotationValue) {
        return annotationValue
      }
    }

    return originalValue
  }

  // Build hierarchical structure (with columns)
  function buildHierarchicalStructure(alerts, columns) {
    const result = []
    const sortKeys = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' })

    const resolveLabelValue = (alert, labelName, labelSource) => {
      if (labelSource === 'metricLabels') {
        const value = alert.metricLabels?.[labelName]
        if (!value) {
          return { skip: true }
        }
        return { value }
      }

      const value = alert.labels?.[labelName]
      if (!value) {
        return { value: 'unknown' }
      }
      return { value }
    }

    // Process each column configuration
    columns.forEach(columnConfig => {
      const columnLabel = columnConfig.label
      const columnLabelSource = columnConfig.labelSource || 'alertLabels'
      const columnDisplayAnnotation = columnConfig.displayNameAnnotation
      const gridConfig = columnConfig.grids
      const hasGrid = Boolean(gridConfig && gridConfig.label)
      const gridLabel = gridConfig?.label
      const gridLabelSource = gridConfig?.labelSource || 'alertLabels'

      const columnGroups = new Map()

      alerts.forEach(alert => {
        const columnResolved = resolveLabelValue(alert, columnLabel, columnLabelSource)
        if (columnResolved.skip) return

        const columnValue = columnResolved.value
        let columnEntry = columnGroups.get(columnValue)
        if (!columnEntry) {
          columnEntry = {
            alerts: [],
            grids: hasGrid ? new Map() : null
          }
          columnGroups.set(columnValue, columnEntry)
        }

        columnEntry.alerts.push(alert)

        if (hasGrid) {
          const gridResolved = resolveLabelValue(alert, gridLabel, gridLabelSource)
          if (gridResolved.skip) return

          const gridValue = gridResolved.value
          const grids = columnEntry.grids
          let gridAlerts = grids.get(gridValue)
          if (!gridAlerts) {
            gridAlerts = []
            grids.set(gridValue, gridAlerts)
          }
          gridAlerts.push(alert)
        }
      })

      const sortedColumnEntries = Array.from(columnGroups.entries()).sort(([a], [b]) => sortKeys(a, b))

      sortedColumnEntries.forEach(([columnValue, columnEntry]) => {
        const columnAlerts = columnEntry.alerts
        const column = {
          type: 'column',
          label: columnLabel,
          value: columnValue,
          displayValue: getDisplayValue(columnAlerts, columnValue, columnDisplayAnnotation),
          grids: []
        }

        if (hasGrid) {
          // Group by grid label with labelSource
          const gridDisplayAnnotation = gridConfig.displayNameAnnotation
          const gridGroups = columnEntry.grids

          const sortedGridEntries = Array.from(gridGroups.entries()).sort(([a], [b]) => sortKeys(a, b))

          sortedGridEntries.forEach(([gridValue, gridAlerts]) => {
            const grid = {
              type: 'grid',
              label: gridLabel,
              value: gridValue,
              displayValue: getDisplayValue(gridAlerts, gridValue, gridDisplayAnnotation),
              state: getAggregatedState(gridAlerts) // Add aggregated state for grid
            }

            // Grid directly contains alerts (no item grouping)
            grid.alerts = gridAlerts

            column.grids.push(grid)
          })
        } else {
          // No grid config, treat column alerts as single grid
          column.grids.push({
            type: 'grid',
            state: getAggregatedState(columnAlerts), // Add aggregated state for grid
            alerts: columnAlerts
          })
        }

        result.push(column)
      })
    })

    return result
  }

  // Get aggregated state from multiple alerts (worst state wins)
  function getAggregatedState(alerts) {
    const statePriority = { firing: 3, pending: 2, inactive: 1 }
    let worstState = 'inactive'
    let worstPriority = 0

    alerts.forEach(alert => {
      const state = alert.state || 'inactive'
      const priority = statePriority[state] || 0
      if (priority > worstPriority) {
        worstState = state
        worstPriority = priority
      }
    })

    return worstState
  }

  // Cleanup (called when store is destroyed)
  function cleanup() {
    stopPolling()
    clearTasks()
  }

  return {
    // State
    alerts,
    alertmanagerAlerts,
    alertmanagerReceiverAlerts,
    alertmanagerSilences,
    tasks,
    // Expose as "watchedTasks" for backwards compatibility (Set of *unwatched* task names).
    watchedTasks: unwatchedTasks,
    selectedTask,
    loading,
    polling,
    pollingCountdown,
    deadManSwitchOk,

    // Computed
    sortedTasks,
    selectedTaskAlerts,
    alertCounts,

    // Actions
    initialize,
    cleanup,
    fetchAlerts,
    refresh,
    markPolled,
    refreshAlertmanagerSilences,
    startPolling,
    stopPolling,
    toggleTaskWatch,
    selectTask,
    clearTasks,
    buildAlertHierarchy
  }
})
