import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getTaskNames } from '../api/vmlog'
import { useServiceStore } from './serviceStore'

const STORAGE_KEY_PREFIX = 'dashboard-watched-tasks'

export const useTaskStore = defineStore('task', () => {
  // State
  const tasks = ref([])
  const watchedTasks = ref(new Set())
  const loading = ref(false)
  // Unread alerts count per task: Object {taskName: count}
  const unreadAlerts = ref({})

  // Get storage key for current service
  function getStorageKey() {
    const serviceStore = useServiceStore()
    const serviceId = serviceStore.getCurrentServiceId()
    return `${STORAGE_KEY_PREFIX}-${serviceId}`
  }

  // Load watched tasks from localStorage
  function loadWatchedTasks() {
    try {
      const saved = localStorage.getItem(getStorageKey())
      if (saved) {
        watchedTasks.value = new Set(JSON.parse(saved))
      } else {
        // Reset to empty if no saved data for this service
        watchedTasks.value = new Set()
      }
    } catch (e) {
      console.error('Error loading watched tasks:', e)
      ElMessage.warning({
        message: '无法加载已保存的关注列表，可能是因为浏览器隐私模式',
        duration: 3000
      })
    }
  }

  // Save watched tasks to localStorage
  function saveWatchedTasks() {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify([...watchedTasks.value]))
    } catch (e) {
      console.error('Error saving watched tasks:', e)
      ElMessage.error({
        message: '无法保存关注设置（浏览器隐私模式下设置不会被保存）',
        duration: 5000
      })
    }
  }

  // Initialize store
  async function initialize() {
    loadWatchedTasks()
    await fetchTasks()
  }

  // Fetch available tasks
  async function fetchTasks() {
    loading.value = true
    try {
      const taskNames = await getTaskNames()
      const vmlogTaskSet = new Set(taskNames)

      // Merge tasks from VMLog with watched tasks
      // This ensures watched tasks are always shown, even if they don't exist in VMLog yet
      const allTaskNames = new Set([...taskNames, ...watchedTasks.value])

      tasks.value = Array.from(allTaskNames).map(name => ({
        name,
        watched: watchedTasks.value.has(name),
        existsInVmLog: vmlogTaskSet.has(name) // Flag to indicate if task has logs in VMLog
      }))
    } catch (e) {
      console.error('Error fetching tasks:', e)
    } finally {
      loading.value = false
    }
  }

  // Clear all tasks (useful when switching services)
  function clearTasks() {
    tasks.value = []
    unreadAlerts.value = {}
  }

  // Reload tasks for current service (called when service switches)
  async function reloadForService() {
    // Clear current state
    clearTasks()

    // Load watched tasks for the new service
    loadWatchedTasks()

    // Fetch tasks from API
    await fetchTasks()
  }

  // Toggle watched status for a task
  function toggleWatched(taskName) {
    if (watchedTasks.value.has(taskName)) {
      watchedTasks.value.delete(taskName)
    } else {
      watchedTasks.value.add(taskName)
    }

    // Update task object
    const task = tasks.value.find(t => t.name === taskName)
    if (task) {
      task.watched = watchedTasks.value.has(taskName)
    }

    saveWatchedTasks()
  }

  // Increment unread alert count for a task
  function incrementUnreadAlerts(taskName) {
    const current = unreadAlerts.value[taskName] || 0
    unreadAlerts.value[taskName] = current + 1
  }

  // Clear unread alerts for a task
  function clearUnreadAlerts(taskName) {
    delete unreadAlerts.value[taskName]
  }

  // Get unread alert count for a task
  function getUnreadAlertCount(taskName) {
    return unreadAlerts.value[taskName] || 0
  }

  // Computed: sorted tasks (watched first, then alphabetically)
  const sortedTasks = computed(() => {
    return [...tasks.value].sort((a, b) => {
      // Watched tasks first
      if (a.watched !== b.watched) {
        return a.watched ? -1 : 1
      }
      // Then alphabetically
      return a.name.localeCompare(b.name)
    })
  })

  return {
    // State
    tasks,
    watchedTasks,
    loading,
    unreadAlerts,

    // Computed
    sortedTasks,

    // Actions
    initialize,
    fetchTasks,
    loadTasks: fetchTasks,  // Alias for consistency
    clearTasks,
    reloadForService,
    toggleWatched,
    incrementUnreadAlerts,
    clearUnreadAlerts,
    getUnreadAlertCount
  }
})
