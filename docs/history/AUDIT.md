# Compact studio audit and validation

Historical initial pass (commit `e6ec2c0`). See [ITERATION.md](ITERATION.md) for the current 1.1 findings and validation, including expanded history, saving protection and export modes. Counts and limitations below describe the initial pass, not the latest test totals.

Date: 2026-09-18. Inspected baseline: `7bb8dcf8abfc588f41462a3b4066981fb26ec40b` on `main`.

The baseline repository contained only a 64,092-byte `index.html`, with no tests or setup documentation. This change keeps a no-build static application and separates its responsibilities into five small runtime files. It is a maintainability and rendering/audio-work improvement, not a claim of smaller total download size.

## Findings addressed

| Baseline finding | Implemented change |
| --- | --- |
| Large padding, tall status cards, three side-by-side mini sequencers, and a one-column breakpoint at 1140 px hid the arranger below substantial empty space. | Compact sticky transport; 286 px desktop inspector; consolidated summary; four full-width 16-step rows; side-by-side library and timeline where space allows; collapsible advanced controls on mobile. |
| Every 25 ms transport tick rebuilt timeline cards and step elements; sequence lookup repeatedly deep-cloned data. | Compile a sequence snapshot once per start; retain clip cards and all 64 step nodes; update only audible position, note state and necessary labels. |
| The displayed step reflected scheduling lookahead, not the event currently reaching the audio clock. | Timestamped visual events are consumed against AudioContext time. |
| Stop cleared the scheduler but left scheduled sources, effect tails and visualizer work alive. | Explicit source tracking, graph disposal, context suspension, RAF cancellation and a revision guard for asynchronous Play/Stop races. |
| The delay had no signal input; effect changes repeatedly rebuilt a ScriptProcessor graph. | Connected dry/echo sends, reusable native effect buses and native quantizing WaveShaper; no ScriptProcessor callbacks. |
| New unseeded noise buffers were allocated per drum hit. | Seeded percussion buffers with a bounded per-context cache. |
| Export used a different manual synthesizer and omitted the live echo/crunch processing. | Shared native synthesis/effect graph for live and offline rendering, bounded export duration, progress/busy states and finally-cleanup. |
| Clip names were interpolated into HTML. | All user names are assigned as text; imported data is validated before use. |
| Library and timeline existed only in memory. | Debounced local autosave, validated versioned JSON backup/import, visible storage-failure handling and undo for destructive list/import operations. |
| Reordering depended on drag and drop, and changing controls triggered overlapping input/change work. | Button-based reordering and consolidated control handling; parameter changes regenerate notes only where relevant. |

## Regression found during final validation

A repeat-export test exposed intermittent offline-render differences. A source's main-thread `ended` callback could disconnect downstream filter nodes while OfflineAudioContext was still rendering their tails. Offline graphs now defer disconnection until rendering completes. Live voices still clean up on completion. Repeated exports in the final browser checks agree within one 16-bit PCM quantization level; byte-identical native mixing is not promised.

A stopped-track mute display also needed to update independently of note regeneration. That regression has an explicit browser check.

## Validation performed

`npm run check` passed for all three JavaScript source files. `npm test` passed **55/55** tests on Node 22.16.0. Coverage includes all 31 scales, repeatable seeded generation, a default-pattern golden hash, bounded parameters, random settings, independent clip snapshots, mixed-tempo/swing compilation, project validation and WAV headers/clipping.

`python3 tests/browser_smoke.py --inline` passed **47/47** checks in Chromium 144.0.7559.96. These are local checks, not GitHub Actions results.

The responsive checks used 1920x1080, 1366x768, 1024x768, 768x1024, 390x844 and 320x700 viewports. None had document-level horizontal overflow. The empty arranger fit without vertical scrolling at both 1366x768 and 1024x768. Populated projects can still require vertical scrolling.

A MutationObserver found **zero added or removed timeline-card/step nodes during playback**; this does not mean the UI performs zero DOM updates. Stop checks reported no retained voices or effect buses, a suspended audio context and no active animation loop. The visual event queue remained bounded without an animation consumer.

Browser interaction coverage includes safe HTML-shaped names, independent saved clips, button and drag reordering, copy/remove/clear/undo, mixed-tempo playback, actual-audio-clock position, asynchronous Play/Stop races, canceling a pending edit restart, keyboard focus, schema-validated project restore/import, simulated storage failure and real WAV/JSON download actions. Native offline exports were non-silent and changed when echo or crunch changed. No uncaught page or console errors were observed in the final run.

## Boundaries and follow-up verification

The execution environment blocked localhost/file navigation. The browser suite therefore injected the exact local HTML/CSS/JavaScript and used an in-memory Storage adapter. Real browser disk persistence, HTTP relative-asset loading and the deployed GitHub Pages URL were not verified. Run the default browser test mode on a normal local machine before relying on those integration paths.

Only Chromium was exercised here. Safari, Firefox, physical mobile devices, touch hardware, listening on the user's audio device and uninterrupted background playback remain unverified. No CPU-time or memory benchmark against the old app was recorded; the performance claims above describe removed work and directly observed DOM/resource behavior, not invented percentage gains.

The original note-generation logic remains, but crunch timbre has intentionally changed from sample-and-hold processing to native waveshaping. Settings changes during playback re-cue the loop; they are not sample-accurate automation. WAV exports include tails and have a three-minute musical-duration cap. Projects permit up to 128 library entries and 128 arranged clips. See `README.md` for usage and backup guidance.
