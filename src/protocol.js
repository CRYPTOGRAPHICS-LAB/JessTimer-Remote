/**
 * Every OSC address and magic number in one place.
 * See PROTOCOL.md for the full contract.
 */

// ---------------------------------------------------------------------------
// Companion -> JessTimer. These match JessTimer's existing vocabulary exactly.
// ---------------------------------------------------------------------------

export const CMD = {
	START: '/Start',
	PAUSE: '/Pause',
	STOP: '/Stop',
	REPEAT: '/Repeat',

	HOURS: '/Hours',
	MINUTES: '/Minutes',
	SECONDS: '/Seconds',
	END_TIME_OF_DAY: '/EndTimeOfDay',

	HRS_PLUS: '/HrsPlus',
	MIN_PLUS: '/MinPlus',
	SEC_PLUS: '/SecPlus',
	HRS_MINUS: '/HrsMinus',
	MIN_MINUS: '/MinMinus',
	SEC_MINUS: '/SecMinus',

	WARP_UP: '/WarpUp',
	WARP_DOWN: '/WarpDown',
	WARP_RESET: '/Warp1',

	DO_AT_END: '/DoAtEnd',
	ALLOW_COUNTUP: '/AllowCountUp',
	DISALLOW_COUNTUP: '/DisallowCountUp',

	FULLSCREEN: '/Fullscreen',

	QUERY: '/Query',
}

/** Payloads for /DoAtEnd. */
export const END_ACTION_CMD = {
	CLEAR: 101,
	HOLD: 102,
	FLASH: 103,
	COUNTUP: 104,
}

/**
 * Payloads for /Fullscreen.
 *
 * Derived from the original button 3-0: the short-release set sent 0 and the
 * long-release set sent 1, on a button labelled "enable-short, disable-long".
 * If JessTimer actually treats 1 as enable, swap these two values. Nothing
 * else in the module depends on the polarity.
 */
export const FULLSCREEN_ENABLE = 0
export const FULLSCREEN_DISABLE = 1

// ---------------------------------------------------------------------------
// JessTimer -> Companion. New addresses on the module's own listen port.
// ---------------------------------------------------------------------------

export const STATUS = {
	HOURS: '/jesstimer/hours',
	MINUTES: '/jesstimer/minutes',
	SECONDS: '/jesstimer/seconds',
	TIME: '/jesstimer/time',
	WARP: '/jesstimer/warp',
	STATE: '/jesstimer/state',
	END_ACTION: '/jesstimer/endaction',
	COUNTUP: '/jesstimer/countup',
	FULLSCREEN: '/jesstimer/fullscreen',
	HEARTBEAT: '/jesstimer/heartbeat',
}

/** Status values for /jesstimer/endaction (note: NOT the same as END_ACTION_CMD). */
export const END_ACTION_STATUS = {
	1: 'clear',
	2: 'hold',
	3: 'flash',
	4: 'countup',
}

export const END_ACTION_LABEL = {
	clear: 'Stop & Clear',
	hold: 'Hold at 00:00',
	flash: 'Flash at End',
	countup: 'Count Up at End',
	unknown: 'Unknown',
}

/** Status values for /jesstimer/state, in both string and integer form. */
export const RUN_STATE_BY_INT = {
	0: 'stopped',
	1: 'running',
	2: 'paused',
	3: 'expired',
}

export const RUN_STATES = ['stopped', 'running', 'paused', 'expired']

export const RUN_STATE_LABEL = {
	stopped: 'Stopped',
	running: 'Running',
	paused: 'Paused',
	expired: 'Expired',
	unknown: 'Unknown',
}
