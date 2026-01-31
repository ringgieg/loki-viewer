import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTaskStore } from './taskStore'
import * as loki from '../api/loki'

// Mock loki API
vi.mock('../api/loki', () => ({
  getTaskNames: vi.fn()
}))

// Mock serviceStore
vi.mock('./serviceStore', () => ({
  useServiceStore: vi.fn(() => ({
    getCurrentServiceId: vi.fn(() => 'test-service')
  }))
}))

describe('taskStore', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useTaskStore()

    // Clear localStorage
    localStorage.clear()

    // Reset mocks
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('initialization', () => {
    it('should initialize with empty tasks and watchedTasks', () => {
      expect(store.tasks).toEqual([])
      expect(store.watchedTasks).toEqual(new Set())
      expect(store.loading).toBe(false)
    })
  })

  describe('fetchTasks()', () => {
    it('should fetch tasks from API and mark watched tasks', async () => {
      loki.getTaskNames.mockResolvedValue(['task-1', 'task-2', 'task-3'])

      // Pre-set some watched tasks
      store.watchedTasks = new Set(['task-2'])

      await store.fetchTasks()

      expect(loki.getTaskNames).toHaveBeenCalledOnce()
      expect(store.tasks).toHaveLength(3)
      expect(store.tasks[0]).toEqual({ name: 'task-1', watched: false, existsInLoki: true })
      expect(store.tasks[1]).toEqual({ name: 'task-2', watched: true, existsInLoki: true })
      expect(store.tasks[2]).toEqual({ name: 'task-3', watched: false, existsInLoki: true })
    })

    it('should set loading state during fetch', async () => {
      loki.getTaskNames.mockImplementation(() => {
        expect(store.loading).toBe(true)
        return Promise.resolve(['task-1'])
      })

      await store.fetchTasks()

      expect(store.loading).toBe(false)
    })

    it('should handle fetch errors gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      loki.getTaskNames.mockRejectedValue(new Error('Network error'))

      await store.fetchTasks()

      expect(consoleError).toHaveBeenCalledWith('Error fetching tasks:', expect.any(Error))
      expect(store.loading).toBe(false)
      expect(store.tasks).toEqual([])

      consoleError.mockRestore()
    })

    it('should include watched tasks even if they are not in Loki', async () => {
      loki.getTaskNames.mockResolvedValue(['task-1', 'task-2'])

      // Pre-set watched tasks including one not in Loki
      store.watchedTasks = new Set(['task-2', 'task-not-in-loki'])

      await store.fetchTasks()

      expect(store.tasks).toHaveLength(3)
      expect(store.tasks).toContainEqual({ name: 'task-1', watched: false, existsInLoki: true })
      expect(store.tasks).toContainEqual({ name: 'task-2', watched: true, existsInLoki: true })
      expect(store.tasks).toContainEqual({ name: 'task-not-in-loki', watched: true, existsInLoki: false })
    })
  })

  describe('toggleWatched()', () => {
    beforeEach(async () => {
      loki.getTaskNames.mockResolvedValue(['task-1', 'task-2', 'task-3'])
      await store.fetchTasks()
    })

    it('should add task to watchedTasks when not watched', () => {
      store.toggleWatched('task-1')

      expect(store.watchedTasks.has('task-1')).toBe(true)
      const task = store.tasks.find(t => t.name === 'task-1')
      expect(task.watched).toBe(true)
    })

    it('should remove task from watchedTasks when already watched', () => {
      store.toggleWatched('task-1')
      expect(store.watchedTasks.has('task-1')).toBe(true)

      store.toggleWatched('task-1')
      expect(store.watchedTasks.has('task-1')).toBe(false)

      const task = store.tasks.find(t => t.name === 'task-1')
      expect(task.watched).toBe(false)
    })

    it('should persist watched tasks to localStorage', () => {
      store.toggleWatched('task-1')
      store.toggleWatched('task-2')

      const saved = JSON.parse(localStorage.getItem('dashboard-watched-tasks-test-service'))
      expect(saved).toEqual(['task-1', 'task-2'])
    })
  })

  // Note: loadWatchedTasks() and saveWatchedTasks() are private functions
  // They are tested indirectly through initialize() and toggleWatched()

  describe('sortedTasks', () => {
    beforeEach(async () => {
      loki.getTaskNames.mockResolvedValue(['zebra', 'alpha', 'beta', 'gamma'])
      await store.fetchTasks()
    })

    it('should sort watched tasks before unwatched tasks', () => {
      store.toggleWatched('gamma')
      store.toggleWatched('alpha')

      const sorted = store.sortedTasks

      expect(sorted[0].name).toBe('alpha')
      expect(sorted[0].watched).toBe(true)
      expect(sorted[1].name).toBe('gamma')
      expect(sorted[1].watched).toBe(true)
      expect(sorted[2].watched).toBe(false)
      expect(sorted[3].watched).toBe(false)
    })

    it('should sort alphabetically within watched and unwatched groups', () => {
      store.toggleWatched('zebra')
      store.toggleWatched('beta')

      const sorted = store.sortedTasks

      // Watched group (sorted alphabetically)
      expect(sorted[0].name).toBe('beta')
      expect(sorted[1].name).toBe('zebra')

      // Unwatched group (sorted alphabetically)
      expect(sorted[2].name).toBe('alpha')
      expect(sorted[3].name).toBe('gamma')
    })

    it('should reactively update when tasks change', async () => {
      const initialSorted = store.sortedTasks
      expect(initialSorted).toHaveLength(4)

      // Add new task
      loki.getTaskNames.mockResolvedValue(['zebra', 'alpha', 'beta', 'gamma', 'new-task'])
      await store.fetchTasks()

      expect(store.sortedTasks).toHaveLength(5)
    })
  })

  describe('initialize()', () => {
    it('should load watched tasks and fetch tasks from API', async () => {
      localStorage.setItem('dashboard-watched-tasks-test-service', JSON.stringify(['task-2']))
      loki.getTaskNames.mockResolvedValue(['task-1', 'task-2', 'task-3'])

      await store.initialize()

      expect(store.watchedTasks).toEqual(new Set(['task-2']))
      expect(store.tasks).toHaveLength(3)
      expect(store.tasks.find(t => t.name === 'task-2').watched).toBe(true)
    })

    it('should isolate watched tasks by service', async () => {
      // Set watched tasks for test-service
      localStorage.setItem('dashboard-watched-tasks-test-service', JSON.stringify(['task-1']))
      // Set different watched tasks for another service
      localStorage.setItem('dashboard-watched-tasks-other-service', JSON.stringify(['task-2', 'task-3']))

      // Mock API response
      loki.getTaskNames.mockResolvedValue(['task-1', 'task-2', 'task-3'])

      // Initialize (should only load test-service's tasks)
      await store.initialize()

      // Should only have task-1 as watched (from test-service)
      expect(store.watchedTasks).toEqual(new Set(['task-1']))
      expect(store.watchedTasks.has('task-2')).toBe(false)
      expect(store.watchedTasks.has('task-3')).toBe(false)

      // Verify task states
      const watchedTask = store.tasks.find(t => t.name === 'task-1')
      expect(watchedTask.watched).toBe(true)
    })
  })
})
