import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getTaskNames } from '../api/loki'

const STORAGE_KEY = 'loki-viewer-watched-tasks'

export const useTaskStore = defineStore('task', () => {
  // State
  const tasks = ref([])
  const watchedTasks = ref(new Set())
  const loading = ref(false)
  // Unread alerts count per task: Map<taskName, count>
  const unreadAlerts = ref(new Map())

  // Load watched tasks from localStorage
  function loadWatchedTasks() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        watchedTasks.value = new Set(JSON.parse(saved))
      }
    } catch (e) {
      console.error('Error loading watched tasks:', e)
    }
  }

  // Save watched tasks to localStorage
  function saveWatchedTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...watchedTasks.value]))
    } catch (e) {
      console.error('Error saving watched tasks:', e)
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
      tasks.value = taskNames.map(name => ({
        name,
        watched: watchedTasks.value.has(name)
      }))
    } catch (e) {
      console.error('Error fetching tasks:', e)
    } finally {
      loading.value = false
    }
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
    const current = unreadAlerts.value.get(taskName) || 0
    unreadAlerts.value.set(taskName, current + 1)
  }

  // Clear unread alerts for a task
  function clearUnreadAlerts(taskName) {
    unreadAlerts.value.delete(taskName)
  }

  // Get unread alert count for a task
  function getUnreadAlertCount(taskName) {
    return unreadAlerts.value.get(taskName) || 0
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
    toggleWatched,
    incrementUnreadAlerts,
    clearUnreadAlerts,
    getUnreadAlertCount
  }
})
