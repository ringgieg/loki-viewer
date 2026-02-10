<template>
  <div
    ref="containerRef"
    class="virtual-log-list"
    @scroll="handleScroll"
  >
    <div
      class="virtual-inner"
      :style="{
        height: totalSize + 'px',
        position: 'relative'
      }"
    >
      <div
        v-for="item in virtualLogItems"
        :key="item.virtualRow.key"
        :ref="el => setRowRef(el)"
        class="log-entry"
        :class="[
          'level-' + (item.log.level || 'info').toLowerCase(),
          { 'is-expanded': isExpanded(item.log.id) }
        ]"
        :data-index="item.virtualRow.index"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${item.virtualRow.start}px)`
        }"
        @click="toggleExpand(item.log.id, $event)"
      >
        <div class="log-header">
          <div class="log-meta">
            <span class="log-time">{{ formatTime(item.log.timestamp) }}</span>
            <span class="log-level" :class="'level-' + (item.log.level || 'info').toLowerCase()">
              {{ item.log.level || 'INFO' }}
            </span>
            <span v-if="item.log.isNew" class="new-tag">NEW</span>
          </div>
          <span class="expand-icon">
            <el-icon v-if="isExpanded(item.log.id)"><ArrowDown /></el-icon>
            <el-icon v-else><ArrowRight /></el-icon>
          </span>
        </div>
        <div
          class="log-content"
          v-html="linkifyText(getTruncatedContent(item.log))"
          @click="handleLogContentClick"
        ></div>
        <div v-if="shouldShowTruncateHint(item.log)" class="truncate-hint">
          ...（点击展开查看完整日志）
        </div>

        <!-- Expanded details section -->
        <div v-if="isExpanded(item.log.id)" class="log-details">
          <!-- Raw log with copy button -->
          <div class="detail-section">
            <div class="section-header">
              <span class="section-title">原始日志</span>
              <el-button size="small" @click.stop="copyRawLog(item.log.line)">
                <el-icon><DocumentCopy /></el-icon>
                复制
              </el-button>
            </div>
            <div class="raw-log-content" @click.stop>{{ item.log.line }}</div>
          </div>

          <!-- Labels -->
          <div class="detail-section">
            <div class="section-header">
              <span class="section-title">标签</span>
            </div>
            <div class="labels-grid">
              <div
                v-for="(value, key) in item.log.labels"
                :key="key"
                class="label-item"
                @click.stop="copyLabel(key, value)"
              >
                <span class="label-key">{{ key }}</span>
                <span class="label-value">{{ value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading indicator -->
    <div v-if="loading" class="loading-more">
      <el-icon class="loading-icon"><Loading /></el-icon>
      加载更多...
    </div>

    <!-- End indicator -->
    <div v-if="!hasMore && logs.length > 0" class="no-more">
      已加载全部
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown, ArrowRight, DocumentCopy, Loading } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import LinkifyIt from 'linkify-it'
import { getConfig } from '../../../utils/config'
import { useVirtualizer } from '@tanstack/vue-virtual'

const props = defineProps({
  logs: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  hasMore: { type: Boolean, default: true },
  estimatedItemHeight: { type: Number, default: 60 },
  bufferSize: { type: Number, default: 10 }
})

const emit = defineEmits(['load-more'])

const containerRef = ref(null)
const expandedLogs = ref(new Set())

const linkify = new LinkifyIt()

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: props.logs.length,
    getScrollElement: () => containerRef.value,
    estimateSize: () => props.estimatedItemHeight,
    overscan: props.bufferSize,
    getItemKey: (index) => props.logs[index]?.id ?? index
  }))
)

const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

const virtualLogItems = computed(() => {
  return rowVirtualizer.value
    .getVirtualItems()
    .map(virtualRow => ({ virtualRow, log: props.logs[virtualRow.index] }))
    .filter(item => item.log)
})

function scrollToTop() {
  const el = containerRef.value
  if (!el) return
  el.scrollTop = 0
}

defineExpose({
  scrollToTop
})

function setRowRef(el) {
  if (!el) return
  const v = rowVirtualizer.value
  if (v && typeof v.measureElement === 'function') {
    v.measureElement(el)
  }
}

function pruneExpandedLogs(newLogs) {
  if (expandedLogs.value.size === 0) return

  if (!Array.isArray(newLogs) || newLogs.length === 0) {
    expandedLogs.value.clear()
    return
  }

  const maxTracked = getConfig('virtualScroll.maxExpandedLogsTracked', 1000)

  // Drop expanded flags for logs that are no longer present.
  // Keep the scan bounded so large lists don't cause slowdowns.
  const scanLimit = Math.max(maxTracked * 2, 2000)
  const present = new Set()
  for (let i = 0; i < newLogs.length && i < scanLimit; i++) {
    const id = newLogs[i]?.id
    if (id != null) present.add(id)
  }
  for (const id of expandedLogs.value) {
    if (!present.has(id)) expandedLogs.value.delete(id)
  }

  // Hard cap to avoid slow unbounded growth even if trimming detection misses a case.
  if (expandedLogs.value.size > maxTracked) {
    const excess = expandedLogs.value.size - maxTracked
    let removed = 0
    for (const id of expandedLogs.value) {
      expandedLogs.value.delete(id)
      removed++
      if (removed >= excess) break
    }
  }
}

watch(
  () => props.logs,
  async (newLogs, oldLogs) => {
    pruneExpandedLogs(newLogs)
  },
  { flush: 'pre' }
)

function handleScroll(event) {
  const target = event.target

  const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight
  // Use dynamic threshold based on container height
  const loadMoreThreshold = getConfig('virtualScroll.loadMoreThreshold', 0.2)
  const threshold = target.clientHeight * loadMoreThreshold
  if (scrollBottom < threshold && !props.loading && props.hasMore) {
    emit('load-more')
  }
}

function formatTime(timestamp) {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')
}

function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function escapeHtmlAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function linkifyText(text) {
  if (!text) return ''
  const matches = linkify.match(text)
  if (!matches || matches.length === 0) {
    return escapeHtml(text)
  }

  let result = ''
  let lastIndex = 0
  for (const match of matches) {
    const start = match.index
    const end = match.lastIndex
    if (start > lastIndex) {
      result += escapeHtml(text.slice(lastIndex, start))
    }

    const href = escapeHtmlAttr(match.url)
    const label = escapeHtml(text.slice(start, end))
    result += `<a class="log-link" target="_blank" rel="noopener noreferrer" href="${href}">${label}</a>`
    lastIndex = end
  }

  if (lastIndex < text.length) {
    result += escapeHtml(text.slice(lastIndex))
  }

  return result
}

function handleLogContentClick(event) {
  const target = event.target
  if (target && target.closest && target.closest('a')) {
    event.stopPropagation()
  }
}

function getTruncatedContent(log) {
  // Always show truncated content (first 10 lines only)
  // Full content is shown in the expanded "原始日志" section
  const lines = log.line ? log.line.split('\n') : []
  if (lines.length > 10) {
    return lines.slice(0, 10).join('\n')
  }
  return log.line
}

function shouldShowTruncateHint(log) {
  // Only show hint if not expanded and content has more than 10 lines
  if (isExpanded(log.id)) {
    return false
  }
  const lines = log.line ? log.line.split('\n') : []
  return lines.length > 10
}

function isExpanded(logId) {
  return expandedLogs.value.has(logId)
}

function toggleExpand(logId, event) {
  // Don't toggle if user is selecting text
  const selection = window.getSelection()
  if (selection && selection.toString().length > 0) {
    return
  }

  if (expandedLogs.value.has(logId)) {
    expandedLogs.value.delete(logId)
  } else {
    expandedLogs.value.add(logId)
  }
  // Re-measure only the clicked row to avoid large offset jumps.
  const targetEl = event?.currentTarget
  nextTick(() => {
    const v = rowVirtualizer.value
    if (!v) return

    if (targetEl && typeof v.measureElement === 'function') {
      v.measureElement(targetEl)
      return
    }
  })
}

async function copyLabel(key, value) {
  const text = `${key}="${value}"`
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success({
      message: '已复制到剪贴板',
      duration: 2000,
      showClose: false
    })
  } catch (e) {
    console.error('Failed to copy:', e)
    ElMessage.error('复制失败')
  }
}

async function copyRawLog(text) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success({
      message: '已复制原始日志',
      duration: 2000,
      showClose: false
    })
  } catch (e) {
    console.error('Failed to copy:', e)
    ElMessage.error('复制失败')
  }
}

</script>

<style scoped>
.virtual-log-list {
  height: 100%;
  overflow-y: auto;
  background: var(--el-bg-color-page);
  padding: 12px;
}

.log-entry {
  padding: 12px 16px;
  margin-bottom: 8px;
  background: var(--el-bg-color);
  border-radius: 8px;
  border-left: 3px solid var(--el-color-primary);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  transition: all 0.15s ease;
  cursor: pointer;
}

.log-entry:hover {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.log-entry.is-expanded {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border-left-width: 4px;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  cursor: pointer;
  user-select: none;
}

.log-entry.level-error {
  border-left-color: var(--el-color-danger);
  background: var(--el-color-danger-light-8);
}

.log-entry.level-warn {
  border-left-color: var(--el-color-warning);
  background: var(--el-color-warning-light-8);
}

.log-entry.level-debug {
  border-left-color: var(--el-text-color-secondary);
}

.log-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.expand-icon {
  display: flex;
  align-items: center;
  color: var(--el-text-color-secondary);
  font-size: 16px;
  transition: all 0.15s ease;
  flex-shrink: 0;
  padding: 4px;
  border-radius: 4px;
  margin-left: 8px;
}

.log-entry:hover .expand-icon {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-8);
}

.log-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace;
  font-weight: 500;
}

.log-level {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.log-level.level-error {
  background: var(--el-color-danger-light-8);
  color: var(--el-color-danger-dark-2);
}

.log-level.level-warn {
  background: var(--el-color-warning-light-8);
  color: var(--el-color-warning-dark-2);
}

.log-level.level-debug {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}

.new-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--el-color-success);
  color: var(--el-bg-color);
  text-transform: uppercase;
}

.log-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: none;
  cursor: default;
  padding-left: 4px;
}

.log-content :deep(a.log-link) {
  color: var(--el-color-primary);
  text-decoration: underline;
  cursor: pointer;
  user-select: none;
}

.log-content :deep(a.log-link:hover) {
  color: var(--el-color-primary-dark-2);
}

.truncate-hint {
  font-size: 12px;
  color: var(--el-color-info);
  font-style: italic;
  margin-top: 4px;
  padding-left: 4px;
  user-select: none;
}

.loading-more,
.no-more {
  padding: 20px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 14px;
  font-weight: 500;
}

.loading-icon {
  display: inline-block;
  margin-right: 8px;
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Expanded Details Section */
.log-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-light);
  user-select: none;
}

.detail-section {
  margin-bottom: 16px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.raw-log-content {
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  font-size: 12px;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace;
  line-height: 1.5;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
  cursor: text;
  max-height: 300px;
  overflow-y: auto;
}

.labels-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 8px;
}

.label-item {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  font-size: 12px;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace;
  transition: all 0.15s ease;
  cursor: pointer;
  user-select: none;
}

.label-item:hover {
  background: var(--el-fill-color-light);
  border-color: var(--el-border-color);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.label-key {
  color: var(--el-text-color-secondary);
  font-weight: 600;
  margin-right: 8px;
  white-space: nowrap;
}

.label-key::after {
  content: '=';
  margin-left: 4px;
  color: var(--el-text-color-placeholder);
}

.label-value {
  color: var(--el-text-color-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
</style>
