#!/usr/bin/env node
/**
 * Watch what JessTimer sends.
 *
 * The mirror image of mock-jesstimer.mjs: instead of impersonating JessTimer,
 * this impersonates the Companion module. It binds the listen port, decodes
 * everything that arrives, and tells you whether the module would understand it.
 *
 * Use this while making the Unreal changes. It takes Companion out of the loop
 * entirely, so when something does not light up you know immediately whether the
 * problem is JessTimer's send or the module's handling of it.
 *
 *   node tools/listen.mjs
 *   node tools/listen.mjs --port 12322
 *   node tools/listen.mjs --query 192.168.1.50:9999
 *
 * With --query it fires /Query at JessTimer on startup, and on demand when you
 * press Enter, so you can test the query responder from Change 5.
 */

import dgram from 'node:dgram'
import { decodePacket } from '../src/osc-decode.js'
import { encodeMessage } from './osc-encode.mjs'
import { STATUS } from '../src/protocol.js'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
	const i = argv.indexOf(`--${name}`)
	return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}

const PORT = Number(arg('port', 12322))
const QUERY = arg('query', null)

/** Addresses the module acts on. Anything else is reported as ignored. */
const KNOWN = new Set(Object.values(STATUS))

/**
 * The countdown arrives 5x a second across three rotating addresses, so plain
 * consecutive-line dedup never fires and real events drown. Instead, remember
 * the last value per address and only print when it actually changes.
 */
const TICKING = new Set([STATUS.HOURS, STATUS.MINUTES, STATUS.SECONDS, STATUS.TIME, STATUS.HEARTBEAT])

const seen = new Map()
const lastValue = new Map()
let total = 0
let suppressed = 0

const rx = dgram.createSocket({ type: 'udp4', reuseAddr: true })

rx.on('error', (err) => {
	console.error(`\nCannot listen on ${PORT}: ${err.message}`)
	if (err.code === 'EADDRINUSE') {
		console.error('Something else already has that port. If Companion is running with')
		console.error('the JessTimer module active, it owns this port - stop the connection first.')
	}
	process.exit(1)
})

rx.on('message', (msg, rinfo) => {
	for (const { address, args } of decodePacket(msg)) {
		total++
		seen.set(address, (seen.get(address) ?? 0) + 1)

		const known = KNOWN.has(address)
		const types = args.map((a) => a.type).join('')
		const values = args.map((a) => JSON.stringify(a.value)).join(' ')
		if (TICKING.has(address) && lastValue.get(address) === values) {
			suppressed++
			continue
		}
		lastValue.set(address, values)

		const stamp = new Date().toTimeString().slice(0, 8)
		console.log(`${stamp} ${known ? ' ' : '?'} ${address}  ,${types}  ${values}`)

		if (!known) {
			console.log(`         ^ the module ignores this address - check the spelling against PROTOCOL.md`)
		}
	}
	rx.lastFrom = `${rinfo.address}:${rinfo.port}`
})

rx.bind(PORT, () => {
	console.log(`Listening on UDP ${PORT} as if I were the Companion module.`)
	console.log(`Lines marked "?" are addresses the module does not recognise.\n`)
	if (QUERY) sendQuery()
})

function sendQuery() {
	const [host, port] = QUERY.split(':')
	const tx = dgram.createSocket('udp4')
	tx.send(encodeMessage('/Query', []), Number(port ?? 9999), host, () => {
		console.log(`  -> sent /Query to ${host}:${port ?? 9999}`)
		tx.close()
	})
}

if (QUERY) {
	console.log('Press Enter to send /Query again.\n')
	process.stdin.on('data', sendQuery)
}

for (const sig of ['SIGINT', 'SIGTERM']) {
	process.on(sig, () => {
		console.log(`\n${total} messages from ${rx.lastFrom ?? 'nobody'} (${suppressed} unchanged ticks hidden):`)
		const expected = [...KNOWN].filter((a) => a !== STATUS.HEARTBEAT && a !== STATUS.TIME)
		for (const [address, count] of [...seen].sort()) {
			console.log(`  ${KNOWN.has(address) ? 'ok  ' : 'IGN '} ${address}  x${count}`)
		}
		const missing = expected.filter((a) => !seen.has(a))
		if (missing.length && seen.size) {
			console.log(`\nNever seen (fine if you have not implemented them yet):`)
			for (const a of missing) console.log(`  --   ${a}`)
		}
		process.exit(0)
	})
}
