#!/usr/bin/env node
/**
 * Mock JessTimer.
 *
 * Impersonates the Unreal side of the protocol so the Companion module can be
 * tested end-to-end before a single line of Blueprint is touched. It listens for
 * commands, prints them, maintains a real countdown, and streams status back at
 * 5 Hz using the addresses in PROTOCOL.md §2.
 *
 *   node tools/mock-jesstimer.mjs --listen 8000 --send 12322 --host 127.0.0.1
 *
 * Point the module's Target Port at --listen and its Listen Port at --send.
 */

import dgram from 'node:dgram'
import { encodeMessage } from './osc-encode.mjs'
import { decodePacket } from '../src/osc-decode.js'

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
	const i = argv.indexOf(`--${name}`)
	return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}

const LISTEN_PORT = Number(arg('listen', 8000))
const SEND_PORT = Number(arg('send', 12322))
const HOST = arg('host', '127.0.0.1')
const TICK_MS = 200

// -------------------------------------------------------------------- state
const state = {
	remaining: 600, // seconds
	warp: 1.0,
	running: false,
	expired: false,
	endAction: 1, // 1 clear, 2 hold, 3 flash
	countUp: 0,
	fullscreen: 0,
}

let lastSentState = null

const tx = dgram.createSocket('udp4')
const rx = dgram.createSocket({ type: 'udp4', reuseAddr: true })

function send(address, args = []) {
	tx.send(encodeMessage(address, args), SEND_PORT, HOST)
}

function two(n) {
	return String(Math.floor(Math.abs(n))).padStart(2, '0')
}

function sendTime() {
	const total = Math.max(0, Math.floor(Math.abs(state.remaining)))
	send('/jesstimer/hours', [{ type: 's', value: two(total / 3600) }])
	send('/jesstimer/minutes', [{ type: 's', value: two((total % 3600) / 60) }])
	send('/jesstimer/seconds', [{ type: 's', value: two(total % 60) }])
}

function runState() {
	if (state.expired) return 'expired'
	if (state.running) return 'running'
	return state.remaining > 0 && lastSentState !== null ? 'paused' : 'stopped'
}

function sendFullState() {
	sendTime()
	send('/jesstimer/warp', [{ type: 's', value: state.warp.toFixed(1) }])
	send('/jesstimer/state', [{ type: 's', value: runState() }])
	send('/jesstimer/endaction', [{ type: 'i', value: state.endAction }])
	send('/jesstimer/countup', [{ type: 'i', value: state.countUp }])
	send('/jesstimer/fullscreen', [{ type: 'i', value: state.fullscreen }])
	lastSentState = runState()
}

// ------------------------------------------------------------------ command
function onCommand(address, args) {
	const v = args[0]?.value
	console.log(`  <- ${address}${args.length ? ' ' + args.map((a) => a.value).join(' ') : ''}`)

	switch (address) {
		case '/Start':
			state.running = true
			state.expired = false
			break
		case '/Pause':
			state.running = false
			break
		case '/Stop':
			state.running = false
			state.expired = false
			state.remaining = 0
			break
		case '/Repeat':
			state.running = true
			state.expired = false
			break

		case '/Hours':
			state.remaining = state.remaining % 3600 + Number(v) * 3600
			break
		case '/Minutes':
			state.remaining = Math.floor(state.remaining / 3600) * 3600 + (state.remaining % 60) + Number(v) * 60
			break
		case '/Seconds':
			state.remaining = Math.floor(state.remaining / 60) * 60 + Number(v)
			break
		case '/EndTimeOfDay': {
			const targetSec = Number(v)
			const now = new Date()
			const currentSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
			let diff = targetSec - currentSec
			if (diff <= 0) diff += 86400
			state.remaining = diff
			break
		}

		case '/HrsPlus':
		case '/HrsMinus':
			state.remaining = Math.max(0, state.remaining + Number(v) * 3600)
			break
		case '/MinPlus':
		case '/MinMinus':
			state.remaining = Math.max(0, state.remaining + Number(v) * 60)
			break
		case '/SecPlus':
		case '/SecMinus':
			state.remaining = Math.max(0, state.remaining + Number(v))
			break

		case '/WarpUp':
			state.warp = Math.min(10, Math.round((state.warp + 0.1) * 10) / 10)
			break
		case '/WarpDown':
			state.warp = Math.max(0.1, Math.round((state.warp - 0.1) * 10) / 10)
			break
		case '/Warp1':
			state.warp = 1.0
			break

		case '/DoAtEnd':
			if (Number(v) === 104) state.countUp = 1
			else state.endAction = Number(v) - 100
			break
		case '/AllowCountUp':
			state.countUp = 1
			break
		case '/DisallowCountUp':
			state.countUp = 0
			break

		case '/Fullscreen':
			// Matches src/protocol.js: 0 enables, 1 disables. Flip both together.
			state.fullscreen = Number(v) === 0 ? 1 : 0
			break

		case '/Query':
			console.log('  -> full state dump')
			sendFullState()
			return

		default:
			console.log(`  !! unrecognised command ${address}`)
			return
	}

	sendFullState()
}

// --------------------------------------------------------------------- loop
rx.on('message', (msg) => {
	for (const { address, args } of decodePacket(msg)) onCommand(address, args)
})

rx.on('error', (err) => {
	console.error(`Listen error on ${LISTEN_PORT}: ${err.message}`)
	process.exit(1)
})

rx.bind(LISTEN_PORT, () => {
	console.log(`Mock JessTimer`)
	console.log(`  commands in : UDP ${LISTEN_PORT}   <- set module "Target Port" to this`)
	console.log(`  status out  : ${HOST}:${SEND_PORT}  <- set module "Listen Port" to this`)
	console.log(`  Ctrl+C to stop.\n`)
	sendFullState()
})

setInterval(() => {
	if (state.running) {
		state.remaining -= (TICK_MS / 1000) * state.warp
		if (state.remaining <= 0) {
			state.remaining = 0
			state.expired = true
			if (state.endAction === 1) state.running = false
			if (!state.countUp && state.endAction !== 3) state.running = false
		}
	}
	// Unconditional 5 Hz send: this is what doubles as the liveness heartbeat.
	sendTime()

	const now = runState()
	if (now !== lastSentState) {
		send('/jesstimer/state', [{ type: 's', value: now }])
		lastSentState = now
	}
}, TICK_MS)

for (const sig of ['SIGINT', 'SIGTERM']) {
	process.on(sig, () => {
		console.log('\nMock JessTimer stopping - the module should go offline within its timeout.')
		process.exit(0)
	})
}
