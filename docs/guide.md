# User guide

[Start here](../README.md) · [Development](development.md)

## Choose and shape a loop

Select one of six presets, then **Play**. **New pattern** keeps the settings and changes the seed. **Randomize** changes both. The same seed and musical settings recreate the same generated notes; there is no online AI service.

| Control | What changes |
| --- | --- |
| Key / Scale | The musical root and collection of notes. |
| Tempo / Bars | Speed in beats per minute / loop length. |
| Swing | Delays alternate sixteenth notes. |
| Density / Variation | How often lead notes play / how varied the generated pattern is. |
| Lead octave / Arpeggio | Lead register / preference for chord tones. |
| Lead wave / Bass wave | Square, triangle or sawtooth voice shape. |
| Echo / Crunch | Delayed repeats / digital grit and softened high frequencies. |
| Harmony | Legacy voicing, or chords using only notes in the chosen scale. |

Changing settings during loop playback restarts the loop after a short delay. Timeline playback uses each clip's saved settings, so editor controls are locked while it runs. **Stop** silences the voices and effects.

## Read the instrument

The top display shows a **pattern contour across all bars** when stopped. Lead marks trace relative pitch; bass, drum and harmony marks show onsets. During playback it becomes a live output spectrum. With reduced motion enabled, the contour stays still while the step cursor advances.

The main pattern shows one bar of **16 steps**, grouped into four beats. Lead is amber, bass mint, drums coral and harmony lilac. Voice labels, note names, glyphs and mute strike-throughs also convey meaning without relying only on color.

Select a step for its exact notes or drum hits. **K / S / H** mean kick, snare and hi-hat. Harmony cells show the lowest listed note; their readout lists the full chord. Pitch marks are scaled within each voice's range, not a shared piano-roll axis. **This is an inspector, not a note editor.**

Tab enters each voice row. Left/Right moves between steps, Up/Down between voices, and Home/End goes to the first/last step. On narrow screens, swipe the pattern sideways; voice labels stay pinned. Browse other bars with the arrows or bar selector while stopped. The display follows playback while running.

## Keep and arrange

Name a loop and **Save**. Each library entry keeps its own seed and settings. Filter by name, key, scale, tempo or seed. Miniature contours help you recognize patterns; they are not unique identifiers.

**+ Add** copies a loop to the timeline. Reorder by dragging or using its arrow buttons. **Copy** duplicates a timeline clip. **Load** brings a clip into the editor without changing the saved version. After editing, save and add a new version. Removing a library loop leaves existing timeline copies intact.

Choose **Loop** to repeat the editor, or **Timeline** to repeat the arrangement. Clips may have different tempos. Arrangement changes during playback restart it.

## Export audio or editable work

**WAV ↓** exports the editor using the selected length. **With tail** keeps releases and echo after the music ends. **Loop-length** exports one sample-rounded musical cycle after effect pre-roll, without an appended tail. **Song WAV ↓** exports the arrangement with its tail.

WAV uses the same instruments and effects as playback: 44.1 kHz, 16-bit mono PCM. Volume affects both listening and export. Rendering stops playback. Exports are limited to 180 seconds of music and 8,388,608 samples including pre-roll/tails, so some near-limit exports may be rejected. Finite pre-roll does not guarantee click-free joins; native browser rendering may vary slightly.

**Project ↓** downloads editable JSON, not audio. **Import** restores the editor, volume, library and timeline. Invalid files leave your work unchanged. A successful import can be undone. Limits are 1 MB per imported file and 128 clips in each list.

## Protect your work

Autosave belongs to this site's browser profile. Clearing browser data, private browsing, storage limits or moving to another URL may lose it. **Use one editing tab and keep JSON backups.**

When saved data is unreadable or another tab's change is detected, autosave pauses. **Saved data ↓** downloads the stored bytes; **Project ↓** downloads the open project. Preserve both before selecting **Keep this project**, which asks before replacing the stored copy. Detection is not atomic multi-tab collaboration: simultaneous writes can still race.

Undo/Redo covers settings, generation, names, volume, clips, arrangement and imports. Slider gestures are grouped. History lasts until reload, with up to 40 undo steps and an approximate 4 MiB budget; large projects may retain fewer steps. Filtering, inspecting notes and choosing export length do not change the project.

## Shortcuts and troubleshooting

**Space** plays/stops; **G** makes a new pattern outside controls. **Ctrl/Cmd-Z** undoes; add **Shift** or use **Ctrl/Cmd-Y** to redo. Text fields retain their own editing shortcuts. The Guide opens without changing playback; Escape closes it.

**No sound:** press Play, raise Volume, enable at least one track and check the browser/system output. An empty timeline cannot play. **Missing project:** check the original browser profile and URL, or import your JSON backup. **Audio stutters in another tab:** return to the app; background throttling can interrupt playback. **Export refused:** shorten the arrangement. Errors appear below the project controls.
