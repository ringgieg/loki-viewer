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
        :disabled="store.loading"
      >
        <el-icon :class="{ 'is-loading': store.loading }">
          <Refresh />
        </el-icon>
      </el-button>
    </div>

    <div class="task-list-content" v-loading="store.loading">
      <div
        v-for="task in filteredTasks"
        :key="task.name"
        class="task-item"
        :class="{
          'is-selected': route.params.taskName === task.name,
          'is-unwatched': !task.watched
        }"
        @click="selectTask(task.name)"
        @contextmenu.prevent="showContextMenu($event, task)"
      >
        <div class="task-info">
          <span class="task-icon" :class="getTaskIconClass(task)">●</span>
          <span class="task-name">{{ task.name }}</span>
          <span
            v-if="store.getUnreadAlertCount(task.name) > 0"
            class="unread-badge"
            :class="{ 'is-unwatched': !task.watched }"
          >
            {{ store.getUnreadAlertCount(task.name) }}
          </span>
        </div>
      </div>

      <div v-if="filteredTasks.length === 0" class="no-tasks">
        暂无任务
      </div>
    </div>

    <div class="task-list-footer">
      <span class="task-count">共 {{ store.tasks.length }} 个任务</span>
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
import { useTaskStore } from '../stores/taskStore'
import { useWsStore } from '../stores/wsStore'
import { useServiceStore } from '../stores/serviceStore'
import { Search, Refresh, FullScreen, Close } from '@element-plus/icons-vue'
import MuteButton from './MuteButton.vue'

// Props
const props = defineProps({
  kioskMode: {
    type: Boolean,
    default: false
  }
})

const router = useRouter()
const route = useRoute()
const store = useTaskStore()
const wsStore = useWsStore()
const serviceStore = useServiceStore()

const searchQuery = ref('')
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuTask = ref(null)

const filteredTasks = computed(() => {
  if (!searchQuery.value) {
    return store.sortedTasks
  }
  const query = searchQuery.value.toLowerCase()
  return store.sortedTasks.filter(task =>
    task.name.toLowerCase().includes(query)
  )
})

function getTaskIconClass(task) {
  if (!task.watched) {
    // 未关注：灰色
    return 'unwatched'
  }

  // 被关注时：检查告警和连接状态
  const hasUnreadAlerts = store.getUnreadAlertCount(task.name) > 0
  const isConnected = wsStore.isConnected

  if (hasUnreadAlerts || !isConnected) {
    // 有告警或断开连接：红色
    return 'alert'
  }

  // 无告警且已连接：绿色
  return 'connected'
}

function selectTask(taskName) {
  // Clear unread alerts when entering task page
  store.clearUnreadAlerts(taskName)
  const serviceId = serviceStore.getCurrentServiceId()
  router.push(`/logs/${serviceId}/${taskName}`)
}

function refreshTasks() {
  store.fetchTasks()
}

function enterKioskMode() {
  // Add kiosk=1 query parameter
  router.push({
    path: route.path,
    query: { ...route.query, kiosk: '1' }
  })
}

function exitKioskMode() {
  // Remove kiosk query parameter
  const query = { ...route.query }
  delete query.kiosk
  router.push({
    path: route.path,
    query
  })
}

function showContextMenu(event, task) {
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuTask.value = task
  contextMenuVisible.value = true
}

function closeContextMenu() {
  contextMenuVisible.value = false
  contextMenuTask.value = null
}

function toggleWatched() {
  if (contextMenuTask.value) {
    store.toggleWatched(contextMenuTask.value.name)
  }
  closeContextMenu()
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    closeContextMenu()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.task-list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-lighter);
}

.task-list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.search-input {
  flex: 1;
}

.refresh-button {
  flex-shrink: 0;
}

.refresh-button .is-loading {
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

.task-list-content {
  flex: 1;
  overflow-y: auto;
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-fill-color-light);
  user-select: none;
  transition: all 0.15s ease;
}

.task-item:hover {
  background: var(--el-fill-color-lighter);
}

.task-item.is-selected {
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
  padding-left: 13px;
}

.task-item.is-unwatched {
  color: var(--el-text-color-secondary);
}

.task-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.task-icon {
  font-size: 10px;
  transition: color 0.15s ease;
}

.task-icon.unwatched {
  color: var(--el-border-color);
}

.task-icon.connected {
  color: var(--el-color-success);
}

.task-icon.alert {
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
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  color: var(--el-text-color-primary);
}

.task-item.is-unwatched .task-name {
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

.unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--el-color-danger);
  color: var(--el-bg-color);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  margin-left: auto;
}

.unread-badge.is-unwatched {
  background: var(--el-text-color-secondary);
  color: var(--el-bg-color);
}

.no-tasks {
  padding: 48px 20px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.task-list-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-lighter);
}

.task-count {
  flex: 1;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kiosk-button {
  padding: 4px 8px;
}

.kiosk-button.kiosk-active {
  background-color: var(--el-color-primary);
  color: white;
}

/* Context Menu */
.context-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 999;
}

.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 140px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.context-menu-item {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  color: var(--el-text-color-regular);
  border-radius: 6px;
  transition: all 0.15s ease;
}

.context-menu-item:hover {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}
</style>
