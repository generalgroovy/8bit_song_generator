# Development

[User guide](guide.md) · [Changelog](../CHANGELOG.md)

## Run and test

The app is plain HTML, CSS and JavaScript. Serve the repository with `python3 -m http.server 8000` (Windows: `py -m http.server 8000`). There is no build or runtime dependency installation.

Use Node 18+ for syntax and unit checks:

```sh
npm run check
npm test
```

For browser checks, install the separate development requirements:

```sh
python3 -m pip install -r requirements-dev.txt
python3 -m playwright install chromium
python3 tests/browser_smoke.py
python3 tests/browser_iteration.py
python3 tests/browser_visual.py
```

On Windows, substitute `py` for `python3`. Runners start a temporary localhost server. They choose `CHROMIUM_PATH`, system Chromium or Playwright's installed browser, in that order. Reports, screenshots and sample exports go to ignored `artifacts/`.

Use `--inline` only where browser policy blocks localhost navigation. It injects the source and uses an in-memory storage adapter: DOM, audio and downloads are real, but HTTP loading, disk persistence and native cross-tab storage delivery are not covered by that fallback. Do not report it as equivalent to normal HTTP testing.

GitHub Actions runs Node checks on Linux/Windows and the browser suites over HTTP on Linux. Check the run for the exact commit rather than assuming a workflow definition or an old pass proves current success. Chromium checks do not certify Safari, Firefox, physical touch devices, listening quality or deployment.

## Where to change things

| File | Responsibility |
| --- | --- |
| `index.html` | Layout, accessible labels and in-app Guide. |
| `styles.css` | Surface/voice tokens, typography, controls and responsive layout. |
| `core.js` | Scales, presets, seeded generation, project validation and sequence compilation. |
| `session.js` | Bounded history and protected autosave. |
| `audio.js` | Shared live/offline synthesis, transport and WAV encoding. |
| `app.js` | UI state, retained note glyphs, contours, project operations and downloads. |
| `tests/` | Core, lifecycle, session, browser and documentation regressions. |

## Visual contract

A warm faceplate holds controls; the dark screen holds musical information. Amber marks the primary actions. Voice colors are fixed: lead amber, bass mint, drums coral, harmony lilac. Change the named tokens at the top of `styles.css`, not scattered hard-coded swatches. Canvas voice colors are read from those tokens at startup.

Use system fonts and original inline graphics; no remote fonts or image services. Color is accompanied by text and glyphs. New controls must retain visible focus and keyboard operation. Small screens scroll the pattern locally instead of squeezing note-inspection buttons below 24 CSS pixels. The Guide uses a native modal dialog; keep its close button, Escape behavior and focus return.

Contours are derived from the actual pattern, without random decoration. The live spectrum uses analyser data. Reduced motion keeps the contour static. Stop and hidden-tab handling cancel animation work. Note buttons and their three glyph nodes are created once: update styles/attributes on bar changes, not DOM children on playback ticks. The four row entry points use roving focus, not 64 tab stops.

Do not treat the preview as simulation authority or imply that clicking a step edits music. The stored project format, generator RNG order and native audio code were intentionally unchanged by the visual pass. Keep the golden seed tests when changing presentation.

## Historical records

[Initial audit](history/AUDIT.md) and [studio 1.1 audit](history/ITERATION.md) describe their own dated snapshots and test limitations. They are not current setup instructions. Keep user-facing behavior in the user guide and present-tense architecture here; place per-run results in test artifacts and PR checks rather than duplicating test totals throughout the documentation.
