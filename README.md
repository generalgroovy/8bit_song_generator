# 8-Bit Loop Generator

[Open 8-Bit Music](https://generalgroovy.github.io/8bit_song_generator/). Generate seeded chiptune patterns, audition four musical layers, arrange clips, and export WAV audio in the browser.

## Engineering overview

- **Composition:** seeded generation produces four musical layers, with separate editor, clip-library and arrangement state.
- **Audio:** live Web Audio playback and a separate offline synthesizer support auditioning and WAV export; their sound differences are documented below.
- **Project integrity:** portable JSON validates settings, notes and identities before import, with bounded history and recovery from damaged browser saves.

[Project overview](https://generalgroovy.web.app/apps/8-bit-loop-generator/) · [Project-state implementation](project-state.js) · [Tests](tests/)

## Make a loop, keep it, build a song

1. Choose **This loop** and press **Play loop**. The notes and current bar are visible beside the editor. **Stop** cancels sound, including a pending audio start.
2. **New pattern** keeps your settings and changes the notes. **Surprise me** changes the musical settings too. Both are undoable. Key, scale and length are immediately available; **Melody & rhythm** and **Sound** reveal deeper choices.
3. Open **Shape one layer** to vary Lead, Bass, Drums or Harmony across the whole loop or one bar. **A little / Half / All** replaces that fraction of the differing steps. Other layers and saved clips stay intact. **Undo / Redo** lets you compare.
4. In **Keep a good loop**, name the loop and choose **Save loop**. This saves the exact notes and sound settings as an independent clip. Choose **Add to arrangement** on a clip to place it in your song.
5. Use the arrangement's **↑ / ↓** controls or drag to reorder; **Copy** repeats a clip and **Remove** removes it. **Play from here** starts at that clip, selects **Arrangement** and continues through later clips before repeating from the beginning. The preview and highlighted card follow the playing clip. The editor notes, saved clips and Undo history stay intact. **Stop** cancels playback or a pending audio start; the main **Play arrangement** button starts again from clip one. Empty arrangements explain how to get started.
6. **Edit copy** opens a separate loop editor copy and selects **This loop**. Save it again to keep your new version; existing saved and arranged clips remain independent.
7. Open **Project & downloads** for **Download project** (an editable JSON backup), **Open project**, **Loop WAV** or **Arrangement WAV**. Audio downloads are mono 44.1 kHz, 16-bit PCM WAV, up to ten minutes. The separate renderer does not reproduce live echo, crunch or exact drum timbre.

Tempo, swing, waveforms, effects, layer switches and playback target preserve generated notes. Key, scale, length, seed and melody controls compose fresh notes; Undo recovers the previous version. Save loop retains actual variations and imported notes. Changing playback target stops sound; an empty arrangement never falls back to the editor loop.

Keyboard focus follows clip actions, and editing a copy returns focus to the editor. Focus a musical control for its help; Escape dismisses the tooltip. **How it works** contains the longer explanations. Saving feedback stays beside the clips, while browser autosave status lives in Project & downloads.

## State and export limits

The complete project autosaves in the current browser after edits. A previous valid draft is retained for recovery. If the current draft is damaged, the previous draft is opened when possible and original storage is preserved: download a JSON backup, then choose **Keep this project** to resume autosave. Storage failures stay visible; JSON download remains available.

**Undo / Redo** restores library/arrangement actions (add, copy, reorder, remove, clear), loop loads, layer variations, melody changes, New pattern, Surprise me and JSON imports. Ctrl/Command+Z and Shift+Z work outside editable fields. Restoring stops playback; it never starts audio automatically. History is session-only and bounded to 30 steps and approximately four million stored characters. A continuous melody adjustment is one undo step. Sound and tempo adjustments autosave but are not individual undo steps. The starting seed recreates the original full pattern; actual variations are preserved in JSON backups, autosaves and saved clips. Layer/bar/change choices are temporary controls, not part of the saved musical material.

The library and timeline each hold up to 64 clips. A library removal leaves existing timeline copies intact. JSON imports are limited to 5 MB and validate settings, actual notes, lengths and identities before changing the workspace. Invalid imports leave current work unchanged. Unknown application-state fields are ignored; audio nodes and running transport are never imported.

Download a project backup before clearing browser data, changing site/device, or making important experiments. There is no cloud sync, MIDI export or MP3 encoder.

WAV export uses a separate offline synthesizer. It is not a recording of the live Web Audio graph: live echo/crunch processing and exact percussion timbre are not preserved. Random percussion samples mean audio files need not be byte-identical for the same musical seed.

## Run and test

No build or dependency installation is needed. Serve the repository root, for example with `python -m http.server 8080`, and open `http://localhost:8080`. The interface and synthesizer are in `index.html`; `project-state.js` validates portable data and manages bounded history; `pattern-tools.js` contains pure constrained variation selection. Serve all three files together. No external services are needed for the app itself.

With Node.js 18 or newer:

```sh
node --test tests/*.test.cjs
```

The suites exercise constrained variations, exact-note saving, non-destructive sound controls, audio source cancellation, WAV headers/samples, transport redraws, starting from any arrangement clip, empty timelines, reorder focus, literal names, complete-project round trips, every scale at legal extremes, invalid imports, undo/redo, damaged-save recovery, audio-resume cancellation and export bounds. Clip-start tests cover pending requests, removal/reordering during audio resume and continuing across the arrangement boundary. The optional `node tests/browser.mjs` suite exercises full project workflows at 1440, 390 and 320px plus a short 844 × 420 viewport; supply `PLAYWRIGHT_PATH` and optionally `CHROMIUM_PATH` for an isolated existing installation. Audio scheduling reads the current loop directly rather than repeatedly cloning its arrays; unchanged visible steps do not rebuild the grids.

A browser acceptance pass should generate and play a loop, save/add/reorder clips, remove the final clip during timeline playback, and inspect/listen to an exported WAV. Automated tests do not establish listening quality, timing under every device load, or musical suitability.

GitHub Actions runs the Node suite and the isolated browser workflow at 1440, 390 and 320 px plus 844 × 420. See [the arrangement listening flow](PROJECT-UX-FLOW-2026-10-07.md), [the previous UX iteration](PROJECT-UX-2026-10-07.md) and [the previous quality record](PROJECT-QUALITY-2026-10-06.md) for evidence and limits.
