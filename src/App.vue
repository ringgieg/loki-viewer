<template>
  <div class="app-container">
    <AlertOverlay />
    <NavBar v-if="!isKioskMode">
      <template #actions>
        <MuteButton />
      </template>
    </NavBar>
    <div class="app-main">
      <aside class="app-sidebar">
        <TaskList :kiosk-mode="isKioskMode" />
      </aside>
      <main class="app-content">
        <LogViewer />
      </main>
    </div>
  </div>
</template>

<script setup>
import { onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useServiceStore } from './stores/serviceStore'
import { useTaskStore } from './stores/taskStore'
import { useWsStore } from './stores/wsStore'
import NavBar from './components/NavBar.vue'
import TaskList from './components/TaskList.vue'
import LogViewer from './components/LogViewer.vue'
import AlertOverlay from './components/AlertOverlay.vue'
import MuteButton from './components/MuteButton.vue'

const route = useRoute()
const serviceStore = useServiceStore()
const taskStore = useTaskStore()
const wsStore = useWsStore()

// Check if kiosk mode is enabled via URL parameter
const isKioskMode = computed(() => route.query.kiosk === '1')

onMounted(async () => {
  // Initialize service store first (sets up config getters)
  serviceStore.initialize()

  // Then initialize task store and WebSocket
  await taskStore.initialize()
  wsStore.connect()
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--el-bg-color-page);
}

.app-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.app-sidebar {
  width: 320px;
  flex-shrink: 0;
  overflow: hidden;
}

.app-content {
  flex: 1;
  overflow: hidden;
}
</style>
