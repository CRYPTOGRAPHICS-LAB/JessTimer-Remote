import { CMD, END_ACTION_CMD, FULLSCREEN_ENABLE, FULLSCREEN_DISABLE } from './protocol.js'

const UNIT_PLUS = { hours: CMD.HRS_PLUS, minutes: CMD.MIN_PLUS, seconds: CMD.SEC_PLUS }
const UNIT_MINUS = { hours: CMD.HRS_MINUS, minutes: CMD.MIN_MINUS, seconds: CMD.SEC_MINUS }

const UNIT_CHOICES = [
	{ id: 'hours', label: 'Hours' },
	{ id: 'minutes', label: 'Minutes' },
	{ id: 'seconds', label: 'Seconds' },
]

/**
 * Convert a 24-hour time string (e.g. "08:30", "20:00", "08:30:15") or raw
 * seconds past midnight (e.g. "72000", 72000, "72000s") into seconds past 00:00.
 *
 * Accepts:
 *   - 24h "00:00" format: "HH:MM" or "H:MM" (e.g. "08:30", "20:00")
 *   - 24h format with seconds: "HH:MM:SS" (e.g. "08:30:00", "20:00:30")
 *   - 12h with AM/PM (e.g. "8:30 AM", "8:30 PM")
 *   - 4-digit military format (e.g. "0830", "2000")
 *   - Raw seconds past midnight (e.g. "72000", 72000, "72000s", "72000 sec")
 *
 * @param {string|number} raw
 * @returns {number|null} seconds past midnight (0-86400), or null if invalid
 */
export function parseTimeToSeconds(raw) {
	if (raw === undefined || raw === null) return null
	if (typeof raw === 'number') {
		if (Number.isFinite(raw) && raw >= 0 && raw <= 86400) {
			return Math.round(raw)
		}
		return null
	}

	const str = String(raw).trim()
	if (!str) return null

	// Match 12h or 24h format: H:MM or H:MM:SS with optional AM/PM
	const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i)
	if (timeMatch) {
		let hours = parseInt(timeMatch[1], 10)
		const minutes = parseInt(timeMatch[2], 10)
		const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0
		const ampm = timeMatch[4]?.toLowerCase()

		if (minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null

		if (ampm) {
			if (hours < 1 || hours > 12) return null
			if (ampm === 'pm' && hours < 12) hours += 12
			if (ampm === 'am' && hours === 12) hours = 0
		} else {
			if (hours === 24 && minutes === 0 && seconds === 0) return 86400
			if (hours < 0 || hours > 23) return null
		}

		return hours * 3600 + minutes * 60 + seconds
	}

	// 4-digit military format: "0830", "2000"
	const milMatch = str.match(/^(\d{2})(\d{2})$/)
	if (milMatch) {
		const hours = parseInt(milMatch[1], 10)
		const minutes = parseInt(milMatch[2], 10)
		if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
			return hours * 3600 + minutes * 60
		}
	}

	// Match raw seconds past midnight: e.g. "72000", "30600", "72000s", "72000 sec"
	const secMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?$/i)
	if (secMatch) {
		const num = Number(secMatch[1])
		if (Number.isFinite(num) && num >= 0 && num <= 86400) {
			return Math.round(num)
		}
	}

	return null
}

export function getActionDefinitions(self) {
	return {
		// ---------------------------------------------------------------- transport
		start: {
			name: 'Transport: Start',
			options: [],
			callback: () => self.sendBlank(CMD.START),
		},
		pause: {
			name: 'Transport: Pause',
			options: [],
			callback: () => self.sendBlank(CMD.PAUSE),
		},
		stop: {
			name: 'Transport: Stop',
			options: [],
			callback: () => self.sendBlank(CMD.STOP),
		},
		repeat: {
			name: 'Transport: Re-engage (repeat)',
			options: [],
			callback: () => self.sendBlank(CMD.REPEAT),
		},

		// -------------------------------------------------------------------- time
		set_time: {
			name: 'Time: Set duration',
			description: 'Sends /Hours, /Minutes and /Seconds in succession. Fields accept variables.',
			options: [
				{ type: 'textinput', id: 'hours', label: 'Hours', default: '0', useVariables: true, width: 4 },
				{ type: 'textinput', id: 'minutes', label: 'Minutes', default: '10', useVariables: true, width: 4 },
				{ type: 'textinput', id: 'seconds', label: 'Seconds', default: '0', useVariables: true, width: 4 },
			],
			callback: async (action, context) => {
				const h = await self.parseNumber(action.options.hours, context, 0)
				const m = await self.parseNumber(action.options.minutes, context, 0)
				const s = await self.parseNumber(action.options.seconds, context, 0)
				self.sendInt(CMD.HOURS, h)
				self.sendInt(CMD.MINUTES, m)
				self.sendInt(CMD.SECONDS, s)
			},
		},

		set_end_time_of_day: {
			name: 'Time: Set to end by time-of-day',
			options: [
				{
					type: 'textinput',
					id: 'time',
					label: '24hr time (e.g. 08:30) or raw seconds past midnight',
					default: '08:30',
					useVariables: true,
				},
			],
			callback: async (action, context) => {
				const raw = await context.parseVariablesInString(String(action.options.time ?? ''))
				const seconds = parseTimeToSeconds(raw)
				if (seconds === null) {
					self.log('warn', `set_end_time_of_day: "${raw}" is not a valid time of day or seconds value`)
					return
				}
				self.sendInt(CMD.END_TIME_OF_DAY, seconds)
			},
		},

		adjust_time: {
			name: 'Time: Adjust by amount',
			description:
				'Nudge one unit up or down. Maps to /HrsPlus, /MinMinus and friends. ' +
				'The module applies the negative sign for you on decrease.',
			options: [
				{ type: 'dropdown', id: 'unit', label: 'Unit', default: 'minutes', choices: UNIT_CHOICES, width: 4 },
				{
					type: 'dropdown',
					id: 'direction',
					label: 'Direction',
					default: 'up',
					choices: [
						{ id: 'up', label: 'Increase' },
						{ id: 'down', label: 'Decrease' },
					],
					width: 4,
				},
				{
					type: 'textinput',
					id: 'amount',
					label: 'Amount',
					default: '1',
					useVariables: true,
					tooltip: 'Enter a positive number. The original buttons used 1 for a tap and 10 for a hold.',
					width: 4,
				},
			],
			callback: async (action, context) => {
				const raw = await self.parseNumber(action.options.amount, context, 1)
				const amount = Math.abs(raw)
				const up = action.options.direction === 'up'
				const path = (up ? UNIT_PLUS : UNIT_MINUS)[action.options.unit]
				if (!path) {
					self.log('warn', `adjust_time: unknown unit "${action.options.unit}"`)
					return
				}
				self.sendInt(path, up ? amount : -amount)
			},
		},

		// -------------------------------------------------------------------- warp
		warp_up: {
			name: 'Warp: Speed up',
			options: [],
			callback: () => self.sendBlank(CMD.WARP_UP),
		},
		warp_down: {
			name: 'Warp: Slow down',
			options: [],
			callback: () => self.sendBlank(CMD.WARP_DOWN),
		},
		warp_reset: {
			name: 'Warp: Reset to 1.0',
			options: [],
			callback: () => self.sendBlank(CMD.WARP_RESET),
		},

		// -------------------------------------------------------------- end action
		set_end_action: {
			name: 'End Action: Set',
			description:
				'Count Up additionally sends /AllowCountUp; the other three send /DisallowCountUp first ' +
				'so a previously-allowed count-up does not override the new choice.',
			options: [
				{
					type: 'dropdown',
					id: 'action',
					label: 'At end of countdown',
					default: 'clear',
					choices: [
						{ id: 'clear', label: 'Stop and CLEAR' },
						{ id: 'hold', label: 'HOLD on 00:00' },
						{ id: 'flash', label: 'FLASH at end' },
						{ id: 'countup', label: 'COUNT UP at end' },
					],
				},
			],
			callback: (action) => {
				switch (action.options.action) {
					case 'countup':
						self.sendBlank(CMD.ALLOW_COUNTUP)
						self.sendInt(CMD.DO_AT_END, END_ACTION_CMD.COUNTUP)
						break
					case 'hold':
						self.sendBlank(CMD.DISALLOW_COUNTUP)
						self.sendInt(CMD.DO_AT_END, END_ACTION_CMD.HOLD)
						break
					case 'flash':
						self.sendBlank(CMD.DISALLOW_COUNTUP)
						self.sendInt(CMD.DO_AT_END, END_ACTION_CMD.FLASH)
						break
					default:
						self.sendBlank(CMD.DISALLOW_COUNTUP)
						self.sendInt(CMD.DO_AT_END, END_ACTION_CMD.CLEAR)
						break
				}
			},
		},

		set_count_up: {
			name: 'End Action: Allow / disallow count up',
			description:
				'Standalone count-up permission, without touching the end action. ' +
				'This is the raw /AllowCountUp and /DisallowCountUp pair.',
			options: [
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Count up',
					default: 'allow',
					choices: [
						{ id: 'allow', label: 'Allow' },
						{ id: 'disallow', label: 'Disallow' },
						{ id: 'toggle', label: 'Toggle' },
					],
				},
			],
			callback: (action) => {
				let allow
				if (action.options.mode === 'toggle') allow = !self.state.countUp
				else allow = action.options.mode === 'allow'
				self.sendBlank(allow ? CMD.ALLOW_COUNTUP : CMD.DISALLOW_COUNTUP)
			},
		},

		// -------------------------------------------------------------- fullscreen
		set_fullscreen: {
			name: 'Fullscreen: Set output',
			options: [
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Fullscreen output',
					default: 'enable',
					choices: [
						{ id: 'enable', label: 'Enable' },
						{ id: 'disable', label: 'Disable' },
						{ id: 'toggle', label: 'Toggle' },
					],
				},
			],
			callback: (action) => {
				let enable
				if (action.options.mode === 'toggle') enable = !self.state.fullscreen
				else enable = action.options.mode === 'enable'
				self.sendInt(CMD.FULLSCREEN, enable ? FULLSCREEN_ENABLE : FULLSCREEN_DISABLE)
			},
		},

		// ------------------------------------------------------------------- misc
		query_state: {
			name: 'Query JessTimer state',
			description: 'Ask JessTimer to re-send everything. Runs automatically on connect.',
			options: [],
			callback: () => self.sendBlank(CMD.QUERY),
		},

		send_raw: {
			name: 'Send raw OSC',
			description: 'Escape hatch for any JessTimer address this module does not yet wrap.',
			options: [
				{ type: 'textinput', id: 'path', label: 'OSC Path', default: '/', useVariables: true },
				{
					type: 'dropdown',
					id: 'argType',
					label: 'Argument type',
					default: 'none',
					choices: [
						{ id: 'none', label: 'No argument' },
						{ id: 'i', label: 'Integer' },
						{ id: 'f', label: 'Float' },
						{ id: 's', label: 'String' },
					],
				},
				{
					type: 'textinput',
					id: 'value',
					label: 'Value',
					default: '',
					useVariables: true,
					isVisible: (opts) => opts.argType !== 'none',
				},
			],
			callback: async (action, context) => {
				const path = (await context.parseVariablesInString(action.options.path)).trim()
				if (!path.startsWith('/')) {
					self.log('warn', `send_raw: "${path}" is not a valid OSC path`)
					return
				}
				const type = action.options.argType
				if (type === 'none') return self.sendBlank(path)

				const raw = await context.parseVariablesInString(action.options.value ?? '')
				if (type === 's') return self.sendOsc(path, [{ type: 's', value: raw }])

				const num = Number(raw)
				if (!Number.isFinite(num)) {
					self.log('warn', `send_raw: "${raw}" is not a number`)
					return
				}
				if (type === 'i') return self.sendInt(path, Math.round(num))
				return self.sendOsc(path, [{ type: 'f', value: num }])
			},
		},
	}
}
