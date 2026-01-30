import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const MUTE_STORAGE_KEY = 'loki-viewer-mute-until'

export const useAlertStore = defineStore('alert', () => {
  // Alert state
  const hasAlert = ref(false)
  const alertReasons = ref([])

  // Mute state (timestamp in milliseconds)
  const muteUntil = ref(loadMuteState())

  // Load mute state from localStorage
  function loadMuteState() {
    try {
      const saved = localStorage.getItem(MUTE_STORAGE_KEY)
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
        localStorage.setItem(MUTE_STORAGE_KEY, muteUntil.value.toString())
      } else {
        localStorage.removeItem(MUTE_STORAGE_KEY)
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
   * Set mute duration
   * @param {number} minutes - Duration in minutes (0 to unmute)
   */
  function setMute(minutes) {
    if (minutes === 0) {
      muteUntil.value = 0
    } else {
      muteUntil.value = Date.now() + minutes * 60 * 1000
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
    getRemainingMuteMinutes
  }
})
