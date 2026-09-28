#!/usr/bin/env node
/**
 * Pre-flight checks. Run with `npm run check` before loading in Companion.
 *
 * Catches the failures that are otherwise silent or cryptic inside Companion:
 * a manifest the schema rejects, a preset pointing at an action that does not
 * exist, a feedback option that no definition declares, or an OSC decoder that
 * mis-parses its own encoder's output.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'

import { getPresetDefinitions } from '../src/presets.js'
import { getVariableDefinitions } from '../src/variables.js'
import { getActionDefinitions, parseTimeToSeconds } from '../src/actions.js'
import { getFeedbackDefinitions } from '../src/feedbacks.js'
import { decodePacket } from '../src/osc-decode.js'
import { encodeMessage } from './osc-encode.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const ok = (msg) => console.log(`  ok    ${msg}`)
const fail = (msg) => {
	failures++
	console.error(`  FAIL  ${msg}`)
}

async function group(name, fn) {
	console.log(`\n${name}`)
	try {
		await fn()
	} catch (err) {
		fail(err.message)
	}
}

// A stand-in for the instance, enough for the definition factories to run.
const stub = {
	state: {
		online: true,
		countUp: false,
		fullscreen: false,
		endAction: 'clear',
		runState: 'stopped',
	},
	log: () => {},
	sendOsc: () => {},
	sendBlank: () => {},
	sendInt: () => {},
	parseNumber: async () => 0,
}

const actions = getActionDefinitions(stub)
const feedbacks = getFeedbackDefinitions(stub)
const presets = getPresetDefinitions()
const variables = getVariableDefinitions()

// ---------------------------------------------------------------- manifest
await group('manifest', () => {
	const manifest = JSON.parse(readFileSync(path.join(root, 'companion/manifest.json'), 'utf8'))
	const schemaPath = path.join(root, 'node_modules/@companion-module/base/assets/manifest.schema.json')

	for (const key of ['id', 'name', 'shortname', 'description', 'version', 'license', 'runtime', 'products']) {
		if (manifest[key] === undefined) fail(`manifest missing required key "${key}"`)
	}

	if (!/^[a-z0-9-]+$/.test(manifest.id)) fail(`manifest id "${manifest.id}" must be lowercase alphanumeric/dash`)
	else ok(`id "${manifest.id}"`)

	if (manifest.runtime?.entrypoint !== '../src/index.js') fail('entrypoint should be ../src/index.js')
	else ok('entrypoint')

	if (manifest.repository?.includes('CHANGEME')) {
		console.log('  note  repository still says CHANGEME - fine locally, must be set before publishing')
	}

	try {
		const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
		const missing = (schema.required ?? []).filter((k) => manifest[k] === undefined)
		if (missing.length) fail(`schema requires: ${missing.join(', ')}`)
		else ok('all schema-required keys present')
	} catch {
		console.log('  note  schema not found (run npm install first) - skipped deep validation')
	}
})

// ------------------------------------------------------------------ presets
await group('presets', () => {
	const actionIds = new Set(Object.keys(actions))
	const feedbackIds = new Set(Object.keys(feedbacks))
	const variableIds = new Set(variables.map((v) => v.variableId))

	let buttons = 0
	let actionRefs = 0
	let feedbackRefs = 0

	for (const [id, preset] of Object.entries(presets)) {
		if (preset.type !== 'button') continue
		buttons++

		assert.ok(preset.category, `${id}: missing category`)
		assert.ok(preset.name, `${id}: missing name`)
		assert.ok(preset.style, `${id}: missing style`)
		assert.ok(Array.isArray(preset.steps), `${id}: steps must be an array`)
		assert.ok(Array.isArray(preset.feedbacks), `${id}: feedbacks must be an array`)

		for (const step of preset.steps) {
			for (const [setName, set] of Object.entries(step)) {
				if (setName === 'name') continue
				const list = Array.isArray(set) ? set : set?.actions
				if (!Array.isArray(list)) continue
				for (const a of list) {
					actionRefs++
					if (!actionIds.has(a.actionId)) fail(`${id}: unknown action "${a.actionId}"`)
				}
			}
		}

		for (const f of preset.feedbacks) {
			feedbackRefs++
			if (!feedbackIds.has(f.feedbackId)) fail(`${id}: unknown feedback "${f.feedbackId}"`)
		}

		// Every $(jesstimer:x) in button text must be a variable we actually define.
		for (const m of String(preset.style.text ?? '').matchAll(/\$\(jesstimer:([a-z_0-9]+)\)/g)) {
			if (!variableIds.has(m[1])) fail(`${id}: references undefined variable "${m[1]}"`)
		}
	}

	ok(`${buttons} presets, ${actionRefs} action refs, ${feedbackRefs} feedback refs`)
})

// ---------------------------------------------------------- feedback options
await group('feedback option defaults', () => {
	for (const [id, def] of Object.entries(feedbacks)) {
		const declared = new Set((def.options ?? []).map((o) => o.id))
		for (const [presetId, preset] of Object.entries(presets)) {
			for (const f of preset.feedbacks ?? []) {
				if (f.feedbackId !== id) continue
				for (const key of Object.keys(f.options ?? {})) {
					if (!declared.has(key)) fail(`${presetId}: feedback "${id}" has no option "${key}"`)
				}
			}
		}
	}
	ok(`${Object.keys(feedbacks).length} feedback definitions consistent with preset usage`)
})

// ------------------------------------------------------------- action options
await group('action option defaults', () => {
	for (const [id, def] of Object.entries(actions)) {
		const declared = new Set((def.options ?? []).map((o) => o.id))
		for (const [presetId, preset] of Object.entries(presets)) {
			for (const step of preset.steps ?? []) {
				for (const [setName, set] of Object.entries(step)) {
					if (setName === 'name') continue
					const list = Array.isArray(set) ? set : set?.actions
					for (const a of list ?? []) {
						if (a.actionId !== id) continue
						for (const key of Object.keys(a.options ?? {})) {
							if (!declared.has(key)) fail(`${presetId}: action "${id}" has no option "${key}"`)
						}
					}
				}
			}
		}
	}
	ok(`${Object.keys(actions).length} action definitions consistent with preset usage`)
})

// ------------------------------------------------------------ config defaults
// A wrong default here is invisible in every automated test and only shows up
// when a user adds a fresh connection and nothing talks to anything.
await group('config defaults', async () => {
	const { getConfigFields } = await import('../src/config.js')
	const fields = Object.fromEntries(getConfigFields().map((f) => [f.id, f]))

	const expect = (id, value) => {
		if (fields[id] === undefined) fail(`config field "${id}" is missing`)
		else if (fields[id].default !== value) fail(`config "${id}" defaults to ${fields[id].default}, expected ${value}`)
	}

	expect('host', '127.0.0.1')
	expect('port', 9999) // JessTimer's hard-coded OSC server port
	expect('listenPort', 12322) // must not be 12321 - Companion owns that
	expect('offlineTimeout', 2000)
	expect('queryOnConnect', true)

	if (fields.listenPort?.default === 12321) fail('listen port 12321 collides with Companion\'s own OSC listener')

	ok('host/port/listenPort/timeout defaults are correct for JessTimer')
})

// ------------------------------------------------------------- action output
// Pins down exactly what leaves the module for each action. JessTimer's OSC
// endpoints require that only one of /HrsPlus, /MinPlus, /SecPlus is addressed
// per press, so "exactly one message, no companions" is a correctness property
// worth locking down rather than eyeballing.
await group('action wire output', async () => {
	const recorder = {
		state: { countUp: false, fullscreen: false },
		log: () => {},
		sent: [],
		sendOsc(path, args = []) {
			this.sent.push(`${path} ${args.map((a) => `${a.type}:${a.value}`).join(' ')}`.trim())
		},
		sendBlank(path) {
			this.sendOsc(path, [])
		},
		sendInt(path, value) {
			this.sendOsc(path, [{ type: 'i', value: Math.round(value) }])
		},
		async parseNumber(raw) {
			return Number(String(raw).trim())
		},
	}
	const context = { parseVariablesInString: async (s) => s }
	const defs = getActionDefinitions(recorder)

	const expect = async (actionId, options, wanted) => {
		recorder.sent = []
		await defs[actionId].callback({ actionId, options }, context)
		const got = recorder.sent
		if (JSON.stringify(got) !== JSON.stringify(wanted)) {
			fail(`${actionId} ${JSON.stringify(options)}\n        sent     ${JSON.stringify(got)}\n        expected ${JSON.stringify(wanted)}`)
		}
	}

	await expect('start', {}, ['/Start'])
	await expect('repeat', {}, ['/Repeat'])

	// The six adjust permutations: one message each, correct sign, nothing else.
	await expect('adjust_time', { unit: 'hours', direction: 'up', amount: '1' }, ['/HrsPlus i:1'])
	await expect('adjust_time', { unit: 'minutes', direction: 'up', amount: '1' }, ['/MinPlus i:1'])
	await expect('adjust_time', { unit: 'seconds', direction: 'up', amount: '1' }, ['/SecPlus i:1'])
	await expect('adjust_time', { unit: 'hours', direction: 'down', amount: '10' }, ['/HrsMinus i:-10'])
	await expect('adjust_time', { unit: 'minutes', direction: 'down', amount: '10' }, ['/MinMinus i:-10'])
	await expect('adjust_time', { unit: 'seconds', direction: 'down', amount: '10' }, ['/SecMinus i:-10'])

	await expect('set_time', { hours: '0', minutes: '7', seconds: '0' }, [
		'/Hours i:0',
		'/Minutes i:7',
		'/Seconds i:0',
	])

	await expect('set_end_time_of_day', { time: '08:30' }, ['/EndTimeOfDay i:30600'])
	await expect('set_end_time_of_day', { time: '14:00' }, ['/EndTimeOfDay i:50400'])
	await expect('set_end_time_of_day', { time: '20:00' }, ['/EndTimeOfDay i:72000'])
	await expect('set_end_time_of_day', { time: '72000' }, ['/EndTimeOfDay i:72000'])

	await expect('set_end_action', { action: 'countup' }, ['/AllowCountUp', '/DoAtEnd i:104'])
	await expect('set_end_action', { action: 'flash' }, ['/DisallowCountUp', '/DoAtEnd i:103'])
	await expect('set_fullscreen', { mode: 'enable' }, ['/Fullscreen i:0'])
	await expect('set_fullscreen', { mode: 'disable' }, ['/Fullscreen i:1'])

	ok('every action emits exactly its expected messages, and nothing else')
})

// ------------------------------------------------------- time parsing math
await group('24hr time parsing math', () => {
	const cases = [
		['08:30', 30600],
		['8:30', 30600],
		['00:00', 0],
		['0:00', 0],
		['12:00', 43200],
		['14:15', 51300],
		['20:00', 72000],
		['23:59', 86340],
		['23:59:59', 86399],
		['08:30:15', 30615],
		['0830', 30600],
		['1400', 50400],
		['8:30 AM', 30600],
		['8:30 PM', 73800],
		['30600', 30600],
		[30600, 30600],
		['72000', 72000],
		[72000, 72000],
		['72000s', 72000],
		['72000 sec', 72000],
		['72000 seconds', 72000],
	]

	for (const [input, expected] of cases) {
		const result = parseTimeToSeconds(input)
		assert.equal(result, expected, `parseTimeToSeconds("${input}") expected ${expected}, got ${result}`)
	}

	const invalidCases = ['invalid', '25:00', '12:60', '12:00:60', '-5:00', '8:30 XM', '', null, undefined]
	for (const input of invalidCases) {
		const result = parseTimeToSeconds(input)
		assert.equal(result, null, `parseTimeToSeconds("${input}") should return null, got ${result}`)
	}

	ok('24hr time parsing math correctly handles valid formats and rejects invalid inputs')
})

// ----------------------------------------------------------------- osc codec
await group('osc round-trip', () => {
	const cases = [
		['/Start', []],
		['/Hours', [{ type: 'i', value: 0 }]],
		['/EndTimeOfDay', [{ type: 'i', value: 30600 }]],
		['/DoAtEnd', [{ type: 'i', value: 104 }]],
		['/HrsMinus', [{ type: 'i', value: -10 }]],
		['/jesstimer/hours', [{ type: 's', value: '07' }]],
		['/jesstimer/time', [
			{ type: 's', value: '01' },
			{ type: 's', value: '23' },
			{ type: 's', value: '45' },
		]],
		['/jesstimer/warp', [{ type: 'f', value: 1.5 }]],
		['/jesstimer/state', [{ type: 's', value: 'running' }]],
	]

	for (const [address, args] of cases) {
		const [decoded] = decodePacket(encodeMessage(address, args))
		assert.ok(decoded, `${address}: failed to decode`)
		assert.equal(decoded.address, address, `${address}: address mismatch`)
		assert.equal(decoded.args.length, args.length, `${address}: arg count mismatch`)
		for (let i = 0; i < args.length; i++) {
			const expected = args[i].value
			const actual = decoded.args[i].value
			if (typeof expected === 'number' && !Number.isInteger(expected)) {
				assert.ok(Math.abs(actual - expected) < 1e-5, `${address}: float mismatch`)
			} else {
				assert.equal(actual, expected, `${address}: value mismatch at arg ${i}`)
			}
		}
	}
	ok(`${cases.length} messages round-tripped`)

	// Junk must not throw, and must not produce phantom messages.
	assert.deepEqual(decodePacket(Buffer.from([1, 2, 3])), [], 'short junk should decode to nothing')
	assert.deepEqual(decodePacket(Buffer.from('not-an-osc-packet-at-all')), [], 'junk should decode to nothing')
	ok('malformed packets rejected without throwing')

	// Bundles get flattened.
	const m1 = encodeMessage('/jesstimer/hours', [{ type: 's', value: '00' }])
	const m2 = encodeMessage('/jesstimer/minutes', [{ type: 's', value: '30' }])
	const sizeOf = (b) => {
		const s = Buffer.alloc(4)
		s.writeInt32BE(b.length)
		return s
	}
	const bundle = Buffer.concat([
		Buffer.from('#bundle\0', 'ascii'),
		Buffer.alloc(8),
		sizeOf(m1), m1,
		sizeOf(m2), m2,
	])
	const flattened = decodePacket(bundle)
	assert.equal(flattened.length, 2, 'bundle should flatten to two messages')
	assert.equal(flattened[1].address, '/jesstimer/minutes')
	ok('bundles flattened')
})

// --------------------------------------------------------------------- images
await group('button images', async () => {
	const { images } = await import('../src/images.js')
	const keys = Object.keys(images)
	for (const [key, data] of Object.entries(images)) {
		if (!/^[0-9]+-[0-9]+$/.test(key)) fail(`image key "${key}" is not row-col`)
		if (!data.startsWith('data:image/png;base64,') && !/^[A-Za-z0-9+/=]+$/.test(data)) {
			fail(`image "${key}" does not look like base64 png data`)
		}
	}
	ok(`${keys.length} button images: ${keys.join(', ')}`)
})

// ---------------------------------------------------------------------- done
console.log('')
if (failures) {
	console.error(`${failures} check(s) failed.`)
	process.exit(1)
}
console.log('All checks passed.')
