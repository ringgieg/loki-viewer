import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  queryLogsWithCursor,
  getLabelValues,
  getTaskNames,
  buildTaskQuery,
  queryTaskLogs,
  filterLogsByLevel
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
      expect(result).toEqual(['job-a', 'job-b'])
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
