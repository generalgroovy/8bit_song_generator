# 8-Bit Loop Generator

[Open 8-Bit Music](https://generalgroovy.github.io/8bit_song_generator/). Generate seeded chiptune patterns, audition four musical layers, arrange clips, and export WAV audio in the browser.

## Core workflow

1. Set key, scale, tempo, bars and seed. Adjust melody, sound and track controls. **New Pattern** changes the seed; **Randomize** changes the musical settings too.
2. Use **Play** and **Stop** in **Loop Mode** to audition the current pattern.
3. Enter a loop name and choose **Save Loop** to keep a snapshot in the clip library.
4. Choose **Add** on a saved clip, or drag it onto the timeline. Use each clip’s **↑ / ↓** buttons or drag timeline clips to reorder; **Copy** duplicates a clip and **Remove** removes it.
5. Select **Timeline Mode** and **Play**. The arrangement repeats. Removing its final clip or clearing the timeline stops that transport; it does not silently play the editor loop.
6. **Save project** downloads an editable JSON backup with the complete editor, sound settings, actual generated notes, library and arrangement. **Open project** restores it.
7. **Export Loop** or **Export Timeline** downloads a mono 44.1 kHz, 16-bit PCM WAV file (up to ten minutes).

**Load** and **Load copy** bring a snapshot into the editor; they do not edit an existing library/timeline clip in place. After changing it, save and add a new snapshot. Clip names are displayed as literal text.

## State and export limits

The complete project autosaves in the current browser after edits. A previous valid draft is retained for recovery. If the current draft is damaged, the previous draft is opened when possible and original storage is preserved: download a JSON backup, then choose **Keep this project** to resume autosave. Storage failures stay visible; JSON download remains available.

**Undo / Redo** restores library/arrangement actions (add, copy, reorder, remove, clear), loop loads, New Pattern, Randomize and JSON imports. Ctrl/Command+Z and Shift+Z work outside editable fields. Restoring stops playback; it never starts audio automatically. History is session-only and bounded to 30 steps and approximately four million stored characters. Continuous parameter adjustments are autosaved but are not individual undo steps.

The library and timeline each hold up to 64 clips. A library removal leaves existing timeline copies intact. JSON imports are limited to 5 MB and validate settings, actual notes, lengths and identities before changing the workspace. Invalid imports leave current work unchanged. Unknown application-state fields are ignored; audio nodes and running transport are never imported.

Download a project backup before clearing browser data, changing site/device, or making important experiments. There is no cloud sync, MIDI export or MP3 encoder.

WAV export uses a separate offline synthesizer. It is not a recording of the live Web Audio graph: live echo/crunch processing and exact percussion timbre are not preserved. Random percussion samples mean audio files need not be byte-identical for the same musical seed.

## Run and test

No build or dependency installation is needed. Serve the repository root, for example with `python -m http.server 8080`, and open `http://localhost:8080`. The interface and synthesizer are in `index.html`; `project-state.js` validates portable data and manages bounded history. Serve both files together. No external services are needed for the app itself.

With Node.js 18 or newer:

```sh
node --test tests/*.test.cjs
```

The suites exercise transport redraws, empty timelines, reorder focus, literal names, complete-project round trips, every scale at legal extremes, invalid imports, undo/redo, damaged-save recovery, audio-resume cancellation and export bounds. The optional `node tests/browser.mjs` suite exercises full project workflows at 1440, 390 and 320px; supply `PLAYWRIGHT_PATH` and optionally `CHROMIUM_PATH` for an isolated existing installation. Audio scheduling reads the current loop directly rather than repeatedly cloning its arrays; unchanged visible steps do not rebuild the grids.

A browser acceptance pass should generate and play a loop, save/add/reorder clips, remove the final clip during timeline playback, and inspect/listen to an exported WAV. Automated tests do not establish listening quality, timing under every device load, or musical suitability.
