/**
 * Minimal, dependency-free OSC 1.0 decoder.
 *
 * Companion's module base already provides oscSend() for the outbound
 * direction, so the module only needs to *decode*. Rolling ~100 lines here
 * avoids pulling in the `osc` package, which drags optional serialport native
 * bindings behind it and is a recurring source of install pain inside
 * Companion's module sandbox.
 *
 * Supports: messages, bundles (including nested), and the argument types
 * i f s b h d t c r m T F N I. Unknown type tags abort the message rather
 * than silently misaligning the read offset.
 */

/** Round up to the next multiple of 4, per the OSC padding rule. */
function pad4(n) {
	return (n + 3) & ~3
}

/**
 * Read a null-terminated, 4-byte-aligned OSC string.
 * @returns {{ value: string, next: number } | null}
 */
function readString(buf, offset) {
	let end = offset
	while (end < buf.length && buf[end] !== 0) end++
	if (end >= buf.length) return null // unterminated
	const value = buf.toString('utf8', offset, end)
	const next = offset + pad4(end - offset + 1)
	if (next > buf.length) return null
	return { value, next }
}

/**
 * Decode a single OSC message body (address already known to start at offset 0).
 * @returns {{ address: string, args: Array<{type: string, value: any}> } | null}
 */
function decodeMessage(buf) {
	const addr = readString(buf, 0)
	if (!addr || !addr.value.startsWith('/')) return null

	const args = []
	let offset = addr.next

	// A message with no type tag string is legal (if archaic) — treat as no args.
	if (offset >= buf.length) return { address: addr.value, args }

	const tags = readString(buf, offset)
	if (!tags || !tags.value.startsWith(',')) return { address: addr.value, args }
	offset = tags.next

	for (const tag of tags.value.slice(1)) {
		switch (tag) {
			case 'i':
			case 'r':
			case 'm':
			case 'c': {
				if (offset + 4 > buf.length) return null
				const value = tag === 'i' ? buf.readInt32BE(offset) : buf.readUInt32BE(offset)
				args.push({ type: tag, value })
				offset += 4
				break
			}
			case 'f': {
				if (offset + 4 > buf.length) return null
				args.push({ type: 'f', value: buf.readFloatBE(offset) })
				offset += 4
				break
			}
			case 'h':
			case 't': {
				if (offset + 8 > buf.length) return null
				args.push({ type: tag, value: Number(buf.readBigInt64BE(offset)) })
				offset += 8
				break
			}
			case 'd': {
				if (offset + 8 > buf.length) return null
				args.push({ type: 'd', value: buf.readDoubleBE(offset) })
				offset += 8
				break
			}
			case 's':
			case 'S': {
				const str = readString(buf, offset)
				if (!str) return null
				args.push({ type: 's', value: str.value })
				offset = str.next
				break
			}
			case 'b': {
				if (offset + 4 > buf.length) return null
				const size = buf.readInt32BE(offset)
				offset += 4
				if (size < 0 || offset + size > buf.length) return null
				args.push({ type: 'b', value: buf.subarray(offset, offset + size) })
				offset += pad4(size)
				break
			}
			case 'T':
				args.push({ type: 'T', value: true })
				break
			case 'F':
				args.push({ type: 'F', value: false })
				break
			case 'N':
				args.push({ type: 'N', value: null })
				break
			case 'I':
				args.push({ type: 'I', value: Infinity })
				break
			default:
				// Unknown tag: the remaining offsets can no longer be trusted.
				return null
		}
	}

	return { address: addr.value, args }
}

/**
 * Decode a UDP datagram into a flat list of OSC messages.
 * Bundles are flattened; timetags are ignored (JessTimer sends live state, so
 * scheduling a bundle for later delivery would be meaningless here).
 *
 * @param {Buffer} buf
 * @returns {Array<{ address: string, args: Array<{type: string, value: any}> }>}
 */
export function decodePacket(buf) {
	if (!Buffer.isBuffer(buf) || buf.length < 4) return []

	if (buf.length >= 16 && buf.toString('ascii', 0, 8) === '#bundle\0') {
		const out = []
		let offset = 16 // 8 bytes '#bundle\0' + 8 bytes timetag
		while (offset + 4 <= buf.length) {
			const size = buf.readInt32BE(offset)
			offset += 4
			if (size <= 0 || offset + size > buf.length) break
			out.push(...decodePacket(buf.subarray(offset, offset + size)))
			offset += size
		}
		return out
	}

	const msg = decodeMessage(buf)
	return msg ? [msg] : []
}
