#!/usr/bin/env node
/**
 * Generate JessTimer-Page.companionconfig - an importable Companion page that
 * lays out the original 8x4 Stream Deck XL design in one shot.
 *
 * Dragging 30 presets into the right grid slots by hand is tedious and easy to
 * get wrong, and these buttons only make sense as a complete page. Importing a
 * page places every button, in position, already wired to the connection.
 *
 *   node tools/make-page-export.mjs
 *
 * The layout is built from the preset definitions themselves, so the two can
 * never drift apart: fix a colour or an action in presets.js and regenerate.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import crypto from 'node:crypto'

import { getPresetDefinitions } from '../src/presets.js'
import { GRID, LAYOUT } from '../src/layout.js'
import { readFileSync } from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(root, 'JessTimer-Page.companionconfig')

/** Companion uses nanoid-style 21-char ids. Any unique string works on import. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
const uid = () =>
	Array.from(crypto.randomBytes(21))
		.map((b) => ALPHABET[b % ALPHABET.length])
		.join('')

const CONNECTION_ID = uid()

// Read the module id from the manifest rather than hard-coding it. The export
// names the connection type it expects, so if these drift, Companion cannot map
// the imported page onto the module and every button lands unwired.
const manifest = JSON.parse(
	readFileSync(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'companion/manifest.json'), 'utf8'),
)

const presets = getPresetDefinitions()

/** preset style -> control style, filling in the fields Companion writes itself. */
function toControlStyle(style) {
	return {
		text: style.text ?? '',
		textExpression: false,
		size: style.size ?? 'auto',
		png64: style.png64 ?? null,
		alignment: style.alignment ?? 'center:center',
		pngalignment: style.pngalignment ?? 'center:center',
		color: style.color ?? 16777215,
		bgcolor: style.bgcolor ?? 0,
		show_topbar: 'default',
		png: null,
	}
}

function toControl(presetId) {
	const preset = presets[presetId]
	if (!preset) throw new Error(`Layout references unknown preset "${presetId}"`)

	// Preset steps are an array; controls key them by index, and wrap the action
	// sets in an `action_sets` object.
	const steps = {}
	preset.steps.forEach((step, index) => {
		const action_sets = {}
		for (const [setName, set] of Object.entries(step)) {
			if (setName === 'name') continue
			const list = Array.isArray(set) ? set : (set?.actions ?? [])
			action_sets[setName] = list.map((a) => ({
				id: uid(),
				definitionId: a.actionId,
				connectionId: CONNECTION_ID,
				options: a.options ?? {},
				type: 'action',
				upgradeIndex: 0,
			}))
		}
		if (!action_sets.down) action_sets.down = []
		if (!action_sets.up) action_sets.up = []
		steps[String(index)] = { action_sets, options: { runWhileHeld: [] } }
	})

	return {
		type: 'button',
		style: toControlStyle(preset.style),
		options: { stepProgression: 'auto', stepExpression: '', rotaryActions: false },
		feedbacks: (preset.feedbacks ?? []).map((f) => ({
			id: uid(),
			definitionId: f.feedbackId,
			connectionId: CONNECTION_ID,
			options: f.options ?? {},
			type: 'feedback',
			style: f.style ?? {},
			isInverted: f.isInverted ?? false,
			children: {},
		})),
		steps,
		localVariables: [],
	}
}

// ------------------------------------------------------------------- assemble
const controls = {}
for (const entry of LAYOUT) {
	controls[entry.row] ??= {}
	// System controls are emitted as their real Companion types here. A page
	// export can express these; a preset cannot.
	controls[entry.row][entry.col] =
		entry.kind === 'button' ? toControl(`btn_${entry.row}_${entry.col}`) : { type: entry.kind }
}

const page = {
	id: uid(),
	name: 'JessTimer',
	controls,
	gridSize: GRID,
}

/**
 * Emitted as a `full` export containing exactly one page and one connection.
 * Companion's import screen lets you pick a single page out of a full export and
 * drop it onto a target page, and prompts to map the connection - which is
 * precisely the flow we want. A bare `page` export is fussier about its wrapper.
 */
const config = {
	version: 9,
	type: 'full',
	companionBuild: `companion-module-${manifest.id}`,
	pages: { 1: page },
	triggers: {},
	triggerCollections: [],
	custom_variables: {},
	customVariablesCollections: [],
	expressionVariables: {},
	expressionVariablesCollections: [],
	instances: {
		[CONNECTION_ID]: {
			instance_type: manifest.id,
			label: manifest.shortname,
			lastUpgradeIndex: 0,
			updatePolicy: 'manual',
			sortOrder: 0,
		},
	},
	connectionCollections: [],
}

writeFileSync(OUT, JSON.stringify(config, null, '\t'))

const buttons = Object.values(controls).flatMap((r) => Object.values(r))
console.log(`Wrote ${path.relative(root, OUT)}`)
console.log(`  ${buttons.filter((b) => b.type === 'button').length} buttons + ${buttons.filter((b) => b.type !== 'button').length} page nav`)
console.log(`  grid ${page.gridSize.maxColumn + 1}x${page.gridSize.maxRow + 1}`)
console.log(`  connection type: ${manifest.id}`)
