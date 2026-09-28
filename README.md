# companion-module-jesstimer (v2.0.0)

A Bitfocus Companion module for **JessTimer**, a stage timer built in Unreal
Engine 5.5.4.

> **Compatibility Notice:** Module version 2.0.0+ only works with **JessTimer 4 or later**.

Replaces the hand-built Generic-OSC page: drag presets onto an empty page and
you have a working, bi-directional timer surface with no custom variables to
create and no grid positions to hard-code.

- **Commands out** — transport, absolute and relative time, end time of day (24h or raw seconds), warp, end action,
  count-up, fullscreen
- **Status in** — countdown, warp coefficient, run state, end action, count-up,
  fullscreen, plus online/offline derived from a message watchdog
- **Presets** — the original 8×4 Stream Deck XL page, artwork included, plus extras

## Requirements

- **JessTimer 4 or later** (for modern bi-directional OSC protocol and `/EndTimeOfDay` endpoint)
- Bitfocus Companion 4.1 or newer
- Node 22 (bundled with Companion; only needed separately for the dev tools)

## Install as a development module

1. Clone or copy this folder somewhere outside Companion's own directories.
2. `npm install`
3. In Companion: **Settings → Developer modules path**, point it at the *parent*
   folder containing `companion-module-jesstimer`, then restart Companion.
4. **Connections → Add connection → JessTimer**.

Companion hot-reloads a developer module when its files change, so edit and
watch the log rather than restarting each time.

## Configure

| Field | Notes |
|---|---|
| Target Host / Target Port | Where JessTimer's OSC server listens |
| Listen Port | Where this module listens for status. Default **12322**. Must not be 12321 — Companion owns that one. |
| Offline Timeout | Silence before JessTimer is declared offline. Default 2000 ms. |

## The JessTimer side

See **[PROTOCOL.md](PROTOCOL.md)**. Short version:

- Commands into JessTimer are **unchanged** — the module speaks the existing
  `/Start`, `/Hours`, `/DoAtEnd` vocabulary verbatim.
- Status out of JessTimer moves from Companion's port 12321 to this module's
  port, and from `/location/{page}/{row}/{col}/style/...` and
  `/custom-variable/.../value` to a flat `/jesstimer/...` namespace. Mostly a
  find-replace on address strings.
- The bgcolor and text-blanking messages can be deleted; offline is now inferred
  from silence, which also catches crashes and hard kills.

## Development

```
npm run check   # manifest, preset/action/feedback consistency, OSC codec
npm run e2e     # full protocol round-trip against the mock JessTimer
npm run dev     # run the mock on its own, to click real buttons against
```

`tools/mock-jesstimer.mjs` impersonates the Unreal side: it maintains a real
countdown, honours every command, and streams status back at 5 Hz. It is the
fastest way to verify a preset or feedback without opening the editor.

## Layout

```
companion/manifest.json   module identity and runtime
companion/HELP.md         in-app help
src/protocol.js           every OSC address and magic number
src/timer-link.js         protocol state machine (no Companion dependency)
src/instance.js           thin Companion adapter
src/osc-decode.js         dependency-free OSC decoder
src/actions.js            outbound commands
src/feedbacks.js          button indicators
src/variables.js          exposed variables
src/presets.js            the ready-made button page
src/images.js             base64 button artwork
```

The protocol logic is deliberately kept out of the `InstanceBase` subclass:
`InstanceBase` refuses to be constructed outside Companion's IPC harness, so
anything living there cannot be tested directly.

## License

MIT
