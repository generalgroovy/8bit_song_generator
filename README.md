# 8-Bit Loop Generator

A compact, dependency-free chiptune studio: generate seeded loops, save clip snapshots, arrange a song and export WAV audio. No account, upload service, analytics, external font, CDN or runtime package dependency. Version 1.1 adds protected project saving, multi-step history, presets, bar inspection and loop-length export.

## Run

Keep `index.html`, `styles.css`, `core.js`, `session.js`, `audio.js` and `app.js` together. From this directory:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. On Windows, use `py -m http.server 8000`. A static host such as GitHub Pages can serve these files without a build step. Click **Play** to enable audio. The app requires a browser with Web Audio and OfflineAudioContext support.

## Compose and arrange

**New pattern** changes the seed; **Randomize** changes musical settings too. Six presets provide editable starting points: Arcade sprint, Night drive, Boss rush, Pocket puzzle, Dungeon echo and Soft savepoint. Applying a preset changes the editor, not saved or arranged clips, and can be undone. Editing its settings marks the preset as custom.

Song, Melody and Sound controls update automatically. Melody and Sound start collapsed on narrow screens. **Legacy chords** retains the original generator's decisions. **Scale-locked chords** constructs harmony from the selected scale; this is the default for the new presets, not for old projects. The other generated tracks and RNG order remain unchanged by that option.

The four 16-step rows show Lead, Bass, Drums and Harmony; tooltips show notes or drum hits. Track checkboxes mute voices. While stopped, use the bar arrows or selector to inspect every bar. During playback, the display follows the audio clock and manual bar navigation is disabled.

Name a loop and select **Save**. Each library entry is an independent snapshot. Filter the library by name, key, scale, tempo or seed. **+ Add** copies a snapshot into the timeline. Drag clips or use the left/right buttons to reorder them. **Load** copies a snapshot into the editor; subsequent editor changes never silently overwrite the original clip. To use an edited variation, save and add it again.

Choose **Loop** to repeat the editor or **Timeline** to repeat the arrangement. Timeline clips retain their own tempo and sound settings. Editor sound controls are disabled during timeline playback. Changing settings during loop playback re-cues the loop after a short debounce; this is not seamless live automation. Structural arrangement edits also re-cue playback. **Stop** cancels scheduled sources, disconnects effects and suspends audio, including a canceled pending Play request.

## Undo and keyboard controls

Persistent **Undo** and **Redo** cover editor settings, presets, generation, names, volume, saved clips, arrangement edits and imports. Slider/text gestures are grouped. Notices and downloads do not erase history. A new edit after undo discards the redo branch.

History is session-only: up to 40 undo steps, additionally bounded by an approximate 4 MiB snapshot budget. Large projects may retain fewer steps. The current snapshot is retained even when it alone exceeds the budget. Reloading starts a new history; use project backups for durable versions. Search filters, bar inspection and export-format selection are not project edits.

**Space** toggles playback and **G** generates a pattern outside interactive controls. **Ctrl/Cmd-Z** undoes, **Ctrl/Cmd-Shift-Z** or **Ctrl/Cmd-Y** redoes outside text-entry fields. Native text undo remains available inside those fields. Playback/history controls are guarded while WAV rendering is busy.

## Autosave, recovery and project backups

The editor, volume, library and timeline autosave under `8bit-loop-studio:v1` in browser localStorage. Storage belongs to the site's origin and browser profile. Private browsing, quota limits, browser cleanup and changing the hosting URL can prevent persistence or remove it. Failures are reported without preventing composition.

Unreadable saved data and detected external changes **pause autosave** instead of silently replacing stored data. **Saved data ↓** downloads the untouched stored text; **Project ↓** downloads the current in-memory project. **Keep this project** requires confirmation before replacing stored data and resuming autosave. Preserve both versions before choosing which to retain.

External-change detection uses storage events and a read/check before writes. It is not an atomic transaction or collaborative editing system: truly simultaneous writes can still race. Prefer one editing tab and keep JSON backups of important projects.

**Import** validates the whole project before replacing anything; invalid files leave the current state untouched. A delayed import is refused if the project changed while the file was being read. Successful imports are undoable. Version-1 backups remain compatible; missing harmony mode defaults to legacy. Limits: 1 MB import, 128 library entries and 128 arranged clips.

## WAV export

The library's format selector controls **WAV ↓** for the editor:

- **With tail** includes note releases and echo decay after the musical duration.
- **Loop-length** renders effect preroll, then exports exactly one sample-rounded musical cycle with no appended tail. Its filename ends in `_loop.wav`.

**Song WAV ↓** exports the arrangement with a tail. Both modes share the native synthesis/effect graph used for playback and produce 44.1 kHz, 16-bit mono PCM WAV. Master volume applies to playback and export. Export stops playback and reports progress. Musical duration is limited to 180 seconds, and offline allocation is capped at 8,388,608 mono samples, including preroll/tails. An oversized render is rejected before allocating its context.

Loop-length export uses finite effect preroll, not an infinite steady-state solution. Sample rounding, browser DSP and residual tails mean it is not a guarantee of byte-identical or universally click-free joins. Native mixing can produce small PCM differences between renders or browsers.

## Compatibility and implementation

All 31 scales, parameter ranges and legacy seeded note decisions are retained. The original app used different live/export synthesizers; this version shares one implementation. Seeded percussion buffers avoid allocating new random noise for every hit.

Crunch uses a native quantizing WaveShaper and low-pass filter rather than the original main-thread ScriptProcessor/sample-and-hold effect. Some timbres intentionally differ. The 120 ms audio lookahead skips stale notes after long stalls instead of emitting an overdue burst. Background throttling can still interrupt audio; uninterrupted background playback is not guaranteed. Visual work stops when hidden or stopped and its pending queue is bounded.

| File | Responsibility |
| --- | --- |
| `index.html`, `styles.css` | Responsive studio, focus states and reduced-motion support |
| `core.js` | Scales, presets, seeded generation, project validation and sequence compilation |
| `session.js` | Bounded undo/redo and protected autosave |
| `audio.js` | Shared live/offline synthesis, transport lifecycle and WAV encoding |
| `app.js` | Incremental UI, project workflow, imports and downloads |
| `tests/*.test.js` | Dependency-free generation, session, render-plan and lifecycle tests |
| `tests/browser_*.py` | Chromium layout, interaction, audio, recovery and export checks |
| `AUDIT.md`, `ITERATION.md` | Initial audit and latest iteration findings/validation boundaries |

## Tests

Node 18 or newer is required. No `npm install` is necessary:

```sh
npm run check
npm test
```

Optional browser-test dependencies are separate from the application:

```sh
python3 -m pip install -r requirements-dev.txt
python3 -m playwright install chromium
python3 tests/browser_smoke.py
python3 tests/browser_iteration.py
```

On Windows, replace `python3` with `py`. Each runner serves the project on a temporary localhost port and selects `CHROMIUM_PATH`, system Chromium or Playwright's installed Chromium, in that order. Reports, screenshots and sample exports go to ignored `artifacts/`.

The GitHub Actions definition runs Node checks on Linux and Windows and both browser suites in ordinary localhost mode on Linux. A workflow definition is not evidence of a successful remote run; inspect the PR's checks for that status.

In restricted environments that block browser navigation, use `--inline` on both browser commands. That fallback injects the exact source assets and substitutes an in-memory Storage adapter. It tests native DOM, Web Audio and downloads, but **not** HTTP asset loading, real disk persistence, actual cross-tab event delivery or deployment. Recorded local results and additional limitations are in `ITERATION.md`.
