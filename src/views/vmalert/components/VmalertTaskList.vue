<template>
  <div class="task-list-container">
    <div class="task-list-header">
      <el-input
        v-model="searchQuery"
        placeholder="搜索任务..."
        size="small"
        :prefix-icon="Search"
        clearable
        class="search-input"
      />
      <el-button
        size="small"
        @click="refreshTasks"
        class="refresh-button"
        :disabled="vmalertStore.loading"
      >
        <el-icon :class="{ 'is-loading': vmalertStore.loading }">
          <Refresh />
        </el-icon>
      </el-button>
    </div>

    <div class="task-list-content" v-loading="vmalertStore.loading">
      <!-- All Alerts Option -->
      <div
        class="task-item"
        :class="{ 'is-selected': !route.params.taskName }"
        @click="selectTask(null)"
      >
        <div class="task-info">
          <span class="task-icon all-alerts">●</span>
          <span class="task-name">全部告警</span>
          <span v-if="activeAlertTotal > 0" class="alert-count">{{ activeAlertTotal }}</span>
        </div>
      </div>

      <!-- Task List -->
      <div
        v-for="task in filteredTasks"
        :key="task.name"
        class="task-item"
        :class="{
          'is-selected': route.params.taskName === task.name,
          'is-unwatched': !task.watched,
          'has-alertmanager-match': hasAlertmanagerMatch(task.name)
        }"
        @click="selectTask(task.name)"
        @contextmenu.prevent="showContextMenu($event, task)"
      >
        <div class="task-info">
          <span class="task-icon" :class="getTaskIconClass(task)">●</span>
          <span class="task-name">{{ task.name }}</span>
          <span
            v-if="!task.existsInVmalert"
            class="not-in-vmalert-badge"
            title="此任务在VMAlert中暂无告警"
          >
            无告警
          </span>
          <span
            v-if="getTaskAlertCount(task.name) > 0"
            class="alert-count"
            :class="getAlertCountClass(task.name)"
          >
            {{ getTaskAlertCount(task.name) }}
          </span>
        </div>
      </div>

      <div v-if="filteredTasks.length === 0" class="no-tasks">
        暂无任务
      </div>
    </div>

    <div class="task-list-footer">
      <span class="task-count">
        共 {{ totalAlertCount }} 个监控项
      </span>
      <div class="footer-actions">
        <MuteButton v-if="kioskMode" size="small" />
        <el-button
          v-if="!kioskMode"
          size="small"
          @click="enterKioskMode"
          title="进入Kiosk模式"
          class="kiosk-button"
        >
          <el-icon><FullScreen /></el-icon>
        </el-button>
        <el-button
          v-else
          size="small"
          type="primary"
          @click="exitKioskMode"
          title="退出Kiosk模式"
          class="kiosk-button kiosk-active"
        >
          <el-icon><FullScreen /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- Context Menu -->
    <div
      v-if="contextMenuVisible"
      class="context-menu"
      :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="toggleWatched">
        {{ contextMenuTask?.watched ? '取消关注' : '设为关注' }}
      </div>
    </div>

    <div
      v-if="contextMenuVisible"
      class="context-menu-overlay"
      @click="closeContextMenu"
    ></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useVmalertStore } from '../../../stores/vmalertStore'
import { useServiceStore } from '../../../stores/serviceStore'
import { Search, Refresh, FullScreen } from '@element-plus/icons-vue'
import { filterAlerts } from '../../../api/vmalert'
import { getPrometheusTaskLabel } from '../../../utils/config'
import MuteButton from '../../../components/MuteButton.vue'

// Props
const props = defineProps({
  kioskMode: {
    type: Boolean,
    default: false
  }
})

const router = useRouter()
const route = useRoute()
const vmalertStore = useVmalertStore()
const serviceStore = useServiceStore()

const searchQuery = ref('')
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuTask = ref(null)

const filteredTasks = computed(() => {
  if (!searchQuery.value) {
    return vmalertStore.sortedTasks
  }
  const query = searchQuery.value.toLowerCase()
  return vmalertStore.sortedTasks.filter(task =>
    task.name.toLowerCase().includes(query)
  )
})

const activeAlertTotal = computed(() => {
  return (vmalertStore.alertCounts.firing || 0) + (vmalertStore.alertCounts.pending || 0)
})

const totalAlertCount = computed(() => {
  return vmalertStore.alertCounts.total || 0
})
const taskAlertmanagerMatchMap = computed(() => {
  const taskLabel = getPrometheusTaskLabel()
  const matchedTasks = new Set()

  vmalertStore.alerts.forEach(alert => {
    if (!alert.alertmanagerMatched) return
    const taskName = alert.labels?.[taskLabel]
    if (taskName) {
      matchedTasks.add(taskName)
    }
  })

  return matchedTasks
})

function hasAlertmanagerMatch(taskName) {
  return taskAlertmanagerMatchMap.value.has(taskName)
}

function getTaskIconClass(task) {
  if (!task.watched) {
    return 'unwatched'
  }

  // Get alert count for this task
  const count = getTaskAlertCount(task.name)

  if (count === 0) {
    return 'normal'
  }

  // Check alert states
  const taskLabel = getPrometheusTaskLabel()
  const taskAlerts = filterAlerts(vmalertStore.alerts, { [taskLabel]: task.name })
  const hasFiring = taskAlerts.some(alert => alert.state === 'firing')
  const hasPending = taskAlerts.some(alert => alert.state === 'pending')

  // Only show warning/danger if there are actual firing or pending alerts
  if (hasFiring) return 'has-firing'
  if (hasPending) return 'has-pending'

  // All alerts are inactive - show as normal (green)
  return 'normal'
}

function getTaskAlertCount(taskName) {
  const taskLabel = getPrometheusTaskLabel()
  const taskAlerts = filterAlerts(vmalertStore.alerts, { [taskLabel]: taskName })
  return taskAlerts.filter(alert => alert.state === 'firing' || alert.state === 'pending').length
}

function getAlertCountClass(taskName) {
  const taskLabel = getPrometheusTaskLabel()
  const taskAlerts = filterAlerts(vmalertStore.alerts, { [taskLabel]: taskName })

  if (taskAlerts.length === 0) {
    return 'count-normal'
  }

  const hasFiring = taskAlerts.some(alert => alert.state === 'firing')
  const hasPending = taskAlerts.some(alert => alert.state === 'pending')

  if (hasFiring) return 'count-firing'
  if (hasPending) return 'count-pending'
  return 'count-normal'
}

function selectTask(taskName) {
  const serviceId = serviceStore.getCurrentServiceId()
  if (taskName) {
    router.push(`/vmalert/${serviceId}/${taskName}`)
  } else {
    router.push(`/vmalert/${serviceId}`)
  }
}

function refreshTasks() {
  vmalertStore.refresh()
}

function showContextMenu(event, task) {
  contextMenuTask.value = task
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuVisible.value = true
}

function closeContextMenu() {
  contextMenuVisible.value = false
  contextMenuTask.value = null
}

function toggleWatched() {
  if (contextMenuTask.value) {
    vmalertStore.toggleTaskWatch(contextMenuTask.value.name)
  }
  closeContextMenu()
}

function enterKioskMode() {
  router.push({ query: { ...route.query, kiosk: '1' } })
}

function exitKioskMode() {
  const query = { ...route.query }
  delete query.kiosk
  router.push({ query })
}

// Close context menu on click outside
function handleClickOutside() {
  if (contextMenuVisible.value) {
    closeContextMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.task-list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
}

.task-list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
}

.search-input {
  flex: 1;
}

.refresh-button {
  flex-shrink: 0;
}

.task-list-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.task-item {
  padding: 12px 16px;
  margin-bottom: 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--el-bg-color);
  border: 1px solid transparent;
}

.task-item:hover {
  background: var(--el-fill-color-light);
  border-color: var(--el-border-color);
}

.task-item.is-selected {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary);
}

.task-item.has-alertmanager-match {
  position: relative;
  background: #fef2f2; /* red-50 */
  border-color: #fecaca; /* red-200 */
  box-shadow: 0 0 0 2px rgba(248, 113, 113, 0.18); /* red-400 ring */
  overflow: hidden;
}

.task-item.has-alertmanager-match.is-selected {
  background: #fee2e2; /* red-100 */
  border-color: #f87171; /* red-400 */
}

.task-item.has-alertmanager-match::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    rgba(248, 113, 113, 0.12) 0%,
    rgba(248, 113, 113, 0.26) 35%,
    rgba(255, 255, 255, 0.22) 50%,
    rgba(248, 113, 113, 0.26) 65%,
    rgba(248, 113, 113, 0.12) 100%
  );
  background-size: 300% 100%;
  animation: taskShimmer 1.9s linear infinite;
  pointer-events: none;
}

.task-item.has-alertmanager-match::after {
  content: '';
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.25), 0 0 0 0 rgba(248, 113, 113, 0.35);
  animation: taskPulse 1.6s ease-in-out infinite;
  pointer-events: none;
}

.task-item.is-unwatched {
  opacity: 0.6;
}

.task-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.task-icon.all-alerts {
  color: var(--el-color-primary);
}

.task-icon.unwatched {
  color: var(--el-text-color-placeholder);
}

.task-icon.normal {
  color: var(--el-color-success);
}

.task-icon.has-pending {
  color: var(--el-color-warning);
}

.task-icon.has-firing {
  color: var(--el-color-danger);
  animation: pulse-icon 2s ease-in-out infinite;
}

@keyframes pulse-icon {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.task-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.not-in-vmalert-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  border-radius: 4px;
}

.alert-count {
  font-size: 11px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.alert-count.count-normal {
  background: var(--el-fill-color-dark);
  color: var(--el-text-color-secondary);
}

.alert-count.count-pending {
  background: var(--el-color-warning);
  color: var(--el-bg-color);
}

.alert-count.count-firing {
  background: var(--el-color-danger);
  color: var(--el-bg-color);
}

.no-tasks {
  text-align: center;
  padding: 32px 16px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.task-list-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color-light);
}

.task-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.kiosk-button {
  padding: 8px;
}

.kiosk-button.kiosk-active {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

@keyframes taskShimmer {
  from {
    background-position: 0% 0%;
  }
  to {
    background-position: 300% 0%;
  }
}

@keyframes taskPulse {
  0%, 100% {
    box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.25), 0 0 0 0 rgba(248, 113, 113, 0.35);
  }
  50% {
    box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.45), 0 0 0 3px rgba(248, 113, 113, 0.22);
  }
}

/* Context Menu */
.context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  min-width: 120px;
}

.context-menu-item {
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.2s ease;
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.context-menu-item:hover {
  background: var(--el-fill-color-light);
}

.context-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9998;
}
</style>
