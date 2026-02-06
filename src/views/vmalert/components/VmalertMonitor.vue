<template>
  <div class="vmalert-monitor-container">
    <!-- Header -->
    <div class="monitor-header">
      <div class="header-left">
        <span class="task-name">{{ currentTask || '全部告警' }}</span>
        <span
          v-if="isDeadManSwitchEnabled"
          class="polling-status deadman-status"
          :class="{
            active: prometheusStore.deadManSwitchOk && prometheusStore.polling,
            error: !prometheusStore.deadManSwitchOk || !prometheusStore.polling
          }"
        >
          ● {{ deadManStatusText }}
        </span>
        <span class="polling-status" :class="{ active: prometheusStore.polling, error: !prometheusStore.polling }">
          ● {{ pollingStatusText }}
        </span>
      </div>

      <div class="header-stats">
        <el-select
          v-if="hasSeverityLabel"
          v-model="selectedSeverity"
          placeholder="级别"
          size="small"
          style="width: 120px; margin-right: 12px"
          clearable
        >
          <el-option label="ALL" value="" />
          <el-option
            v-for="level in severityLevels"
            :key="level"
            :label="level.toUpperCase()"
            :value="level"
          />
        </el-select>
        <el-button
          size="small"
          :icon="Refresh"
          :loading="prometheusStore.loading"
          @click="handleRefresh"
        >
          刷新
        </el-button>
      </div>
    </div>

    <!-- Content -->
    <div class="monitor-content">
      <div v-if="prometheusStore.loading && hierarchy.length === 0" class="loading-state">
        <el-icon class="loading-icon"><Loading /></el-icon>
        加载中...
      </div>

      <div v-else-if="hierarchy.length > 0" class="alert-hierarchy">
        <!-- Flat structure (no columns) -->
        <template v-if="hierarchy[0].type === 'flat'">
          <div class="alert-list">
            <div
              v-for="(alert, index) in hierarchy[0].alerts"
              :key="index"
              class="alert-item-wrapper"
            >
              <div
                class="alert-item"
                :class="[`alert-${alert.state}`, { expanded: expandedAlertIndex === `flat-${index}` }]"
                @click="toggleAlertExpand(`flat-${index}`, [alert])"
              >
                <div class="alert-summary">
                  <div class="alert-name">{{ getAlertDisplayName(alert) }}</div>
                  <div class="alert-summary-tags">
                    <el-tag :type="getStateTagType(alert.state)" size="small">
                      {{ getStateDisplayName(alert.state) }}
                    </el-tag>
                    <el-tag
                      v-if="getAlertmanagerTagLabel(alert)"
                      type="info"
                      size="small"
                      class="alertmanager-tag"
                      effect="plain"
                    >
                      {{ getAlertmanagerTagLabel(alert) }}
                    </el-tag>
                  </div>
                </div>
              </div>

              <!-- Expanded detail -->
              <div v-if="expandedAlertIndex === `flat-${index}`" class="alert-detail-expanded">
                <div v-if="alert.annotations && Object.keys(alert.annotations).length > 0" class="detail-section">
                  <div class="detail-title">Annotations</div>
                  <div class="annotations-list">
                    <div v-for="([key, value], index) in Object.entries(alert.annotations).sort((a, b) => a[0].localeCompare(b[0]))" :key="index" class="annotation-item">
                      <span class="annotation-key">{{ key }}:</span>
                      <span class="annotation-value" v-html="linkifyText(value)"></span>
                    </div>
                  </div>
                </div>

                <div class="detail-section">
                  <div class="detail-title">Labels</div>
                  <div v-if="!alert.labels || Object.keys(alert.labels).length === 0" class="empty-hint">
                    暂无 Labels 数据
                  </div>
                  <div v-else class="labels-grid">
                    <div
                      v-for="([key, value], index) in Object.entries(alert.labels).sort((a, b) => a[0].localeCompare(b[0]))"
                      :key="index"
                      class="label-item"
                    >
                      <span class="label-key">{{ key }}:</span>
                      <span class="label-value">{{ value }}</span>
                    </div>
                  </div>
                </div>

                <div v-if="alert.rule" class="detail-section">
                  <div class="detail-title">Rule Info</div>
                  <div class="rule-info">
                    <div class="rule-item"><strong>Query:</strong> {{ alert.rule.query }}</div>
                    <div class="rule-item"><strong>Duration:</strong> {{ alert.rule.duration }}</div>
                    <div class="rule-item"><strong>Health:</strong> {{ alert.rule.health }}</div>
                    <div v-if="alert.rule.lastError" class="rule-item"><strong>Last Error:</strong> {{ alert.rule.lastError }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Hierarchical structure (with columns) -->
        <template v-else>
          <div class="columns-container">
            <div
              v-for="(column, colIndex) in hierarchy"
              :key="colIndex"
              class="column"
            >
              <div class="column-header">
                <span class="column-label">{{ column.label }}</span>
                <span class="column-value">{{ column.displayValue || column.value }}</span>
              </div>

              <div class="grids-container">
                <div
                  v-for="(grid, gridIndex) in column.grids"
                  :key="gridIndex"
                  class="grid"
                  :class="[
                    `grid-${grid.state}`,
                    'grid-clickable',
                    {
                      'grid-alertmanager-match': hasAlertmanagerMatchForGrid(grid),
                      'grid-alertmanager-silenced': hasAlertmanagerSilenceForGrid(grid)
                    }
                  ]"
                  @click="openGridDialog(grid, column)"
                >
                  <div class="grid-header">
                    <div class="grid-title">
                      <span class="grid-label">{{ grid.label }}</span>
                      <span class="grid-value">{{ grid.displayValue || grid.value }}</span>
                    </div>
                    <div v-if="hasAlertmanagerMatchForGrid(grid)" class="grid-actions" @click.stop>
                    <AlertmanagerSilenceDropdown
                      :alerts="getGridAlerts(grid)"
                      :labels="getMuteLabelsForGrid(grid, column)"
                      :context-label="`${grid.label}: ${grid.displayValue || grid.value}`"
                      :exclude-label-keys="getMuteExcludeLabelsForColumn(column)"
                      :include-alertname-fallback="false"
                      :confirm-before-create="true"
                      size="small"
                      @silenced="handleSilenceCreated"
                    />
                    </div>
                  </div>

                  <div class="grid-summary">
                    <div class="grid-stat">
                      <span class="stat-label">监控项:</span>
                      <span class="stat-value">{{ getGridAlertCount(grid) }}</span>
                    </div>
                    <div class="grid-stat">
                      <span class="stat-label">状态:</span>
                      <div class="grid-status-group">
                        <el-tag :type="getStateTagType(grid.state)" size="small">
                          {{ getStateDisplayName(grid.state) }}
                        </el-tag>
                        <el-tag
                          v-if="getGridSilenceLabel(grid)"
                          type="warning"
                          size="small"
                          class="grid-silence-tag"
                          effect="plain"
                        >
                          {{ getGridSilenceLabel(grid) }}
                        </el-tag>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-else class="empty-state">
        {{ currentTask ? '该任务暂无告警' : '暂无告警数据' }}
      </div>
    </div>

    <!-- Grid Alert Dialog -->
    <el-dialog
      v-model="gridDialogVisible"
      :title="selectedGrid ? `${selectedGrid.label}: ${selectedGrid.displayValue || selectedGrid.value}` : '告警详情'"
      width="70%"
      :close-on-click-modal="false"
    >
      <div v-if="selectedGrid" class="grid-dialog-content">
        <div class="dialog-summary">
          <div class="summary-item">
            <span class="summary-label">监控项:</span>
            <span class="summary-value">{{ sortedGridAlerts.length }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">整体状态:</span>
            <el-tag :type="getStateTagType(selectedGrid.state)" size="default">
              {{ getStateDisplayName(selectedGrid.state) }}
            </el-tag>
          </div>
          <div v-if="dialogCommonLabels.length > 0" class="summary-item summary-common-labels">
            <span class="summary-label">共同标签</span>
            <div class="summary-common-list">
              <span
                v-for="([key, value], index) in dialogCommonLabels"
                :key="index"
                class="summary-common-chip"
              >
                <span class="summary-common-key">{{ key }}</span>
                <span class="summary-common-sep">:</span>
                <span class="summary-common-value">{{ value }}</span>
              </span>
            </div>
          </div>
        </div>

        <div class="dialog-alerts-list">
          <div
            v-for="(alert, index) in sortedGridAlerts"
            :key="index"
            class="dialog-alert-item"
            :class="[
              `alert-${alert.state}`,
              {
                'alertmanager-match': alert.alertmanagerMatched,
                'alertmanager-silenced': isAlertmanagerAlertSilenced(alert)
              }
            ]"
          >
            <div class="dialog-alert-header">
              <div class="dialog-alert-name">{{ getAlertDisplayName(alert) }}</div>
              <div class="dialog-alert-actions">
                <div class="alert-summary-tags">
                  <el-tag :type="getStateTagType(alert.state)" size="small">
                    {{ getStateDisplayName(alert.state) }}
                  </el-tag>
                  <el-tag
                    v-if="isAlertmanagerAlertSilenced(alert)"
                    type="warning"
                    size="small"
                    class="alertmanager-silenced-tag"
                    effect="plain"
                  >
                    {{ getAlertmanagerSilencedLabel(alert) }}
                  </el-tag>
                  <el-tag
                    v-if="getAlertmanagerTagLabel(alert)"
                    type="info"
                    size="small"
                    class="alertmanager-tag"
                    effect="plain"
                  >
                    {{ getAlertmanagerTagLabel(alert) }}
                  </el-tag>
                </div>
                <AlertmanagerSilenceDropdown
                  :alert="alert"
                  :labels="getMuteLabelsForGrid(selectedGrid, selectedColumn)"
                  :context-label="selectedGrid ? `${selectedGrid.label}: ${selectedGrid.displayValue || selectedGrid.value}` : ''"
                  :exclude-label-keys="currentMuteExcludeLabels"
                  :include-alertname-fallback="false"
                  :confirm-before-create="true"
                  size="small"
                  @silenced="handleSilenceCreated"
                />
              </div>
            </div>

            <div class="dialog-alert-body">

              <div v-if="alert.annotations && Object.keys(alert.annotations).length > 0" class="detail-section">
                <div class="detail-title">Annotations</div>
                <div class="annotations-list">
                  <div
                    v-for="([key, value, category], index) in getSortedAnnotations(alert)"
                    :key="index"
                    class="annotation-item"
                    :class="`annotation-${category}`"
                  >
                    <span class="annotation-key">{{ key }}:</span>
                      <span class="annotation-value" v-html="linkifyText(value)"></span>
                  </div>
                </div>
              </div>

              <div class="detail-section">
                <div class="detail-title">Labels</div>
                <div v-if="!alert.labels || Object.keys(alert.labels).length === 0" class="empty-hint">
                  暂无 Labels 数据
                </div>
                <div v-else class="labels-grid">
                  <div
                    v-for="([key, value, category], index) in getSortedLabels(alert)"
                    :key="index"
                    class="label-item"
                    :class="`label-${category}`"
                  >
                    <span class="label-key">{{ key }}:</span>
                    <span class="label-value">{{ value }}</span>
                  </div>
                </div>
              </div>

              <div v-if="alert.rule" class="detail-section">
                <div class="detail-title">Rule Info</div>
                <div class="rule-info">
                  <div class="rule-item"><strong>Query:</strong> {{ alert.rule.query }}</div>
                  <div class="rule-item"><strong>Duration:</strong> {{ alert.rule.duration }}</div>
                  <div class="rule-item"><strong>Health:</strong> {{ alert.rule.health }}</div>
                  <div v-if="alert.rule.lastError" class="rule-item"><strong>Last Error:</strong> {{ alert.rule.lastError }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { Loading, Refresh } from '@element-plus/icons-vue'
import { useVmalertStore } from '../../../stores/vmalertStore'
import { getAlertStateDisplayName } from '../../../api/vmalert'
import LinkifyIt from 'linkify-it'
import AlertmanagerSilenceDropdown from '../../../components/AlertmanagerSilenceDropdown.vue'
import {
  doesAlertmanagerSilenceMatchAlert,
  formatRemainingDurationCompact,
  getRemainingDurationMs,
  isAlertmanagerSilenceActive
} from '../../../utils/alertmanager'
import {
  isDeadManSwitchEnabled as checkDeadManSwitchEnabled,
  getPrometheusSeverityLevels,
  getPrometheusSeverityLabel,
  getPrometheusTaskLabel,
  getPrometheusFixedLabels,
  getPrometheusColumns
} from '../../../utils/config'

const route = useRoute()
const prometheusStore = useVmalertStore()
const linkify = new LinkifyIt()

const currentTask = computed(() => route.params.taskName || null)

// Expanded alert index (for flat structure accordion-style expansion)
const expandedAlertIndex = ref(null)

// Grid dialog state
const selectedGrid = ref(null)
const selectedColumn = ref(null) // Store the column that the grid belongs to
const gridDialogVisible = ref(false)

// Severity filter
const selectedSeverity = ref('')

// Check if DeadManSwitch is enabled
const isDeadManSwitchEnabled = computed(() => checkDeadManSwitchEnabled())

// Get severity levels configuration
const severityLevels = computed(() => getPrometheusSeverityLevels())
const severityLabel = computed(() => getPrometheusSeverityLabel())
const taskLabel = computed(() => getPrometheusTaskLabel())
const fixedLabels = computed(() => getPrometheusFixedLabels() || {})

// Get columns configuration
const columnsConfig = computed(() => getPrometheusColumns())

// Highlight configuration for current dialog
const dialogHighlightAnnotations = ref([])
const dialogMuteExcludeLabels = ref([])

const currentHighlightAnnotations = computed(() => {
  if (dialogHighlightAnnotations.value && dialogHighlightAnnotations.value.length > 0) {
    return dialogHighlightAnnotations.value
  }
  if (!selectedColumn.value || !selectedColumn.value.highlightAnnotations) {
    return []
  }
  return selectedColumn.value.highlightAnnotations
})

const currentMuteExcludeLabels = computed(() => {
  if (dialogMuteExcludeLabels.value && dialogMuteExcludeLabels.value.length > 0) {
    return dialogMuteExcludeLabels.value
  }
  return []
})

// Annotation keys used for display names should be hidden in dialog
const hiddenAnnotationKeys = computed(() => {
  const keys = new Set()
  if (!selectedColumn.value) return keys

  const columnConfig = columnsConfig.value.find(cfg => cfg.label === selectedColumn.value.label) || null
  if (!columnConfig) return keys

  const addKey = (key) => {
    if (key && typeof key === 'string') {
      keys.add(key)
    }
  }

  addKey(columnConfig.displayNameAnnotation)
  const gridConfig = columnConfig.grids || null
  if (gridConfig) {
    addKey(gridConfig.displayNameAnnotation)
  }

  return keys
})

const dialogCommonLabels = computed(() => {
  return getCommonLabelEntriesForGrid(selectedGrid.value, selectedColumn.value)
})

// Check if any alerts have severity label
const hasSeverityLabel = computed(() => {
  const allAlerts = prometheusStore.alerts
  return allAlerts.some(alert => alert.labels && severityLabel.value in alert.labels)
})

// Computed: DeadManSwitch status text
const deadManStatusText = computed(() => {
  if (!prometheusStore.polling) {
    return '监控链路: 轮询已停止'
  }
  return prometheusStore.deadManSwitchOk ? '监控链路: 正常' : '监控链路: 异常'
})

// Computed: Polling status text
const pollingStatusText = computed(() => {
  if (!prometheusStore.polling) return '轮询已停止'
  if (prometheusStore.pollingCountdown > 0) {
    return `下次更新: ${prometheusStore.pollingCountdown}s`
  }
  return '轮询中...'
})

// Computed: Filtered alerts by severity
const filteredAlerts = computed(() => {
  // Always depend on selectedTaskAlerts for reactivity
  const taskAlerts = prometheusStore.selectedTaskAlerts

  if (!selectedSeverity.value) {
    return taskAlerts
  }

  const selectedIndex = severityLevels.value.indexOf(selectedSeverity.value)
  if (selectedIndex === -1) {
    return taskAlerts
  }

  // Include selected level and higher priority levels (earlier in array)
  const allowedLevels = severityLevels.value.slice(0, selectedIndex + 1)

  return taskAlerts.filter(alert => {
    const alertSeverity = alert.labels?.[severityLabel.value]
    return alertSeverity && allowedLevels.includes(alertSeverity)
  })
})

// Computed: Alert hierarchy (using filtered alerts)
const hierarchy = computed(() => {
  return prometheusStore.buildAlertHierarchy(filteredAlerts.value)
})

// Watch task changes
watch(currentTask, (newTask) => {
  prometheusStore.selectTask(newTask)
})

// Handle refresh
function handleRefresh() {
  prometheusStore.refresh()
}

// Toggle alert expansion (accordion-style)
function toggleAlertExpand(index, alerts) {
  if (expandedAlertIndex.value === index) {
    // Collapse if clicking the same item
    expandedAlertIndex.value = null
  } else {
    // Expand the clicked item
    expandedAlertIndex.value = index
  }
}

// Get state display name
function getStateDisplayName(state) {
  return getAlertStateDisplayName(state)
}

// Get alert display name (use summary annotation if available, otherwise use alertname)
function getAlertDisplayName(alert) {
  return alert.annotations?.summary || alert.name || alert.labels?.alertname || 'Unknown'
}

function linkifyText(text) {
  // NOTE: HTML is intentionally not sanitized here; XSS risk is accepted per requirement.
  const raw = text == null ? '' : String(text)
  const matches = linkify.match(raw)
  if (!matches || matches.length === 0) {
    return raw
  }

  let result = ''
  let lastIndex = 0

  for (const match of matches) {
    if (match.index > lastIndex) {
      result += raw.slice(lastIndex, match.index)
    }
    result += `<a href="${match.url}" target="_blank" rel="noopener noreferrer">${match.raw}</a>`
    lastIndex = match.lastIndex
  }

  if (lastIndex < raw.length) {
    result += raw.slice(lastIndex)
  }

  return result
}

// Get state tag type for Element Plus
function getStateTagType(state) {
  const typeMap = {
    'firing': 'danger',
    'pending': 'warning',
    'inactive': 'success'
  }
  return typeMap[state] || 'info'
}

function getAlertmanagerTagLabel(alert) {
  const receivers = alert?.alertmanagerReceivers || []
  if (!Array.isArray(receivers) || receivers.length === 0) {
    return ''
  }
  if (receivers.length === 1) {
    return `AM:${receivers[0]}`
  }
  return `AM:${receivers[0]}+${receivers.length - 1}`
}

function getGridAlerts(grid) {
  if (!grid) return []
  if (grid.alerts) {
    return grid.alerts
  }
  return []
}

function hasAlertmanagerMatchForGrid(grid) {
  const alerts = getGridAlerts(grid)
  return alerts.some(alert => alert.alertmanagerMatched)
}

function hasAlertmanagerSilenceForGrid(grid) {
  const alerts = getGridAlerts(grid)
  if (!alerts.length) return false

  const activeSilences = getActiveAlertmanagerSilences()
  if (activeSilences.length === 0) return false

  return alerts.some(alert => activeSilences.some(silence => doesAlertmanagerSilenceMatchAlert(silence, alert)))
}

function getActiveAlertmanagerSilences() {
  const silences = Array.isArray(prometheusStore.alertmanagerSilences)
    ? prometheusStore.alertmanagerSilences
    : []
  return silences.filter(isAlertmanagerSilenceActive)
}

function isAlertmanagerAlertSilenced(alert) {
  if (!alert) return false
  const activeSilences = getActiveAlertmanagerSilences()
  if (activeSilences.length === 0) return false
  return activeSilences.some(silence => doesAlertmanagerSilenceMatchAlert(silence, alert))
}

function getAlertmanagerSilencedLabel(alert) {
  if (!alert) return '\u5df2\u9759\u9ed8'

  const activeSilences = getActiveAlertmanagerSilences()
  if (activeSilences.length === 0) return '\u5df2\u9759\u9ed8'

  const matching = activeSilences.filter(silence => doesAlertmanagerSilenceMatchAlert(silence, alert))
  if (matching.length === 0) return '\u5df2\u9759\u9ed8'

  let minRemainingMs = Infinity
  matching.forEach(silence => {
    const remainingMs = getRemainingDurationMs(silence?.endsAt)
    if (remainingMs > 0 && remainingMs < minRemainingMs) {
      minRemainingMs = remainingMs
    }
  })

  if (!Number.isFinite(minRemainingMs)) {
    return '\u5df2\u9759\u9ed8'
  }

  const compact = formatRemainingDurationCompact(minRemainingMs)
  if (!compact) return '\u5df2\u9759\u9ed8'
  return `\u5df2\u9759\u9ed8(${compact})`
}

function getGridSilenceLabel(grid) {
  const alerts = getGridAlerts(grid)
  if (!alerts.length) return ''

  const activeSilences = getActiveAlertmanagerSilences()
  if (activeSilences.length === 0) return ''

  let matched = false
  let minRemainingMs = Infinity

  activeSilences.forEach(silence => {
    const matchesAny = alerts.some(alert => doesAlertmanagerSilenceMatchAlert(silence, alert))
    if (!matchesAny) return

    matched = true
    const remainingMs = getRemainingDurationMs(silence?.endsAt)
    if (remainingMs > 0 && remainingMs < minRemainingMs) {
      minRemainingMs = remainingMs
    }
  })

  if (!matched) return ''
  if (!Number.isFinite(minRemainingMs)) return '\u5df2\u9759\u9ed8'

  const compact = formatRemainingDurationCompact(minRemainingMs)
  if (!compact) return '\u5df2\u9759\u9ed8'
  return `\u5df2\u9759\u9ed8(${compact})`
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => (item == null ? '' : String(item).trim()))
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }
  return []
}

function resolveMuteExcludeLabels(config = {}) {
  if (!config || typeof config !== 'object') return []
  const raw = config.muteExcludeLabels ?? config.muteExcludeLabel ?? config.muteexclaudelabel
  return normalizeStringArray(raw)
}

function resolveMuteIncludeLabels(config = {}) {
  if (!config || typeof config !== 'object') return []
  const raw = config.muteIncludeLabels ?? config.muteIncludeLabel ?? config.muteincludelabel
  return normalizeStringArray(raw)
}

function getMuteExcludeLabelsForColumn(column) {
  if (!column) return []
  const columnConfig = columnsConfig.value.find(cfg => cfg.label === column.label) || null
  const gridConfig = columnConfig?.grids || null
  const gridExclude = resolveMuteExcludeLabels(gridConfig)
  if (gridExclude.length > 0) return gridExclude
  return resolveMuteExcludeLabels(columnConfig)
}

function getMuteIncludeLabelsForColumn(column) {
  if (!column) return []
  const columnConfig = columnsConfig.value.find(cfg => cfg.label === column.label) || null
  const gridConfig = columnConfig?.grids || null
  const gridInclude = resolveMuteIncludeLabels(gridConfig)
  if (gridInclude.length > 0) return gridInclude
  return resolveMuteIncludeLabels(columnConfig)
}

function getCommonLabelEntriesForGrid(grid, column) {
  if (!grid) return []
  const alerts = getGridAlerts(grid)
  if (!Array.isArray(alerts) || alerts.length === 0) return []

  const keys = new Set()
  if (taskLabel.value) keys.add(taskLabel.value)
  if (column?.label) keys.add(column.label)
  if (grid?.label) keys.add(grid.label)
  getMuteIncludeLabelsForColumn(column).forEach(key => keys.add(key))

  const excluded = new Set(getMuteExcludeLabelsForColumn(column))
  const entries = []

  for (const key of keys) {
    if (!key || excluded.has(key)) continue
    let commonValue = null
    let isCommon = true

    for (const alert of alerts) {
      const value = alert?.labels?.[key]
      if (value == null) {
        isCommon = false
        break
      }
      if (commonValue == null) {
        commonValue = value
        continue
      }
      if (String(commonValue) !== String(value)) {
        isCommon = false
        break
      }
    }

    if (isCommon && commonValue != null && String(commonValue).length > 0) {
      entries.push([key, commonValue])
    }
  }

  Object.entries(fixedLabels.value || {}).forEach(([key, value]) => {
    if (!key || excluded.has(key)) return
    if (value == null || String(value).length === 0) return
    if (entries.some(entry => entry[0] === key)) return
    entries.push([key, value])
  })

  return entries
}

function getMuteLabelsForGrid(grid, column) {
  const labels = {}
  getCommonLabelEntriesForGrid(grid, column).forEach(([key, value]) => {
    labels[key] = value
  })
  return labels
}

// Open grid dialog
function openGridDialog(grid, column, highlightConfig = null) {
  selectedGrid.value = grid
  selectedColumn.value = column

  let annotations = null

  if (highlightConfig && typeof highlightConfig === 'object' && !Array.isArray(highlightConfig)) {
    if (Array.isArray(highlightConfig.annotations)) {
      annotations = highlightConfig.annotations
    }
  } else if (Array.isArray(highlightConfig)) {
    annotations = highlightConfig
  }

  const columnConfig = columnsConfig.value.find(cfg => cfg.label === column.label) || null
  const gridConfig = columnConfig?.grids || null

  dialogHighlightAnnotations.value =
    annotations ||
    gridConfig?.highlightAnnotations ||
    columnConfig?.highlightAnnotations ||
    []

  dialogMuteExcludeLabels.value =
    resolveMuteExcludeLabels(gridConfig).length > 0
      ? resolveMuteExcludeLabels(gridConfig)
      : resolveMuteExcludeLabels(columnConfig)

  gridDialogVisible.value = true
}

async function handleSilenceCreated() {
  try {
    await prometheusStore.refreshAlertmanagerSilences()
  } catch (error) {
    console.warn('[PrometheusMonitor] Failed to refresh after silence create:', error)
  }
}

// Get total alert count in a grid
function getGridAlertCount(grid) {
  // If grid has alerts directly, count them
  if (grid.alerts) {
    return grid.alerts.length
  }
  return 0
}

// Computed: Sorted alerts in selected grid (firing first)
const sortedGridAlerts = computed(() => {
  if (!selectedGrid.value) return []

  const allAlerts = Array.isArray(selectedGrid.value.alerts)
    ? [...selectedGrid.value.alerts]
    : []

  // Sort: firing first, then pending, then inactive
  return allAlerts.sort((a, b) => {
    const priority = { firing: 3, pending: 2, inactive: 1 }
    return (priority[b.state] || 0) - (priority[a.state] || 0)
  })
})

// Computed: Diff labels (labels that have different values across alerts in the grid)
const diffLabels = computed(() => {
  const alerts = sortedGridAlerts.value
  if (alerts.length <= 1) return new Set()

  // Collect all label keys and their values
  const labelValues = new Map() // key -> Set of values

  alerts.forEach(alert => {
    if (alert.labels) {
      Object.entries(alert.labels).forEach(([key, value]) => {
        if (!labelValues.has(key)) {
          labelValues.set(key, new Set())
        }
        labelValues.get(key).add(value)
      })
    }
  })

  // Find labels that have different values (more than 1 unique value)
  const diffKeys = new Set()
  labelValues.forEach((values, key) => {
    if (values.size > 1) {
      diffKeys.add(key)
    }
  })

  return diffKeys
})

// Get sorted labels (no categorization, just alphabetical)
function getSortedLabels(alert) {
  if (!alert.labels) return []

  const labels = Object.entries(alert.labels)
  const diff = diffLabels.value
  const highlightPalette = ['amber', 'sky', 'emerald', 'rose', 'violet', 'slate', 'indigo', 'teal']

  function getAutoHighlightColor(key) {
    let hash = 0
    for (let i = 0; i < key.length; i++) {
      hash = (hash + key.charCodeAt(i)) % highlightPalette.length
    }
    return highlightPalette[hash]
  }

  // Categorize labels by highlight > diff > normal
  const highlightLabelsList = []
  const diffLabelsList = []
  const normalLabelsList = []

  labels.forEach(([key, value]) => {
    const isDiff = diff.has(key)
    const highlightColor = currentHighlightAnnotations.value.includes(key)
      ? getAutoHighlightColor(key)
      : null

    if (highlightColor) {
      highlightLabelsList.push([key, value, `highlight-${highlightColor}`])
    } else if (isDiff) {
      diffLabelsList.push([key, value, `diff-${getAutoHighlightColor(key)}`])
    } else {
      normalLabelsList.push([key, value, 'normal'])
    }
  })

  // Sort within each category alphabetically
  const sortFn = (a, b) => a[0].localeCompare(b[0])
  highlightLabelsList.sort(sortFn)
  diffLabelsList.sort(sortFn)
  normalLabelsList.sort(sortFn)

  // Concatenate: highlight first, then diff, then normal
  return [
    ...highlightLabelsList,
    ...diffLabelsList,
    ...normalLabelsList
  ]
}

// Get sorted annotations with highlight
function getSortedAnnotations(alert) {
  if (!alert.annotations) return []

  const annotations = Object.entries(alert.annotations)
  const highlighted = currentHighlightAnnotations.value
  const hiddenKeys = hiddenAnnotationKeys.value

  // Categorize annotations
  const highlightedAnnotations = []
  const normalAnnotations = []

  annotations.forEach(([key, value]) => {
    if (hiddenKeys.has(key)) {
      return
    }
    const isHighlight = highlighted.includes(key)

    if (isHighlight) {
      highlightedAnnotations.push([key, value, 'highlight'])
    } else {
      normalAnnotations.push([key, value, 'normal'])
    }
  })

  // Sort within each category: keep highlight in config order, normal alphabetically
  highlightedAnnotations.sort((a, b) => {
    const indexA = highlighted.indexOf(a[0])
    const indexB = highlighted.indexOf(b[0])
    return indexA - indexB
  })
  normalAnnotations.sort((a, b) => a[0].localeCompare(b[0]))

  // Concatenate: highlighted first, then normal
  return [
    ...highlightedAnnotations,
    ...normalAnnotations
  ]
}

watch(
  currentTask,
  (taskName) => {
    prometheusStore.selectTask(taskName)
  },
  { immediate: true }
)
</script>

<style scoped>
.vmalert-monitor-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color);
}

.monitor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.task-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.polling-status {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.polling-status.active {
  color: var(--el-color-success);
}

.polling-status.error {
  color: var(--el-color-danger);
}

.header-stats {
  display: flex;
  align-items: center;
  gap: 12px;
}

.monitor-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.loading-icon {
  font-size: 32px;
  margin-bottom: 16px;
  animation: spin 1s linear infinite;
}

/* Flat structure */
.alert-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.alert-item-wrapper {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.alert-item {
  padding: 12px 16px;
  cursor: pointer;
  background: var(--el-bg-color);
  transition: all 0.2s ease;
}

.alert-item:hover {
  background: var(--el-fill-color-light);
}

.alert-item.expanded {
  background: var(--el-fill-color);
  border-bottom: 1px solid var(--el-border-color-light);
}

.alert-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.alert-summary-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}

.alertmanager-tag {
  background: #eff6ff; /* blue-50 */
  border-color: #bfdbfe; /* blue-200 */
  color: #1d4ed8; /* blue-700 */
}

.alertmanager-silenced-tag {
  background: #fff7ed; /* orange-50 */
  border-color: #fed7aa; /* orange-200 */
  color: #c2410c; /* orange-700 */
}

.alert-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.alert-firing {
  border-left: 4px solid #f56c6c;
}

.alert-pending {
  border-left: 4px solid #e6a23c;
}

.alert-inactive {
  border-left: 4px solid #67c23a;
}

.alert-detail-expanded {
  padding: 16px;
  background: var(--el-bg-color-page);
  border-top: 1px solid var(--el-border-color-lighter);
  animation: slideDown 0.3s ease;
}

/* Hierarchical structure */
.columns-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.column {
  width: 100%;
  background: var(--el-bg-color-page);
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.06);
}

.column-header {
  padding: 14px 18px;
  background: linear-gradient(to right, var(--el-fill-color-light), var(--el-fill-color));
  border-bottom: 2px solid var(--el-border-color-light);
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
}

.column-label {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 3px 10px;
  background: var(--el-bg-color);
  border-radius: 6px;
}

.column-value {
  color: var(--el-text-color-primary);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.grids-container {
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.grid {
  flex: 1 1 200px;
  min-width: 200px;
  max-width: 400px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.grid-clickable {
  cursor: pointer;
}

.grid-clickable:hover {
  box-shadow: 0 6px 12px -2px rgba(0, 0, 0, 0.15), 0 3px 6px -3px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.grid-clickable:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
}

/* Grid state colors */
.grid-firing {
  border-color: #ef4444;
  border-width: 2px;
  box-shadow: 0 2px 8px 0 rgba(239, 68, 68, 0.15), 0 1px 3px -1px rgba(239, 68, 68, 0.1);
}

.grid-firing .grid-header {
  background: linear-gradient(to bottom, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.12));
  border-bottom: 1px solid rgba(239, 68, 68, 0.2);
}

.grid-pending {
  border-color: #f59e0b;
  border-width: 2px;
  box-shadow: 0 2px 8px 0 rgba(251, 146, 60, 0.12), 0 1px 3px -1px rgba(251, 146, 60, 0.08);
}

.grid-pending .grid-header {
  background: linear-gradient(to bottom, rgba(251, 146, 60, 0.08), rgba(251, 146, 60, 0.12));
  border-bottom: 1px solid rgba(251, 146, 60, 0.2);
}

.grid-inactive {
  border-color: #22c55e;
  border-width: 1px;
  box-shadow: 0 1px 4px 0 rgba(34, 197, 94, 0.08), 0 1px 2px -1px rgba(34, 197, 94, 0.05);
}

.grid-inactive .grid-header {
  background: linear-gradient(to bottom, rgba(34, 197, 94, 0.05), rgba(34, 197, 94, 0.08));
  border-bottom: 1px solid rgba(34, 197, 94, 0.15);
}

.grid-alertmanager-match {
  background: #fef2f2; /* red-50 */
  border-color: #f87171; /* red-400 */
  box-shadow: 0 8px 16px -8px rgba(248, 113, 113, 0.45), 0 2px 6px -4px rgba(248, 113, 113, 0.4);
}

.grid-alertmanager-match .grid-header {
  background: linear-gradient(
    110deg,
    rgba(248, 113, 113, 0.18) 0%,
    rgba(248, 113, 113, 0.32) 35%,
    rgba(255, 255, 255, 0.28) 50%,
    rgba(248, 113, 113, 0.32) 65%,
    rgba(248, 113, 113, 0.18) 100%
  );
  border-bottom: 1px solid rgba(248, 113, 113, 0.25);
  background-size: 300% 100%;
  animation: gridHeaderShimmer 1.8s linear infinite, gridHeaderPulse 1.6s ease-in-out infinite;
}

.grid-alertmanager-silenced {
  background: #fff7ed; /* orange-50 */
  border-color: #fb923c; /* orange-400 */
  box-shadow: 0 8px 16px -8px rgba(249, 115, 22, 0.45), 0 2px 6px -4px rgba(249, 115, 22, 0.4);
}

.grid-alertmanager-silenced .grid-header {
  background: linear-gradient(
    110deg,
    rgba(251, 146, 60, 0.2) 0%,
    rgba(251, 146, 60, 0.38) 35%,
    rgba(255, 255, 255, 0.3) 50%,
    rgba(251, 146, 60, 0.38) 65%,
    rgba(251, 146, 60, 0.2) 100%
  );
  border-bottom: 1px solid rgba(251, 146, 60, 0.3);
  background-size: 320% 100%;
  animation: gridHeaderSilenceShimmer 1.6s linear infinite, gridHeaderSilencePulse 1.4s ease-in-out infinite;
}

.grid-header {
  padding: 12px 16px;
  background: linear-gradient(to bottom, var(--el-fill-color-lighter), var(--el-fill-color));
  border-bottom: none;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.grid-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.grid-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

.grid-label {
  color: var(--el-text-color-secondary);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 8px;
  background: var(--el-bg-color);
  border-radius: 4px;
}

.grid-value {
  color: var(--el-text-color-primary);
  font-weight: 700;
  font-size: 14px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Grid alerts container */
.grid-alerts-container {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grid-alert-item {
  /* Container for each alert group */
}

.alert-detail-card {
  padding: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  margin-bottom: 12px;
}

.alert-detail-card:last-child {
  margin-bottom: 0;
}

.alert-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.detail-section {
  margin-bottom: 12px;
  display: block;
  min-height: fit-content;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
}

.labels-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.annotations-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label-item,
.annotation-item {
  padding: 6px 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  font-size: 12px;
  word-break: break-all;
  min-height: 28px;
  display: flex;
  align-items: center;
}

/* Label categories - tailwind-style highlights */
.label-item[class*="label-highlight-"] {
  font-weight: 600;
}

.label-item.label-highlight-amber {
  background: #fffbeb; /* amber-50 */
  border: 1px solid #fde68a; /* amber-200 */
  box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.18); /* amber-400 ring */
}

.label-item.label-highlight-sky {
  background: #f0f9ff; /* sky-50 */
  border: 1px solid #bae6fd; /* sky-200 */
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.18); /* sky-400 ring */
}

.label-item.label-highlight-emerald {
  background: #ecfdf5; /* emerald-50 */
  border: 1px solid #a7f3d0; /* emerald-200 */
  box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.18); /* emerald-400 ring */
}

.label-item.label-highlight-rose {
  background: #fff1f2; /* rose-50 */
  border: 1px solid #fecdd3; /* rose-200 */
  box-shadow: 0 0 0 2px rgba(251, 113, 133, 0.18); /* rose-400 ring */
}

.label-item.label-highlight-violet {
  background: #f5f3ff; /* violet-50 */
  border: 1px solid #ddd6fe; /* violet-200 */
  box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.18); /* violet-400 ring */
}

.label-item.label-highlight-slate {
  background: #f8fafc; /* slate-50 */
  border: 1px solid #e2e8f0; /* slate-200 */
  box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.18); /* slate-400 ring */
}

.label-item.label-highlight-indigo {
  background: #eef2ff; /* indigo-50 */
  border: 1px solid #c7d2fe; /* indigo-200 */
  box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.18); /* indigo-400 ring */
}

.label-item.label-highlight-teal {
  background: #f0fdfa; /* teal-50 */
  border: 1px solid #99f6e4; /* teal-200 */
  box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.18); /* teal-400 ring */
}

/* Diff labels - tailwind-style colors by key */
.label-item[class*="label-diff-"] {
  font-weight: 500;
}

.label-item.label-diff-amber {
  background: #fff7ed; /* amber-50 */
  border: 1px solid #fed7aa; /* amber-200 */
  box-shadow: 0 0 0 2px rgba(251, 146, 60, 0.12); /* amber-400 ring */
}

.label-item.label-diff-sky {
  background: #f0f9ff; /* sky-50 */
  border: 1px solid #bae6fd; /* sky-200 */
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.12); /* sky-400 ring */
}

.label-item.label-diff-emerald {
  background: #ecfdf5; /* emerald-50 */
  border: 1px solid #a7f3d0; /* emerald-200 */
  box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.12); /* emerald-400 ring */
}

.label-item.label-diff-rose {
  background: #fff1f2; /* rose-50 */
  border: 1px solid #fecdd3; /* rose-200 */
  box-shadow: 0 0 0 2px rgba(251, 113, 133, 0.12); /* rose-400 ring */
}

.label-item.label-diff-violet {
  background: #f5f3ff; /* violet-50 */
  border: 1px solid #ddd6fe; /* violet-200 */
  box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.12); /* violet-400 ring */
}

.label-item.label-diff-slate {
  background: #f8fafc; /* slate-50 */
  border: 1px solid #e2e8f0; /* slate-200 */
  box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.12); /* slate-400 ring */
}

.label-item.label-diff-indigo {
  background: #eef2ff; /* indigo-50 */
  border: 1px solid #c7d2fe; /* indigo-200 */
  box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.12); /* indigo-400 ring */
}

.label-item.label-diff-teal {
  background: #f0fdfa; /* teal-50 */
  border: 1px solid #99f6e4; /* teal-200 */
  box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.12); /* teal-400 ring */
}

.label-item.label-normal {
  background: var(--el-fill-color-lighter);
  border: 1px solid transparent;
}

/* Annotation categories - highlight important annotations */
.annotation-item.annotation-highlight {
  background: #fffbeb; /* amber-50 */
  border: 1px solid #fde68a; /* amber-200 */
  box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.18); /* amber-400 ring */
  font-weight: 600;
}

.label-item[class*="label-highlight-"] .label-key,
.label-item[class*="label-diff-"] .label-key,
.annotation-item.annotation-highlight .annotation-key {
  color: #0f172a; /* slate-900 */
}

.label-item[class*="label-highlight-"] .label-value,
.label-item[class*="label-diff-"] .label-value,
.annotation-item.annotation-highlight .annotation-value {
  color: #334155; /* slate-700 */
}

.annotation-item.annotation-normal {
  background: var(--el-fill-color-lighter);
  border: 1px solid transparent;
}

.label-key,
.annotation-key {
  font-weight: 600;
  color: var(--el-text-color-regular);
  margin-right: 4px;
}

.label-value,
.annotation-value {
  color: var(--el-text-color-secondary);
}

.annotation-value a {
  color: #2563eb; /* blue-600 */
  text-decoration: underline;
  text-underline-offset: 2px;
}

.annotation-value a:hover {
  color: #1d4ed8; /* blue-700 */
}

.rule-info {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.rule-item {
  padding: 6px 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  margin-bottom: 6px;
  word-break: break-all;
}

.rule-item:last-child {
  margin-bottom: 0;
}

.rule-item strong {
  color: var(--el-text-color-primary);
  margin-right: 8px;
}

.empty-hint {
  padding: 12px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
}

/* Grid summary */
.grid-summary {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.grid-status-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.grid-silence-tag {
  background: #fff7ed; /* orange-50 */
  border-color: #fed7aa; /* orange-200 */
  color: #c2410c; /* orange-700 */
}

.grid-stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.stat-label {
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.stat-value {
  color: var(--el-text-color-primary);
  font-weight: 700;
  font-size: 18px;
}

/* Dialog styles */
.grid-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dialog-summary {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
  padding: 16px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-common-labels {
  flex: 1;
  min-width: 0;
}

.summary-common-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.summary-common-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-regular);
  max-width: 220px;
}

.summary-common-key {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.summary-common-sep {
  color: var(--el-text-color-secondary);
}

.summary-common-value {
  color: var(--el-text-color-regular);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-label {
  color: var(--el-text-color-secondary);
  font-size: 14px;
  font-weight: 500;
}

.summary-value {
  color: var(--el-text-color-primary);
  font-size: 18px;
  font-weight: 700;
}

.dialog-alerts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
  overflow-y: auto;
}

.dialog-alert-item {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s ease;
  min-height: fit-content;
  display: block;
}

.dialog-alert-item:hover {
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.08);
}

.dialog-alert-item.alert-firing {
  border-left: 4px solid #f56c6c;
  background: linear-gradient(to right, rgba(245, 108, 108, 0.02), transparent);
}

.dialog-alert-item.alert-pending {
  border-left: 4px solid #e6a23c;
  background: linear-gradient(to right, rgba(230, 162, 60, 0.02), transparent);
}

.dialog-alert-item.alert-inactive {
  border-left: 4px solid #67c23a;
  background: linear-gradient(to right, rgba(103, 194, 58, 0.02), transparent);
}

.dialog-alert-item.alertmanager-match {
  background: linear-gradient(to right, rgba(248, 113, 113, 0.14), rgba(248, 113, 113, 0.04));
  border-color: #fca5a5; /* red-300 */
  box-shadow: 0 4px 10px -6px rgba(248, 113, 113, 0.6);
}

.dialog-alert-item.alertmanager-match.alert-firing {
  background: linear-gradient(to right, rgba(239, 68, 68, 0.18), rgba(239, 68, 68, 0.06));
  border-left-color: #ef4444;
}

.dialog-alert-item.alertmanager-silenced {
  background: linear-gradient(to right, rgba(251, 146, 60, 0.16), rgba(251, 146, 60, 0.05));
  border-color: #fdba74; /* orange-300 */
  box-shadow: 0 4px 10px -6px rgba(249, 115, 22, 0.45);
}

.dialog-alert-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.dialog-alert-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.dialog-alert-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.dialog-alert-body {
  padding: 16px;
  min-height: fit-content;
  display: block;
}

/* Animation */
@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes gridHeaderShimmer {
  from {
    background-position: 0% 0%;
  }
  to {
    background-position: 300% 0%;
  }
}

@keyframes gridHeaderPulse {
  0%, 100% {
    box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.25), 0 0 0 0 rgba(248, 113, 113, 0.4);
  }
  50% {
    box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.45), 0 0 0 3px rgba(248, 113, 113, 0.25);
  }
}

@keyframes gridHeaderSilenceShimmer {
  from {
    background-position: 0% 0%;
  }
  to {
    background-position: 320% 0%;
  }
}

@keyframes gridHeaderSilencePulse {
  0%, 100% {
    box-shadow: inset 0 0 0 1px rgba(251, 146, 60, 0.3), 0 0 0 0 rgba(251, 146, 60, 0.4);
  }
  50% {
    box-shadow: inset 0 0 0 1px rgba(251, 146, 60, 0.55), 0 0 0 3px rgba(251, 146, 60, 0.25);
  }
}
</style>
