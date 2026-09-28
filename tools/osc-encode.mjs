/** Minimal OSC 1.0 encoder — used by the mock and the test harness only. */

function padded(str) {
	const buf = Buffer.from(str, 'utf8')
	const len = (buf.length + 4) & ~3 // always at least one null, then pad to 4
	const out = Buffer.alloc(len)
	buf.copy(out)
	return out
}

/**
 * @param {string} address
 * @param {Array<{type: 'i'|'f'|'s', value: any}>} args
 * @returns {Buffer}
 */
export function encodeMessage(address, args = []) {
	const parts = [padded(address)]
	let tags = ','
	const bodies = []

	for (const arg of args) {
		tags += arg.type
		if (arg.type === 'i') {
			const b = Buffer.alloc(4)
			b.writeInt32BE(Math.round(arg.value) | 0)
			bodies.push(b)
		} else if (arg.type === 'f') {
			const b = Buffer.alloc(4)
			b.writeFloatBE(Number(arg.value))
			bodies.push(b)
		} else if (arg.type === 's') {
			bodies.push(padded(String(arg.value)))
		} else {
			throw new Error(`encodeMessage: unsupported type "${arg.type}"`)
		}
	}

	parts.push(padded(tags), ...bodies)
	return Buffer.concat(parts)
}
