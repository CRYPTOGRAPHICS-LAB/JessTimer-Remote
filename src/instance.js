import { InstanceBase, InstanceStatus } from '@companion-module/base'

import { getConfigFields } from './config.js'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { getPresetDefinitions } from './presets.js'
import { getVariableDefinitions, buildVariableValues } from './variables.js'
import { TimerLink, ALL_FEEDBACKS } from './timer-link.js'

const STATUS_MAP = {
	ok: InstanceStatus.Ok,
	connecting: InstanceStatus.Connecting,
	disconnected: InstanceStatus.Disconnected,
	bad_config: InstanceStatus.BadConfig,
	connection_failure: InstanceStatus.ConnectionFailure,
}

/**
 * Thin Companion adapter. All JessTimer protocol logic lives in TimerLink;
 * this class only translates between that and Companion's APIs.
 */
export class JessTimerInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.link = new TimerLink({
			log: (level, message) => this.log(level, message),
			send: (address, args) => this.sendOsc(address, args),
			onStatus: (status, message) => this.updateStatus(STATUS_MAP[status] ?? InstanceStatus.UnknownError, message),
			onChange: ({ variables, feedbacks }) => {
				if (variables) this.pushVariables()
				if (feedbacks?.length) this.checkFeedbacks(...feedbacks)
			},
		})
	}

	/** Actions and feedbacks read module state through here. */
	get state() {
		return this.link.state
	}

	async init(config) {
		this.config = config

		this.setActionDefinitions(getActionDefinitions(this))
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))
		this.setVariableDefinitions(getVariableDefinitions())
		this.setPresetDefinitions(getPresetDefinitions())

		this.link.start(config)
		this.pushVariables()
		this.checkFeedbacks(...ALL_FEEDBACKS)
	}

	async destroy() {
		this.link.stop()
	}

	async configUpdated(config) {
		this.config = config
		this.link.stop()
		this.link.start(config)
		this.pushVariables()
		this.checkFeedbacks(...ALL_FEEDBACKS)
	}

	getConfigFields() {
		return getConfigFields()
	}

	pushVariables() {
		this.setVariableValues(buildVariableValues(this.link.state))
	}

	// =========================================================================
	// Outbound OSC
	// =========================================================================

	/**
	 * @param {string} path
	 * @param {Array<{type: string, value: any}>} args
	 */
	sendOsc(path, args = []) {
		const host = this.config?.host
		const port = Number(this.config?.port)
		if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
			this.log('warn', `Cannot send ${path}: target host/port not configured`)
			return
		}
		if (this.config?.verbose) {
			this.log('debug', `TX ${host}:${port} ${path} ${JSON.stringify(args.map((a) => a.value))}`)
		}
		try {
			this.oscSend(host, port, path, args)
		} catch (err) {
			this.log('error', `Failed to send ${path}: ${err?.message ?? err}`)
		}
	}

	sendBlank(path) {
		this.sendOsc(path, [])
	}

	sendInt(path, value) {
		this.sendOsc(path, [{ type: 'i', value: Math.round(value) }])
	}

	/** Resolve a variable-bearing action option into a finite number. */
	async parseNumber(raw, context, fallback = 0) {
		const text = await context.parseVariablesInString(String(raw ?? ''))
		const num = Number(text.trim())
		if (!Number.isFinite(num)) {
			this.log('warn', `"${text}" is not a number; using ${fallback}`)
			return fallback
		}
		return num
	}
}
