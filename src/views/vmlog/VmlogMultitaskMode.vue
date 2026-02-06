<template>
  <div class="vmlog-multitask-mode">
    <aside class="mode-sidebar">
      <TaskList :kiosk-mode="kioskMode" />
    </aside>
    <main class="mode-content">
      <LogViewer />
    </main>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useTaskStore } from '../../stores/taskStore'
import { useWsStore } from '../../stores/wsStore'
import { useServiceStore } from '../../stores/serviceStore'
import TaskList from './components/TaskList.vue'
import LogViewer from './components/LogViewer.vue'

const route = useRoute()
const taskStore = useTaskStore()
const wsStore = useWsStore()
const serviceStore = useServiceStore()

// Check if kiosk mode is enabled via URL parameter
const kioskMode = computed(() => route.query.kiosk === '1')

onMounted(async () => {
  console.log('[VMLogMultitaskMode] Initializing for service:', route.params.serviceId)

  // CRITICAL: Set current service BEFORE initializing stores
  // This ensures stores use the correct serviceId for localStorage keys
  const serviceId = route.params.serviceId
  if (serviceId) {
    serviceStore.setCurrentService(serviceId)
  }

  // Initialize task store and WebSocket
  await taskStore.initialize()
  wsStore.connect()

  console.log('[VMLogMultitaskMode] Initialized')
})

onUnmounted(() => {
  console.log('[VMLogMultitaskMode] Cleaning up...')

  // Cleanup: disconnect WebSocket
  wsStore.disconnect()

  console.log('[VMLogMultitaskMode] Cleaned up')
})
</script>

<style scoped>
.vmlog-multitask-mode {
  display: flex;
  height: 100%;
  width: 100%;
}

.mode-sidebar {
  width: 280px;
  flex-shrink: 0;
  overflow: hidden;
}

.mode-content {
  flex: 1;
  overflow: hidden;
}
</style>
