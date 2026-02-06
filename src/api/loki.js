import axios from 'axios'
import { getConfig, getCurrentServiceConfig, getLogLevelRegex, getLogLevelOrder } from '../utils/config'

// Use nginx proxy for WebSocket connections
// WebSocket protocol/host/path follows the Loki API base path
function getWebSocketUrl() {
  const apiBasePath = getCurrentServiceConfig('loki.apiBasePath') ||
    getConfig('loki.apiBasePath', '/loki/api/v1')

  let baseUrl
  try {
    baseUrl = new URL(apiBasePath, window.location.origin)
  } catch (e) {
    baseUrl = new URL('/loki/api/v1', window.location.origin)
  }

  const isHttps = baseUrl.protocol === 'https:'
  const wsProtocol = isHttps ? 'wss' : 'ws'
  const wsHost = baseUrl.host || window.location.host
  const wsPath = baseUrl.pathname.replace(/\/$/, '')

  return `${wsProtocol}://${wsHost}${wsPath}`
}

function getLokiApiBase() {
  return getCurrentServiceConfig('loki.apiBasePath') ||
    getConfig('loki.apiBasePath', '/loki/api/v1')
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
  const configMaxRetries = getCurrentServiceConfig('loki.api.maxRetries', 3)
  const configBaseDelay = getCurrentServiceConfig('loki.api.retryBaseDelay', 1000)

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
        console.log(`[Loki] Too many requests, retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        throw error
      }
    }
  }
}

/**
 * Query logs with cursor-based pagination for infinite scroll
 * Default time range: configurable via query.defaultTimeRangeDays (Loki has query time range limits)
 */
export async function queryLogsWithCursor(query, options = {}) {
  const { limit = 500, cursor, direction = 'backward' } = options

  const params = { query, limit, direction }

  // Get configured time range (default: 7 days)
  const timeRangeDays = getCurrentServiceConfig('query.defaultTimeRangeDays') ||
                        getConfig('query.defaultTimeRangeDays', 7)

  const now = Date.now() * 1000000 // Current time in nanoseconds
  const timeRangeAgo = (Date.now() - timeRangeDays * 24 * 60 * 60 * 1000) * 1000000

  if (cursor) {
    if (direction === 'backward') {
      params.end = cursor
      params.start = timeRangeAgo.toString()
    } else {
      params.start = cursor
    }
  } else {
    // Initial fetch: use configured time range
    params.start = timeRangeAgo.toString()
    params.end = now.toString()
  }

  // Create unique key for this query to support concurrent requests
  const requestKey = `${query}-${cursor || 'initial'}-${direction}`

  // Wait for any pending request with the same key to complete
  if (pendingRequests.has(requestKey)) {
    try {
      await pendingRequests.get(requestKey)
    } catch (e) {
      // Ignore errors from previous request
    }
  }

  const requestFn = async () => {
    const response = await axios.get(`${getLokiApiBase()}/query_range`, { params })
    return response
  }

  try {
    const currentRequest = retryWithBackoff(requestFn)
    pendingRequests.set(requestKey, currentRequest)
    const response = await currentRequest

    const result = parseLogResponse(response.data, direction)

    let nextCursor = null
    if (result.logs.length > 0) {
      const lastLog = result.logs[result.logs.length - 1]
      nextCursor = (lastLog.timestampNano - 1).toString()
    }

    return {
      logs: result.logs,
      nextCursor,
      hasMore: result.logs.length >= limit
    }
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

  // Get tail parameters from config
  const tailLimit = getCurrentServiceConfig('loki.api.tailLimit', 100)
  const tailDelayFor = getCurrentServiceConfig('loki.api.tailDelayFor', '0')

  const params = new URLSearchParams({
    query,
    delay_for: tailDelayFor,
    limit: String(tailLimit)
  })

  const wsUrl = `${getWebSocketUrl()}/tail?${params.toString()}`

  let ws = null
  let reconnectAttempts = 0
  let reconnectTimeout = null
  let isManualClose = false
  let isConnecting = false
  const reconnectDelay = getCurrentServiceConfig('loki.websocket.reconnectDelay', 3000)

  function cleanupWebSocket() {
    if (ws) {
      // Remove all event handlers to prevent memory leaks
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null

      // Close if still open or connecting
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.close()
        } catch (e) {
          console.log('[WebSocket] Error closing:', e)
        }
      }
      ws = null
    }
  }

  function connect() {
    // Prevent multiple simultaneous connection attempts
    if (isManualClose || isConnecting) return

    // Cleanup any existing connection first
    cleanupWebSocket()

    try {
      isConnecting = true
      console.log('[WebSocket] Connecting to:', wsUrl)
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('[WebSocket] Connected successfully')
        isConnecting = false
        reconnectAttempts = 0
        if (onOpen) onOpen()
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.streams && data.streams.length > 0) {
            const logs = parseStreamData(data.streams)
            if (onLog && logs.length > 0) {
              onLog(logs)
            }
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        isConnecting = false
        if (onError) onError(error)
      }

      ws.onclose = (event) => {
        console.log('[WebSocket] Connection closed')
        isConnecting = false
        if (onClose) onClose(event)

        // Try to reconnect if not manually closed
        if (!isManualClose) {
          reconnectAttempts++
          console.log(`[WebSocket] Reconnecting... attempt ${reconnectAttempts}`)
          if (reconnectTimeout) clearTimeout(reconnectTimeout)
          reconnectTimeout = setTimeout(connect, reconnectDelay)
        }
      }
    } catch (error) {
      console.error('Error creating WebSocket:', error)
      isConnecting = false
      if (onError) onError(error)
    }
  }

  connect()

  return {
    close: () => {
      isManualClose = true
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      cleanupWebSocket()
    },
    isConnected: () => ws && ws.readyState === WebSocket.OPEN
  }
}

function parseStreamData(streams) {
  // Get configured task label name from current service
  const taskLabel = getCurrentServiceConfig('loki.taskLabel', 'task_name')

  const logs = []
  for (const stream of streams) {
    const labels = stream.stream || {}
    for (const [timestamp, line] of (stream.values || [])) {
      logs.push({
        id: `${timestamp}-${++logIdCounter}`,
        timestamp: parseInt(timestamp, 10) / 1000000,
        timestampNano: parseInt(timestamp, 10),
        line,
        labels,
        taskName: labels[taskLabel],
        service: labels.service,
        level: labels.level || extractLevel(line)
      })
    }
  }
  return logs
}

export async function getLabelValues(labelName) {
  try {
    const response = await axios.get(`${getLokiApiBase()}/label/${labelName}/values`)
    return response.data.data || []
  } catch (error) {
    console.error(`Error getting label values for ${labelName}:`, error)
    throw error
  }
}

export async function getTaskNames() {
  const taskLabel = getCurrentServiceConfig('loki.taskLabel', 'task_name')
  return getLabelValues(taskLabel)
}

export function buildTaskQuery(taskName, options = {}) {
  const { level } = options

  // Get configured labels from current service
  const fixedLabels = getCurrentServiceConfig('loki.fixedLabels', { job: 'tasks', service: 'Batch-Sync' })
  const taskLabel = getCurrentServiceConfig('loki.taskLabel', 'task_name')

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

  // Level works as threshold: INFO shows ERROR, WARN, INFO
  if (level) {
    const levelRegex = getLogLevelRegex(level)
    query += ` | level=~"${levelRegex}"`
  }

  return query
}

export async function queryTaskLogs(taskName, options = {}) {
  const query = buildTaskQuery(taskName, options)
  return queryLogsWithCursor(query, options)
}

function parseLogResponse(data, direction = 'backward') {
  // Get configured task label name from current service
  const taskLabel = getCurrentServiceConfig('loki.taskLabel', 'task_name')

  const logs = []

  if (data.data?.result) {
    for (const stream of data.data.result) {
      const labels = stream.stream || {}
      for (const [timestamp, line] of (stream.values || [])) {
        logs.push({
          id: `${timestamp}-${++logIdCounter}`,
          timestamp: parseInt(timestamp, 10) / 1000000,
          timestampNano: parseInt(timestamp, 10),
          line,
          labels,
          taskName: labels[taskLabel],
          service: labels.service,
          level: labels.level || extractLevel(line)
        })
      }
    }
  }

  logs.sort((a, b) => {
    return direction === 'backward'
      ? b.timestampNano - a.timestampNano
      : a.timestampNano - b.timestampNano
  })

  return { logs }
}

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
