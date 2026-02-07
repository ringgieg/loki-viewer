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
  /* Light mode: keep tasklist on normal background (no gray/blue tint) */
  --app-surface-bluegray: var(--el-bg-color);
  --app-surface-bluegray-2: var(--el-fill-color-light);
  --app-border-strong: var(--el-border-color-light);

  /* Danger emphasis: light mode slightly deeper */
  --app-task-danger-bg: color-mix(in srgb, var(--el-color-danger) 8%, var(--app-surface-bluegray) 92%);
  --app-task-danger-bg-selected: color-mix(in srgb, var(--el-color-danger) 12%, var(--app-surface-bluegray) 88%);

  --app-task-header-bg: var(--el-bg-color);

  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--app-surface-bluegray);
  border-right: 1px solid var(--app-border-strong);
}

:global(html.dark) .task-list-container {
  /* Dark mode: keep blue-gray surface */
  --app-surface-bluegray: color-mix(in srgb, var(--el-color-info) 9%, var(--el-bg-color) 91%);
  --app-surface-bluegray-2: color-mix(in srgb, var(--el-color-info) 13%, var(--el-bg-color) 87%);
  --app-border-strong: color-mix(in srgb, var(--el-text-color-primary) 16%, var(--el-border-color) 84%);

  /* Danger emphasis: dark mode one step lighter */
  --app-task-danger-bg: color-mix(in srgb, var(--el-color-danger) 4%, var(--app-surface-bluegray) 96%);
  --app-task-danger-bg-selected: color-mix(in srgb, var(--el-color-danger) 8%, var(--app-surface-bluegray) 92%);

  --app-task-header-bg: linear-gradient(to bottom, var(--app-surface-bluegray-2), var(--app-surface-bluegray));
}

.task-list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--app-task-header-bg);
  border-bottom: 1px solid var(--app-border-strong);
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
  background: var(--app-surface-bluegray);
  border: 1px solid transparent;
}

.task-item:hover {
  background: var(--app-surface-bluegray-2);
  border-color: transparent;
}

.task-item.is-selected {
  background: color-mix(in srgb, var(--el-color-primary) 12%, var(--app-surface-bluegray) 88%);
  border-color: transparent;
}

.task-item.has-alertmanager-match {
  --app-am-danger-12: color-mix(in srgb, var(--el-color-danger) 12%, transparent);
  --app-am-danger-18: color-mix(in srgb, var(--el-color-danger) 18%, transparent);
  --app-am-danger-22: color-mix(in srgb, var(--el-color-danger) 22%, transparent);
  --app-am-danger-25: color-mix(in srgb, var(--el-color-danger) 25%, transparent);
  --app-am-danger-35: color-mix(in srgb, var(--el-color-danger) 35%, transparent);
  --app-am-bg-22: color-mix(in srgb, var(--el-bg-color) 22%, transparent);
  position: relative;
  background: var(--app-task-danger-bg);
  border-color: transparent;
  box-shadow: none;
  overflow: visible;
}

.task-item.has-alertmanager-match.is-selected {
  background: var(--app-task-danger-bg-selected);
  border-color: transparent;
}

.task-item.has-alertmanager-match::before {
  content: none;
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    var(--app-am-danger-12) 0%,
    var(--app-am-danger-25) 35%,
    var(--app-am-bg-22) 50%,
    var(--app-am-danger-25) 65%,
    var(--app-am-danger-12) 100%
  );
  background-size: 300% 100%;
  animation: taskShimmer 1.9s linear infinite;
  pointer-events: none;
}

.task-item.has-alertmanager-match::after {
  content: none;
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 0 1px var(--app-am-danger-25), 0 0 0 0 var(--app-am-danger-35);
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
    box-shadow: inset 0 0 0 1px var(--app-am-danger-25), 0 0 0 0 var(--app-am-danger-35);
  }
  50% {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--el-color-danger) 45%, transparent), 0 0 0 3px var(--app-am-danger-22);
  }
}

/* Context Menu */
.context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  box-shadow: var(--el-box-shadow-light);
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
