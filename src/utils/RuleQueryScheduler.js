/**
 * RuleQueryScheduler - Priority Queue Based Rule Query Scheduler
 *
 * Schedules and executes VMAlert rule queries based on their interval.
 * Uses a priority queue to efficiently manage query execution timing.
 *
 * Features:
 * - Per-rule interval scheduling (30s, 1m, etc.)
 * - Priority queue for efficient scheduling
 * - Automatic re-queuing after execution
 * - Graceful failure handling with data persistence
 * - Dynamic rule updates on alert refresh
 */

/**
 * Parse interval string to milliseconds
 * @param {string} interval - Interval string (e.g., '30s', '1m', '5m')
 * @returns {number} Interval in milliseconds
 */
function parseInterval(interval) {
  if (!interval || typeof interval !== 'string') {
    return 30000 // Default 30s
  }

  const match = interval.match(/^(\d+)([smh])$/)
  if (!match) {
    console.warn(`[RuleQueryScheduler] Invalid interval format: ${interval}, using default 30s`)
    return 30000
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 's': return value * 1000
    case 'm': return value * 60 * 1000
    case 'h': return value * 60 * 60 * 1000
    default: return 30000
  }
}

/**
 * Rule Query Scheduler
 */
export class RuleQueryScheduler {
  constructor(queryExecutor) {
    /**
     * @type {Function} queryExecutor - Function to execute query: (query) => Promise<result>
     */
    this.queryExecutor = queryExecutor

    /**
     * @type {Array<Object>} queue - Priority queue of scheduled rules
     * Each item: { ruleId, query, interval, intervalMs, nextExecutionTime, lastResult, executing }
     */
    this.queue = []

    /**
     * @type {Map<string, Object>} ruleMap - Map of ruleId to rule data for quick lookup
     */
    this.ruleMap = new Map()

    /**
     * @type {number|null} checkTimer - Timer for checking queue
     */
    this.checkTimer = null

    /**
     * @type {boolean} running - Whether scheduler is running
     */
    this.running = false

    /**
     * @type {Function|null} onResultCallback - Callback when results are updated
     */
    this.onResultCallback = null
  }

  /**
   * Start the scheduler
   * Checks queue every 1 second for due tasks
   */
  start() {
    if (this.running) {
      console.log('[RuleQueryScheduler] Already running')
      return
    }

    this.running = true
    console.log('[RuleQueryScheduler] Starting scheduler (check interval: 1s)')

    // Check queue every 1 second
    this.checkTimer = setInterval(() => {
      this.checkAndExecute()
    }, 1000)
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.running) {
      return
    }

    this.running = false

    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }

    console.log('[RuleQueryScheduler] Stopped')
  }

  /**
   * Update rules in the scheduler
   * Called when alerts are fetched/refreshed
   * @param {Array<Object>} alerts - Array of alert objects with rule.query and rule metadata
   */
  updateRules(alerts) {
    // Extract unique rules from alerts
    const rulesMap = new Map()

    alerts.forEach(alert => {
      if (!alert.rule?.query) {
        return
      }

      const ruleId = alert.rule.name || alert.labels?.alertname || alert.rule.query

      if (!rulesMap.has(ruleId)) {
        rulesMap.set(ruleId, {
          ruleId,
          query: alert.rule.query,
          interval: alert.rule.duration || '30s', // Use duration or default
          alertName: alert.labels?.alertname
        })
      }
    })

    console.log(`[RuleQueryScheduler] Updating: ${rulesMap.size} unique rules from ${alerts.length} alerts`)

    // Determine which rules to add, update, or remove
    const currentRuleIds = new Set(this.ruleMap.keys())
    const newRuleIds = new Set(rulesMap.keys())

    // Add new rules
    for (const [ruleId, ruleData] of rulesMap.entries()) {
      if (!currentRuleIds.has(ruleId)) {
        this.addRule(ruleData)
      } else {
        // Update existing rule if interval changed
        const existing = this.ruleMap.get(ruleId)
        if (existing.interval !== ruleData.interval) {
          this.removeRule(ruleId)
          this.addRule(ruleData)
        }
      }
    }

    // Remove rules that no longer exist
    for (const ruleId of currentRuleIds) {
      if (!newRuleIds.has(ruleId)) {
        this.removeRule(ruleId)
      }
    }
  }

  /**
   * Add a new rule to the scheduler
   * @param {Object} ruleData - { ruleId, query, interval }
   */
  addRule(ruleData) {
    const { ruleId, query, interval } = ruleData
    const intervalMs = parseInterval(interval)
    const now = Date.now()

    const rule = {
      ruleId,
      query,
      interval,
      intervalMs,
      nextExecutionTime: now, // Execute immediately on first add
      lastResult: null, // Store last successful result
      executing: false,
      alertName: ruleData.alertName
    }

    this.ruleMap.set(ruleId, rule)
    this.enqueue(rule)
  }

  /**
   * Remove a rule from the scheduler
   * @param {string} ruleId - Rule ID to remove
   */
  removeRule(ruleId) {
    this.ruleMap.delete(ruleId)
    this.queue = this.queue.filter(r => r.ruleId !== ruleId)
  }

  /**
   * Enqueue a rule into the priority queue
   * Queue is sorted by nextExecutionTime (earliest first)
   * @param {Object} rule - Rule object
   */
  enqueue(rule) {
    this.queue.push(rule)
    this.queue.sort((a, b) => a.nextExecutionTime - b.nextExecutionTime)
  }

  /**
   * Dequeue the next rule from the priority queue
   * @returns {Object|null} Rule object or null if queue is empty
   */
  dequeue() {
    return this.queue.shift() || null
  }

  /**
   * Check queue and execute due tasks
   */
  async checkAndExecute() {
    if (!this.running) {
      return
    }

    if (this.queue.length === 0) {
      return
    }

    const now = Date.now()
    const nextRule = this.queue[0]

    // Log next execution time on first check
    if (!this._loggedFirstCheck) {
      console.log(`[RuleQueryScheduler] First check - next rule: ${nextRule.ruleId}, due in ${Math.floor((nextRule.nextExecutionTime - now) / 1000)}s`)
      this._loggedFirstCheck = true
    }

    // Process all rules that are due for execution
    while (this.queue.length > 0) {
      const nextRule = this.queue[0]

      // Check if rule is due
      if (nextRule.nextExecutionTime > now) {
        break // Queue is sorted, so we can stop here
      }

      // Check if rule is already executing
      if (nextRule.executing) {
        // Remove from queue and re-enqueue to avoid infinite loop
        this.dequeue()
        nextRule.nextExecutionTime = now + nextRule.intervalMs
        this.enqueue(nextRule)
        continue
      }

      // Dequeue and execute
      const rule = this.dequeue()
      this.executeRule(rule)
    }
  }

  /**
   * Execute a rule query
   * @param {Object} rule - Rule to execute
   */
  async executeRule(rule) {
    rule.executing = true
    console.log(`[RuleQueryScheduler] Executing rule ${rule.ruleId}`)

    try {
      const result = await this.queryExecutor(rule.query)
      console.log(`[RuleQueryScheduler] Rule ${rule.ruleId} executed successfully, got ${result?.result?.length || 0} results`)

      // Store successful result
      rule.lastResult = result
    } catch (error) {
      console.error(`[RuleQueryScheduler] Query failed for ${rule.ruleId}:`, error.message)
      // Keep lastResult unchanged on failure (fallback to previous data)
    } finally {
      rule.executing = false

      // Schedule next execution
      const now = Date.now()
      rule.nextExecutionTime = now + rule.intervalMs

      // Re-enqueue
      this.enqueue(rule)

      // Notify callback if registered
      if (this.onResultCallback) {
        console.log(`[RuleQueryScheduler] Triggering callback with ${this.getAllResults().size} results`)
        this.onResultCallback(this.getAllResults())
      }
    }
  }

  /**
   * Get all current results
   * @returns {Map<string, Object>} Map of query to result
   */
  getAllResults() {
    const results = new Map()

    for (const [ruleId, rule] of this.ruleMap.entries()) {
      if (rule.lastResult !== null) {
        results.set(rule.query, rule.lastResult)
      }
    }

    return results
  }

  /**
   * Set callback for result updates
   * @param {Function} callback - Callback function(resultsMap)
   */
  onResult(callback) {
    this.onResultCallback = callback
  }

  /**
   * Get scheduler statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const now = Date.now()

    return {
      running: this.running,
      totalRules: this.ruleMap.size,
      queueSize: this.queue.length,
      nextExecution: this.queue.length > 0
        ? Math.max(0, Math.floor((this.queue[0].nextExecutionTime - now) / 1000))
        : null,
      rules: Array.from(this.ruleMap.values()).map(rule => ({
        ruleId: rule.ruleId,
        interval: rule.interval,
        nextExecution: Math.max(0, Math.floor((rule.nextExecutionTime - now) / 1000)),
        hasResult: rule.lastResult !== null,
        executing: rule.executing
      }))
    }
  }
}

export default RuleQueryScheduler
