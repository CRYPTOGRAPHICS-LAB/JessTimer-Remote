import { combineRgb } from '@companion-module/base'
import { images } from './images.js'
import { GRID, LAYOUT } from './layout.js'

/**
 * Presets are rendered from src/layout.js, which is generated straight out of a
 * Companion page export by tools/import-page.mjs. Nothing here is transcribed by
 * hand, so text sizes, alignments, colours, artwork, actions and feedbacks are
 * exactly what was on the page.
 *
 * Companion's preset browser is always Connection -> Category -> presets, and
 * `category` is a required field, so the nesting cannot be removed. The category
 * name is used to explain what the group is instead.
 *
 * Presets are listed in grid order and split by row, with the system controls
 * included as placeholders, so all four rows read as a full 8-wide page.
 */
const CATEGORY = 'Suggested Page Layout'

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const OFFLINE_RED = combineRgb(75, 0, 0)
const WARP_GREY = combineRgb(108, 187, 188)
const PLACEHOLDER_BG = combineRgb(28, 28, 28)
const PLACEHOLDER_FG = combineRgb(120, 120, 120)

const COLUMNS = GRID.maxColumn - GRID.minColumn + 1

const ROW_NOTES = {
	0: 'Transport, re-engage, and the first three duration presets.',
	1: 'The countdown readout, warp coefficient, and three more durations.',
	2: 'Add time, warp up, count-up choice, and one more duration.',
	3: 'Fullscreen, subtract time, warp down, and the end actions.',
}

const heading = (name, text) => ({ type: 'text', category: CATEGORY, name, text })

/**
 * Resolve a generated layout entry into a real preset.
 *
 * `imageKey` is swapped for the actual base64 here rather than being inlined in
 * layout.js, so the layout stays readable and the artwork lives in one place.
 */
function toPreset(entry) {
	const { imageKey, ...style } = entry.style
	return {
		type: 'button',
		category: CATEGORY,
		name: `${entry.key}  ${entry.name}`,
		style: {
			size: 'auto',
			color: WHITE,
			bgcolor: BLACK,
			alignment: 'center:center',
			pngalignment: 'center:center',
			...style,
			...(imageKey ? { png64: images[imageKey] } : {}),
		},
		steps: entry.steps.length ? entry.steps : [{ down: [], up: [] }],
		feedbacks: entry.feedbacks,
	}
}

/**
 * Stand-in for a Companion system control.
 *
 * A module cannot ship a preset that creates a page-up or page-down button -
 * those are Companion control types, not module buttons, and a preset always
 * produces a normal button. This placeholder keeps the row eight wide so the
 * layout reads correctly, and says what belongs in the slot. Drag it out and
 * then change the button's type in Companion, or just skip it.
 */
function toPlaceholder(entry) {
	const label = entry.kind === 'pageup' ? 'PAGE\\nUP' : 'PAGE\\nDOWN'
	return {
		type: 'button',
		category: CATEGORY,
		name: `${entry.key}  ${entry.kind} - use Companion's own control here`,
		style: {
			text: label,
			size: '14',
			color: PLACEHOLDER_FG,
			bgcolor: PLACEHOLDER_BG,
			alignment: 'center:center',
			pngalignment: 'center:center',
		},
		steps: [{ down: [], up: [] }],
		feedbacks: [],
	}
}

const act = (actionId, options = {}) => ({ actionId, options })

export function getPresetDefinitions() {
	const presets = {}

	// ----------------------------------------------------- the suggested page
	let currentRow = null
	for (const entry of LAYOUT) {
		if (entry.row !== currentRow) {
			currentRow = entry.row
			presets[`row_${currentRow}`] = heading(
				`Row ${currentRow}`,
				`Row ${currentRow} of ${COLUMNS} columns. ${ROW_NOTES[currentRow] ?? ''}`.trim(),
			)
		}
		presets[`btn_${entry.row}_${entry.col}`] =
			entry.kind === 'button' ? toPreset(entry) : toPlaceholder(entry)
	}

	// ------------------------------------------------------------ extras
	presets.row_extra = heading(
		'Extras',
		'Not on the suggested page. Drop these anywhere, or ignore them entirely.',
	)

	const extra = (id, name, style, steps = [{ down: [], up: [] }], feedbacks = []) => {
		presets[id] = {
			type: 'button',
			category: CATEGORY,
			name: `Extra  ${name}`,
			style: {
				size: 'auto',
				color: WHITE,
				bgcolor: BLACK,
				alignment: 'center:center',
				pngalignment: 'center:center',
				...style,
			},
			steps,
			feedbacks,
		}
	}

	extra(
		'display_time',
		'Whole countdown on one button (HH:MM:SS)',
		{ text: '', size: '18', color: WHITE, bgcolor: OFFLINE_RED },
		[{ down: [], up: [] }],
		[
			{ feedbackId: 'readout', options: { field: 'time', prefix: '', suffix: '' }, style: {} },
			{ feedbackId: 'online', options: {}, style: { bgcolor: BLACK } },
		],
	)

	extra(
		'status',
		'Connection status lamp',
		{ text: 'JESSTIMER\\nOFFLINE', size: '14', color: WHITE, bgcolor: OFFLINE_RED },
		[{ down: [], up: [] }],
		[{ feedbackId: 'online', options: {}, style: { bgcolor: BLACK, color: WHITE, text: 'JESSTIMER\\nONLINE' } }],
	)

	extra(
		'run_state',
		'Run state readout',
		{ text: '', size: '14' },
		[{ down: [], up: [] }],
		[
			{ feedbackId: 'readout', options: { field: 'state_label', prefix: '', suffix: '' }, style: {} },
			{
				feedbackId: 'run_state_is',
				options: { state: 'running' },
				style: { bgcolor: combineRgb(0, 153, 0) },
			},
		],
	)

	extra('warp_reset', 'Warp reset to 1.0', { text: 'WARP\\n1.0', size: '14', color: WARP_GREY }, [
		{ down: [act('warp_reset')], up: [] },
	])

	extra(
		'fullscreen_toggle',
		'Fullscreen toggle',
		{ text: 'FULL\\nSCREEN', size: '14', color: BLACK, bgcolor: combineRgb(225, 145, 152) },
		[{ down: [act('set_fullscreen', { mode: 'toggle' })], up: [] }],
		[
			{
				feedbackId: 'fullscreen_is',
				options: { value: 'true' },
				style: { color: BLACK, bgcolor: combineRgb(0, 204, 0) },
			},
		],
	)

	extra('query', 'Resync (query JessTimer state)', {
		text: 'RESYNC',
		size: '14',
		color: WHITE,
		bgcolor: combineRgb(0, 0, 100),
	}, [{ down: [act('query_state')], up: [] }])

	extra(
		'end_time_of_day',
		'Set end time of day (24hr, e.g. 08:30)',
		{ text: 'END AT\\n08:30', size: '14', color: WHITE, bgcolor: BLACK },
		[{ down: [act('set_end_time_of_day', { time: '08:30' })], up: [] }],
	)

	return presets
}
