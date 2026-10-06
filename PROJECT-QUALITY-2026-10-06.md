# 8-Bit Music quality slice â€” 6 October 2026

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

Candidate CI/browser verification is pending. No publication claimed. Human listening and physical-device timing are separate from automated verification.
