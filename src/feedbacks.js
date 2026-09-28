import { combineRgb } from '@companion-module/base'
import { RUN_STATES, RUN_STATE_LABEL } from './protocol.js'
import { buildVariableValues } from './variables.js'

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const OFFLINE_RED = combineRgb(75, 0, 0)

export function getFeedbackDefinitions(self) {
	return {
		/**
		 * Replaces the old scheme where JessTimer pushed bgcolor changes at three
		 * hard-coded button locations. Any button can use this now, anywhere.
		 */
		online: {
			type: 'boolean',
			name: 'JessTimer online',
			description:
				'True while JessTimer is sending status. Goes false after the configured ' +
				'offline timeout, including on a crash or hard kill.',
			defaultStyle: { bgcolor: BLACK, color: WHITE },
			options: [],
			callback: () => self.state.online,
		},

		offline: {
			type: 'boolean',
			name: 'JessTimer offline',
			description: 'Inverse of the above, for buttons that should light up on loss of contact.',
			defaultStyle: { bgcolor: OFFLINE_RED, color: WHITE },
			options: [],
			callback: () => !self.state.online,
		},

		end_action_is: {
			type: 'boolean',
			name: 'End action is',
			description: 'True when JessTimer reports the selected end action.',
			defaultStyle: { bgcolor: WHITE, color: BLACK },
			options: [
				{
					type: 'dropdown',
					id: 'action',
					label: 'End action',
					default: 'clear',
					choices: [
						{ id: 'clear', label: 'Stop and CLEAR' },
						{ id: 'hold', label: 'HOLD on 00:00' },
						{ id: 'flash', label: 'FLASH at end' },
						{ id: 'countup', label: 'COUNT UP at end' },
					],
				},
			],
			callback: (feedback) => {
				// Count-up overrides the end action in JessTimer, so mirror that here:
				// while count-up is allowed, the other three never report as active.
				if (feedback.options.action === 'countup') return self.state.countUp
				if (self.state.countUp) return false
				return self.state.endAction === feedback.options.action
			},
		},

		count_up_is: {
			type: 'boolean',
			name: 'Count up is',
			defaultStyle: { bgcolor: WHITE, color: BLACK },
			options: [
				{
					type: 'dropdown',
					id: 'value',
					label: 'Count up',
					default: 'true',
					choices: [
						{ id: 'true', label: 'Allowed' },
						{ id: 'false', label: 'Not allowed' },
					],
				},
			],
			callback: (feedback) => String(self.state.countUp) === feedback.options.value,
		},

		fullscreen_is: {
			type: 'boolean',
			name: 'Fullscreen output is',
			defaultStyle: { bgcolor: combineRgb(0, 204, 0), color: BLACK },
			options: [
				{
					type: 'dropdown',
					id: 'value',
					label: 'Fullscreen',
					default: 'true',
					choices: [
						{ id: 'true', label: 'Enabled' },
						{ id: 'false', label: 'Disabled' },
					],
				},
			],
			callback: (feedback) => String(self.state.fullscreen) === feedback.options.value,
		},

		/**
		 * Supplies a button's text instead of putting `$(jesstimer:hours)` into the
		 * button's own text field.
		 *
		 * The reason is what happens when the connection is *disabled*: Companion
		 * removes the module's variables, and any button referencing one renders
		 * the literal string "$NA" — which lands right on top of the Terminal
		 * Offline artwork. Feedbacks do not run at all on a disabled connection, so
		 * the button falls back to its blank base text and the artwork stays clean.
		 *
		 * It also means the module returns the value directly rather than going
		 * through variable substitution, so there is no name to get stale if the
		 * connection is relabelled.
		 */
		readout: {
			type: 'advanced',
			name: 'Show countdown value as button text',
			description:
				'Draws a JessTimer value onto the button. Leave the button text blank and use this instead, ' +
				'so the button shows nothing rather than "$NA" when the connection is disabled.',
			options: [
				{
					type: 'dropdown',
					id: 'field',
					label: 'Value',
					default: 'time',
					choices: [
						{ id: 'hours', label: 'Hours (HH)' },
						{ id: 'minutes', label: 'Minutes (MM)' },
						{ id: 'seconds', label: 'Seconds (SS)' },
						{ id: 'time', label: 'Full countdown (HH:MM:SS)' },
						{ id: 'time_short', label: 'Countdown, hours dropped when zero' },
						{ id: 'total_seconds', label: 'Countdown in seconds' },
						{ id: 'warp', label: 'Warp coefficient' },
						{ id: 'state_label', label: 'Run state' },
					],
				},
				{
					type: 'textinput',
					id: 'prefix',
					label: 'Prefix',
					default: '',
					tooltip: 'Literal text before the value. Useful for padding, e.g. two spaces.',
				},
				{
					type: 'textinput',
					id: 'suffix',
					label: 'Suffix',
					default: '',
					tooltip: 'Literal text after the value.',
				},
			],
			callback: (feedback) => {
				const value = buildVariableValues(self.state)[feedback.options.field]
				// Blank rather than a stale or partial reading while offline. The
				// module already clears these when JessTimer stops responding.
				if (value === undefined || value === '') return { text: '' }
				return { text: `${feedback.options.prefix ?? ''}${value}${feedback.options.suffix ?? ''}` }
			},
		},

		/**
		 * Replaces an internal `variable_value` feedback comparing the warp
		 * variable. Presets cannot reference internal feedbacks in module API 1.13,
		 * and this version does not break if the connection is relabelled.
		 */
		warp_is: {
			type: 'boolean',
			name: 'Warp coefficient is',
			description: 'Compare the warp coefficient. Always false while JessTimer is offline.',
			defaultStyle: { bgcolor: combineRgb(125, 125, 255), color: combineRgb(125, 125, 255) },
			options: [
				{
					type: 'dropdown',
					id: 'op',
					label: 'Comparison',
					default: 'ne',
					choices: [
						{ id: 'eq', label: 'Equal to' },
						{ id: 'ne', label: 'Not equal to' },
						{ id: 'gt', label: 'Greater than' },
						{ id: 'lt', label: 'Less than' },
					],
				},
				{ type: 'textinput', id: 'value', label: 'Value', default: '1.0' },
			],
			callback: (feedback) => {
				// Offline blanks the warp reading, which would otherwise make
				// "not equal to 1.0" spuriously true and light the button up.
				if (!self.state.online) return false

				const current = self.state.warp
				const target = String(feedback.options.value ?? '')
				const a = Number(current)
				const b = Number(target)
				const numeric = current !== '' && target !== '' && Number.isFinite(a) && Number.isFinite(b)

				switch (feedback.options.op) {
					case 'eq':
						return numeric ? a === b : current === target
					case 'gt':
						return numeric && a > b
					case 'lt':
						return numeric && a < b
					default:
						return numeric ? a !== b : current !== target
				}
			},
		},

		/**
		 * Published but not used by the stock presets — the HH:MM:SS readout already
		 * tells the operator whether the clock is moving. Here for anyone who wants
		 * lit transport buttons.
		 */
		run_state_is: {
			type: 'boolean',
			name: 'Timer run state is',
			description: 'Requires JessTimer to send /jesstimer/state. See PROTOCOL.md §2.',
			defaultStyle: { bgcolor: combineRgb(0, 153, 0), color: WHITE },
			options: [
				{
					type: 'dropdown',
					id: 'state',
					label: 'Run state',
					default: 'running',
					choices: RUN_STATES.map((id) => ({ id, label: RUN_STATE_LABEL[id] })),
				},
			],
			callback: (feedback) => self.state.runState === feedback.options.state,
		},
	}
}
