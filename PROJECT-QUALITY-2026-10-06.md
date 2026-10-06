# 8-Bit Music quality slice - 6 October 2026

Baseline: `13e38a3`, matching fetched `origin/main`. Dedicated candidate branch: `codex/8bit-intentional-variations`.

## Journey and evidence

Make a loop immediately, keep the parts that work, explore one layer, then save and arrange exact independent clips. Code inspection found that Save Loop regenerates the loop and that mute, waveform and playback-mode changes regenerate notes. Those actions can silently discard imported or varied material. Stop currently cancels scheduling but leaves already scheduled voices sounding.

## Bounded plan and acceptance

- Add constrained variations for one layer and optionally one bar, with three change amounts. Preserve musical settings, progression, other layers and independent clips. Same source, candidate seed and choices produce identical results.
- Save actual editor notes; sound/mute/transport changes preserve them. Variation is one undo step, autosaves and survives JSON round trips.
- Stop cancels pending playback and scheduled voices; failures leave playback stopped with useful feedback.
- Keep the first action obvious and place occasional controls in compact disclosures, without deleting depth.
- Verify model behavior, history/import recovery, audio lifecycle and exported WAV structure. Check keyboard, touch-sized layouts and live workflow using the coordinated browser lease or isolated CI.

## Evidence

Local verification: 21 behavior tests pass; inline application script, external module and browser-suite syntax checks pass; `git diff --check` passes. The WAV check renders PCM and validates its header, duration and non-silent samples. It does not establish listening quality.

The implementation adds single-layer/bar variations, independent actual-note saving, non-regenerating sound/transport controls, one-step undo for composing gestures, and compact native disclosures. Inspection also found that the existing echo graph had no input; its input is now connected. Stop clears scheduled sources and replaces the echo buffer; effects no longer recreate the bitcrusher unless its setting changes.

Self-review corrected hidden error/recovery feedback after introducing Save & Export disclosure, clarified muted/timeline variation feedback, preserved imported custom progressions and limited harmony inversions to valid MIDI pitches.

Candidate CI at `b4f54c7` passed all 21 Node tests and full browser workflows at 1440, 390 and 320 px: selected-layer/bar protection; sound/mode preservation; variation Undo/Redo; quick Stop/Play and fresh echo buffer; exact-note clip save; arrangement/library independence; project download/import/invalid import; autosave/reload and damaged-save recovery. All three widths have no horizontal page overflow and no page errors. [Passing CI](https://github.com/generalgroovy/8bit_song_generator/actions/runs/37534743745).

First CI passed 1440 px, then exposed a test race at 390 px: an immediate AudioParam read preceded the next audio render quantum. The regression now waits up to one second for the stopped gain while still requiring cleared sources, stopped transport and a fresh echo buffer. Local CI screenshots were inspected at desktop and narrow phone widths; native disclosures and controls render without clipping.

Manual CUA was not run for this candidate: the isolated CI browser already exercised the same interaction paths and all three screen widths, so no duplicate browser pass was needed. Rendered screenshots were inspected locally. No publication claimed. Human listening and physical-device timing are separate from automated verification.


## Release handoff

- Reviewed application revision: `f707f08d68661877ba9cae9e9cfb5faa56e7f93d`.
- Passing browser regression revision: `b4f54c7` (test-only correction after the application commit).
- Runtime files: `index.html`, `project-state.js`, **`pattern-tools.js`**. Include the new module when updating embedded copies.
- No dependencies are needed in production. The pinned Playwright dependency is installed only by CI.
- [Browser report](docs/evidence/browser-quality-2026-10-06.json) and [desktop screenshot](docs/evidence/browser-quality-2026-10-06.png).
- Parent owns main/release/portfolio publication. This agent pushed only the candidate branch.
- Deferred acceptance: listening quality, physical phone audio/timing, and independent novice usability observation. Existing offline-WAV/live-effects differences remain explicitly documented.
