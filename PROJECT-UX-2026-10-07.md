# 8-Bit Music UX iteration — 7 October 2026

Base: `67b3051d8f62b13b4f51fca5d05d403c753e0eda` (`origin/main`). Candidate branch: `codex/ux-clarity-2026-10-07`.

## Friction addressed

The original first view spent most of its space on a large waveform, repeated metrics and empty library/arrangement panels, while the notes sat below them. Saving a loop was hidden in the download disclosure even though arranging required a saved clip. New Pattern and Randomize relied on hover explanations. The playback target, clip preview and editor state could disagree; browser autosave replaced useful feedback almost immediately.

## Result

- One compact playback header names the target: This loop or Arrangement. Ready, starting and playing states enable meaningful actions; Stop can cancel a pending audio resume. Empty arrangements explain the next step and disable empty playback/export/clear actions.
- A smaller preview shows the active source, bar, waveform and note rows together. Arrangement titles and tempo follow the actual clip. Duplicate metric cards are removed; secondary pattern details remain available in a disclosure.
- New pattern and Surprise me state their different effects directly on the buttons. Key, scale, tempo and length stay visible; deeper melody, rhythm, sound and layer variation remain available.
- A named Save loop action sits directly above the clip library. Add to arrangement states its destination. Edit copy consistently returns to the loop editor and keeps saved clips independent. Clear arrangement lives beside the arrangement.
- Clip actions retain useful keyboard focus. Musical controls have accessible descriptions and focus-visible help dismissible with Escape. Background autosave no longer erases action messages. Download and backup guidance is grouped separately.
- Existing generation, constrained variation, actual-note snapshots, undo/redo, import validation, recovery, live audio cancellation and WAV rendering are retained. No production dependency changes.

## Verification

Local: `node --test tests/*.test.cjs` — 24 tests pass. `node --check tests/browser.mjs` and `git diff --check` pass. The new tests cover empty/pending/playing controls, arrangement-source preview, and autosave preserving action feedback. Existing audio cancellation, import/recovery, exact-note variation, transport, focus and WAV tests remain passing.

The isolated CI browser workflow is extended to 1440 × 900, 390 × 900, 320 × 900 and 844 × 420. It checks direct save discovery, preview placement, empty arrangement recovery, keyboard help/Escape, clip action focus and arrangement previews along with the previous complete music/project regression. CI and independent review results are pending at this checkpoint.

## Acceptance boundaries

Local automated checks do not establish listening quality, human novice understanding, musical quality, physical touch behavior or timing on every device. The established WAV/live-effects difference remains visible. The parent owns integration, main promotion and publication; this branch alone does not change the live app.
