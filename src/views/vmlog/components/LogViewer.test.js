import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import LogViewer from './LogViewer.vue'
import * as vmlog from '../../../api/vmlog'
import { useWsStore } from '../../../stores/wsStore'

// Mock vmlog API
vi.mock('../../../api/vmlog', () => ({
  queryTaskLogs: vi.fn(),
  filterLogsByLevel: vi.fn((logs, level) => logs)
}))

// Mock config
vi.mock('../../../utils/config', () => ({
  getConfig: vi.fn((key, fallback) => {
    const config = {
      'alert.newLogHighlightDuration': 3000,
      'routing.basePath': '/logs'
    }
    return config[key] !== undefined ? config[key] : fallback
  }),
  getCurrentServiceConfig: vi.fn((key, fallback) => {
    const config = {
      'defaultLogLevel': '',
      'logsPerPage': 500
    }
    return config[key] !== undefined ? config[key] : fallback
  })
}))

// Mock VirtualLogList
vi.mock('./VirtualLogList.vue', () => ({
  default: {
    name: 'VirtualLogList',
    template: '<div class="virtual-log-list-mock">Logs: {{ logs.length }}</div>',
    props: ['logs', 'loading', 'hasMore'],
    emits: ['load-more']
  }
}))

describe('LogViewer.vue', () => {
  let router
  let pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
        { path: '/logs/batch-sync/:taskName', name: 'task', component: LogViewer }
      ]
    })

    vi.clearAllMocks()
  })

  async function createWrapper(taskName = null) {
    const path = taskName ? `/logs/batch-sync/${taskName}` : '/'
    await router.push(path)
    await router.isReady()

    return mount(LogViewer, {
      global: {
        plugins: [pinia, router],
        stubs: {
          ElButton: {
            template: '<button><slot /></button>',
            props: ['size', 'disabled']
          },
          ElSelect: {
            template: '<select><slot /></select>',
            props: ['modelValue', 'placeholder', 'size', 'style']
          },
          ElOption: {
            template: '<option :value="value"><slot /></option>',
            props: ['label', 'value']
          }
        }
      }
    })
  }

  it('should display "please select a task" when no task is selected', async () => {
    const wrapper = await createWrapper()
    await flushPromises()

    expect(wrapper.find('.empty-state').text()).toBe('请选择一个任务')
  })

  it('should fetch initial logs when task is selected', async () => {
    const mockLogs = [
      { id: '1', line: 'Log 1', level: 'INFO', timestamp: 1000 },
      { id: '2', line: 'Log 2', level: 'ERROR', timestamp: 2000 }
    ]

    vmlog.queryTaskLogs.mockResolvedValue({
      logs: mockLogs,
      nextCursor: '12345',
      hasMore: true
    })

    const wrapper = await createWrapper('test-task')
    await flushPromises()

    expect(vmlog.queryTaskLogs).toHaveBeenCalledWith('test-task', {
      limit: 500
    })
    expect(wrapper.vm.logs.length).toBeGreaterThan(0)
  })

  it('should pass level filter to API when selected', async () => {
    vmlog.queryTaskLogs.mockResolvedValue({
      logs: [],
      nextCursor: null,
      hasMore: false
    })

    const wrapper = await createWrapper('test-task')
    await flushPromises()

    // Change level filter
    wrapper.vm.selectedLevel = 'ERROR'
    await wrapper.vm.$nextTick()
    await flushPromises()

    const calls = vmlog.queryTaskLogs.mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1]).toMatchObject({
      limit: 500,
      level: 'ERROR'
    })
  })

  it('should display connection status based on WebSocket state', async () => {
    vmlog.queryTaskLogs.mockResolvedValue({
      logs: [],
      nextCursor: null,
      hasMore: false
    })

    const wsStore = useWsStore()
    wsStore.isConnected = true

    const wrapper = await createWrapper('test-task')
    await flushPromises()

    expect(wrapper.vm.connectionStatus).toBe('connected')
    expect(wrapper.vm.connectionStatusText).toBe('已连接')

    wsStore.isConnected = false
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.connectionStatus).toBe('disconnected')
    expect(wrapper.vm.connectionStatusText).toBe('连接断开')
  })

  it('should clear logs when switching tasks', async () => {
    const initialLogs = [
      { id: '1', line: 'Task 1 log', level: 'INFO', timestamp: 1000 }
    ]

    const newTaskLogs = [
      { id: '2', line: 'Task 2 log', level: 'INFO', timestamp: 2000 }
    ]

    vmlog.queryTaskLogs
      .mockResolvedValueOnce({
        logs: initialLogs,
        nextCursor: null,
        hasMore: false
      })
      .mockResolvedValueOnce({
        logs: newTaskLogs,
        nextCursor: null,
        hasMore: false
      })

    const wrapper = await createWrapper('task-1')
    await flushPromises()

    expect(wrapper.vm.logs).toHaveLength(1)

    // Switch to task-2
    await router.push('/logs/batch-sync/task-2')
    await flushPromises()

    expect(wrapper.vm.logs).toHaveLength(1)
    expect(wrapper.vm.logs[0].line).toBe('Task 2 log')
  })

  it('should handle API errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vmlog.queryTaskLogs.mockRejectedValue(new Error('API Error'))

    const wrapper = await createWrapper('test-task')
    await flushPromises()

    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('should reset pagination state when changing tasks', async () => {
    vmlog.queryTaskLogs
      .mockResolvedValueOnce({
        logs: [],
        nextCursor: '12345',
        hasMore: true
      })
      .mockResolvedValueOnce({
        logs: [],
        nextCursor: '67890',
        hasMore: true
      })

    const wrapper = await createWrapper('task-1')
    await flushPromises()

    expect(wrapper.vm.nextCursor).toBe('12345')
    expect(wrapper.vm.hasMore).toBe(true)

    // Change task
    await router.push('/logs/batch-sync/task-2')
    await flushPromises()

    // Should fetch new data with new cursor
    expect(wrapper.vm.nextCursor).toBe('67890')
  })
})
