# 8-Bit Loop Generator

A small chiptune studio. **Generate a loop → save it → arrange a song → export WAV.**

Four voices, 31 scales, repeatable seeds and six presets. The hardware-inspired interface shows actual notes, drum hits and pitch contours. Everything runs in your browser: no account, uploads, external fonts, runtime packages or build step.

## Start

Download the repository and open a terminal in its folder:

```sh
python3 -m http.server 8000
```

On Windows, use `py -m http.server 8000`. Open **http://localhost:8000** and press **Play**. A static host such as GitHub Pages can serve the same files. Keep the HTML, CSS and JavaScript files together.

## Make something

1. **Choose a preset and Play.** Use **New pattern** to change only the seed, or **Randomize** for different musical settings.
2. **Shape the loop.** Adjust key, rhythm, melody and sound. Track checkboxes mute voices. The pattern is a read-only preview: select a step to inspect it, and browse bars while stopped.
3. **Save and arrange.** Name the loop, **Save**, then **+ Add** it to the timeline. Reorder clips with the arrows or drag. Select **Timeline** to hear the song.
4. **Export.** **WAV ↓** exports the editor; **Song WAV ↓** exports the arrangement. **Project ↓** saves an editable JSON backup; **Import** restores one.

**Saved clips are independent snapshots.** Loading and editing a clip does not overwrite it. Save a new version when it is ready. Undo/Redo covers project edits until you reload.

## Know before you start

Autosave stays in this browser and is not a backup. Keep important projects with **Project ↓**. Settings changes during playback restart the loop. Exports are mono WAV, up to three minutes of music; loop-length export is not a guarantee of click-free joins. Browsers may interrupt audio in background tabs.

## Help and development

**Guide ?** in the app covers the basics without leaving your work. Read the [user guide](docs/guide.md) for controls, exports, recovery and shortcuts; [development notes](docs/development.md) for tests and styling; or the [changelog](CHANGELOG.md) for release changes.

Run the dependency-free checks with `npm run check` and `npm test` (Node 18+). Browser-test setup is in the development notes.
