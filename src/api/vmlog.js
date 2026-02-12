import axios from 'axios'
import { getConfig, getCurrentServiceConfig, getLogLevelOrder } from '../utils/config'
import { queryClient } from '../queryClient'
import { createRetryOptions, getHttpStatus } from '../utils/queryRetry'

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

// Log ID counter for unique IDs (prevents Math.random() collisions)
let logIdCounter = 0

function getVmLogRetryOptions() {
  const maxAttempts = getCurrentServiceConfig('vmlog.api.maxRetries', 3)
  const baseDelay = getCurrentServiceConfig('vmlog.api.retryBaseDelay', 1000)

  return createRetryOptions({
    maxAttempts,
    baseDelay,
    maxDelay: 30_000,
    shouldRetry: (error) => {
      const status = getHttpStatus(error)
      const msg = String(error?.message || '').toLowerCase()
      const tooManyOutstanding = msg.includes('too many outstanding requests')
      return status === 429 || tooManyOutstanding || (status != null && status >= 500)
    },
    logPrefix: '[VMLog] Too many requests,'
  })
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
  // Preserve explicit 0 (do not treat it as falsy).
  const timeRangeDays = getCurrentServiceConfig('query.defaultTimeRangeDays', null) ??
                        getConfig('query.defaultTimeRangeDays', 7)

  try {
    return await queryClient.fetchQuery({
      queryKey: ['vmlog', 'queryLogsWithCursor', query, safeOffset, limit, timeRangeDays],
      queryFn: async () => {
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

        const logs = parseLogSqlResponse(response.data)
        const hasMore = logs.length >= limit
        const nextCursor = hasMore ? String(safeOffset + logs.length) : null
        return { logs, nextCursor, hasMore }
      },
      staleTime: 0,
      // Cursor pages should be GC'ed quickly (prevents cache growth under long scrolling)
      gcTime: 30_000,
      ...getVmLogRetryOptions()
    })
  } catch (error) {
    console.error('Error querying logs with cursor:', error)
    throw error
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
  const refreshInterval = getCurrentServiceConfig('vmlog.tail.refreshInterval', '1s')

  let abortController = null
  let reconnectAttempts = 0
  let reconnectTimeout = null
  let isManualClose = false
  let isConnecting = false
  let isConnected = false
  let lastError = null
  const reconnectDelay = getCurrentServiceConfig('vmlog.tail.reconnectDelay', 3000)

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

    lastError = null

    // Cleanup any existing connection first
    cleanupTail()

    try {
      isConnecting = true
      abortController = new AbortController()

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

        if (!isConnected) {
          isConnected = true
          if (onOpen) onOpen()
        }
        isConnecting = false
        reconnectAttempts = 0

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
        lastError = error
        if (onError) onError(error)
      }).finally(() => {
        const isErrorClose = !!lastError
        const event = {
          type: 'close',
          manual: isManualClose,
          error: isErrorClose,
          completed: !isManualClose && !isErrorClose
        }
        isConnecting = false

        // For VictoriaLogs tail, the server/proxy may complete the response periodically.
        // Always treat stream completion as a close so the UI/alerting logic can reflect
        // the actual connection state while we are reconnecting.
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

function escapeLabelValue(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

function escapeRegexLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeFixedLabelRules(fixedLabels) {
  if (!fixedLabels) return []

  // New format: array of rules: [{key, in, notIn, inRegex, notRegex}]
  if (Array.isArray(fixedLabels)) {
    return fixedLabels
      .filter(r => r && typeof r === 'object')
      .map(r => ({ ...r, key: r.key != null ? String(r.key).trim() : '' }))
      .filter(r => r.key)
  }

  // Backward compatible: object map
  if (typeof fixedLabels === 'object') {
    const rules = []
    for (const [key, value] of Object.entries(fixedLabels)) {
      if (value == null) continue
      if (typeof value === 'object' && !Array.isArray(value)) {
        rules.push({ key: String(key).trim(), ...value })
      } else {
        rules.push({ key: String(key).trim(), in: [value] })
      }
    }
    return rules.filter(r => r.key)
  }

  return []
}

function getFixedLabelKeys(fixedLabels) {
  const rules = normalizeFixedLabelRules(fixedLabels)
  return rules.map(r => r.key).filter(Boolean)
}

function fixedLabelRuleToMatcher(rule) {
  const key = String(rule?.key || '').trim()
  if (!key) return null

  const normalizeStringList = (list) => {
    if (!Array.isArray(list)) return []
    return list
      .map(v => String(v).trim())
      .filter(v => v.length > 0)
  }

  // Priority: notIn, in, notRegex, inRegex
  // (notRegex before inRegex so a rule can't accidentally be broadened if multiple fields are set)
  if (Array.isArray(rule.notIn)) {
    const values = normalizeStringList(rule.notIn)
    if (values.length === 1) {
      return `${key}!="${escapeLabelValue(values[0])}"`
    }
    if (values.length > 1) {
      const re = `^(?:${values.map(escapeRegexLiteral).join('|')})$`
      return `${key}!~"${re}"`
    }
  }

  if (Array.isArray(rule.in)) {
    const values = normalizeStringList(rule.in)
    if (values.length === 1) {
      return `${key}="${escapeLabelValue(values[0])}"`
    }
    if (values.length > 1) {
      const re = `^(?:${values.map(escapeRegexLiteral).join('|')})$`
      return `${key}=~"${re}"`
    }
  }

  if (typeof rule.notRegex === 'string' && rule.notRegex.trim()) {
    // Escape as a quoted selector string (backslashes must survive JS + query parsing).
    return `${key}!~"${escapeLabelValue(rule.notRegex.trim())}"`
  }

  if (typeof rule.inRegex === 'string' && rule.inRegex.trim()) {
    return `${key}=~"${escapeLabelValue(rule.inRegex.trim())}"`
  }

  return null
}

// Test-only exports (kept small and explicit)
export const __test__ = {
  escapeLabelValue,
  escapeRegexLiteral,
  normalizeFixedLabelRules,
  getFixedLabelKeys,
  fixedLabelRuleToMatcher,
  normalizeLogSqlRow,
  buildTaskMessageFallbackQuery
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
  for (const key of getFixedLabelKeys(fixedLabels)) {
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
    const timeRangeDays = getCurrentServiceConfig('query.defaultTimeRangeDays', null) ??
                          getConfig('query.defaultTimeRangeDays', 7)

    // Treat label values as VictoriaLogs stream field values.
    const query = buildTaskQuery(null)

    const body = new URLSearchParams({
      query,
      field: String(labelName),
      start: `${timeRangeDays}d`,
      end: 'now'
    })

    return await queryClient.fetchQuery({
      queryKey: ['vmlog', 'labelValues', labelName, timeRangeDays, query],
      queryFn: async () => {
        const response = await axios.post(buildLogSqlUrl('stream_field_values'), body, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })

        const values = response.data?.values || []
        return values.map(v => v.value).filter(v => typeof v === 'string')
      },
      staleTime: 0,
      gcTime: 5 * 60_000,
      ...getVmLogRetryOptions()
    })
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

  const rules = normalizeFixedLabelRules(fixedLabels)

  // Build label selectors
  const matchers = []

  // Add fixed label rules, but avoid duplicating taskLabel if taskName is provided.
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') continue
    const key = String(rule.key || '').trim()
    if (!key) continue
    if (taskName && key === taskLabel) continue

    const matcher = fixedLabelRuleToMatcher(rule)
    if (matcher) matchers.push(matcher)
  }

  // Add task name filter if specified
  if (taskName) {
    matchers.push(`${taskLabel}="${escapeLabelValue(taskName)}"`)
  }

  return `{${matchers.join(', ')}}`
}

function buildTaskMessageFallbackQuery(taskName) {
  const baseSelector = buildTaskQuery(null)
  const safeTask = escapeLabelValue(String(taskName || ''))
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
