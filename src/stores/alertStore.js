import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useServiceStore } from './serviceStore'

const MUTE_STORAGE_KEY_PREFIX = 'dashboard-mute-until'

export const useAlertStore = defineStore('alert', () => {
  // Alert state
  const hasAlert = ref(false)
  const alertReasons = ref([])

  // Mute state (timestamp in milliseconds)
  const muteUntil = ref(loadMuteState())

  // Timer for checking mute expiration (兜底机制)
  let muteCheckTimer = null

  // Get storage key for current service
  function getStorageKey() {
    const serviceStore = useServiceStore()
    const serviceId = serviceStore.getCurrentServiceId()
    return `${MUTE_STORAGE_KEY_PREFIX}-${serviceId}`
  }

  // Load mute state from localStorage
  function loadMuteState() {
    try {
      const saved = localStorage.getItem(getStorageKey())
      if (saved) {
        const timestamp = parseInt(saved, 10)
        // Only restore if still in the future
        if (timestamp > Date.now()) {
          return timestamp
        }
      }
    } catch (e) {
      console.error('Error loading mute state:', e)
    }
    return 0
  }

  // Save mute state to localStorage
  function saveMuteState() {
    try {
      if (muteUntil.value > 0) {
        localStorage.setItem(getStorageKey(), muteUntil.value.toString())
      } else {
        localStorage.removeItem(getStorageKey())
      }
    } catch (e) {
      console.error('Error saving mute state:', e)
    }
  }

  // Check if currently muted
  const isMuted = computed(() => {
    return muteUntil.value > Date.now()
  })

  /**
   * Trigger an alert (only if not muted)
   * @param {string} reason - Reason for the alert
   */
  function triggerAlert(reason) {
    // Don't show overlay if muted
    if (isMuted.value) {
      console.log(`Alert muted until ${new Date(muteUntil.value).toLocaleTimeString()}`)
      return
    }

    if (!alertReasons.value.includes(reason)) {
      alertReasons.value.push(reason)
    }
    hasAlert.value = true
  }

  /**
   * Dismiss the alert (called when user clicks anywhere)
   */
  function dismissAlert() {
    hasAlert.value = false
    alertReasons.value = []
  }

  /**
   * Remove a specific alert reason
   * @param {string} reason - Reason to remove
   */
  function removeAlertReason(reason) {
    const index = alertReasons.value.indexOf(reason)
    if (index > -1) {
      alertReasons.value.splice(index, 1)
    }
    if (alertReasons.value.length === 0) {
      hasAlert.value = false
    }
  }

  /**
   * Check if mute has expired and clear it (兜底机制)
   */
  function checkMuteExpiration() {
    if (muteUntil.value > 0 && muteUntil.value <= Date.now()) {
      console.log('Mute expired, auto-clearing (兜底机制触发)')
      muteUntil.value = 0
      saveMuteState()
      stopMuteCheckTimer()
    }
  }

  /**
   * Start periodic mute check timer (兜底机制)
   * Checks every minute to ensure mute expires correctly
   */
  function startMuteCheckTimer() {
    stopMuteCheckTimer() // Clear any existing timer
    // Check every 30 seconds as a fallback mechanism
    muteCheckTimer = setInterval(() => {
      checkMuteExpiration()
    }, 30000) // 30秒检查一次
    console.log('Mute check timer started (兜底定时器已启动)')
  }

  /**
   * Stop periodic mute check timer
   */
  function stopMuteCheckTimer() {
    if (muteCheckTimer) {
      clearInterval(muteCheckTimer)
      muteCheckTimer = null
      console.log('Mute check timer stopped (兜底定时器已停止)')
    }
  }

  /**
   * Set mute duration
   * @param {number} minutes - Duration in minutes (0 to unmute)
   */
  function setMute(minutes) {
    if (minutes === 0) {
      muteUntil.value = 0
      stopMuteCheckTimer()
    } else {
      muteUntil.value = Date.now() + minutes * 60 * 1000
      startMuteCheckTimer() // 启动兜底定时器
    }
    saveMuteState()
    console.log(minutes === 0 ? 'Alert unmuted' : `Alert muted for ${minutes} minutes`)
  }

  /**
   * Get remaining mute time in minutes
   */
  function getRemainingMuteMinutes() {
    if (!isMuted.value) return 0
    return Math.ceil((muteUntil.value - Date.now()) / 60000)
  }

  // Initialize: start timer if muted state was restored from localStorage
  if (muteUntil.value > Date.now()) {
    startMuteCheckTimer()
    console.log('Restored mute state, starting check timer (恢复静默状态，启动兜底定时器)')
  }

  return {
    // State
    hasAlert,
    alertReasons,
    isMuted,
    muteUntil,

    // Actions
    triggerAlert,
    dismissAlert,
    removeAlertReason,
    setMute,
    getRemainingMuteMinutes,
    checkMuteExpiration // 暴露手动检查方法
  }
})
