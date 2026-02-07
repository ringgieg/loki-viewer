import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useVmalertStore } from './vmalertStore'
import { useServiceStore } from './serviceStore'
import { getAlerts } from '../api/vmalert'

vi.mock('element-plus', () => ({
  ElMessage: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn()
  }
}))

vi.mock('../api/alertmanager', () => ({
  getAlertmanagerAlerts: vi.fn().mockResolvedValue([]),
  getAlertmanagerSilences: vi.fn().mockResolvedValue([])
}))

vi.mock('../utils/alertmanager', () => ({
  applyAlertmanagerReceiverMapping: vi.fn(),
  filterAlertmanagerAlertsByReceivers: vi.fn(() => []),
  resolveAlertmanagerState: vi.fn((alert) => alert?.status?.state || alert?.state || 'inactive')
}))

vi.mock('../api/vmalert', () => ({
  getAlerts: vi.fn(),
  filterAlerts: vi.fn((alerts, fixedLabels) => {
    if (!fixedLabels || typeof fixedLabels !== 'object') return alerts
    const entries = Object.entries(fixedLabels).filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
    if (entries.length === 0) return alerts
    return alerts.filter((alert) => {
      const labels = alert?.labels || {}
      return entries.every(([k, v]) => String(labels[k]) === String(v))
    })
  }),
  groupAlertsByLabel: vi.fn(() => new Map())
}))

vi.mock('../utils/config', async () => {
  const actual = await vi.importActual('../utils/config')
  return {
    ...actual,
    getPrometheusTaskLabel: () => 'task',
    getPrometheusFixedLabels: () => ({}),
    getPrometheusPollingInterval: () => 60_000,
    getPrometheusColumns: () => [],
    isDeadManSwitchEnabled: () => false,
    getDeadManSwitchAlertName: () => 'DeadManSwitch',
    getAlertmanagerReceivers: () => [],
    getPrometheusSeverityLevels: () => ['critical', 'warning', 'info'],
    getPrometheusSeverityLabel: () => 'severity',
    getPrometheusAlertLevel: () => 'CRITICAL',
    isPrometheusAlertLevelEnabled: () => false
  }
})

describe('vmalertStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())

    // Minimal runtime config for serviceStore
    window.APP_CONFIG = {
      activeService: 'vmalert-dashboard',
      services: [
        {
          id: 'vmalert-dashboard',
          displayName: 'VMAlert Dashboard',
          type: 'vmalert-multitask'
        }
      ]
    }

    // Ensure local/session storage are clean between tests
    localStorage.clear()
    sessionStorage.clear()

    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('fetchAlerts populates alerts + tasks from alert labels', async () => {
    getAlerts.mockResolvedValue([
      { state: 'firing', labels: { task: 'task-a' } },
      { state: 'pending', labels: { task: 'task-b' } },
      { state: 'inactive', labels: { task: 'task-a' } }
    ])

    const serviceStore = useServiceStore()
    serviceStore.initialize()

    const store = useVmalertStore()
    await store.fetchAlerts({ showLoading: true })

    expect(store.alerts).toHaveLength(3)
    expect(store.tasks).toHaveLength(2)

    const taskNames = store.tasks.map(t => t.name).sort()
    expect(taskNames).toEqual(['task-a', 'task-b'])

    const taskA = store.tasks.find(t => t.name === 'task-a')
    expect(taskA.watched).toBe(true)
    expect(taskA.existsInVmalert).toBe(true)

    expect(store.alertCounts.total).toBe(3)
    expect(store.alertCounts.firing).toBe(1)
    expect(store.alertCounts.pending).toBe(1)
    expect(store.alertCounts.inactive).toBe(1)
  })

  it('toggleTaskWatch persists watched tasks per service', async () => {
    getAlerts.mockResolvedValue([
      { state: 'inactive', labels: { task: 'task-a' } }
    ])

    const serviceStore = useServiceStore()
    serviceStore.initialize()

    const store = useVmalertStore()
    await store.fetchAlerts()

    store.toggleTaskWatch('task-a')

    const key = 'dashboard-watched-vmalert-tasks-vmalert-dashboard'
    expect(JSON.parse(localStorage.getItem(key))).toEqual(['task-a'])

    const taskA = store.tasks.find(t => t.name === 'task-a')
    expect(taskA.watched).toBe(false)
  })
})
