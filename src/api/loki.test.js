import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  queryLogsWithCursor,
  getLabelValues,
  getTaskNames,
  buildTaskQuery,
  queryTaskLogs,
  filterLogsByLevel
} from './loki.js'

// Mock axios
vi.mock('axios')

describe('loki.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('queryLogsWithCursor()', () => {
    it('should query logs with default parameters', async () => {
      const mockResponse = {
        data: {
          data: {
            result: [
              {
                stream: { service: 'batch-sync', task_name: 'test-task', level: 'INFO' },
                values: [
                  ['1234567890000000000', 'Test log message']
                ]
              }
            ]
          }
        }
      }

      axios.get.mockResolvedValue(mockResponse)

      const result = await queryLogsWithCursor('{service="batch-sync"}')

      expect(axios.get).toHaveBeenCalledWith('/loki/api/v1/query_range', {
        params: expect.objectContaining({
          query: '{service="batch-sync"}',
          limit: 500,
          direction: 'backward'
        })
      })

      expect(result.logs).toHaveLength(1)
      expect(result.logs[0]).toMatchObject({
        line: 'Test log message',
        service: 'batch-sync',
        taskName: 'test-task',
        level: 'INFO'
      })
    })

    it('should handle cursor-based pagination backward', async () => {
      const mockResponse = {
        data: {
          data: {
            result: []
          }
        }
      }

      axios.get.mockResolvedValue(mockResponse)

      await queryLogsWithCursor('{service="batch-sync"}', {
        cursor: '1234567890000000000',
        direction: 'backward'
      })

      expect(axios.get).toHaveBeenCalledWith('/loki/api/v1/query_range', {
        params: expect.objectContaining({
          end: '1234567890000000000',
          direction: 'backward'
        })
      })
    })

    it('should return nextCursor and hasMore flag', async () => {
      const mockResponse = {
        data: {
          data: {
            result: [
              {
                stream: { service: 'batch-sync' },
                values: [
                  ['2000000000000', 'Log 1'],
                  ['1000000000000', 'Log 2']
                ]
              }
            ]
          }
        }
      }

      axios.get.mockResolvedValue(mockResponse)

      const result = await queryLogsWithCursor('{service="batch-sync"}', { limit: 2 })

      expect(result.hasMore).toBe(true)
      // After backward sorting: logs[0].timestampNano=2000000000000, logs[1].timestampNano=1000000000000
      // lastLog = logs[1], nextCursor = 1000000000000 - 1
      expect(result.nextCursor).toBe('999999999999')
    })

    it('should retry on 429 Too Many Requests', async () => {
      const errorResponse = {
        response: { status: 429 }
      }

      const successResponse = {
        data: {
          data: {
            result: [
              {
                stream: { service: 'batch-sync' },
                values: [['1234567890000000000', 'Success after retry']]
              }
            ]
          }
        }
      }

      axios.get
        .mockRejectedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse)

      const result = await queryLogsWithCursor('{service="batch-sync"}')

      expect(axios.get).toHaveBeenCalledTimes(2)
      expect(result.logs).toHaveLength(1)
    })

    it('should throw error after max retries', async () => {
      const errorResponse = {
        response: { status: 429 }
      }

      axios.get.mockRejectedValue(errorResponse)

      await expect(
        queryLogsWithCursor('{service="batch-sync"}')
      ).rejects.toMatchObject({ response: { status: 429 } })

      expect(axios.get).toHaveBeenCalledTimes(3) // max retries = 3
    })
  })

  describe('getLabelValues()', () => {
    it('should fetch label values from API', async () => {
      const mockResponse = {
        data: {
          data: ['task-1', 'task-2', 'task-3']
        }
      }

      axios.get.mockResolvedValue(mockResponse)

      const result = await getLabelValues('task_name')

      expect(axios.get).toHaveBeenCalledWith('/loki/api/v1/label/task_name/values')
      expect(result).toEqual(['task-1', 'task-2', 'task-3'])
    })

    it('should handle empty label values', async () => {
      const mockResponse = {
        data: {
          data: []
        }
      }

      axios.get.mockResolvedValue(mockResponse)

      const result = await getLabelValues('nonexistent')

      expect(result).toEqual([])
    })

    it('should throw error on API failure', async () => {
      axios.get.mockRejectedValue(new Error('Network error'))

      await expect(getLabelValues('task_name')).rejects.toThrow('Network error')
    })
  })

  describe('getTaskNames()', () => {
    it('should fetch task names using getLabelValues', async () => {
      const mockResponse = {
        data: {
          data: ['task-a', 'task-b']
        }
      }

      axios.get.mockResolvedValue(mockResponse)

      const result = await getTaskNames()

      expect(axios.get).toHaveBeenCalledWith('/loki/api/v1/label/task_name/values')
      expect(result).toEqual(['task-a', 'task-b'])
    })
  })

  describe('buildTaskQuery()', () => {
    it('should build basic query without task name', () => {
      const query = buildTaskQuery(null, { service: 'Batch-Sync' })

      expect(query).toBe('{job="tasks", service="Batch-Sync"}')
    })

    it('should build query with task name', () => {
      const query = buildTaskQuery('my-task', { service: 'Batch-Sync' })

      expect(query).toBe('{job="tasks", service="Batch-Sync", task_name="my-task"}')
    })

    it('should add ERROR level filter', () => {
      const query = buildTaskQuery('my-task', {
        service: 'Batch-Sync',
        level: 'ERROR'
      })

      expect(query).toContain('| level=~"ERROR"')
    })

    it('should add WARN level filter (includes ERROR and WARN)', () => {
      const query = buildTaskQuery('my-task', {
        service: 'Batch-Sync',
        level: 'WARN'
      })

      expect(query).toContain('| level=~"ERROR|WARN"')
    })

    it('should add INFO level filter (includes ERROR, WARN, INFO)', () => {
      const query = buildTaskQuery('my-task', {
        service: 'Batch-Sync',
        level: 'INFO'
      })

      expect(query).toContain('| level=~"ERROR|WARN|INFO"')
    })

    it('should add DEBUG level filter (includes all levels)', () => {
      const query = buildTaskQuery('my-task', {
        service: 'Batch-Sync',
        level: 'DEBUG'
      })

      expect(query).toContain('| level=~"ERROR|WARN|INFO|DEBUG"')
    })

    it('should default to Batch-Sync service', () => {
      const query = buildTaskQuery('my-task')

      expect(query).toContain('service="Batch-Sync"')
    })
  })

  describe('queryTaskLogs()', () => {
    it('should build query and call queryLogsWithCursor', async () => {
      const mockResponse = {
        data: {
          data: {
            result: []
          }
        }
      }

      axios.get.mockResolvedValue(mockResponse)

      await queryTaskLogs('my-task', {
        service: 'Batch-Sync',
        level: 'ERROR',
        limit: 100
      })

      expect(axios.get).toHaveBeenCalledWith('/loki/api/v1/query_range', {
        params: expect.objectContaining({
          query: '{job="tasks", service="Batch-Sync", task_name="my-task"} | level=~"ERROR"',
          limit: 100
        })
      })
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
