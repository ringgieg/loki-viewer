<template>
  <div class="vmalert-multitask-mode">
    <aside class="mode-sidebar">
      <VmalertTaskList :kiosk-mode="kioskMode" />
    </aside>
    <main class="mode-content">
      <VmalertMonitor />
    </main>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useVmalertStore } from '../../stores/vmalertStore'
import { useServiceStore } from '../../stores/serviceStore'
import { useVmalertPollingQuery } from './useVmalertPollingQuery'
import VmalertTaskList from './components/VmalertTaskList.vue'
import VmalertMonitor from './components/VmalertMonitor.vue'

const route = useRoute()
const vmalertStore = useVmalertStore()
const serviceStore = useServiceStore()

// Initialize vue-query polling driver (enabled when vmalertStore.startPolling() is called).
useVmalertPollingQuery()

// Check if kiosk mode is enabled via URL parameter
const kioskMode = computed(() => route.query.kiosk === '1')

onMounted(async () => {
  console.log('[VMAlertMultitaskMode] Initializing for service:', route.params.serviceId)

  // CRITICAL: Set current service BEFORE initializing stores
  // This ensures stores use the correct serviceId for localStorage keys
  const serviceId = route.params.serviceId
  if (serviceId) {
    serviceStore.setCurrentService(serviceId)
  }

  // Initialize vmalert store
  await vmalertStore.initialize()

  console.log('[VMAlertMultitaskMode] Initialized')
})

onUnmounted(() => {
  console.log('[VMAlertMultitaskMode] Cleaning up...')

  // Cleanup: stop polling
  vmalertStore.cleanup()

  console.log('[VMAlertMultitaskMode] Cleaned up')
})
</script>

<style scoped>
.vmalert-multitask-mode {
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
