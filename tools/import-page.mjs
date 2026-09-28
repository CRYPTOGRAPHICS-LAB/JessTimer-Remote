#!/usr/bin/env node
/**
 * Import a Companion page and regenerate the module's layout + artwork.
 *
 * The suggested page layout is a real working Companion page, not something
 * hand-maintained in code. Rather than transcribing it by hand every time the
 * design changes - and losing a text size or an alignment in the process - this
 * reads the exported .companionconfig and regenerates:
 *
 *   src/images.js  - base64 PNG backgrounds, keyed "row-col"
 *   src/layout.js  - every button's style, feedbacks and actions, in grid order
 *
 * src/presets.js then renders that data into Companion presets. Redesign the
 * page in Companion, export, re-run this, done.
 *
 *   node tools/import-page.mjs ../export.companionconfig 27
 *
 * Two translations happen on the way in, because a preset cannot express
 * everything a real button can:
 *
 *   1. Internal feedbacks (connectionId "internal") cannot be referenced from a
 *      preset in module API 1.13. The one in use - variable_value comparing
 *      warp - is rewritten to the module's own `warp_is` feedback.
 *   2. Buttons whose text is a module variable are converted to a blank base
 *      text plus a `readout` feedback that supplies the text. This is what stops
 *      "$NA" appearing across the artwork when the connection is disabled.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const [fileArg, pageArg] = process.argv.slice(2)
if (!fileArg || !pageArg) {
	console.error('usage: node tools/import-page.mjs <export.companionconfig> <pageNumber>')
	process.exit(1)
}

const config = JSON.parse(readFileSync(path.resolve(process.cwd(), fileArg), 'utf8'))
const page = config.pages?.[String(pageArg)]
if (!page) {
	console.error(`Page ${pageArg} not found. Available: ${Object.keys(config.pages ?? {}).join(', ')}`)
	process.exit(1)
}

/**
 * Human-readable preset names. Falls back to the button's own text, which is
 * usually descriptive enough, but these read better in the picker.
 */
const NAMES = {
	'0-1': 'Start',
	'0-2': 'Pause',
	'0-3': 'Stop',
	'0-4': 'Re-engage',
	'1-0': 'JessTimer logo / online lamp',
	'1-1': 'Countdown hours',
	'1-2': 'Countdown minutes',
	'1-3': 'Countdown seconds',
	'1-4': 'Warp coefficient (hold to reset to 1.0)',
	'2-1': 'Hours + (tap 1, hold 10)',
	'2-2': 'Minutes + (tap 1, hold 10)',
	'2-3': 'Seconds + (tap 1, hold 10)',
	'2-4': 'Warp up (speed the clock)',
	'2-5': 'Do not count up at END',
	'2-6': 'Count up at END',
	'3-0': 'Fullscreen (tap enable, hold disable)',
	'3-1': 'Hours - (tap 1, hold 10)',
	'3-2': 'Minutes - (tap 1, hold 10)',
	'3-3': 'Seconds - (tap 1, hold 10)',
	'3-4': 'Warp down (slow the clock)',
	'3-5': 'Stop / CLEAR at END',
	'3-6': 'HOLD at END',
	'3-7': 'FLASH at END',
}

/** Module variables that a button may display. Order matters: longest first. */
const READOUT_FIELDS = ['time_short', 'total_seconds', 'state_label', 'time', 'hours', 'minutes', 'seconds', 'warp']

const images = {}
const buttons = []

/** `$(SomeConnectionLabel:hours)` -> { field, prefix, suffix } */
function parseReadout(text) {
	const m = /^(.*)\$\([^:)]+:([a-z_0-9]+)\)(.*)$/s.exec(text ?? '')
	if (!m) return null
	const [, prefix, field, suffix] = m
	if (!READOUT_FIELDS.includes(field)) return null
	return { field, prefix, suffix }
}

function convertStyle(style, key) {
	const out = {}
	for (const prop of ['text', 'size', 'color', 'bgcolor', 'alignment', 'pngalignment']) {
		if (style[prop] !== undefined && style[prop] !== null) out[prop] = style[prop]
	}
	if (style.textExpression) out.textExpression = true
	if (style.png64) {
		images[key] = style.png64
		out.imageKey = key
	}
	return out
}

function convertFeedback(fb) {
	// Internal feedbacks cannot be referenced from a preset. The only one in use
	// compares the warp variable, which the module can answer natively.
	if (fb.connectionId === 'internal') {
		if (fb.definitionId === 'variable_value' && /:warp$/.test(fb.options?.variable ?? '')) {
			return {
				feedbackId: 'warp_is',
				options: { op: fb.options.op ?? 'ne', value: String(fb.options.value ?? '1.0') },
				style: fb.style ?? {},
				isInverted: fb.isInverted ?? false,
			}
		}
		console.warn(`  ! dropping internal feedback "${fb.definitionId}" - presets cannot reference these`)
		return null
	}
	return {
		feedbackId: fb.definitionId,
		options: fb.options ?? {},
		style: fb.style ?? {},
		isInverted: fb.isInverted ?? false,
	}
}

function convertSteps(steps) {
	return Object.keys(steps ?? {})
		.sort((a, b) => Number(a) - Number(b))
		.map((stepKey) => {
			const step = { down: [], up: [] }
			for (const [setName, actions] of Object.entries(steps[stepKey].action_sets ?? {})) {
				if (!Array.isArray(actions) || actions.length === 0) continue
				step[setName] = actions.map((a) => ({ actionId: a.definitionId, options: a.options ?? {} }))
			}
			return step
		})
}

const { minRow, maxRow, minColumn, maxColumn } = page.gridSize
for (let row = minRow; row <= maxRow; row++) {
	for (let col = minColumn; col <= maxColumn; col++) {
		const key = `${row}-${col}`
		const control = page.controls?.[row]?.[col]
		if (!control) continue

		if (control.type !== 'button') {
			buttons.push({ row, col, key, kind: control.type, name: control.type })
			continue
		}

		const style = convertStyle(control.style ?? {}, key)
		const feedbacks = (control.feedbacks ?? []).map(convertFeedback).filter(Boolean)

		// A button showing a module variable gets blank base text plus a feedback
		// that supplies it, so a disabled connection renders nothing rather than
		// painting "$NA" over the artwork.
		const readout = parseReadout(style.text)
		if (readout) {
			style.text = ''
			feedbacks.unshift({
				feedbackId: 'readout',
				options: {
					field: readout.field,
					prefix: readout.prefix,
					suffix: readout.suffix,
				},
				style: {},
				isInverted: false,
			})
		}

		buttons.push({
			row,
			col,
			key,
			kind: 'button',
			name: NAMES[key] || String(control.style?.text ?? '').split('\n')[0].trim() || `Button ${key}`,
			style,
			feedbacks,
			steps: convertSteps(control.steps),
		})
	}
}

// ------------------------------------------------------------------ emit
const banner = (what) =>
	`// Generated by tools/import-page.mjs from a Companion page export (page ${pageArg}).\n` +
	`// Do not hand-edit - redesign the page in Companion, re-export, and re-run the importer.\n` +
	`// ${what}\n\n`

let imagesJs = banner('base64 PNG button backgrounds, keyed "row-col".')
imagesJs += 'export const images = {\n'
for (const [k, v] of Object.entries(images)) imagesJs += `\t${JSON.stringify(k)}: ${JSON.stringify(v)},\n`
imagesJs += '}\n'
writeFileSync(path.join(root, 'src/images.js'), imagesJs)

let layoutJs = banner('The suggested page layout, in grid order.')
layoutJs += `export const GRID = ${JSON.stringify(page.gridSize)}\n\n`
layoutJs += 'export const LAYOUT = [\n'
for (const b of buttons) {
	layoutJs += `\t${JSON.stringify(b)},\n`
}
layoutJs += ']\n'
writeFileSync(path.join(root, 'src/layout.js'), layoutJs)

// ------------------------------------------------------------------ report
const real = buttons.filter((b) => b.kind === 'button')
console.log(`Imported page ${pageArg} ("${page.name}") - ${real.length} buttons, ${buttons.length - real.length} system controls`)
console.log(`  grid ${maxColumn - minColumn + 1}x${maxRow - minRow + 1}`)
console.log(`  ${Object.keys(images).length} button images`)

const readouts = real.filter((b) => b.feedbacks.some((f) => f.feedbackId === 'readout'))
console.log(`  ${readouts.length} readout buttons converted: ${readouts.map((b) => b.key).join(', ')}`)

const used = new Set()
for (const b of real) {
	for (const f of b.feedbacks) used.add(`fb:${f.feedbackId}`)
	for (const s of b.steps) for (const set of Object.values(s)) for (const a of set) used.add(`act:${a.actionId}`)
}
console.log(`  references: ${[...used].sort().join(', ')}`)
