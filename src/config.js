import { Regex } from '@companion-module/base'

export function getConfigFields() {
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'JessTimer',
			value:
				'Bi-directional OSC control for JessTimer. Commands go out to the target below; ' +
				'status comes back to the listen port. See PROTOCOL.md for the addresses JessTimer must send.',
		},
		{
			type: 'static-text',
			id: 'outHeading',
			width: 12,
			label: 'Commands to JessTimer',
			value: '',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Target Host',
			tooltip: 'IP address of the machine running JessTimer',
			width: 6,
			default: '127.0.0.1',
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Target Port',
			tooltip:
				"The UDP port JessTimer's OSC server listens on. JessTimer currently hard-codes 9999; " +
				'change this only if a future version makes it configurable.',
			width: 6,
			default: 9999,
			min: 1,
			max: 65535,
		},
		{
			type: 'static-text',
			id: 'inHeading',
			width: 12,
			label: 'Status from JessTimer',
			value: '',
		},
		{
			type: 'number',
			id: 'listenPort',
			label: 'Listen Port',
			tooltip:
				'UDP port this module binds to receive status. JessTimer must send here, ' +
				'NOT to Companion\'s built-in OSC port 12321.',
			width: 6,
			default: 12322,
			min: 1,
			max: 65535,
		},
		{
			type: 'number',
			id: 'offlineTimeout',
			label: 'Offline Timeout (ms)',
			tooltip:
				'Mark JessTimer offline after this long with no inbound message. ' +
				'JessTimer sends at 5 Hz, so 2000 ms allows ten missed updates.',
			width: 6,
			default: 2000,
			min: 250,
			max: 60000,
		},
		{
			type: 'checkbox',
			id: 'queryOnConnect',
			label: 'Query state on startup',
			tooltip:
				'Send /Query when the module starts and whenever JessTimer comes back online, ' +
				'so buttons repopulate immediately instead of waiting for the next change.',
			width: 6,
			default: true,
		},
		{
			type: 'checkbox',
			id: 'verbose',
			label: 'Verbose logging',
			tooltip: 'Log every OSC message sent and received. Useful while wiring up JessTimer; noisy in production.',
			width: 6,
			default: false,
		},
	]
}
