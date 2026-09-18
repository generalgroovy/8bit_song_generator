# 8-Bit Loop Generator

A compact, dependency-free chiptune studio: generate seeded loops, save clip snapshots, arrange them into a song, and export WAV audio. Everything runs locally in the browser. There is no account, upload service, analytics, external font, CDN or runtime package dependency.

## Run

Keep `index.html`, `styles.css`, `core.js`, `audio.js` and `app.js` together. From this directory:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. On Windows, `py -m http.server 8000` is the equivalent command. A static host such as GitHub Pages can serve the same files without a build step. Click **Play** to enable audio. Use a current browser with Web Audio and OfflineAudioContext support.

## Workflow

The top transport stays available while working. **New pattern** changes only the seed; **Randomize** changes musical settings as well. Song, Melody and Sound controls update automatically. Melody and Sound start collapsed on narrow screens; all controls remain available.

The four 16-step rows show Lead, Bass, Drums and Harmony, including note names in tooltips. Track checkboxes mute the corresponding voice. The blue outline follows the audio clock rather than the scheduler's lookahead.

Name a loop and select **Save**. Each library item is an independent snapshot. **+ Add** copies it into the timeline. Drag clips, or use the accessible left/right buttons, to reorder. **Load** brings a snapshot into the editor; changing the editor does not silently overwrite saved or arranged clips. Remove, clear and import operations offer a single-level **Undo**.

Choose **Loop** to repeat the editor, or **Timeline** to repeat the arrangement. During timeline playback, editor settings are disabled because the saved clips supply their own settings. Changing settings during loop playback re-cues the loop from its beginning after a short debounce; this is not seamless live automation. Structural timeline edits also re-cue playback. **Stop** cancels scheduled notes, disconnects effects and suspends the audio context.

**Space** toggles playback and **G** generates a new pattern when focus is outside editable or interactive controls. The shortcuts do not intercept text entry, buttons or native control interaction.

## Saving and exports

The editor, volume, library and timeline autosave under `8bit-loop-studio:v1` in browser localStorage. Storage is specific to the site's origin and browser profile. Private browsing, quota limits, browser cleanup or changing the hosting URL can prevent persistence or remove it. An on-screen message reports storage failures; the app stays usable.

**Project ↓** downloads a versioned JSON backup. **Import** validates the complete project before replacing the current state; an invalid file leaves the project unchanged. Back up important projects rather than relying exclusively on browser storage. Maximum import size: 1 MB. Maximum library size and timeline size: 128 clips each.

**Loop WAV ↓** renders the editor. **Song WAV ↓** renders the arrangement, including each clip's tempo and sound settings. Both exports use the same native synthesis/effect graph as audition: 44.1 kHz, 16-bit, mono PCM WAV. Volume applies to both playback and export. Exports include release/echo tails, so their duration is longer than the displayed musical duration; they are not sample-exact seamless-loop files. The musical duration of one export is limited to 180 seconds to bound offline rendering work. Export stops live playback and reports its progress.

## Compatibility and deliberate sound changes

All 31 scale choices, original parameter ranges, seeded note-generation decisions and the main generation/library/timeline workflow are retained. The original live and exported audio used different synthesizers; they now share one implementation. Seeded noise buffers make percussion repeatable and avoid allocating new noise for every hit.

Crunch now uses a native quantizing WaveShaper and low-pass filter rather than a main-thread ScriptProcessor with sample-and-hold downsampling. This intentionally changes some timbres; it is not a bit-identical emulation of the old effect. Native browser mixing can also produce tiny floating-point/PCM differences, so exported WAVs are not promised byte-identical across renders or browsers.

Audio lookahead is 120 ms. The scheduler skips stale notes after a long stall instead of playing a burst of overdue events. Background-tab throttling can still interrupt audio; uninterrupted background playback is not guaranteed. Visual updates stop while the page is hidden and when playback stops. The hidden-tab visual queue is bounded.

## Structure

| File | Responsibility |
| --- | --- |
| `index.html` | Semantic transport, settings, sequencer, library and arranger |
| `styles.css` | Compact responsive layout, focus states and reduced-motion support |
| `core.js` | Scales, seeded generation, validated projects, immutable sequence compilation |
| `audio.js` | Shared live/offline Web Audio graph, scheduler, cleanup and WAV encoding |
| `app.js` | Incremental UI updates, transport, local persistence, imports and downloads |
| `tests/core.test.js` | Dependency-free Node tests |
| `tests/browser_smoke.py` | Real Chromium layout, interaction, playback and export checks |
| `AUDIT.md` | Findings, implementation scope, measured checks and limitations |

## Tests

Node 18 or newer is required for the unit tests. No `npm install` is necessary:

```sh
npm run check
npm test
```

Browser testing is an optional development dependency, not an application dependency:

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
npm run test:browser
```

The browser runner serves the project from a temporary localhost port. It uses `CHROMIUM_PATH`, a system `chromium`, or Playwright's installed Chromium, in that order. On Windows, run `py tests/browser_smoke.py` after installing Playwright with `py -m pip install playwright`. Reports, screenshots and export samples are written to ignored `artifacts/`.

For a restricted test environment that blocks all browser navigation:

```sh
python3 tests/browser_smoke.py --inline
```

That fallback injects the exact source assets into Chromium and substitutes an in-memory Storage adapter. It exercises real DOM, Web Audio, downloads and restoration logic, but does **not** verify HTTP asset loading, browser disk persistence or a live deployment. This is the mode used for the recorded validation in `AUDIT.md`.
