<template>
  <div class="log-viewer-container">
    <!-- Header -->
    <div class="log-viewer-header" v-if="currentTask">
      <div class="header-left">
        <span class="task-name">{{ currentTask }}</span>
        <span class="connection-status" :class="connectionStatus">
          ● {{ connectionStatusText }}
        </span>
      </div>

      <div class="header-filters">
        <el-select
          v-model="selectedLevel"
          placeholder="级别"
          size="small"
          style="width: 100px"
        >
          <el-option label="ALL" value="" />
          <el-option label="ERROR" value="ERROR" />
          <el-option label="WARN" value="WARN" />
          <el-option label="INFO" value="INFO" />
          <el-option label="DEBUG" value="DEBUG" />
        </el-select>
      </div>
    </div>

    <!-- Content -->
    <div class="log-viewer-content">
      <template v-if="currentTask">
        <div v-if="initialLoading" class="loading-state">
          <el-icon class="loading-icon"><Loading /></el-icon>
          加载中...
        </div>

        <VirtualLogList
          v-else-if="logs.length > 0"
          :logs="logs"
          :loading="loading"
          :has-more="hasMore"
          @load-more="loadMoreLogs"
        />

        <div v-else class="empty-state">
          等待日志...
        </div>
      </template>

      <div v-else class="empty-state">
        请选择一个任务
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { Loading } from '@element-plus/icons-vue'
import { queryTaskLogs, filterLogsByLevel } from '../../../api/vmlog'
import { useWsStore } from '../../../stores/wsStore'
import { useTaskStore } from '../../../stores/taskStore'
import { getCurrentServiceConfig } from '../../../utils/config'
import VirtualLogList from './VirtualLogList.vue'

const route = useRoute()
const wsStore = useWsStore()
const taskStore = useTaskStore()

const currentTask = computed(() => route.params.taskName || null)

const logs = ref([])
const loading = ref(false)
const initialLoading = ref(false)
const hasMore = ref(true)
const nextCursor = ref(null)
const selectedLevel = ref(getCurrentServiceConfig('defaultLogLevel', ''))

// Get config values
const logsPerPage = getCurrentServiceConfig('logsPerPage', 500)
const newLogHighlightDuration = getCurrentServiceConfig('alert.newLogHighlightDuration', 3000)

let unsubscribe = null
let highlightTimer = null

const connectionStatus = computed(() => {
  if (wsStore.isConnected) return 'connected'
  return 'disconnected'
})

const connectionStatusText = computed(() => {
  if (wsStore.isConnected) return '已连接'
  return '连接断开'
})

watch(currentTask, async (newTask, oldTask) => {
  stopStreaming()
  logs.value = []
  nextCursor.value = null
  hasMore.value = true

  // Update currently viewing task in wsStore
  wsStore.setCurrentViewingTask(newTask)

  if (newTask) {
    // Clear unread alerts when viewing this task
    taskStore.clearUnreadAlerts(newTask)
    await fetchInitialLogs()
    startStreaming()
  }
}, { immediate: true })

// Reload logs when level filter changes
watch(selectedLevel, async () => {
  if (currentTask.value) {
    stopStreaming()
    logs.value = []
    nextCursor.value = null
    hasMore.value = true
    await fetchInitialLogs()
    startStreaming()
  }
})

async function fetchInitialLogs() {
  if (!currentTask.value) return

  console.log('[LogViewer] Fetching initial logs for task:', currentTask.value)
  initialLoading.value = true
  logs.value = []
  nextCursor.value = null
  hasMore.value = true

  try {
    const options = { limit: logsPerPage }
    if (selectedLevel.value) options.level = selectedLevel.value

    console.log('[LogViewer] Query options:', options)
    const result = await queryTaskLogs(currentTask.value, options)
    console.log('[LogViewer] Got logs:', result.logs.length)
    logs.value = result.logs
    nextCursor.value = result.nextCursor
    hasMore.value = result.hasMore
  } catch (error) {
    console.error('[LogViewer] Error fetching logs:', error)
  } finally {
    initialLoading.value = false
  }
}

async function loadMoreLogs() {
  if (loading.value || !hasMore.value || !currentTask.value) return

  loading.value = true

  try {
    const options = {
      limit: logsPerPage,
      cursor: nextCursor.value
    }
    if (selectedLevel.value) options.level = selectedLevel.value

    const result = await queryTaskLogs(currentTask.value, options)
    logs.value = [...logs.value, ...result.logs]
    nextCursor.value = result.nextCursor
    hasMore.value = result.hasMore
  } catch (error) {
    console.error('Error loading more:', error)
  } finally {
    loading.value = false
  }
}

function startStreaming() {
  if (!currentTask.value || unsubscribe) return

  // Subscribe to logs for this specific task
  unsubscribe = wsStore.subscribe(currentTask.value, (newLogs) => {
    // Filter by level using unified logic
    const filteredLogs = filterLogsByLevel(newLogs, selectedLevel.value)

    if (filteredLogs.length === 0) return

    const markedLogs = filteredLogs.map(log => ({ ...log, isNew: true }))
    logs.value = [...markedLogs, ...logs.value]

    // Clear previous timer to avoid memory leak
    if (highlightTimer) {
      clearTimeout(highlightTimer)
    }

    // Set new timer to remove highlight
    highlightTimer = setTimeout(() => {
      logs.value = logs.value.map(log => {
        if (markedLogs.find(nl => nl.id === log.id)) {
          return { ...log, isNew: false }
        }
        return log
      })
      highlightTimer = null
    }, newLogHighlightDuration)
  })
}

function stopStreaming() {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
}

onUnmounted(() => {
  stopStreaming()
  // Clear currently viewing task
  wsStore.setCurrentViewingTask(null)
  // Clean up highlight timer to prevent memory leak
  if (highlightTimer) {
    clearTimeout(highlightTimer)
    highlightTimer = null
  }
})
</script>

<style scoped>
.log-viewer-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color);
}

.log-viewer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.task-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: -0.025em;
}

.connection-status {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  padding: 4px 12px;
  border-radius: 12px;
  background: var(--el-fill-color-light);
}

.connection-status.connected {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.connection-status.disconnected {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.header-filters {
  display: flex;
  align-items: center;
  gap: 12px;
}

.log-viewer-content {
  flex: 1;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.loading-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--el-text-color-secondary);
  font-size: 15px;
  font-weight: 500;
}

.loading-icon {
  display: inline-block;
  margin-right: 8px;
  animation: spin 1s linear infinite;
}
</style>
