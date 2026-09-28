## JessTimer

Bi-directional OSC control for **JessTimer**, a stage timer built in Unreal Engine 5.

> **Compatibility Notice:** Module version 2.0.0+ requires **JessTimer 4 or later**.

Commands go out to JessTimer; status comes back to a UDP port this module binds
itself. Because the module owns that port, every countdown value and indicator
is a real Companion variable and feedback — nothing needs to be created by hand,
and buttons work wherever you drop them on a page.

### Configuration

| Field | Meaning |
|---|---|
| **Target Host** | IP address of the machine running JessTimer |
| **Target Port** | The UDP port JessTimer's OSC server listens on |
| **Listen Port** | Port this module binds for status. Default **12322**. JessTimer must send here — **not** to Companion's built-in OSC port 12321. |
| **Offline Timeout** | Mark JessTimer offline after this long with no inbound message. Default 2000 ms. |
| **Query state on startup** | Send `/Query` on start and on reconnect so buttons repopulate immediately. |
| **Verbose logging** | Log every OSC message. Useful while wiring up; noisy in production. |

> The Listen Port must not be 12321. Companion already owns that port for its own
> OSC remote control, and the bind will fail.

### Getting started

1. Add the connection and set Target Host / Target Port to JessTimer.
2. Open **Buttons**, pick an empty page, and drag presets in from the
   **JessTimer** category in the sidebar.
3. Configure JessTimer to send status to this module's Listen Port using the
   addresses in `PROTOCOL.md`.

### Presets

Grouped by category: **Transport**, **Countdown Display**, **Set Duration**,
**Adjust Time**, **Warp**, **End Action**, **Output**, **Utility**. The original
Stream Deck XL layout is reproduced button-for-button, including the artwork.

The three countdown readout buttons default to the dark red "Terminal Offline"
background and switch to black via the `JessTimer online` feedback.

### Variables

| Variable | Example |
|---|---|
| `$(jesstimer:online)` | `true` |
| `$(jesstimer:hours)` `$(jesstimer:minutes)` `$(jesstimer:seconds)` | `00` `04` `32` |
| `$(jesstimer:time)` | `00:04:32` |
| `$(jesstimer:time_short)` | `04:32` |
| `$(jesstimer:total_seconds)` | `272` |
| `$(jesstimer:warp)` | `1.0` |
| `$(jesstimer:state)` `$(jesstimer:state_label)` | `running` / `Running` |
| `$(jesstimer:end_action)` `$(jesstimer:end_action_label)` | `flash` / `Flash at End` |
| `$(jesstimer:count_up)` | `false` |
| `$(jesstimer:fullscreen)` | `true` |

While offline, the countdown and warp variables are blanked rather than left
showing a frozen time.

### Feedbacks

- **JessTimer online** / **JessTimer offline** — driven by the message watchdog,
  so a crash or pulled cable is detected, not just a graceful exit
- **End action is** — count-up correctly overrides the other three, matching
  JessTimer's internal behaviour
- **Count up is**
- **Fullscreen output is**
- **Timer run state is** — requires JessTimer to send `/jesstimer/state`

### Testing without Unreal

The repo ships a mock:

```
node tools/mock-jesstimer.mjs --listen 8000 --send 12322
```

Point Target Port at `--listen` and Listen Port at `--send`. `npm run e2e` runs
the whole protocol against it automatically.
