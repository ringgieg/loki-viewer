import { getConfig } from './config'
import { useAlertStore } from '../stores/alertStore'

const DEFAULT_SCHEDULE = {
	mode: 'auto',
	timeZone: 'Asia/Shanghai',
	dayStart: '08:25',
	nightStart: '16:25',
	darkClass: 'dark',
	autoRefresh: []
}

function parseHHMM(value) {
	if (typeof value !== 'string') return null
	const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/)
	if (!match) return null
	const hours = Number(match[1])
	const minutes = Number(match[2])
	return hours * 60 + minutes
}

function getDateKeyInTimeZone(date, timeZone) {
	try {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(date)

		const y = parts.find((p) => p.type === 'year')?.value
		const m = parts.find((p) => p.type === 'month')?.value
		const d = parts.find((p) => p.type === 'day')?.value
		if (!y || !m || !d) return null
		return `${y}-${m}-${d}`
	} catch {
		return null
	}
}

function getScheduleConfig() {
	// Canonical key: schedule
	// Legacy keys: themeSchedule, theme
	const raw = getConfig('schedule', null) || getConfig('themeSchedule', null) || getConfig('theme', null) || {}
	return {
		...DEFAULT_SCHEDULE,
		...(raw && typeof raw === 'object' ? raw : {})
	}
}

function getMinutesInTimeZone(date, timeZone) {
	try {
		const parts = new Intl.DateTimeFormat('en-GB', {
			timeZone,
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).formatToParts(date)

		const hourPart = parts.find((p) => p.type === 'hour')
		const minutePart = parts.find((p) => p.type === 'minute')

		const hours = Number(hourPart?.value)
		const minutes = Number(minutePart?.value)
		if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
		return hours * 60 + minutes
	} catch {
		return null
	}
}

function isDarkBySchedule(nowMinutes, dayStartMinutes, nightStartMinutes) {
	if (!Number.isFinite(nowMinutes)) return false
	if (!Number.isFinite(dayStartMinutes) || !Number.isFinite(nightStartMinutes)) return false

	// Common case: dayStart < nightStart (e.g., 08:25 -> 16:25)
	// Light in [dayStart, nightStart), dark otherwise
	if (dayStartMinutes < nightStartMinutes) {
		return nowMinutes < dayStartMinutes || nowMinutes >= nightStartMinutes
	}

	// If nightStart < dayStart, dark in [nightStart, dayStart)
	if (nightStartMinutes < dayStartMinutes) {
		return nowMinutes >= nightStartMinutes && nowMinutes < dayStartMinutes
	}

	// dayStart === nightStart: treat as always light
	return false
}

export function applyThemeFromSchedule(date = new Date()) {
	const schedule = getScheduleConfig()
	const className = schedule.darkClass || DEFAULT_SCHEDULE.darkClass

	if (schedule.mode && schedule.mode === 'dark') {
		document.documentElement.classList.add(className)
	} else if (schedule.mode && schedule.mode === 'light') {
		document.documentElement.classList.remove(className)
	} else {
		const dayStartMinutes = parseHHMM(schedule.dayStart) ?? parseHHMM(DEFAULT_SCHEDULE.dayStart)
		const nightStartMinutes = parseHHMM(schedule.nightStart) ?? parseHHMM(DEFAULT_SCHEDULE.nightStart)
		const nowMinutes = getMinutesInTimeZone(date, schedule.timeZone || DEFAULT_SCHEDULE.timeZone)

		const shouldDark = isDarkBySchedule(nowMinutes, dayStartMinutes, nightStartMinutes)
		document.documentElement.classList.toggle(className, shouldDark)
	}

}

let lastAutoRefreshKey = null

// Timer references for cleanup
let initialTimer = null
let recurringTimer = null

export function maybeAutoRefreshFromSchedule(date = new Date()) {
	const schedule = getScheduleConfig()
	const timeZone = schedule.timeZone || DEFAULT_SCHEDULE.timeZone
	const autoRefresh = Array.isArray(schedule.autoRefresh) ? schedule.autoRefresh : []
	if (autoRefresh.length === 0) return

	const nowMinutes = getMinutesInTimeZone(date, timeZone)
	if (!Number.isFinite(nowMinutes)) return

	for (const t of autoRefresh) {
		const targetMinutes = parseHHMM(t)
		if (!Number.isFinite(targetMinutes)) continue
		if (targetMinutes !== nowMinutes) continue

		const dateKey = getDateKeyInTimeZone(date, timeZone)
		const refreshKey = `${dateKey || 'unknown'}@${String(t).trim()}`
		if (refreshKey === lastAutoRefreshKey) return
		lastAutoRefreshKey = refreshKey

		try {
			const alertStore = useAlertStore()
			if (alertStore?.hasAlert) {
				return
			}
		} catch {
			// Pinia might not be ready; skip auto refresh.
			return
		}

		// No global alert: refresh to mitigate long-running memory issues.
		window.location.reload()
		return
	}
}

/**
 * Stop the theme scheduler and clean up timers
 */
export function stopThemeScheduler() {
	if (initialTimer) {
		window.clearTimeout(initialTimer)
		initialTimer = null
	}
	if (recurringTimer) {
		window.clearInterval(recurringTimer)
		recurringTimer = null
	}
	console.log('[ThemeScheduler] Stopped and cleaned up timers')
}

export function startThemeScheduler() {
	// Stop any existing timers first
	stopThemeScheduler()

	applyThemeFromSchedule()
	maybeAutoRefreshFromSchedule()

	// Align checks to minute boundaries to avoid drift
	const now = new Date()
	const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 20

	initialTimer = window.setTimeout(() => {
		applyThemeFromSchedule()
		maybeAutoRefreshFromSchedule()

		// Start recurring timer
		recurringTimer = window.setInterval(() => {
			applyThemeFromSchedule()
			maybeAutoRefreshFromSchedule()
		}, 60_000)
	}, Math.max(20, msUntilNextMinute))

	console.log('[ThemeScheduler] Started')
}
