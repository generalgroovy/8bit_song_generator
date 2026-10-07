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

The isolated CI browser workflow is extended to 1440 × 900, 390 × 900, 320 × 900 and 844 × 420. It checks direct save discovery, preview placement, empty arrangement recovery, keyboard help/Escape, clip action focus and arrangement previews along with the previous complete music/project regression. First candidate CI passed all Node checks and reached the browser save action; it found an obsolete exact-label selector (Loop Name versus Loop name), now corrected. The final runtime candidate `3265e505c086ba18639f2ca1a9a91eee88ae01f7` passed [Quality CI](https://github.com/generalgroovy/8bit_song_generator/actions/runs/37598079221): all 24 Node tests and the complete browser workflow at all four sizes. There were no page errors or horizontal overflow. [Machine report](docs/evidence/browser-ux-2026-10-07.json), [desktop first use](docs/evidence/first-use-ux-2026-10-07-desktop.png), and [320px first use](docs/evidence/first-use-ux-2026-10-07-mobile.png) are retained. The same layout screenshots from the preceding passing candidate were inspected locally; the final runtime additionally clarifies the Save editor loop label.

Root real-browser verification passed at 1366 × 900, 390 × 900 and 320 × 900: direct save, add to arrangement, playback source selection, Edit copy returning to This loop with editor focus, keyboard tooltip/Escape, Play/Stop and no page overflow. Screenshots are recorded by the parent in the shared UX evidence directory. A singular-count wording issue found there was fixed.

Independent agent review inspected the actual diff and reran all 24 tests, finding no release blocker in empty/pending/cancelled transport, clip previews, editor-copy isolation, save/import/history, tooltip naming or focused clip rerenders. Review clarified saving while Arrangement is selected: its button now reads Save editor loop. Self-review added long-name wrapping, 44px playback target labels and history clearing stale clip-save feedback. These preserve the tested workflow.

## Acceptance boundaries

Local automated checks do not establish listening quality, human novice understanding, musical quality, physical touch behavior or timing on every device. The established WAV/live-effects difference remains visible. The parent owns integration, main promotion and publication; this branch alone does not change the live app.
