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
        :icon="Refresh"
        :loading="store.loading"
        @click="refreshTasks"
        class="refresh-button"
      />
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
      共 {{ store.tasks.length }} 个任务
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
import { Search, Refresh } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const store = useTaskStore()
const wsStore = useWsStore()

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
  router.push(`/batch-sync/${taskName}`)
}

function refreshTasks() {
  store.fetchTasks()
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
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
}

.task-list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;
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
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid #f3f4f6;
  user-select: none;
  transition: all 0.15s ease;
}

.task-item:hover {
  background: #f9fafb;
}

.task-item.is-selected {
  background: #eff6ff;
  border-left: 3px solid #3b82f6;
  padding-left: 13px;
}

.task-item.is-unwatched {
  color: #9ca3af;
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
  color: #d1d5db;
}

.task-icon.connected {
  color: #10b981;
}

.task-icon.alert {
  color: #ef4444;
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
  color: #111827;
}

.task-item.is-unwatched .task-name {
  color: #9ca3af;
  font-weight: 400;
}

.unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: #ef4444;
  color: #ffffff;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  margin-left: auto;
}

.unread-badge.is-unwatched {
  background: #9ca3af;
  color: #ffffff;
}

.no-tasks {
  padding: 48px 20px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}

.task-list-footer {
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
  font-size: 13px;
  color: #6b7280;
  background: #f9fafb;
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
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.context-menu-item {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.context-menu-item:hover {
  background: #f3f4f6;
  color: #111827;
}
</style>
