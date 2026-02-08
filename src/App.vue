<template>
  <div class="app-container">
    <AlertOverlay />
    <NavBar v-if="!isKioskMode">
      <template #actions>
        <MuteButton />
      </template>
    </NavBar>
    <div class="app-main">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useServiceStore } from './stores/serviceStore'
import { useAlertStore } from './stores/alertStore'
import NavBar from './components/NavBar.vue'
import AlertOverlay from './components/AlertOverlay.vue'
import MuteButton from './components/MuteButton.vue'
import { stopThemeScheduler } from './utils/theme'

const route = useRoute()
const serviceStore = useServiceStore()
const alertStore = useAlertStore()

// Check if kiosk mode is enabled via URL parameter
const isKioskMode = computed(() => route.query.kiosk === '1')

onMounted(async () => {
  console.log('[App] Initializing...')

  // Initialize service store first (sets up config getters)
  serviceStore.initialize()

  // Set current service from route if available
  const routeServiceId = route.params.serviceId
  if (routeServiceId) {
    serviceStore.setCurrentService(routeServiceId)
  }

  // Initialize alert store after service store is ready
  alertStore.initialize()

  console.log('[App] Initialized (mode-specific initialization handled by route components)')
})

onUnmounted(() => {
  console.log('[App] Cleaning up...')
  
  // Stop theme scheduler to prevent timer leaks
  stopThemeScheduler()
  
  // Cleanup alert store timers
  alertStore.cleanup()
  
  console.log('[App] Cleaned up')
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-main {
  flex: 1;
  overflow: hidden;
  display: flex;
}
</style>
