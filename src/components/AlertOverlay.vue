<template>
  <div
    v-if="alertStore.hasAlert"
    class="alert-overlay"
    @click="alertStore.dismissAlert"
  >
    <div class="alert-background"></div>
  </div>
</template>

<script setup>
import { watch, ref, onUnmounted } from 'vue'
import { useAlertStore } from '../stores/alertStore'
import { playAlertSound } from '../utils/audio'

const alertStore = useAlertStore()
const soundIntervalId = ref(null)

// 开始循环播放提示音
function startAlertSound() {
  // 立即播放一次
  playAlertSound('error')

  // 每1秒播放一次
  soundIntervalId.value = setInterval(() => {
    playAlertSound('error')
  }, 2000)
}

// 停止播放提示音
function stopAlertSound() {
  if (soundIntervalId.value !== null) {
    clearInterval(soundIntervalId.value)
    soundIntervalId.value = null
  }
}

// 监听 hasAlert 变化
watch(
  () => alertStore.hasAlert,
  (newValue) => {
    if (newValue) {
      startAlertSound()
    } else {
      stopAlertSound()
    }
  },
  { immediate: true }
)

// 组件卸载时清除定时器
onUnmounted(() => {
  stopAlertSound()
})
</script>

<style scoped>
.alert-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  pointer-events: auto;
  cursor: pointer;
}

.alert-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  box-shadow:
    inset 0 0 100px 20px rgba(255, 0, 0, 0.2),
    inset 0 0 200px 40px rgba(255, 0, 0, 0.15),
    inset 0 0 300px 60px rgba(255, 0, 0, 0.075);
  animation: pulse-alert 0.5s ease-in-out infinite;
}

@keyframes pulse-alert {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
