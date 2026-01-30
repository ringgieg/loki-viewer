<template>
  <div class="app-container">
    <AlertOverlay />
    <NavBar />
    <div class="app-main">
      <aside class="app-sidebar">
        <TaskList />
      </aside>
      <main class="app-content">
        <LogViewer />
      </main>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useTaskStore } from './stores/taskStore'
import { useWsStore } from './stores/wsStore'
import NavBar from './components/NavBar.vue'
import TaskList from './components/TaskList.vue'
import LogViewer from './components/LogViewer.vue'
import AlertOverlay from './components/AlertOverlay.vue'

const taskStore = useTaskStore()
const wsStore = useWsStore()

onMounted(async () => {
  await taskStore.initialize()
  // Start global WebSocket connection
  wsStore.connect()
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #f9fafb;
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
