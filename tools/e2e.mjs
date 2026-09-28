#!/usr/bin/env node
/**
 * End-to-end test: the real TimerLink state machine and the real feedback and
 * variable code, over real UDP sockets, against the mock JessTimer.
 * No Companion required.
 *
 *   node tools/e2e.mjs
 *
 * InstanceBase refuses to be constructed outside Companion's IPC harness, which
 * is exactly why the protocol logic lives in TimerLink instead. What is NOT
 * covered here is the thin adapter in instance.js; that is exercised by loading
 * the module in Companion itself.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dgram from 'node:dgram'
import assert from 'node:assert/strict'

import { TimerLink } from '../src/timer-link.js'
import { buildVariableValues } from '../src/variables.js'
import { getFeedbackDefinitions } from '../src/feedbacks.js'
import { encodeMessage } from './osc-encode.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

const MOCK_LISTEN = 18000 // mock receives commands here
const MODULE_LISTEN = 18322 // module receives status here

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
const ok = (m) => console.log(`  ok    ${m}`)
const check = (fn, label) => {
	try {
		fn()
		ok(label)
	} catch (err) {
		failures++
		console.error(`  FAIL  ${label}\n        ${err.message}`)
	}
}
const section = (name) => console.log(`\n${name}`)

// ---------------------------------------------------------------- test rig
const tx = dgram.createSocket('udp4')
const sendCommand = (address, args = []) =>
	new Promise((resolve) => tx.send(encodeMessage(address, args), MOCK_LISTEN, '127.0.0.1', resolve))
const sendInt = (address, value) => sendCommand(address, [{ type: 'i', value }])

let statusHistory = []
let vars = {}

const link = new TimerLink({
	log: () => {},
	send: (address, args) => sendCommand(address, args),
	onStatus: (status) => statusHistory.push(status),
	onChange: ({ variables }) => {
		if (variables) vars = buildVariableValues(link.state)
	},
})

// Feedback callbacks read `self.state`, so hand them a live view of the link.
const feedbacks = () =>
	getFeedbackDefinitions({
		get state() {
			return link.state
		},
	})

console.log('Starting mock JessTimer...')
const mock = spawn(
	process.execPath,
	[path.join(here, 'mock-jesstimer.mjs'), '--listen', String(MOCK_LISTEN), '--send', String(MODULE_LISTEN)],
	{ stdio: ['ignore', 'ignore', 'pipe'] },
)
mock.stderr.on('data', (d) => process.stderr.write(`  [mock] ${d}`))

try {
	await sleep(400)

	link.start({
		listenPort: MODULE_LISTEN,
		offlineTimeout: 800,
		queryOnConnect: true,
		verbose: false,
	})

	// ----------------------------------------------------------------- online
	section('connection')
	await sleep(600)
	check(() => assert.equal(link.state.online, true), 'module detects JessTimer online')
	check(() => assert.equal(vars.online, 'true'), '$(jesstimer:online) is true')
	check(() => assert.ok(statusHistory.includes('ok'), `saw ${statusHistory}`), 'instance status reaches "ok"')

	// --------------------------------------------------------------- duration
	section('set duration')
	await sendInt('/Hours', 0)
	await sendInt('/Minutes', 7)
	await sendInt('/Seconds', 0)
	await sleep(500)
	check(() => assert.equal(vars.minutes, '07'), 'set 7 MIN -> $(jesstimer:minutes) == "07"')
	check(() => assert.equal(vars.time, '00:07:00'), '$(jesstimer:time) == "00:07:00"')
	check(() => assert.equal(vars.time_short, '07:00'), '$(jesstimer:time_short) drops the empty hours')
	check(() => assert.equal(vars.total_seconds, 420), '$(jesstimer:total_seconds) == 420')

	// ----------------------------------------------------------------- adjust
	section('adjust time')
	await sendInt('/MinPlus', 10)
	await sleep(400)
	check(() => assert.equal(vars.minutes, '17'), 'MinPlus 10 -> 17 minutes')

	await sendInt('/MinMinus', -10)
	await sleep(400)
	check(() => assert.equal(vars.minutes, '07'), 'MinMinus -10 -> back to 7 minutes')

	// -------------------------------------------------------------- transport
	section('transport')
	await sendCommand('/Start')
	await sleep(700)
	check(() => assert.equal(link.state.runState, 'running'), 'Start -> run state "running"')
	check(() => assert.ok(Number(vars.total_seconds) < 420), 'countdown is actually decreasing')

	await sendCommand('/Pause')
	await sleep(400)
	check(() => assert.equal(link.state.runState, 'paused'), 'Pause -> run state "paused"')

	// ------------------------------------------------------------------- warp
	section('warp')
	await sendCommand('/WarpUp')
	await sleep(400)
	check(() => assert.equal(vars.warp, '1.1'), 'WarpUp -> $(jesstimer:warp) == "1.1"')

	check(
		() => assert.equal(feedbacks().warp_is.callback({ options: { op: 'ne', value: '1.0' } }), true),
		'warp_is "not 1.0" lights up while warped',
	)

	await sendCommand('/Warp1')
	await sleep(400)
	check(() => assert.equal(vars.warp, '1.0'), 'Warp1 -> warp reset to "1.0"')
	check(
		() => assert.equal(feedbacks().warp_is.callback({ options: { op: 'ne', value: '1.0' } }), false),
		'warp_is goes dark once warp is back to 1.0',
	)

	// The readout feedback is what puts text on the button instead of a
	// $(jesstimer:...) reference, so that a disabled connection shows nothing
	// rather than "$NA" across the artwork.
	section('readout feedback')
	const readout = (field, prefix = '', suffix = '') =>
		feedbacks().readout.callback({ options: { field, prefix, suffix } })

	// Compared against the live variables rather than fixed strings - the clock
	// has been running since the transport section, so any literal would be stale.
	check(() => assert.equal(readout('minutes').text, vars.minutes), 'readout minutes matches $(jesstimer:minutes)')
	check(() => assert.equal(readout('time').text, vars.time), 'readout time matches $(jesstimer:time)')
	check(() => assert.equal(readout('warp').text, '1.0'), 'readout warp -> "1.0"')
	check(() => assert.equal(readout('seconds', '  ').text, `  ${vars.seconds}`), 'prefix padding is preserved')
	check(() => assert.match(readout('time').text, /^\d\d:\d\d:\d\d$/), 'readout time is a full HH:MM:SS')

	// ------------------------------------------------------------- end action
	section('end action')
	await sendInt('/DoAtEnd', 102)
	await sleep(400)
	check(() => assert.equal(link.state.endAction, 'hold'), 'DoAtEnd 102 -> end action "hold"')
	check(
		() => assert.equal(feedbacks().end_action_is.callback({ options: { action: 'hold' } }), true),
		'HOLD button feedback lights up',
	)
	check(
		() => assert.equal(feedbacks().end_action_is.callback({ options: { action: 'flash' } }), false),
		'FLASH button feedback stays dark',
	)

	await sendInt('/DoAtEnd', 103)
	await sleep(400)
	check(
		() => assert.equal(feedbacks().end_action_is.callback({ options: { action: 'flash' } }), true),
		'DoAtEnd 103 -> FLASH feedback lights up',
	)
	check(() => assert.equal(vars.end_action_label, 'Flash at End'), '$(jesstimer:end_action_label) reads back')

	// ---------------------------------------------------------------- countup
	section('count up')
	await sendCommand('/AllowCountUp')
	await sleep(400)
	check(() => assert.equal(link.state.countUp, true), 'AllowCountUp -> countUp true')
	check(() => assert.equal(vars.count_up, 'true'), '$(jesstimer:count_up) is true')
	check(
		() => assert.equal(feedbacks().end_action_is.callback({ options: { action: 'countup' } }), true),
		'CountUp feedback lights up',
	)
	check(
		() => assert.equal(feedbacks().end_action_is.callback({ options: { action: 'flash' } }), false),
		'count-up overrides the FLASH indicator, as JessTimer does internally',
	)

	await sendCommand('/DisallowCountUp')
	await sleep(400)
	check(
		() => assert.equal(feedbacks().count_up_is.callback({ options: { value: 'false' } }), true),
		'DisallowCountUp -> DONT-count-up feedback lights up',
	)
	check(
		() => assert.equal(feedbacks().end_action_is.callback({ options: { action: 'flash' } }), true),
		'FLASH indicator returns once count-up is disallowed',
	)

	// ------------------------------------------------------------- fullscreen
	section('fullscreen')
	await sendInt('/Fullscreen', 0) // 0 == enable, per src/protocol.js
	await sleep(400)
	check(() => assert.equal(link.state.fullscreen, true), 'Fullscreen 0 -> enabled')
	check(
		() => assert.equal(feedbacks().fullscreen_is.callback({ options: { value: 'true' } }), true),
		'fullscreen feedback lights up',
	)

	await sendInt('/Fullscreen', 1)
	await sleep(400)
	check(() => assert.equal(link.state.fullscreen, false), 'Fullscreen 1 -> disabled')

	// -------------------------------------------------------- end time of day
	section('end time of day')
	const now = new Date()
	const targetSeconds = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + 600) % 86400
	await sendInt('/EndTimeOfDay', targetSeconds)
	await sleep(400)
	check(() => assert.ok(Number(vars.total_seconds) > 0), 'EndTimeOfDay sets remaining time')

	// ------------------------------------------------- offline on a hard kill
	section('offline detection (SIGKILL, no graceful shutdown)')
	mock.kill('SIGKILL')
	await sleep(1400)
	check(() => assert.equal(link.state.online, false), 'hard kill detected -> offline')
	check(() => assert.equal(vars.online, 'false'), '$(jesstimer:online) flips to false')
	check(() => assert.equal(vars.hours, ''), 'readout blanks instead of freezing a stale time')
	check(() => assert.equal(feedbacks().online.callback(), false), 'online feedback dark -> readout returns to red')
	check(() => assert.equal(feedbacks().offline.callback(), true), 'offline feedback lights up')
	check(
		() => assert.equal(feedbacks().readout.callback({ options: { field: 'hours', prefix: '  ' } }).text, ''),
		'readout returns empty text, not stale digits or padding',
	)
	check(
		() => assert.equal(feedbacks().warp_is.callback({ options: { op: 'ne', value: '1.0' } }), false),
		'warp_is stays dark while offline instead of firing on a blank reading',
	)
	check(
		() => assert.equal(statusHistory.at(-1), 'disconnected'),
		'instance status reports disconnected to Companion',
	)
} finally {
	link.stop()
	tx.close()
	if (!mock.killed) mock.kill('SIGKILL')
}

console.log('')
if (failures) {
	console.error(`${failures} check(s) failed.`)
	process.exit(1)
}
console.log('All end-to-end checks passed.')
process.exit(0)
