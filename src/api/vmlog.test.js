import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  queryLogsWithCursor,
  getLabelValues,
  getTaskNames,
  buildTaskQuery,
  queryTaskLogs,
  filterLogsByLevel,
  __test__
} from './vmlog.js'

// Mock axios
vi.mock('axios')

describe('vmlog.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set default config for tests (multi-service format)
    window.APP_CONFIG = {
      activeService: 'batch-sync',
      services: [
        {
          id: 'batch-sync',
          displayName: 'Batch-Sync Service',
          vmlog: {
            fixedLabels: {
              job: 'tasks',
              service: 'Batch-Sync'
            },
            taskLabel: 'task_name'
          }
        }
      ],
      vmlog: {
        apiBasePath: '/select/logsql'
      }
    }
  })

  afterEach(() => {
    delete window.APP_CONFIG
  })

  describe('queryLogsWithCursor()', () => {
    it('should query logs with default parameters', async () => {
      const mockResponse = {
        data: [
          JSON.stringify({
            _time: '2026-02-06T00:00:00Z',
            _msg: 'Test log message',
            service: 'batch-sync',
            task_name: 'test-task',
            level: 'INFO'
          })
        ].join('\n') + '\n'
      }

      axios.post.mockResolvedValue(mockResponse)

      const result = await queryLogsWithCursor('{service="batch-sync"}')

      expect(axios.post).toHaveBeenCalledWith(
        '/select/logsql/query',
        expect.any(URLSearchParams),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          responseType: 'text'
        })
      )

      const body = axios.post.mock.calls[0][1]
      expect(body.get('query')).toBe('{service="batch-sync"}')
      expect(body.get('limit')).toBe('500')
      expect(body.get('offset')).toBe('0')

      expect(result.logs).toHaveLength(1)
      expect(result.logs[0]).toMatchObject({
        line: 'Test log message',
        service: 'batch-sync',
        taskName: 'test-task',
        level: 'INFO'
      })
    })

    it('should handle cursor-based pagination via offset', async () => {
      const mockResponse = { data: '' }
      axios.post.mockResolvedValue(mockResponse)

      await queryLogsWithCursor('{service="batch-sync"}', { cursor: '500' })

      const body = axios.post.mock.calls[0][1]
      expect(body.get('offset')).toBe('500')
    })

    it('should return nextCursor and hasMore flag', async () => {
      const mockResponse = {
        data: [
          JSON.stringify({ _time: '2026-02-06T00:00:02Z', _msg: 'Log 1', task_name: 't', service: 'batch-sync', level: 'INFO' }),
          JSON.stringify({ _time: '2026-02-06T00:00:01Z', _msg: 'Log 2', task_name: 't', service: 'batch-sync', level: 'INFO' })
        ].join('\n') + '\n'
      }

      axios.post.mockResolvedValue(mockResponse)

      const result = await queryLogsWithCursor('{service="batch-sync"}', { limit: 2 })

      expect(result.hasMore).toBe(true)
      expect(result.nextCursor).toBe('2')
    })

    it('should retry on 429 Too Many Requests', async () => {
      const errorResponse = {
        response: { status: 429 }
      }

      const successResponse = {
        data: JSON.stringify({ _time: '2026-02-06T00:00:00Z', _msg: 'Success after retry', service: 'batch-sync', task_name: 't' }) + '\n'
      }

      axios.post
        .mockRejectedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse)

      const result = await queryLogsWithCursor('{service="batch-sync"}')

      expect(axios.post).toHaveBeenCalledTimes(2)
      expect(result.logs).toHaveLength(1)
    })

    it('should throw error after max retries', async () => {
      const errorResponse = {
        response: { status: 429 }
      }

      axios.post.mockRejectedValue(errorResponse)

      await expect(
        queryLogsWithCursor('{service="batch-sync"}')
      ).rejects.toMatchObject({ response: { status: 429 } })

      expect(axios.post).toHaveBeenCalledTimes(3) // max retries = 3
    })

    it('should dedupe concurrent identical requests', async () => {
      const mockResponse = {
        data: JSON.stringify({ _time: '2026-02-06T00:00:00Z', _msg: 'Same', service: 'batch-sync', task_name: 't', level: 'INFO' }) + '\n'
      }

      let resolvePost
      const postPromise = new Promise((resolve) => {
        resolvePost = resolve
      })

      axios.post.mockReturnValue(postPromise)

      const p1 = queryLogsWithCursor('{service="batch-sync"}', { limit: 10 })
      const p2 = queryLogsWithCursor('{service="batch-sync"}', { limit: 10 })

      expect(axios.post).toHaveBeenCalledTimes(1)

      resolvePost(mockResponse)

      const [r1, r2] = await Promise.all([p1, p2])
      expect(r1).toEqual(r2)
      expect(r1.logs).toHaveLength(1)
      expect(r1.logs[0].line).toBe('Same')
    })

    it('should preserve explicit query.defaultTimeRangeDays=0 (no falsy fallback)', async () => {
      window.APP_CONFIG.services[0].query = { defaultTimeRangeDays: 0 }

      axios.post.mockResolvedValue({ data: '' })

      await queryLogsWithCursor('{service="batch-sync"}')

      const body = axios.post.mock.calls[0][1]
      expect(body.get('start')).toBe('0d')
      expect(body.get('end')).toBe('now')
    })
  })

  describe('getLabelValues()', () => {
    it('should fetch label values from API', async () => {
      const mockResponse = {
        data: {
          values: [
            { value: 'task-1', hits: 10 },
            { value: 'task-2', hits: 5 },
            { value: 'task-3', hits: 1 }
          ]
        }
      }

      axios.post.mockResolvedValue(mockResponse)

      const result = await getLabelValues('task_name')

      expect(axios.post).toHaveBeenCalledWith(
        '/select/logsql/stream_field_values',
        expect.any(URLSearchParams),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
      )
      expect(result).toEqual(['task-1', 'task-2', 'task-3'])

      const body = axios.post.mock.calls[0][1]
      expect(body.get('query')).toBe('{job="tasks", service="Batch-Sync"}')
    })

    it('should preserve explicit query.defaultTimeRangeDays=0 (no falsy fallback)', async () => {
      window.APP_CONFIG.services[0].query = { defaultTimeRangeDays: 0 }

      axios.post.mockResolvedValue({ data: { values: [] } })
      await getLabelValues('task_name')

      const body = axios.post.mock.calls[0][1]
      expect(body.get('start')).toBe('0d')
      expect(body.get('end')).toBe('now')
    })

    it('should build query based on fixedLabels array rules', async () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'env', in: ['prod', 'staging'] },
        { key: 'service', in: ['Batch-Sync'] }
      ]

      axios.post.mockResolvedValue({ data: { values: [] } })
      await getLabelValues('task_name')

      const body = axios.post.mock.calls[0][1]
      expect(body.get('query')).toBe('{env=~"^(?:prod|staging)$", service="Batch-Sync"}')
    })

    it('should build {} query when fixedLabels is empty', async () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = {}

      axios.post.mockResolvedValue({ data: { values: [] } })
      await getLabelValues('task_name')

      const body = axios.post.mock.calls[0][1]
      expect(body.get('query')).toBe('{}')

    })

    it('should handle empty label values', async () => {
      const mockResponse = {
        data: {
          values: []
        }
      }

      axios.post.mockResolvedValue(mockResponse)

      const result = await getLabelValues('nonexistent')

      expect(result).toEqual([])
    })

    it('should throw error on API failure', async () => {
      axios.post.mockRejectedValue(new Error('Network error'))

      await expect(getLabelValues('task_name')).rejects.toThrow('Network error')
    })
  })

  describe('getTaskNames()', () => {
    it('should fetch task names using getLabelValues', async () => {
      const mockResponse = {
        data: {
          values: [{ value: 'task-a' }, { value: 'task-b' }]
        }
      }

      axios.post.mockResolvedValue(mockResponse)

      const result = await getTaskNames()

      expect(axios.post).toHaveBeenCalled()
      expect(result).toEqual(['task-a', 'task-b'])
    })

    it('should use custom task label from config', async () => {
      window.APP_CONFIG.services[0].vmlog.taskLabel = 'job_name'

      const mockResponse = {
        data: {
          values: [{ value: 'job-a' }, { value: 'job-b' }]
        }
      }

      axios.post.mockResolvedValue(mockResponse)

      const result = await getTaskNames()

      const body = axios.post.mock.calls[0][1]
      expect(body.get('field')).toBe('job_name')
      expect(body.get('query')).toBe('{job="tasks", service="Batch-Sync"}')
      expect(result).toEqual(['job-a', 'job-b'])
    })

    it('should pass fixedLabels into underlying label-values query', async () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'service', in: ['Batch-Sync'] },
        { key: 'host', notIn: ['bad-host'] }
      ]

      axios.post.mockResolvedValue({ data: { values: [] } })
      await getTaskNames()

      const body = axios.post.mock.calls[0][1]
      expect(body.get('query')).toBe('{service="Batch-Sync", host!="bad-host"}')
    })
  })

  describe('buildTaskQuery()', () => {
    it('should build basic query without task name', () => {
      const query = buildTaskQuery(null)

      expect(query).toBe('{job="tasks", service="Batch-Sync"}')
    })

    it('should build query with task name', () => {
      const query = buildTaskQuery('my-task')

      expect(query).toBe('{job="tasks", service="Batch-Sync", task_name="my-task"}')
    })

    it('should use fixed labels from config', () => {
      const query = buildTaskQuery('my-task')

      expect(query).toContain('service="Batch-Sync"')
      expect(query).toContain('job="tasks"')
    })

    it('should use custom fixed labels from config', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = {
        env: 'production',
        app: 'MyApp'
      }
      window.APP_CONFIG.services[0].vmlog.taskLabel = 'job_name'

      const query = buildTaskQuery('my-task')

      expect(query).toBe('{env="production", app="MyApp", job_name="my-task"}')
    })

    it('should work with minimal fixed labels', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = {
        service: 'Batch-Sync'
      }
      window.APP_CONFIG.services[0].vmlog.taskLabel = 'task_name'

      const query = buildTaskQuery('my-task')

      expect(query).toBe('{service="Batch-Sync", task_name="my-task"}')
    })

    it('should support multiple fixed labels', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = {
        job: 'tasks',
        env: 'production',
        region: 'us-east-1',
        service: 'Batch-Sync'
      }
      window.APP_CONFIG.services[0].vmlog.taskLabel = 'task_name'

      const query = buildTaskQuery(null)

      expect(query).toBe('{job="tasks", env="production", region="us-east-1", service="Batch-Sync"}')
    })

    it('should support fixedLabels rules as an array (in single)', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'job', in: ['tasks'] },
        { key: 'service', in: ['Batch-Sync'] }
      ]

      const query = buildTaskQuery(null)
      expect(query).toBe('{job="tasks", service="Batch-Sync"}')
    })

    it('should support fixedLabels rules as an array (in multiple -> regex)', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'env', in: ['prod', 'staging'] }
      ]

      const query = buildTaskQuery(null)
      expect(query).toBe('{env=~"^(?:prod|staging)$"}')
    })

    it('should support fixedLabels rules as an array (notIn single)', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'host', notIn: ['bad-host'] }
      ]

      const query = buildTaskQuery(null)
      expect(query).toBe('{host!="bad-host"}')
    })

    it('should support fixedLabels rules as an array (notIn multiple -> regex)', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'host', notIn: ['bad-host', 'worse.host'] }
      ]

      const query = buildTaskQuery(null)
      // dots should be escaped in the regex alternative
      expect(query).toBe('{host!~"^(?:bad-host|worse\\.host)$"}')
    })

    it('should support inRegex and notRegex matchers', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'task_name', inRegex: '^(api|batch).*' },
        { key: 'filename', notRegex: '.*\\.gz$' }
      ]
      window.APP_CONFIG.services[0].vmlog.taskLabel = 'task_name'

      const query = buildTaskQuery(null)
      expect(query).toBe('{task_name=~"^(api|batch).*", filename!~".*\\\\.gz$"}')
    })

    it('should trim rule keys (array format) and ignore whitespace-only keys', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: '  ', in: ['ignored'] },
        { key: ' service ', in: ['Batch-Sync'] },
        { key: ' job ', in: ['tasks'] }
      ]

      const query = buildTaskQuery(null)
      expect(query).toBe('{service="Batch-Sync", job="tasks"}')
    })

    it('should trim map keys (backward compatible) and ignore whitespace-only keys', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = {
        '  ': 'ignored',
        ' env ': { in: ['prod'] },
        ' service ': 'Batch-Sync'
      }

      const query = buildTaskQuery(null)
      expect(query).toBe('{env="prod", service="Batch-Sync"}')
    })

    it('should escape quotes and backslashes in inRegex/notRegex matchers', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'msg', inRegex: '^a"b$' },
        { key: 'num', notRegex: '.*\\d+.*' }
      ]

      const query = buildTaskQuery(null)
      expect(query).toBe('{msg=~"^a\\"b$", num!~".*\\\\d+.*"}')
    })

    it('should ignore invalid/empty rules and keep valid ones', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        null,
        { },
        { key: '' },
        { key: 'env', in: [] },
        { key: 'env', notIn: [] },
        { key: 'region', in: ['us-east-1'] }
      ]

      const query = buildTaskQuery(null)
      expect(query).toBe('{region="us-east-1"}')
    })

    it('should allow rule objects inside fixedLabels map (backward compatible)', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = {
        env: { in: ['prod', 'staging'] },
        service: 'Batch-Sync'
      }

      const query = buildTaskQuery(null)
      expect(query).toBe('{env=~"^(?:prod|staging)$", service="Batch-Sync"}')
    })

    it('should escape quotes and backslashes in label values', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'service', in: ['A"B'] },
        { key: 'path', in: ['C:\\x'] }
      ]

      const query = buildTaskQuery(null)
      expect(query).toBe('{service="A\\"B", path="C:\\\\x"}')
    })

    it('should return {} when all fixedLabels rules are invalid (empty matchers)', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        null,
        123,
        'x',
        {},
        { key: '  ' },
        { key: 'env', in: ['', '  '] },
        { key: 'env', inRegex: '  ' }
      ]

      const query = buildTaskQuery(null)
      expect(query).toBe('{}')
    })

    it('should preserve matcher order from fixedLabels array config', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'b', in: ['2'] },
        { key: 'a', in: ['1'] },
        { key: 'c', in: ['3'] }
      ]

      const query = buildTaskQuery(null)
      expect(query).toBe('{b="2", a="1", c="3"}')
    })

    it('should not dedupe matchers with duplicate keys (current behavior)', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'x', in: ['1'] },
        { key: 'x', in: ['2'] }
      ]

      const query = buildTaskQuery(null)
      expect(query).toBe('{x="1", x="2"}')
    })

    it('should exercise non-object rules branch in buildTaskQuery() loop', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        123,
        'abc',
        { key: 'service', in: ['Batch-Sync'] }
      ]

      const query = buildTaskQuery(null)
      expect(query).toBe('{service="Batch-Sync"}')
    })

    it('should treat empty string taskName as no taskName (same as null)', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'task_name', inRegex: '^from-rule$' },
        { key: 'service', in: ['Batch-Sync'] }
      ]
      window.APP_CONFIG.services[0].vmlog.taskLabel = 'task_name'

      expect(buildTaskQuery('')).toBe('{task_name=~"^from-rule$", service="Batch-Sync"}')
      expect(buildTaskQuery(null)).toBe('{task_name=~"^from-rule$", service="Batch-Sync"}')
    })

    it('should escape special characters in taskName (quotes, backslashes, control chars)', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = {
        service: 'Batch-Sync'
      }
      window.APP_CONFIG.services[0].vmlog.taskLabel = 'task_name'

      expect(buildTaskQuery('task"name')).toBe('{service="Batch-Sync", task_name="task\\"name"}')
      expect(buildTaskQuery('task\\name')).toBe('{service="Batch-Sync", task_name="task\\\\name"}')
      const taskWithControls = 'line1' + '\n' + 'line2' + '\t' + 'end'
      expect(buildTaskQuery(taskWithControls)).toBe('{service="Batch-Sync", task_name="line1\\nline2\\tend"}')
    })

    it('should handle many fixedLabels matchers and long/unicode values', () => {
      const rules = []
      for (let i = 0; i < 50; i++) {
        rules.push({ key: `k${i}`, in: [`v${i}`] })
      }
      rules.push({ key: '服务', in: ['值✓'] })
      rules.push({ key: 'long', in: ['x'.repeat(2048)] })
      window.APP_CONFIG.services[0].vmlog.fixedLabels = rules

      const query = buildTaskQuery(null)
      expect(query.startsWith('{')).toBe(true)
      expect(query.endsWith('}')).toBe(true)
      expect(query).toContain('k0="v0"')
      expect(query).toContain('k49="v49"')
      expect(query).toContain('服务="值✓"')
      expect(query).toContain('long="' + 'x'.repeat(64))
    })

    it('should override fixedLabels matcher for taskLabel when taskName is provided', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'task_name', inRegex: '^ignore-me$' },
        { key: 'service', in: ['Batch-Sync'] }
      ]
      window.APP_CONFIG.services[0].vmlog.taskLabel = 'task_name'

      const query = buildTaskQuery('my-task')
      expect(query).toBe('{service="Batch-Sync", task_name="my-task"}')
    })
  })

  describe('fixedLabels helpers (__test__)', () => {
    const {
      fixedLabelRuleToMatcher,
      getFixedLabelKeys,
      escapeRegexLiteral,
      escapeLabelValue,
      normalizeLogSqlRow
    } = __test__

    it('fixedLabelRuleToMatcher() should return null for null/undefined rule', () => {
      expect(fixedLabelRuleToMatcher(null)).toBe(null)
      expect(fixedLabelRuleToMatcher(undefined)).toBe(null)
      expect(fixedLabelRuleToMatcher({})).toBe(null)
      expect(fixedLabelRuleToMatcher({ key: '  ' })).toBe(null)
    })

    it('fixedLabelRuleToMatcher() should apply priority: notIn > in > notRegex > inRegex', () => {
      expect(
        fixedLabelRuleToMatcher({ key: 'x', notIn: ['a'], in: ['b'] })
      ).toBe('x!="a"')

      expect(
        fixedLabelRuleToMatcher({ key: 'x', notRegex: 'a', inRegex: 'b' })
      ).toBe('x!~"a"')

      expect(
        fixedLabelRuleToMatcher({
          key: 'x',
          notIn: ['a'],
          in: ['b'],
          notRegex: 'c',
          inRegex: 'd'
        })
      ).toBe('x!="a"')
    })

    it('fixedLabelRuleToMatcher() should filter empty/whitespace values in in/notIn arrays', () => {
      expect(
        fixedLabelRuleToMatcher({ key: 'x', in: ['', 'valid'] })
      ).toBe('x="valid"')

      expect(
        fixedLabelRuleToMatcher({ key: 'x', in: ['', '  '] })
      ).toBe(null)

      expect(
        fixedLabelRuleToMatcher({ key: 'x', notIn: ['  ', 'bad'] })
      ).toBe('x!="bad"')
    })

    it('fixedLabelRuleToMatcher() should ignore blank inRegex/notRegex', () => {
      expect(fixedLabelRuleToMatcher({ key: 'x', inRegex: '  ' })).toBe(null)
      expect(fixedLabelRuleToMatcher({ key: 'x', notRegex: '' })).toBe(null)
    })

    it('fixedLabelRuleToMatcher() behavior for special-character key', () => {
      // LogsQL label keys may not support this, but implementation should be deterministic.
      expect(fixedLabelRuleToMatcher({ key: 'x.y', in: ['a'] })).toBe('x.y="a"')
    })

    it('getFixedLabelKeys() should normalize keys for array and map formats', () => {
      expect(getFixedLabelKeys(null)).toEqual([])

      expect(
        getFixedLabelKeys([
          null,
          { key: '  ' },
          { key: ' env ', in: ['prod'] },
          { key: 'service', in: ['s'] }
        ])
      ).toEqual(['env', 'service'])

      expect(
        getFixedLabelKeys({
          '  ': 'ignored',
          ' env ': 'prod',
          service: { in: ['s'] }
        })
      ).toEqual(['env', 'service'])
    })

    it('escapeRegexLiteral() should escape all regex special chars', () => {
      const input = '.*+?^${}()|[]\\'
      const out = escapeRegexLiteral(input)
      expect(out).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\')
    })

    it('escapeLabelValue() should escape quotes and backslashes', () => {
      expect(escapeLabelValue('A"B')).toBe('A\\"B')
      expect(escapeLabelValue('C\\x')).toBe('C\\\\x')
    })

    it('escapeLabelValue() should escape control characters', () => {
      expect(escapeLabelValue('a\nb')).toBe('a\\nb')
      expect(escapeLabelValue('a\rb')).toBe('a\\rb')
      expect(escapeLabelValue('a\tb')).toBe('a\\tb')
    })

    it('normalizeLogSqlRow() should extract fixedLabel keys from row top-level fields when present', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'env', in: ['prod'] },
        { key: 'region', in: ['cn'] }
      ]
      window.APP_CONFIG.services[0].vmlog.taskLabel = 'task_name'

      const row = {
        _time: '2026-02-06T00:00:00Z',
        _msg: 'hello',
        _stream: '{env="from-stream", service="Batch-Sync"}',
        env: 'from-row',
        task_name: 't-1'
        // region missing
      }

      const log = normalizeLogSqlRow(row)
      expect(log.labels.env).toBe('from-row')
      expect(log.labels.service).toBe('Batch-Sync')
      expect(log.labels.region).toBeUndefined()
      expect(log.taskName).toBe('t-1')
    })

    it('normalizeLogSqlRow() should keep stream label when fixedLabel not present on row', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'env', in: ['prod'] }
      ]

      const row = {
        _time: '2026-02-06T00:00:00Z',
        _msg: 'hello',
        _stream: '{env="stream-only", service="Batch-Sync"}',
        task_name: 't-1'
      }

      const log = normalizeLogSqlRow(row)
      expect(log.labels.env).toBe('stream-only')
    })
  })

  describe('buildTaskMessageFallbackQuery() (__test__)', () => {
    it('should build fallback query using fixedLabels selector', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = { service: 'Batch-Sync' }
      const q = __test__.buildTaskMessageFallbackQuery('t')
      expect(q).toBe('{service="Batch-Sync"} _msg:"t"')
    })

    it('should escape quotes, backslashes and control chars in fallback search value', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = { service: 'Batch-Sync' }
      const s = 'a"b\\c' + '\n' + '\t'
      const q = __test__.buildTaskMessageFallbackQuery(s)
      expect(q).toBe('{service="Batch-Sync"} _msg:"a\\"b\\\\c\\n\\t"')
    })

    it('should return base selector when taskName is empty', () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = { service: 'Batch-Sync' }
      expect(__test__.buildTaskMessageFallbackQuery('')).toBe('{service="Batch-Sync"}')
      expect(__test__.buildTaskMessageFallbackQuery(null)).toBe('{service="Batch-Sync"}')
    })
  })

  describe('queryTaskLogs()', () => {
    it('should build query and call queryLogsWithCursor', async () => {
      const mockResponse = {
        data: [
          JSON.stringify({ _time: '2026-02-06T00:00:00Z', _msg: 'error', level: 'ERROR', task_name: 'my-task', service: 'Batch-Sync' }),
          JSON.stringify({ _time: '2026-02-06T00:00:00Z', _msg: 'warn', level: 'WARN', task_name: 'my-task', service: 'Batch-Sync' })
        ].join('\n') + '\n'
      }

      axios.post.mockResolvedValue(mockResponse)

      const result = await queryTaskLogs('my-task', { level: 'ERROR', limit: 100 })

      expect(axios.post).toHaveBeenCalledWith(
        '/select/logsql/query',
        expect.any(URLSearchParams),
        expect.objectContaining({ responseType: 'text' })
      )
      const body = axios.post.mock.calls[0][1]
      expect(body.get('query')).toBe('{job="tasks", service="Batch-Sync", task_name="my-task"}')
      expect(body.get('limit')).toBe('100')

      // client-side level filtering
      expect(result.logs).toHaveLength(1)
      expect(result.logs[0].level).toBe('ERROR')
    })

    it('should trigger fallback query when primary query fails and include fixedLabels', async () => {
      window.APP_CONFIG.services[0].vmlog.fixedLabels = [
        { key: 'service', in: ['Batch-Sync'] }
      ]
      window.APP_CONFIG.services[0].vmlog.taskLabel = 'task_name'

      axios.post
        .mockRejectedValueOnce(new Error('primary failed'))
        .mockResolvedValueOnce({
          data: JSON.stringify({ _time: '2026-02-06T00:00:00Z', _msg: 'ok', level: 'INFO', task_name: 'task"x', service: 'Batch-Sync' }) + '\n'
        })

      const result = await queryTaskLogs('task"x', { limit: 10 })
      expect(axios.post).toHaveBeenCalledTimes(2)

      const primaryBody = axios.post.mock.calls[0][1]
      expect(primaryBody.get('query')).toBe('{service="Batch-Sync", task_name="task\\"x"}')

      const fallbackBody = axios.post.mock.calls[1][1]
      expect(fallbackBody.get('query')).toBe('{service="Batch-Sync"} _msg:"task\\"x"')

      expect(result.logs).toHaveLength(1)
      expect(result.logs[0].line).toBe('ok')
    })
  })

  describe('filterLogsByLevel()', () => {
    const sampleLogs = [
      { level: 'ERROR', line: 'Error log' },
      { level: 'WARN', line: 'Warning log' },
      { level: 'INFO', line: 'Info log' },
      { level: 'DEBUG', line: 'Debug log' }
    ]

    it('should return all logs when no level filter', () => {
      const result = filterLogsByLevel(sampleLogs, '')

      expect(result).toHaveLength(4)
    })

    it('should filter to ERROR only', () => {
      const result = filterLogsByLevel(sampleLogs, 'ERROR')

      expect(result).toHaveLength(1)
      expect(result[0].level).toBe('ERROR')
    })

    it('should filter to ERROR and WARN', () => {
      const result = filterLogsByLevel(sampleLogs, 'WARN')

      expect(result).toHaveLength(2)
      expect(result.map(l => l.level)).toEqual(['ERROR', 'WARN'])
    })

    it('should filter to ERROR, WARN, and INFO', () => {
      const result = filterLogsByLevel(sampleLogs, 'INFO')

      expect(result).toHaveLength(3)
      expect(result.map(l => l.level)).toEqual(['ERROR', 'WARN', 'INFO'])
    })

    it('should include all levels for DEBUG', () => {
      const result = filterLogsByLevel(sampleLogs, 'DEBUG')

      expect(result).toHaveLength(4)
    })

    it('should handle logs without level (default to INFO)', () => {
      const logs = [
        { level: 'ERROR', line: 'Error' },
        { line: 'No level' }
      ]

      const result = filterLogsByLevel(logs, 'INFO')

      expect(result).toHaveLength(2)
    })

    it('should handle case-insensitive levels', () => {
      const logs = [
        { level: 'error', line: 'Error lowercase' },
        { level: 'WARN', line: 'Warn uppercase' }
      ]

      const result = filterLogsByLevel(logs, 'ERROR')

      expect(result).toHaveLength(1)
      expect(result[0].line).toBe('Error lowercase')
    })

    it('should return all logs for unknown level', () => {
      const result = filterLogsByLevel(sampleLogs, 'UNKNOWN')

      expect(result).toHaveLength(4)
    })
  })
})
