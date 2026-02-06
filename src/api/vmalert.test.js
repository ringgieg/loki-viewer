import { describe, it, expect } from 'vitest'
import { buildAlertMatchers, filterAlerts, groupAlertsByLabel } from './vmalert'

describe('vmalert api helpers', () => {
  it('buildAlertMatchers merges fixed labels and filters', () => {
    expect(buildAlertMatchers({ job: 'api', env: 'prod' }, { instance: 'node-1' }))
      .toEqual({ job: 'api', env: 'prod', instance: 'node-1' })
  })

  it('filterAlerts returns all alerts when matchers empty', () => {
    const alerts = [
      { labels: { job: 'a' } },
      { labels: { job: 'b' } }
    ]

    expect(filterAlerts(alerts, {})).toBe(alerts)
    expect(filterAlerts(alerts, null)).toBe(alerts)
  })

  it('filterAlerts matches by labels', () => {
    const alerts = [
      { labels: { job: 'api', instance: 'n1' } },
      { labels: { job: 'api', instance: 'n2' } },
      { labels: { job: 'db', instance: 'n3' } }
    ]

    expect(filterAlerts(alerts, { job: 'api' })).toHaveLength(2)
    expect(filterAlerts(alerts, { job: 'api', instance: 'n2' })).toEqual([
      { labels: { job: 'api', instance: 'n2' } }
    ])
  })

  it('groupAlertsByLabel groups by alertLabels and uses unknown for missing', () => {
    const alerts = [
      { labels: { job: 'api' } },
      { labels: { job: 'api' } },
      { labels: { job: 'db' } },
      { labels: { } }
    ]

    const groups = groupAlertsByLabel(alerts, 'job', 'alertLabels')
    expect(groups.get('api')).toHaveLength(2)
    expect(groups.get('db')).toHaveLength(1)
    expect(groups.get('unknown')).toHaveLength(1)
  })

  it('groupAlertsByLabel can group by metricLabels and skips missing', () => {
    const alerts = [
      { metricLabels: { instance: 'n1' }, labels: { instance: 'x1' } },
      { metricLabels: { instance: 'n1' }, labels: { instance: 'x2' } },
      { metricLabels: { instance: 'n2' }, labels: { instance: 'x3' } },
      { labels: { instance: 'x4' } }
    ]

    const groups = groupAlertsByLabel(alerts, 'instance', 'metricLabels')
    expect(groups.get('n1')).toHaveLength(2)
    expect(groups.get('n2')).toHaveLength(1)
    expect(groups.has('x4')).toBe(false)
  })
})
