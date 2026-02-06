import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AlertmanagerSilenceDropdown from './AlertmanagerSilenceDropdown.vue'

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  },
  ElMessageBox: {
    confirm: vi.fn()
  }
}))

vi.mock('@element-plus/icons-vue', () => ({
  Clock: { name: 'Clock', render: () => null },
  MuteNotification: { name: 'MuteNotification', render: () => null }
}))

vi.mock('../api/alertmanager', () => ({
  createAlertmanagerSilence: vi.fn(),
  deleteAlertmanagerSilence: vi.fn(),
  getAlertmanagerSilences: vi.fn()
}))

import { ElMessageBox } from 'element-plus'
import {
  createAlertmanagerSilence,
  getAlertmanagerSilences
} from '../api/alertmanager'

const globalStubs = {
  ElDropdown: {
    name: 'ElDropdown',
    emits: ['command', 'visible-change', 'click'],
    template: '<div><slot /><slot name="dropdown" /></div>'
  },
  ElDropdownMenu: {
    name: 'ElDropdownMenu',
    template: '<div><slot /></div>'
  },
  ElDropdownItem: {
    name: 'ElDropdownItem',
    props: ['command', 'disabled'],
    template: '<div><slot /></div>'
  },
  ElButton: {
    name: 'ElButton',
    template: '<button><slot /></button>'
  },
  ElIcon: {
    name: 'ElIcon',
    template: '<i><slot /></i>'
  }
}

describe('AlertmanagerSilenceDropdown.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ElMessageBox.confirm.mockResolvedValue(true)
    createAlertmanagerSilence.mockResolvedValue({ id: 'silence-1' })
    getAlertmanagerSilences.mockResolvedValue([])
  })

  it('creates silence using labels prop and excludes internal + excluded keys', async () => {
    const wrapper = mount(AlertmanagerSilenceDropdown, {
      props: {
        labels: {
          alertname: 'HighCPUUsage',
          instance: 'node-1',
          job: 'node',
          '__threshold_name__': 'critical'
        },
        excludeLabelKeys: ['job'],
        includeAlertnameFallback: false,
        requireAlertmanagerMatch: false
      },
      global: {
        stubs: globalStubs
      }
    })

    await wrapper.findComponent({ name: 'ElDropdown' }).vm.$emit('command', '5')
    await flushPromises()

    expect(createAlertmanagerSilence).toHaveBeenCalledTimes(1)
    const payload = createAlertmanagerSilence.mock.calls[0][0]
    const matcherNames = payload.matchers.map(item => item.name)
    expect(matcherNames).toContain('alertname')
    expect(matcherNames).toContain('instance')
    expect(matcherNames).not.toContain('job')
    expect(matcherNames).not.toContain('__threshold_name__')
  })

  it('includes internal labels when allowInternalLabels is true', async () => {
    const wrapper = mount(AlertmanagerSilenceDropdown, {
      props: {
        labels: {
          alertname: 'HighCPUUsage',
          '__threshold_name__': 'critical'
        },
        allowInternalLabels: true,
        includeAlertnameFallback: false,
        requireAlertmanagerMatch: false
      },
      global: {
        stubs: globalStubs
      }
    })

    await wrapper.findComponent({ name: 'ElDropdown' }).vm.$emit('command', '5')
    await flushPromises()

    const payload = createAlertmanagerSilence.mock.calls[0][0]
    const matcherNames = payload.matchers.map(item => item.name)
    expect(matcherNames).toContain('__threshold_name__')
  })

  it('uses confirmation dialog when confirmBeforeCreate is true', async () => {
    const wrapper = mount(AlertmanagerSilenceDropdown, {
      props: {
        labels: { alertname: 'HighCPUUsage' },
        confirmBeforeCreate: true,
        includeAlertnameFallback: false,
        requireAlertmanagerMatch: false
      },
      global: {
        stubs: globalStubs
      }
    })

    await wrapper.findComponent({ name: 'ElDropdown' }).vm.$emit('command', '5')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(createAlertmanagerSilence).toHaveBeenCalledTimes(1)
  })

  it('does not create silence when confirmation is cancelled', async () => {
    ElMessageBox.confirm.mockRejectedValueOnce(new Error('cancel'))

    const wrapper = mount(AlertmanagerSilenceDropdown, {
      props: {
        labels: { alertname: 'HighCPUUsage' },
        confirmBeforeCreate: true,
        includeAlertnameFallback: false,
        requireAlertmanagerMatch: false
      },
      global: {
        stubs: globalStubs
      }
    })

    await wrapper.findComponent({ name: 'ElDropdown' }).vm.$emit('command', '5')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(createAlertmanagerSilence).not.toHaveBeenCalled()
  })

  it('fetches silences when dropdown becomes visible', async () => {
    const wrapper = mount(AlertmanagerSilenceDropdown, {
      props: {
        labels: { alertname: 'HighCPUUsage' },
        requireAlertmanagerMatch: false
      },
      global: {
        stubs: globalStubs
      }
    })

    await wrapper.findComponent({ name: 'ElDropdown' }).vm.$emit('visible-change', true)
    await flushPromises()

    expect(getAlertmanagerSilences).toHaveBeenCalled()
  })
})
