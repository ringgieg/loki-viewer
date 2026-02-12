<template>
  <!-- Alert Overlay -->
  <div
    v-if="alertStore.hasAlert"
    class="alert-overlay"
    @click="alertStore.dismissAlert"
  >
    <div class="alert-background"></div>
  </div>

  <!-- Unmute Warning Overlay -->
  <div
    v-if="alertStore.justUnmutedFromPermanent"
    class="unmute-warning-overlay"
    @click="alertStore.dismissUnmuteWarning"
  >
    <div class="unmute-warning-background"></div>
    <div class="unmute-warning-icon">
      <el-icon :size="80"><MuteNotification /></el-icon>
      <div class="unmute-warning-text">已取消永久静音</div>
    </div>
  </div>
</template>

<script setup>
import { watch, ref, onUnmounted } from 'vue'
import { useAlertStore } from '../stores/alertStore'
import { playAlertSound } from '../utils/audio'
import { MuteNotification } from '@element-plus/icons-vue'

const alertStore = useAlertStore()
const soundIntervalId = ref(null)

function safePlayAlertSound(type) {
  try {
    playAlertSound(type)
  } catch (e) {
    console.error('[AlertOverlay] playAlertSound failed:', e)
  }
}

// 开始循环播放提示音
function startAlertSound() {
  // Ensure we never accumulate multiple intervals
  stopAlertSound()

  // 立即播放一次
  safePlayAlertSound('error')

  // 每2秒播放一次
  soundIntervalId.value = setInterval(() => {
    safePlayAlertSound('error')
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
    try {
      if (newValue) {
        startAlertSound()
      } else {
        stopAlertSound()
      }
    } catch (e) {
      console.error('[AlertOverlay] hasAlert watcher failed:', e)
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
.alert-overlay,
.unmute-warning-overlay {
  --app-danger-20: color-mix(in srgb, var(--el-color-danger) 20%, transparent);
  --app-danger-15: color-mix(in srgb, var(--el-color-danger) 15%, transparent);
  --app-danger-08: color-mix(in srgb, var(--el-color-danger) 8%, transparent);
  --app-danger-30: color-mix(in srgb, var(--el-color-danger) 30%, transparent);
}

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
    inset 0 0 100px 20px var(--app-danger-20),
    inset 0 0 200px 40px var(--app-danger-15),
    inset 0 0 300px 60px var(--app-danger-08);
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

/* Unmute Warning Overlay */
.unmute-warning-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9998;
  pointer-events: auto;
  cursor: pointer;
}

.unmute-warning-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  background-color: var(--app-danger-15);
  animation: pulse-unmute 1s ease-in-out infinite;
}

.unmute-warning-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--el-color-danger);
  text-align: center;
  pointer-events: none;
  animation: fade-in 0.3s ease-out;
}

.unmute-warning-text {
  margin-top: 16px;
  font-size: 24px;
  font-weight: bold;
  color: var(--el-color-danger);
  text-shadow: 0 2px 8px var(--app-danger-30);
}

@keyframes pulse-unmute {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
</style>
