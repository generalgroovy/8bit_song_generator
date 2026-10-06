# 8-Bit Loop Generator

[Open 8-Bit Music](https://generalgroovy.github.io/8bit_song_generator/). Generate seeded chiptune patterns, audition four musical layers, arrange clips, and export WAV audio in the browser.

## Engineering overview

- **Composition:** seeded generation produces four musical layers, with separate editor, clip-library and arrangement state.
- **Audio:** live Web Audio playback and a separate offline synthesizer support auditioning and WAV export; their sound differences are documented below.
- **Project integrity:** portable JSON validates settings, notes and identities before import, with bounded history and recovery from damaged browser saves.

[Project overview](https://generalgroovy.web.app/apps/8-bit-loop-generator/) · [Project-state implementation](project-state.js) · [Tests](tests/)

## Core workflow

1. Set key, scale, tempo, bars and seed. Adjust melody, sound and track controls. **New Pattern** changes the seed; **Randomize** changes the musical settings too.
2. Open **Shape one layer** to vary just Lead, Bass, Drums or Harmony, across the whole loop or one bar. **A little / Half / All** changes that fraction of the differing steps. Harmony can change voicing while keeping the progression. The other layers and saved clips stay intact; **Undo / Redo** lets you compare. Each click explores a fresh random candidate.
3. Use **Play** and **Stop** in **Loop Mode** to audition the current pattern.
4. Open **Save & Export**, enter a loop name and choose **Save Loop** to keep a snapshot in the clip library.
5. Choose **Add** on a saved clip, or drag it onto the timeline. Use each clip’s **↑ / ↓** buttons or drag timeline clips to reorder; **Copy** duplicates a clip and **Remove** removes it.
6. Select **Timeline Mode** and **Play**. The arrangement repeats. Removing its final clip or clearing the timeline stops that transport; it does not silently play the editor loop.
7. **Save project** downloads an editable JSON backup with the complete editor, sound settings, actual generated notes, library and arrangement. **Open project** restores it.
8. **Export Loop** or **Export Timeline** downloads a mono 44.1 kHz, 16-bit PCM WAV file (up to ten minutes).

**Load** and **Load copy** bring a snapshot into the editor; they do not edit an existing library/timeline clip in place. After changing it, save and add a new snapshot. Clip names are displayed as literal text. Save Loop retains the actual notes you hear, including variations and imported edits. Changing tempo, swing, waveforms, effects, track switches or playback mode does not regenerate those notes. Key, scale, length, seed and Melody controls compose a new full pattern; Undo recovers your earlier version. Stop silences scheduled notes and echo, and switching modes stops playback.

## State and export limits

The complete project autosaves in the current browser after edits. A previous valid draft is retained for recovery. If the current draft is damaged, the previous draft is opened when possible and original storage is preserved: download a JSON backup, then choose **Keep this project** to resume autosave. Storage failures stay visible; JSON download remains available.

**Undo / Redo** restores library/arrangement actions (add, copy, reorder, remove, clear), loop loads, layer variations, melody changes, New Pattern, Randomize and JSON imports. Ctrl/Command+Z and Shift+Z work outside editable fields. Restoring stops playback; it never starts audio automatically. History is session-only and bounded to 30 steps and approximately four million stored characters. A continuous melody adjustment is one undo step. Sound and tempo adjustments autosave but are not individual undo steps. The starting seed recreates the original full pattern; actual variations are preserved in JSON backups, autosaves and saved clips. Layer/bar/change choices are temporary controls, not part of the saved musical material.

The library and timeline each hold up to 64 clips. A library removal leaves existing timeline copies intact. JSON imports are limited to 5 MB and validate settings, actual notes, lengths and identities before changing the workspace. Invalid imports leave current work unchanged. Unknown application-state fields are ignored; audio nodes and running transport are never imported.

Download a project backup before clearing browser data, changing site/device, or making important experiments. There is no cloud sync, MIDI export or MP3 encoder.

WAV export uses a separate offline synthesizer. It is not a recording of the live Web Audio graph: live echo/crunch processing and exact percussion timbre are not preserved. Random percussion samples mean audio files need not be byte-identical for the same musical seed.

## Run and test

No build or dependency installation is needed. Serve the repository root, for example with `python -m http.server 8080`, and open `http://localhost:8080`. The interface and synthesizer are in `index.html`; `project-state.js` validates portable data and manages bounded history; `pattern-tools.js` contains pure constrained variation selection. Serve all three files together. No external services are needed for the app itself.

With Node.js 18 or newer:

```sh
node --test tests/*.test.cjs
```

The suites exercise constrained variations, exact-note saving, non-destructive sound controls, audio source cancellation, WAV headers/samples, transport redraws, empty timelines, reorder focus, literal names, complete-project round trips, every scale at legal extremes, invalid imports, undo/redo, damaged-save recovery, audio-resume cancellation and export bounds. The optional `node tests/browser.mjs` suite exercises full project workflows at 1440, 390 and 320px; supply `PLAYWRIGHT_PATH` and optionally `CHROMIUM_PATH` for an isolated existing installation. Audio scheduling reads the current loop directly rather than repeatedly cloning its arrays; unchanged visible steps do not rebuild the grids.

A browser acceptance pass should generate and play a loop, save/add/reorder clips, remove the final clip during timeline playback, and inspect/listen to an exported WAV. Automated tests do not establish listening quality, timing under every device load, or musical suitability.

GitHub Actions runs the Node suite and the isolated browser workflow at 1440, 390 and 320 px. See [the quality record](PROJECT-QUALITY-2026-10-06.md) for this candidate’s evidence and limits.
