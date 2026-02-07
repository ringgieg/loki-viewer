import { getConfig } from './config'

const DEFAULT_THEME_SCHEDULE = {
	mode: 'auto',
	timeZone: 'Asia/Shanghai',
	dayStart: '08:25',
	nightStart: '16:25',
	darkClass: 'dark'
}

function parseHHMM(value) {
	if (typeof value !== 'string') return null
	const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/)
	if (!match) return null
	const hours = Number(match[1])
	const minutes = Number(match[2])
	return hours * 60 + minutes
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
	const schedule = {
		...DEFAULT_THEME_SCHEDULE,
		...(getConfig('themeSchedule', null) || getConfig('theme', null) || {})
	}

	const className = schedule.darkClass || DEFAULT_THEME_SCHEDULE.darkClass

	if (schedule.mode && schedule.mode === 'dark') {
		document.documentElement.classList.add(className)
	} else if (schedule.mode && schedule.mode === 'light') {
		document.documentElement.classList.remove(className)
	} else {
		const dayStartMinutes = parseHHMM(schedule.dayStart) ?? parseHHMM(DEFAULT_THEME_SCHEDULE.dayStart)
		const nightStartMinutes = parseHHMM(schedule.nightStart) ?? parseHHMM(DEFAULT_THEME_SCHEDULE.nightStart)
		const nowMinutes = getMinutesInTimeZone(date, schedule.timeZone || DEFAULT_THEME_SCHEDULE.timeZone)

		const shouldDark = isDarkBySchedule(nowMinutes, dayStartMinutes, nightStartMinutes)
		document.documentElement.classList.toggle(className, shouldDark)
	}

}

export function startThemeScheduler() {
	applyThemeFromSchedule()

	// Align checks to minute boundaries to avoid drift
	const scheduleNextTick = () => {
		const now = new Date()
		const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 20
		return window.setTimeout(() => {
			applyThemeFromSchedule()
			window.setInterval(() => applyThemeFromSchedule(), 60_000)
		}, Math.max(20, msUntilNextMinute))
	}

	scheduleNextTick()
}
