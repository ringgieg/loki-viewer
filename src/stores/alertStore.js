import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useServiceStore } from './serviceStore'
import { getAlertMuteMinutes, getAlertmanagerAlertMuteMinutes } from '../utils/config'

const MUTE_STORAGE_KEY_PREFIX = 'dashboard-mute-until'
const AM_MUTE_STORAGE_KEY_PREFIX = 'dashboard-am-muted-fingerprints'

export const useAlertStore = defineStore('alert', () => {
  // Alert state
  const hasAlert = ref(false)
  const alertReasons = ref([])
  const alertFingerprints = ref(new Set())

  // Mute state (timestamp in milliseconds, -1 for permanent mute)
  // Initialize to 0, will be loaded after serviceStore is ready
  const muteUntil = ref(0)

  // Just unmuted from permanent state (for warning display)
  const justUnmutedFromPermanent = ref(false)

  // Timer for checking mute expiration (兜底机制)
  let muteCheckTimer = null

  // Get storage key for current service
  function getStorageKey() {
    const serviceStore = useServiceStore()
    const serviceId = serviceStore.getCurrentServiceId()
    return `${MUTE_STORAGE_KEY_PREFIX}-${serviceId}`
  }

  function getAlertmanagerMuteStorageKey() {
    const serviceStore = useServiceStore()
    const serviceId = serviceStore.getCurrentServiceId()
    return `${AM_MUTE_STORAGE_KEY_PREFIX}-${serviceId}`
  }

  function loadAlertmanagerMuteMap() {
    try {
      const raw = sessionStorage.getItem(getAlertmanagerMuteStorageKey())
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return {}

      const now = Date.now()
      const cleaned = {}
      Object.entries(parsed).forEach(([fingerprint, expiresAt]) => {
        if (typeof expiresAt === 'number' && expiresAt > now) {
          cleaned[fingerprint] = expiresAt
        }
      })

      if (Object.keys(cleaned).length !== Object.keys(parsed).length) {
        sessionStorage.setItem(getAlertmanagerMuteStorageKey(), JSON.stringify(cleaned))
      }

      return cleaned
    } catch (e) {
      console.error('Error loading Alertmanager mute map:', e)
      return {}
    }
  }

  function saveAlertmanagerMuteMap(map) {
    try {
      sessionStorage.setItem(getAlertmanagerMuteStorageKey(), JSON.stringify(map))
    } catch (e) {
      console.error('Error saving Alertmanager mute map:', e)
    }
  }

  function isAlertmanagerFingerprintMuted(fingerprint) {
    if (!fingerprint) return false
    const minutes = getAlertmanagerAlertMuteMinutes()
    if (!minutes || minutes <= 0) return false

    const map = loadAlertmanagerMuteMap()
    const expiresAt = map[fingerprint]
    return typeof expiresAt === 'number' && expiresAt > Date.now()
  }

  function addAlertFingerprint(fingerprint) {
    if (!fingerprint) return
    alertFingerprints.value.add(fingerprint)
  }

  function muteAlertmanagerFingerprints(fingerprints = []) {
    const minutes = getAlertmanagerAlertMuteMinutes()
    if (!minutes || minutes <= 0) return
    if (!Array.isArray(fingerprints) || fingerprints.length === 0) return

    const map = loadAlertmanagerMuteMap()
    const expiresAt = Date.now() + minutes * 60 * 1000
    fingerprints.forEach((fingerprint) => {
      if (fingerprint) {
        map[fingerprint] = expiresAt
      }
    })
    saveAlertmanagerMuteMap(map)
  }

  // Load mute state from localStorage
  function loadMuteState() {
    try {
      const saved = localStorage.getItem(getStorageKey())
      if (saved) {
        const timestamp = parseInt(saved, 10)
        // -1 means permanent mute
        if (timestamp === -1) {
          return -1
        }
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
      if (muteUntil.value === -1 || muteUntil.value > 0) {
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
    return muteUntil.value === -1 || muteUntil.value > Date.now()
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
    if (alertFingerprints.value.size > 0) {
      muteAlertmanagerFingerprints(Array.from(alertFingerprints.value))
    }
    alertFingerprints.value = new Set()

    const muteMinutes = getAlertMuteMinutes()
    if (!isMuted.value && typeof muteMinutes === 'number' && muteMinutes > 0) {
      setMute(muteMinutes)
    }
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
   * Check if mute has expired and clear it.
   */
  function checkMuteExpiration() {
    if (muteUntil.value > 0 && muteUntil.value <= Date.now()) {
      console.log('Mute expired, auto-clearing')
      muteUntil.value = 0
      saveMuteState()
      stopMuteCheckTimer()
    }
  }

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
   * @param {number} minutes - Duration in minutes (0 to unmute, -1 for permanent mute)
   */
  function setMute(minutes) {
    if (minutes === 0) {
      // Unmute
      muteUntil.value = 0
      stopMuteCheckTimer()
      console.log('Alert unmuted')
    } else if (minutes === -1) {
      // Permanent mute
      muteUntil.value = -1
      justUnmutedFromPermanent.value = false
      stopMuteCheckTimer()
      console.log('Alert permanently muted')
    } else {
      // Timed mute
      justUnmutedFromPermanent.value = false
      muteUntil.value = Date.now() + minutes * 60 * 1000
      startMuteCheckTimer() // 启动兜底定时器
      console.log(`Alert muted for ${minutes} minutes`)
    }
    saveMuteState()
  }

  /**
   * Dismiss the unmute warning
   */
  function dismissUnmuteWarning() {
    justUnmutedFromPermanent.value = false
  }

  /**
   * Get remaining mute time in minutes
   * @returns {number} Minutes remaining, or -1 for permanent mute
   */
  function getRemainingMuteMinutes() {
    if (muteUntil.value === -1) return -1
    if (!isMuted.value) return 0
    return Math.ceil((muteUntil.value - Date.now()) / 60000)
  }

  /**
   * Initialize store - must be called after serviceStore is ready
   * Loads mute state from localStorage for the current service
   */
  function initialize() {
    // Load mute state for current service
    muteUntil.value = loadMuteState()

    // Start timer if muted state was restored from localStorage
    if (muteUntil.value > Date.now()) {
      startMuteCheckTimer()
      console.log('Restored mute state, starting check timer (恢复静默状态，启动兜底定时器)')
    }
  }

  return {
    // State
    hasAlert,
    alertReasons,
    isMuted,
    muteUntil,
    justUnmutedFromPermanent,

    // Actions
    initialize,
    triggerAlert,
    dismissAlert,
    removeAlertReason,
    setMute,
    getRemainingMuteMinutes,
    checkMuteExpiration, // 暴露手动检查方法
    dismissUnmuteWarning,
    isAlertmanagerFingerprintMuted,
    addAlertFingerprint
  }
})
