# JessTimer ↔ Companion OSC Protocol v1

This is the contract between **JessTimer** (Unreal Engine 5.5.4) and the
**companion-module-jesstimer** Companion module.

There are two independent directions, and they are deliberately asymmetric:

- **Companion → JessTimer** is **unchanged**. Every address and payload below is
  exactly what your existing page-1 buttons already send. No UE5 work required.
- **JessTimer → Companion** is **new**. This is the only side that needs edits,
  and for the most part it is a find-replace on address string literals.

---

## 1. Companion → JessTimer (commands)

Sent over UDP to JessTimer's OSC listen address, configured in the module as
**Target Host** / **Target Port**.

### Transport

| Address   | Args | Meaning                                  |
|-----------|------|------------------------------------------|
| `/Start`  | —    | Start / resume the countdown             |
| `/Pause`  | —    | Pause, retaining remaining time          |
| `/Stop`   | —    | Stop and reset                           |
| `/Repeat` | —    | Re-engage / restart the last duration    |

### Absolute time set

Sent as three messages in immediate succession.

| Address     | Args        | Range |
|-------------|-------------|-------|
| `/Hours`    | `i` hours   | 0–99  |
| `/Minutes`  | `i` minutes | 0–59  |
| `/Seconds`  | `i` seconds | 0–59  |

### Relative time adjust

| Address     | Args                    | Notes                             |
|-------------|-------------------------|-----------------------------------|
| `/HrsPlus`  | `i` positive delta      | Existing buttons send `1` / `10`   |
| `/MinPlus`  | `i` positive delta      | Existing buttons send `1` / `10`   |
| `/SecPlus`  | `i` positive delta      | Existing buttons send `1` / `10`   |
| `/HrsMinus` | `i` **negative** delta  | Existing buttons send `-1` / `-10` |
| `/MinMinus` | `i` **negative** delta  | Existing buttons send `-1` / `-10` |
| `/SecMinus` | `i` **negative** delta  | Existing buttons send `-1` / `-10` |

> Note the sign convention: the `*Minus` addresses carry an already-negative
> integer. The module preserves this exactly rather than "fixing" it.

### Warp (clock tick-rate scaling)

| Address      | Args | Meaning                                     |
|--------------|------|---------------------------------------------|
| `/WarpUp`    | —    | Increase the warp coefficient one step       |
| `/WarpDown`  | —    | Decrease the warp coefficient one step       |
| `/Warp1`     | —    | Reset warp to 1.0 (a second takes a second)   |

### End action

| Address     | Args    | Meaning                        |
|-------------|---------|--------------------------------|
| `/DoAtEnd`  | `i 101` | Stop and CLEAR at end          |
| `/DoAtEnd`  | `i 102` | HOLD on 00:00                  |
| `/DoAtEnd`  | `i 103` | Get angry / FLASH at end       |
| `/DoAtEnd`  | `i 104` | COUNT UP at end                |

| Address              | Args | Meaning                                  |
|----------------------|------|------------------------------------------|
| `/AllowCountUp`      | —    | Permit count-up (overrides end action)   |
| `/DisallowCountUp`   | —    | Forbid count-up                          |

> The existing "CountUp at END" button sends `/AllowCountUp` followed by
> `/DoAtEnd 104`. The module's **Set End Action → Count Up** reproduces this pair.

### Fullscreen

| Address        | Args  | Meaning              |
|----------------|-------|----------------------|
| `/Fullscreen`  | `i 0` | **Enable** fullscreen  |
| `/Fullscreen`  | `i 1` | **Disable** fullscreen |

> ⚠️ **Confirm this polarity.** Derived from the existing button 3-0, where the
> short-release (`up`) set sends `0` and the long-release (`1000`) set sends `1`,
> combined with the button label "enable-short, disable-long". This is the
> opposite polarity from the `/jesstimer/fullscreen` status message below, where
> `1` means enabled. If JessTimer actually treats `1` as enable, flip
> `FULLSCREEN_ENABLE` / `FULLSCREEN_DISABLE` in `src/protocol.js` — it is a
> two-line change and nothing else depends on it.

### Query (NEW — one addition to JessTimer)

| Address  | Args | Meaning                                             |
|----------|------|-----------------------------------------------------|
| `/Query` | —    | Reply with the **full** current state (§2, all rows) |

The module sends `/Query` when it starts, when its config changes, and whenever
it transitions from offline back to online. Without it, a freshly-restarted
Companion shows blank buttons until each value happens to change on its own.

---

## 2. JessTimer → Companion (status)

Sent over UDP to the **module's** listen port — **not** to Companion's built-in
OSC port 12321. Default **12322**, configurable in the module.

The module owns these values as real module variables and feedbacks, so button
appearance is bound **by name**, not by grid position. The "which Companion page
are the buttons on" field in the JessTimer GUI is no longer needed for anything
here, and the whole `/location/{page}/{row}/{col}/...` addressing scheme goes away.

### Countdown

Send **either** form. The module accepts both.

**Form A — three messages** (smallest edit; matches your current three sends):

| Address               | Args        | Example |
|-----------------------|-------------|---------|
| `/jesstimer/hours`    | `s` or `i`  | `"00"`  |
| `/jesstimer/minutes`  | `s` or `i`  | `"04"`  |
| `/jesstimer/seconds`  | `s` or `i`  | `"32"`  |

**Form B — one message:**

| Address             | Args                    | Example              |
|---------------------|-------------------------|----------------------|
| `/jesstimer/time`   | `s` `s` `s` (HH, MM, SS) | `"00" "04" "32"`     |

Keep the existing 5 Hz (0.2 s) cadence — it is what stops the Stream Deck from
jittering, and it doubles as the liveness heartbeat (§3).

Strings are passed through to the button verbatim, so zero-padding is preserved
exactly as JessTimer formats it. Integers are accepted and zero-padded to two
digits by the module.

### Warp coefficient

| Address             | Args         | Example |
|---------------------|--------------|---------|
| `/jesstimer/warp`   | `s` or `f`   | `"1.0"` |

Replaces the current text-style send aimed at button 1/4.

### Run state (NEW)

| Address             | Args | Values                                          |
|---------------------|------|-------------------------------------------------|
| `/jesstimer/state`  | `s`  | `running` \| `paused` \| `stopped` \| `expired`  |
| `/jesstimer/state`  | `i`  | `0` stopped, `1` running, `2` paused, `3` expired |

Send on change. Powers the optional `Timer run state` feedback. The stock
presets do not use it — the HH/MM/SS readout already conveys run state to the
operator — but it is published so it is there when wanted.

### End action / count-up

| Address                 | Args  | Values                                    |
|-------------------------|-------|-------------------------------------------|
| `/jesstimer/endaction`  | `i`   | `1` clear, `2` hold, `3` flash            |
| `/jesstimer/countup`    | `i`   | `1` count-up allowed, `0` not allowed      |

Replaces `/custom-variable/JessTimer_EndAction/value` and
`/custom-variable/JessTimer_CountUp/value`. Payloads are unchanged — **only the
address string differs** — so this is a pure find-replace.

> The 1/2/3 status numbering intentionally stays as-is even though the outbound
> command uses 101/102/103/104. The module maps between them. Do not renumber.
> `/jesstimer/endaction 4` is also accepted, should you ever want to report
> count-up through the same field.

### Fullscreen

| Address                  | Args | Values                        |
|--------------------------|------|-------------------------------|
| `/jesstimer/fullscreen`  | `i`  | `1` enabled, `0` disabled      |

Replaces `/custom-variable/JessTimer_Fullscreen/value`. Payload unchanged.

### Heartbeat (optional)

| Address                 | Args | Meaning              |
|-------------------------|------|----------------------|
| `/jesstimer/heartbeat`  | —    | "I am alive"          |

Only needed if JessTimer **stops** sending countdown updates while the timer is
stopped or paused. If the 5 Hz time send is unconditional, this address is
unnecessary — see §3.

---

## 3. Online / offline detection

**Any** inbound message on the listen port — countdown tick, state change,
heartbeat, anything — marks JessTimer as online and resets a watchdog. If nothing
arrives for **Offline Timeout** milliseconds (default 2000), the module marks
JessTimer offline, sets `$(jesstimer:online)` to `false`, and every button using
the `JessTimer online` feedback reverts to its offline look.

This is why the current dark-red-background and text-blanking messages can be
**deleted entirely** from JessTimer. It also means offline is detected correctly
on a hard kill, a crash, a pulled network cable, or a machine reboot — not just
on a graceful GUI-initiated exit.

> **One thing to check:** does JessTimer send the HH/MM/SS triplet continuously,
> or only while the timer is running? If it stops when the timer is stopped, add
> `/jesstimer/heartbeat` on a 2 Hz timer, or make the time send unconditional.
> Otherwise a stopped-but-running JessTimer will be reported as offline.

---

## 4. Migration checklist for the UE5 side

1. Change the OSC send destination port from `12321` to `12322` (or expose it in
   the JessTimer GUI next to the existing IP field).
2. Replace address strings:
   - `/location/{page}/1/1/style/text` → `/jesstimer/hours`
   - `/location/{page}/1/2/style/text` → `/jesstimer/minutes`
   - `/location/{page}/1/3/style/text` → `/jesstimer/seconds`
   - `/location/{page}/1/4/style/text` → `/jesstimer/warp`
   - `/custom-variable/JessTimer_EndAction/value` → `/jesstimer/endaction`
   - `/custom-variable/JessTimer_CountUp/value` → `/jesstimer/countup`
   - `/custom-variable/JessTimer_Fullscreen/value` → `/jesstimer/fullscreen`
3. **Delete** all `/location/.../style/bgcolor` sends (the 3× dark-red offline
   and 3× black online triplets) and the 3× text-blanking sends.
4. **Add** `/jesstimer/state` on run-state change.
5. **Add** an OSC receive handler for `/Query` that re-sends every §2 value.
6. The "Companion page number" GUI field is now unused by this protocol.

Steps 1–3 are the minimum for a working module. Steps 4–5 are what make it
robust across Companion restarts.

---

## 5. Testing without Unreal

`tools/mock-jesstimer.mjs` in this repo impersonates JessTimer: it listens for
commands on the target port, prints them, and streams §2 status back at 5 Hz. It
lets you verify every preset, variable and feedback before touching Blueprint.

```
node tools/mock-jesstimer.mjs --listen 8000 --send 12322 --host 127.0.0.1
```
