import axios from 'axios'
import { getConfig, getCurrentServiceConfig, getLogLevelOrder } from '../utils/config'

function getLogSqlApiBase() {
  const apiBasePath = getCurrentServiceConfig('vmlog.apiBasePath') ||
    getConfig('vmlog.apiBasePath', '/select/logsql')

  try {
    const url = new URL(apiBasePath, window.location.origin)
    const basePath = url.pathname.replace(/\/$/, '')
    // If apiBasePath is absolute (points to another host), preserve origin.
    const isLikelyAbsolute = /^https?:\/\//i.test(String(apiBasePath))
    return isLikelyAbsolute ? `${url.origin}${basePath}` : basePath
  } catch (e) {
    return '/select/logsql'
  }
}

function buildLogSqlUrl(endpoint) {
  const basePath = getLogSqlApiBase()
  const normalizedEndpoint = String(endpoint || '').replace(/^\//, '')
  return `${basePath}/${normalizedEndpoint}`
}

// Request queue to limit concurrent requests (Map by query key)
const pendingRequests = new Map()

// Log ID counter for unique IDs (prevents Math.random() collisions)
let logIdCounter = 0

/**
 * Retry wrapper with exponential backoff
 * Reads retry settings from current service config
 */
async function retryWithBackoff(fn, maxRetries = null, baseDelay = null) {
  // Get retry settings from config or use defaults
  const configMaxRetries = getCurrentServiceConfig('vmlog.api.maxRetries', 3)
  const configBaseDelay = getCurrentServiceConfig('vmlog.api.retryBaseDelay', 1000)

  const finalMaxRetries = maxRetries ?? configMaxRetries
  const finalBaseDelay = baseDelay ?? configBaseDelay

  for (let i = 0; i < finalMaxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      const isTooManyRequests = error.response?.status === 429 ||
        error.message?.includes('too many outstanding requests')

      if (isTooManyRequests && i < finalMaxRetries - 1) {
        const delay = finalBaseDelay * Math.pow(2, i)
        console.log(`[VMLog] Too many requests, retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        throw error
      }
    }
  }
}

/**
 * Query logs with cursor-based pagination for infinite scroll
 * Default time range: configurable via query.defaultTimeRangeDays
 */
export async function queryLogsWithCursor(query, options = {}) {
  const { limit = 500, cursor } = options

  // VictoriaLogs LogsQL pagination uses offset
  const offset = cursor ? Number.parseInt(String(cursor), 10) : 0
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0

  // Get configured time range (default: 7 days)
  const timeRangeDays = getCurrentServiceConfig('query.defaultTimeRangeDays') ||
                        getConfig('query.defaultTimeRangeDays', 7)

  // Create unique key for this query to support concurrent requests
  const requestKey = `${query}-${safeOffset}-${limit}`

  // Wait for any pending request with the same key to complete
  if (pendingRequests.has(requestKey)) {
    try {
      await pendingRequests.get(requestKey)
    } catch (e) {
      // Ignore errors from previous request
    }
  }

  const requestFn = async () => {
    const body = new URLSearchParams({
      query,
      limit: String(limit),
      offset: String(safeOffset),
      start: `${timeRangeDays}d`,
      end: 'now'
    })

    const response = await axios.post(buildLogSqlUrl('query'), body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      responseType: 'text'
    })

    return response
  }

  try {
    const currentRequest = retryWithBackoff(requestFn)
    pendingRequests.set(requestKey, currentRequest)
    const response = await currentRequest

    const logs = parseLogSqlResponse(response.data)
    const hasMore = logs.length >= limit
    const nextCursor = hasMore ? String(safeOffset + logs.length) : null

    return { logs, nextCursor, hasMore }
  } catch (error) {
    console.error('Error querying logs with cursor:', error)
    throw error
  } finally {
    // Always clean up pending request to prevent memory leak
    pendingRequests.delete(requestKey)
  }
}

/**
 * Create a WebSocket connection to tail logs in real-time
 */
export function tailLogs(query, callbacks = {}) {
  const { onLog, onError, onClose, onOpen } = callbacks

  // VictoriaLogs tailing is streaming HTTP, not WebSocket.
  // Map existing config keys to VictoriaLogs tail args.
  const tailDelayFor = getCurrentServiceConfig('vmlog.api.tailDelayFor', '0')
  const refreshInterval = getCurrentServiceConfig('vmlog.websocket.refreshInterval', '1s')

  let abortController = null
  let reconnectAttempts = 0
  let reconnectTimeout = null
  let isManualClose = false
  let isConnecting = false
  let isConnected = false
  const reconnectDelay = getCurrentServiceConfig('vmlog.websocket.reconnectDelay', 3000)

  function cleanupTail() {
    if (abortController) {
      try {
        abortController.abort()
      } catch (e) {
        // ignore
      }
      abortController = null
    }
  }

  function connect() {
    // Prevent multiple simultaneous connection attempts
    if (isManualClose || isConnecting) return

    // Cleanup any existing connection first
    cleanupTail()

    try {
      isConnecting = true
      abortController = new AbortController()

      // Optimistically report open once a request is initiated.
      // Some proxies may not deliver headers until the first log line.
      // If the request fails, onClose/onError will flip the state back.
      if (!isConnected) {
        isConnected = true
        if (onOpen) onOpen()
      }

      const body = new URLSearchParams({
        query,
        // deliver logs with a small delay; VictoriaLogs expects duration string
        offset: `${tailDelayFor}s`,
        refresh_interval: refreshInterval
      })

      const url = buildLogSqlUrl('tail')
      console.log('[Tail] Connecting to:', url)

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: abortController.signal
      }).then(async (response) => {
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(`Tail request failed: ${response.status} ${response.statusText} ${text}`)
        }

        if (!response.body) {
          throw new Error('Tail response has no body stream')
        }

        isConnected = true
        isConnecting = false
        reconnectAttempts = 0
        // onOpen may have already fired optimistically above.

        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let newLineIndex
          while ((newLineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newLineIndex).trim()
            buffer = buffer.slice(newLineIndex + 1)
            if (!line) continue

            try {
              const obj = JSON.parse(line)
              const log = normalizeLogSqlRow(obj)
              if (onLog) onLog([log])
            } catch (e) {
              // ignore malformed lines
            }
          }
        }
      }).catch((error) => {
        if (isManualClose) return
        isConnecting = false
        isConnected = false
        if (onError) onError(error)
      }).finally(() => {
        const event = { type: 'close' }
        isConnecting = false
        isConnected = false
        if (onClose) onClose(event)

        if (!isManualClose) {
          reconnectAttempts++
          if (reconnectTimeout) clearTimeout(reconnectTimeout)
          reconnectTimeout = setTimeout(connect, reconnectDelay)
        }
      })
    } catch (error) {
      console.error('Error creating tail connection:', error)
      isConnecting = false
      if (onError) onError(error)
    }
  }

  connect()

  return {
    close: () => {
      isManualClose = true
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      cleanupTail()
    },
    isConnected: () => isConnected
  }
}

function parseStreamLabels(stream) {
  if (!stream || typeof stream !== 'string') return {}
  const s = stream.trim()
  if (!s.startsWith('{') || !s.endsWith('}')) return {}

  const inner = s.slice(1, -1)
  if (!inner) return {}

  const labels = {}
  const re = /([A-Za-z0-9_]+)="([^"]*)"/g
  let m
  while ((m = re.exec(inner)) !== null) {
    labels[m[1]] = m[2]
  }
  return labels
}

function normalizeLogSqlRow(row) {
  // Get configured task label name from current service
  const taskLabel = getCurrentServiceConfig('vmlog.taskLabel', 'task_name')
  const fixedLabels = getCurrentServiceConfig('vmlog.fixedLabels', {})

  const streamLabels = parseStreamLabels(row?._stream)

  const timeStr = row?._time
  const timestampMs = timeStr ? Date.parse(timeStr) : Date.now()
  const timestampNano = Number.isFinite(timestampMs) ? timestampMs * 1000000 : Date.now() * 1000000

  const line = row?._msg ?? row?.msg ?? row?.message ?? ''

  const labels = { ...streamLabels }

  // Preserve known labels from top-level fields if present.
  // VictoriaLogs may expose some labels both in _stream and as separate fields.
  for (const key of Object.keys(fixedLabels || {})) {
    if (row && row[key] != null) labels[key] = String(row[key])
  }
  if (row && row[taskLabel] != null) labels[taskLabel] = String(row[taskLabel])
  if (row && row.service != null) labels.service = String(row.service)
  if (row && row.level != null) labels.level = String(row.level)
  if (row && row.job != null) labels.job = String(row.job)

  const level = (labels.level || String(row?.level || '') || extractLevel(line) || 'INFO').toUpperCase()

  return {
    id: `${timestampNano}-${++logIdCounter}`,
    timestamp: Math.floor(timestampNano / 1000000),
    timestampNano,
    line,
    labels,
    taskName: labels[taskLabel],
    service: labels.service,
    level
  }
}

function parseLogSqlResponse(text) {
  if (!text) return []
  const lines = String(text).split('\n').map(l => l.trim()).filter(Boolean)
  const logs = []
  for (const line of lines) {
    try {
      const obj = JSON.parse(line)
      logs.push(normalizeLogSqlRow(obj))
    } catch (e) {
      // ignore
    }
  }
  return logs
}

export async function getLabelValues(labelName) {
  try {
    const timeRangeDays = getCurrentServiceConfig('query.defaultTimeRangeDays') ||
                          getConfig('query.defaultTimeRangeDays', 7)

    // Treat label values as VictoriaLogs stream field values.
    const query = buildTaskQuery(null)

    const body = new URLSearchParams({
      query,
      field: String(labelName),
      start: `${timeRangeDays}d`,
      end: 'now'
    })

    const response = await axios.post(buildLogSqlUrl('stream_field_values'), body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })

    const values = response.data?.values || []
    return values.map(v => v.value).filter(v => typeof v === 'string')
  } catch (error) {
    console.error(`Error getting label values for ${labelName}:`, error)
    throw error
  }
}

export async function getTaskNames() {
  const taskLabel = getCurrentServiceConfig('vmlog.taskLabel', 'task_name')
  return getLabelValues(taskLabel)
}

export function buildTaskQuery(taskName, options = {}) {
  void options

  // Get configured labels from current service
  const fixedLabels = getCurrentServiceConfig('vmlog.fixedLabels', { job: 'tasks', service: 'Batch-Sync' })
  const taskLabel = getCurrentServiceConfig('vmlog.taskLabel', 'task_name')

  // Build label selectors
  const labels = []

  // Add fixed labels
  for (const [key, value] of Object.entries(fixedLabels)) {
    labels.push(`${key}="${value}"`)
  }

  // Add task name filter if specified
  if (taskName) {
    labels.push(`${taskLabel}="${taskName}"`)
  }

  let query = `{${labels.join(', ')}}`

  return query
}

function buildTaskMessageFallbackQuery(taskName) {
  const baseSelector = buildTaskQuery(null)
  const safeTask = String(taskName || '').replace(/"/g, '\\"')
  if (!safeTask) return baseSelector
  return `${baseSelector} _msg:"${safeTask}"`
}

export async function queryTaskLogs(taskName, options = {}) {
  const { level, ...rest } = options
  const query = buildTaskQuery(taskName)

  let result
  try {
    result = await queryLogsWithCursor(query, rest)
  } catch (e) {
    // If the label-based query is invalid for the given dataset, fallback.
    result = { logs: [], nextCursor: null, hasMore: false }
  }

  // If there are no results on the first page, fallback to message search.
  // This helps environments where task name is embedded in log message instead of a stream label.
  if ((!result.logs || result.logs.length === 0) && !rest.cursor) {
    const fallbackQuery = buildTaskMessageFallbackQuery(taskName)
    result = await queryLogsWithCursor(fallbackQuery, rest)
  }

  if (level) {
    result.logs = filterLogsByLevel(result.logs, level)
  }
  return result
}

// Legacy response parsing is not used; VictoriaLogs returns JSON lines.

function extractLevel(line) {
  const match = line.match(/\]\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+/)
  return match ? match[1] : 'INFO'
}

/**
 * Filter logs by level (threshold-based)
 * Selected level acts as threshold: INFO shows ERROR, WARN, INFO
 * @param {Array} logs - Logs to filter
 * @param {string} level - Selected level (ERROR, WARN, INFO, DEBUG, or empty for all)
 * @returns {Array} Filtered logs
 */
export function filterLogsByLevel(logs, level) {
  if (!level) return logs

  const levelOrder = getLogLevelOrder()
  const selectedIndex = levelOrder.indexOf(level)

  if (selectedIndex === -1) return logs

  const allowedLevels = levelOrder.slice(0, selectedIndex + 1)

  return logs.filter(log => {
    const logLevel = (log.level || 'INFO').toUpperCase()
    return allowedLevels.includes(logLevel)
  })
}
