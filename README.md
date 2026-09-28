# 8-Bit Loop Generator

[Open 8-Bit Music](https://generalgroovy.github.io/8bit_song_generator/). Generate seeded chiptune patterns, audition four musical layers, arrange clips, and export WAV audio in the browser.

## Core workflow

1. Set key, scale, tempo, bars and seed. Adjust melody, sound and track controls. **New Pattern** changes the seed; **Randomize** changes the musical settings too.
2. Use **Play** and **Stop** in **Loop Mode** to audition the current pattern.
3. Enter a loop name and choose **Save Loop** to keep a snapshot in the current tab's clip library.
4. Choose **Add** on a saved clip, or drag it onto the timeline. Drag timeline clips to reorder; **Copy** duplicates a clip and **Remove** removes it.
5. Select **Timeline Mode** and **Play**. The arrangement repeats. Removing its final clip or clearing the timeline stops that transport; it does not silently play the editor loop.
6. **Export Loop** or **Export Timeline** downloads a mono 44.1 kHz, 16-bit PCM WAV file.

**Load** and **Load copy** bring a snapshot into the editor; they do not edit an existing library/timeline clip in place. After changing it, save and add a new snapshot. Clip names are displayed as literal text.

## State and export limits

The editor, clip library and arrangement live only in the current tab's memory. Reloading or closing the page loses them. Export audio before leaving; there is no project JSON import/export, durable project save, MIDI export or MP3 encoder.

WAV export uses a separate offline synthesizer. It is not a recording of the live Web Audio graph: live echo/crunch processing and exact percussion timbre are not preserved. Random percussion samples mean audio files need not be byte-identical for the same musical seed.

## Run and test

No build or dependency installation is needed. Serve the repository root, for example with `python -m http.server 8080`, and open `http://localhost:8080`. Everything is in `index.html`; no external services are needed for the app itself.

With Node.js 18 or newer:

```sh
node --test tests/transport.test.cjs
```

The suite exercises the actual sequence lookup and transport redraw path, empty-timeline behavior and literal clip-name rendering. Audio scheduling reads the current loop directly rather than repeatedly cloning its arrays; unchanged visible steps do not rebuild the grids.

A browser acceptance pass should generate and play a loop, save/add/reorder clips, remove the final clip during timeline playback, and inspect/listen to an exported WAV. Automated tests do not establish listening quality, timing under every device load, or musical suitability.
