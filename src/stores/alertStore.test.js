import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAlertStore } from './alertStore'

// Mock serviceStore
vi.mock('./serviceStore', () => ({
  useServiceStore: vi.fn(() => ({
    getCurrentServiceId: vi.fn(() => 'test-service')
  }))
}))

describe('alertStore', () => {
  let store
  let timers

  beforeEach(() => {
    setActivePinia(createPinia())

    // Clear localStorage
    localStorage.clear()

    // Use fake timers for controlling time
    timers = vi.useFakeTimers()

    // Set a fixed time
    timers.setSystemTime(new Date('2025-01-01T12:00:00Z'))

    // Create store after setting up fake timers
    store = useAlertStore()

    // Reset mocks
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    timers.useRealTimers()
  })

  describe('initialization', () => {
    it('should initialize with no alert', () => {
      expect(store.hasAlert).toBe(false)
      expect(store.alertReasons).toEqual([])
      expect(store.isMuted).toBe(false)
    })

    it('should restore mute state from localStorage', () => {
      // Set mute state for test-service
      const futureTime = Date.now() + 10 * 60 * 1000 // 10 minutes in future
      localStorage.setItem('dashboard-mute-until-test-service', futureTime.toString())

      // Clear and recreate pinia to trigger store initialization
      setActivePinia(createPinia())
      const newStore = useAlertStore()

      expect(newStore.isMuted).toBe(true)
      expect(newStore.muteUntil).toBe(futureTime)
    })

    it('should not restore expired mute state', () => {
      // Set expired mute state
      const pastTime = Date.now() - 10 * 60 * 1000 // 10 minutes in past
      localStorage.setItem('dashboard-mute-until-test-service', pastTime.toString())

      setActivePinia(createPinia())
      const newStore = useAlertStore()

      expect(newStore.isMuted).toBe(false)
      expect(newStore.muteUntil).toBe(0)
    })
  })

  describe('triggerAlert()', () => {
    it('should trigger alert with reason', () => {
      store.triggerAlert('error')

      expect(store.hasAlert).toBe(true)
      expect(store.alertReasons).toEqual(['error'])
    })

    it('should not duplicate alert reasons', () => {
      store.triggerAlert('error')
      store.triggerAlert('error')

      expect(store.alertReasons).toEqual(['error'])
    })

    it('should add multiple different alert reasons', () => {
      store.triggerAlert('error')
      store.triggerAlert('disconnect')

      expect(store.alertReasons).toEqual(['error', 'disconnect'])
    })

    it('should not trigger alert when muted', () => {
      store.setMute(10) // Mute for 10 minutes
      store.triggerAlert('error')

      expect(store.hasAlert).toBe(false)
      expect(store.alertReasons).toEqual([])
    })
  })

  describe('dismissAlert()', () => {
    it('should clear alert and reasons', () => {
      store.triggerAlert('error')
      store.triggerAlert('disconnect')

      store.dismissAlert()

      expect(store.hasAlert).toBe(false)
      expect(store.alertReasons).toEqual([])
    })
  })

  describe('removeAlertReason()', () => {
    it('should remove specific alert reason', () => {
      store.triggerAlert('error')
      store.triggerAlert('disconnect')

      store.removeAlertReason('error')

      expect(store.alertReasons).toEqual(['disconnect'])
      expect(store.hasAlert).toBe(true)
    })

    it('should clear hasAlert when all reasons removed', () => {
      store.triggerAlert('error')

      store.removeAlertReason('error')

      expect(store.hasAlert).toBe(false)
      expect(store.alertReasons).toEqual([])
    })

    it('should handle removing non-existent reason', () => {
      store.triggerAlert('error')

      store.removeAlertReason('nonexistent')

      expect(store.alertReasons).toEqual(['error'])
      expect(store.hasAlert).toBe(true)
    })
  })

  describe('setMute()', () => {
    it('should mute for specified minutes', () => {
      store.setMute(10)

      expect(store.isMuted).toBe(true)
      expect(store.muteUntil).toBe(Date.now() + 10 * 60 * 1000)
    })

    it('should unmute when set to 0', () => {
      store.setMute(10)
      expect(store.isMuted).toBe(true)

      store.setMute(0)

      expect(store.isMuted).toBe(false)
      expect(store.muteUntil).toBe(0)
    })

    it('should persist mute state to localStorage', () => {
      store.setMute(10)

      const saved = localStorage.getItem('dashboard-mute-until-test-service')
      expect(saved).toBe((Date.now() + 10 * 60 * 1000).toString())
    })

    it('should remove from localStorage when unmuted', () => {
      store.setMute(10)
      expect(localStorage.getItem('dashboard-mute-until-test-service')).not.toBeNull()

      store.setMute(0)

      expect(localStorage.getItem('dashboard-mute-until-test-service')).toBeNull()
    })
  })

  describe('getRemainingMuteMinutes()', () => {
    it('should return 0 when not muted', () => {
      expect(store.getRemainingMuteMinutes()).toBe(0)
    })

    it('should return remaining minutes when muted', () => {
      store.setMute(10)

      expect(store.getRemainingMuteMinutes()).toBe(10)
    })

    it('should return updated remaining minutes as time passes', () => {
      store.setMute(10)

      // Advance time by 5 minutes
      timers.advanceTimersByTime(5 * 60 * 1000)

      expect(store.getRemainingMuteMinutes()).toBe(5)
    })

    it('should round up remaining minutes', () => {
      store.setMute(10)

      // Advance time by 9.5 minutes
      timers.advanceTimersByTime(9.5 * 60 * 1000)

      expect(store.getRemainingMuteMinutes()).toBe(1)
    })
  })

  describe('checkMuteExpiration()', () => {
    it('should clear mute when expired', () => {
      store.setMute(10)

      // Advance time past expiration
      timers.advanceTimersByTime(11 * 60 * 1000)

      store.checkMuteExpiration()

      expect(store.isMuted).toBe(false)
      expect(store.muteUntil).toBe(0)
    })

    it('should not clear mute if not expired', () => {
      store.setMute(10)

      // Advance time but not past expiration
      timers.advanceTimersByTime(5 * 60 * 1000)

      store.checkMuteExpiration()

      expect(store.isMuted).toBe(true)
    })

    it('should automatically check expiration via timer', () => {
      store.setMute(1) // Mute for 1 minute

      expect(store.isMuted).toBe(true)

      // Advance time by 30 seconds (first timer tick)
      timers.advanceTimersByTime(30 * 1000)
      expect(store.isMuted).toBe(true)

      // Advance time by another 30 seconds (second timer tick, past expiration)
      timers.advanceTimersByTime(30 * 1000)

      // Timer should have auto-cleared mute
      expect(store.isMuted).toBe(false)
      expect(store.muteUntil).toBe(0)
    })
  })

  describe('service isolation', () => {
    it('should isolate mute state by service', () => {
      // Set mute for test-service
      localStorage.setItem('dashboard-mute-until-test-service', (Date.now() + 10 * 60 * 1000).toString())
      // Set different mute for another service
      localStorage.setItem('dashboard-mute-until-other-service', (Date.now() + 20 * 60 * 1000).toString())

      // Recreate store (should only load test-service's mute)
      setActivePinia(createPinia())
      const newStore = useAlertStore()

      expect(newStore.isMuted).toBe(true)
      expect(newStore.getRemainingMuteMinutes()).toBe(10)
    })

    it('should not share mute state between services', () => {
      // Set mute for test-service
      store.setMute(10)

      // Verify only test-service key is set
      expect(localStorage.getItem('dashboard-mute-until-test-service')).not.toBeNull()
      expect(localStorage.getItem('dashboard-mute-until-other-service')).toBeNull()
    })
  })

  describe('isMuted computed', () => {
    it('should be true when mute time is in future', () => {
      store.setMute(10)

      expect(store.isMuted).toBe(true)
    })

    it('should be false when mute time is in past', () => {
      store.setMute(10)

      // Advance time past expiration
      timers.advanceTimersByTime(11 * 60 * 1000)

      expect(store.isMuted).toBe(false)
    })

    it('should be false when muteUntil is 0', () => {
      expect(store.isMuted).toBe(false)
    })
  })
})
