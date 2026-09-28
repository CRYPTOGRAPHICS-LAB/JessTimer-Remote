import dgram from 'node:dgram'

import { decodePacket } from './osc-decode.js'
import { STATUS, END_ACTION_STATUS, END_ACTION_LABEL, RUN_STATE_BY_INT, RUN_STATE_LABEL } from './protocol.js'

const WATCHDOG_TICK_MS = 200

export function initialState() {
	return {
		online: false,
		hours: '',
		minutes: '',
		seconds: '',
		warp: '',
		runState: 'unknown',
		runStateLabel: RUN_STATE_LABEL.unknown,
		endAction: 'unknown',
		endActionLabel: END_ACTION_LABEL.unknown,
		countUp: false,
		fullscreen: false,
	}
}

/**
 * Everything about talking to JessTimer, with no dependency on Companion.
 *
 * Kept deliberately separate from the InstanceBase subclass: InstanceBase
 * refuses to be constructed outside Companion's IPC harness, which would make
 * this logic untestable if it lived there. Here it can be driven by a plain
 * script over real sockets (see tools/e2e.mjs).
 *
 * Communicates outward through four callbacks rather than by reaching into
 * Companion directly:
 *   log(level, message)
 *   send(address, args)          - outbound OSC, used for /Query
 *   onStatus(status, message)    - connection status for the Companion UI
 *   onChange({ variables, feedbacks })
 */
export class TimerLink {
	constructor({ log, send, onStatus, onChange }) {
		this.state = initialState()
		this.config = {}
		this.socket = null
		this.watchdog = null
		this.lastRx = 0

		this._log = log ?? (() => {})
		this._send = send ?? (() => {})
		this._onStatus = onStatus ?? (() => {})
		this._onChange = onChange ?? (() => {})
	}

	/** Bind the listen socket and begin watching for silence. */
	start(config) {
		this.config = config ?? {}
		this.state = initialState()
		this.openSocket()
		this.startWatchdog()
	}

	stop() {
		this.stopWatchdog()
		this.closeSocket()
	}

	// =========================================================================
	// Socket
	// =========================================================================

	openSocket() {
		const port = Number(this.config.listenPort)
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			this._onStatus('bad_config', 'Invalid listen port')
			return
		}

		this._onStatus('connecting', 'Waiting for JessTimer')

		const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
		this.socket = socket

		socket.on('error', (err) => {
			// EADDRINUSE here almost always means the port collides with something
			// else on the box - most often Companion's own OSC listener on 12321.
			this._log('error', `Listen socket error on port ${port}: ${err.message}`)
			this._onStatus('connection_failure', err.message)
			this.closeSocket()
		})

		socket.on('message', (msg, rinfo) => {
			for (const packet of decodePacket(msg)) this.handleMessage(packet, rinfo)
		})

		socket.on('listening', () => {
			this._log('info', `Listening for JessTimer status on UDP ${port}`)
			if (this.config.queryOnConnect) this.query()
		})

		try {
			socket.bind(port)
		} catch (err) {
			this._log('error', `Could not bind UDP ${port}: ${err?.message ?? err}`)
			this._onStatus('connection_failure', `Bind failed on ${port}`)
		}
	}

	closeSocket() {
		if (!this.socket) return
		try {
			this.socket.removeAllListeners()
			this.socket.close()
		} catch {
			// Already closed, or never bound. Nothing useful to do.
		}
		this.socket = null
	}

	query() {
		this._send('/Query', [])
	}

	// =========================================================================
	// Inbound
	// =========================================================================

	handleMessage(packet, rinfo) {
		const { address, args } = packet

		if (this.config.verbose) {
			const from = rinfo ? `${rinfo.address}:${rinfo.port} ` : ''
			this._log('debug', `RX ${from}${address} ${JSON.stringify(args.map((a) => a.value))}`)
		}

		// Any traffic at all counts as proof of life.
		this.lastRx = Date.now()
		const wasOffline = !this.state.online

		const first = args[0]?.value
		const changed = new Set()

		switch (address) {
			case STATUS.HOURS:
				this.setTimeField('hours', first, changed)
				break
			case STATUS.MINUTES:
				this.setTimeField('minutes', first, changed)
				break
			case STATUS.SECONDS:
				this.setTimeField('seconds', first, changed)
				break

			case STATUS.TIME:
				this.setTimeField('hours', args[0]?.value, changed)
				this.setTimeField('minutes', args[1]?.value, changed)
				this.setTimeField('seconds', args[2]?.value, changed)
				break

			case STATUS.WARP: {
				const warp = first === undefined ? '' : String(first)
				if (warp !== this.state.warp) {
					this.state.warp = warp
					changed.add('variables')
					changed.add('readout')
					changed.add('warp_is')
				}
				break
			}

			case STATUS.STATE: {
				const runState = normaliseRunState(first)
				if (runState !== this.state.runState) {
					this.state.runState = runState
					this.state.runStateLabel = RUN_STATE_LABEL[runState] ?? RUN_STATE_LABEL.unknown
					changed.add('variables')
					changed.add('run_state_is')
					changed.add('readout')
				}
				break
			}

			case STATUS.END_ACTION: {
				const endAction = END_ACTION_STATUS[Number(first)] ?? 'unknown'
				if (endAction !== this.state.endAction) {
					this.state.endAction = endAction
					this.state.endActionLabel = END_ACTION_LABEL[endAction] ?? END_ACTION_LABEL.unknown
					changed.add('variables')
					changed.add('end_action_is')
				}
				break
			}

			case STATUS.COUNTUP: {
				const countUp = truthy(first)
				if (countUp !== this.state.countUp) {
					this.state.countUp = countUp
					changed.add('variables')
					changed.add('count_up_is')
					// Count-up overrides the end action, so that indicator moves too.
					changed.add('end_action_is')
				}
				break
			}

			case STATUS.FULLSCREEN: {
				const fullscreen = truthy(first)
				if (fullscreen !== this.state.fullscreen) {
					this.state.fullscreen = fullscreen
					changed.add('variables')
					changed.add('fullscreen_is')
				}
				break
			}

			case STATUS.HEARTBEAT:
				break

			default:
				if (this.config.verbose) this._log('debug', `Ignoring unrecognised address ${address}`)
				break
		}

		if (wasOffline) {
			this.setOnline(true)
			// Coming back from a dropout: ask for everything rather than waiting for
			// each value to change on its own.
			if (this.config.queryOnConnect) this.query()
			return // setOnline already emitted a full change
		}

		this.emit(changed)
	}

	setTimeField(field, value, changed) {
		if (value === undefined || value === null) return
		const text = typeof value === 'number' ? String(Math.trunc(value)).padStart(2, '0') : String(value)
		if (text !== this.state[field]) {
			this.state[field] = text
			changed.add('variables')
			changed.add('readout')
		}
	}

	emit(changed) {
		if (changed.size === 0) return
		this._onChange({
			variables: changed.has('variables'),
			feedbacks: [...changed].filter((k) => k !== 'variables'),
		})
	}

	// =========================================================================
	// Liveness
	// =========================================================================

	startWatchdog() {
		this.stopWatchdog()
		this.watchdog = setInterval(() => {
			const timeout = Number(this.config.offlineTimeout) || 2000
			if (this.state.online && Date.now() - this.lastRx > timeout) {
				this._log('info', `No JessTimer traffic for ${timeout} ms - marking offline`)
				this.setOnline(false)
			}
		}, WATCHDOG_TICK_MS)
		if (typeof this.watchdog.unref === 'function') this.watchdog.unref()
	}

	stopWatchdog() {
		if (this.watchdog) clearInterval(this.watchdog)
		this.watchdog = null
	}

	setOnline(online) {
		this.state.online = online

		if (online) {
			this._log('info', 'JessTimer online')
			this._onStatus('ok')
		} else {
			// Blank the readout rather than leaving a frozen countdown on screen.
			// This mirrors what JessTimer's old "Terminal Offline" messages did, and
			// a stale time is worse than no time on a show floor.
			this.state.hours = ''
			this.state.minutes = ''
			this.state.seconds = ''
			this.state.warp = ''
			this.state.runState = 'unknown'
			this.state.runStateLabel = RUN_STATE_LABEL.unknown
			this._onStatus('disconnected', 'JessTimer not responding')
		}

		this._onChange({ variables: true, feedbacks: ALL_FEEDBACKS })
	}
}

export const ALL_FEEDBACKS = [
	'online',
	'offline',
	'readout',
	'warp_is',
	'end_action_is',
	'count_up_is',
	'fullscreen_is',
	'run_state_is',
]

function normaliseRunState(value) {
	if (typeof value === 'number') return RUN_STATE_BY_INT[value] ?? 'unknown'
	const text = String(value ?? '')
		.trim()
		.toLowerCase()
	if (text !== '' && Number.isFinite(Number(text))) return RUN_STATE_BY_INT[Number(text)] ?? 'unknown'
	return RUN_STATE_LABEL[text] ? text : 'unknown'
}

function truthy(value) {
	if (typeof value === 'boolean') return value
	if (typeof value === 'number') return value !== 0
	const text = String(value ?? '')
		.trim()
		.toLowerCase()
	return text === '1' || text === 'true' || text === 'yes' || text === 'on'
}
