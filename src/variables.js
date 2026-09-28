export function getVariableDefinitions() {
	return [
		{ variableId: 'online', name: 'JessTimer online (true/false)' },

		{ variableId: 'hours', name: 'Countdown hours (HH)' },
		{ variableId: 'minutes', name: 'Countdown minutes (MM)' },
		{ variableId: 'seconds', name: 'Countdown seconds (SS)' },
		{ variableId: 'time', name: 'Countdown formatted (HH:MM:SS)' },
		{ variableId: 'time_short', name: 'Countdown without leading hours (MM:SS when under an hour)' },
		{ variableId: 'total_seconds', name: 'Countdown total seconds' },

		{ variableId: 'warp', name: 'Warp coefficient' },

		{ variableId: 'state', name: 'Run state (stopped/running/paused/expired)' },
		{ variableId: 'state_label', name: 'Run state, display form' },

		{ variableId: 'end_action', name: 'End action (clear/hold/flash/countup)' },
		{ variableId: 'end_action_label', name: 'End action, display form' },
		{ variableId: 'count_up', name: 'Count up allowed (true/false)' },

		{ variableId: 'fullscreen', name: 'Fullscreen output enabled (true/false)' },
	]
}

/**
 * Build the full variable value map from module state.
 * Called on every state change, so it stays cheap and allocation-light.
 */
export function buildVariableValues(state) {
	const { hours, minutes, seconds } = state
	const h = Number.parseInt(hours, 10)
	const m = Number.parseInt(minutes, 10)
	const s = Number.parseInt(seconds, 10)
	const haveTime = Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s)

	const time = `${hours}:${minutes}:${seconds}`

	return {
		online: state.online ? 'true' : 'false',

		hours,
		minutes,
		seconds,
		time,
		time_short: haveTime && h === 0 ? `${minutes}:${seconds}` : time,
		total_seconds: haveTime ? h * 3600 + m * 60 + s : '',

		warp: state.warp,

		state: state.runState,
		state_label: state.runStateLabel,

		end_action: state.endAction,
		end_action_label: state.endActionLabel,
		count_up: state.countUp ? 'true' : 'false',

		fullscreen: state.fullscreen ? 'true' : 'false',
	}
}
