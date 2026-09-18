# Studio 1.1: iterative audit and validation

Date: 2026-09-18. Starting point: `e6ec2c02c51819c125fbdf1880b889d57bee374c` on `improve/compact-studio-audio` (PR #1). `main` was inspected at `7bb8dcf8abfc588f41462a3b4066981fb26ec40b`. The published branch and all 11 starting source blob hashes were checked before editing. This pass builds on the initial audit in `AUDIT.md` and does not merge or deploy the PR.

## Pass 1: reproduce and protect

The starting suite passed 55 Node tests and 47 Chromium checks. Additional inspection found that one-level undo was tied to status messages, a failed saved-project restore could later be overwritten, and a delayed import could replace edits made while reading the file.

Implemented persistent multi-step undo/redo across project operations, grouped editor gestures, stable clip IDs through restore and explicit memory/history bounds. Notices, exports and errors no longer remove history. Invalid saved bytes are preserved; observed storage changes pause autosave. Recovery offers separate downloads of stored data and current work, with confirmation before replacing stored data. Imports validate before mutation and reject stale asynchronous reads.

A new lifecycle test reproduced an additional audio race: stopping while `AudioContext.resume()` was pending could leave the context running after the late resume. Start/stop intent now protects both successful and failed asynchronous requests, without allowing an older request to tear down a newer start. Failed starts clean up scheduled resources. A native Chromium delayed-resume test also verifies a suspended final context.

## Pass 2: refine and expand

Six authored presets provide editable starting points without changing saved clips: Arcade sprint, Night drive, Boss rush, Pocket puzzle, Dungeon echo and Soft savepoint. Optional scale-locked harmony keeps chord pitches in the selected scale. Legacy mode remains the default for existing projects, preserving the original seeded output and RNG order; the new presets opt into scale-locked harmony.

Stopped-bar navigation exposes all bars instead of only the first. Library filtering searches names, keys, scales, tempos and seeds without mutating projects. Presets, harmony options, bar controls, search and persistent Undo/Redo fit the existing compact studio; mobile advanced settings remain collapsible. Library scrolling and clip-action spacing were tightened rather than adding more dashboard panels.

Loop WAV export now offers a tail-inclusive file or one sample-rounded musical cycle after finite effect preroll. Song export retains its tail. A shared render planner validates options and bounds sample allocation before context creation. Playback and history actions are guarded while rendering. Rendering still uses the native graph shared with audition.

## Pass 3: regress, inspect and repeat

Final local checks:

| Check | Result |
| --- | --- |
| `npm run check` | Passed for core, session, audio and app source files |
| `npm test` | **93/93 passed**, Node 22.16.0 |
| `python3 tests/browser_smoke.py --inline` | **47/47 passed**, Chromium 144.0.7559.96 |
| `python3 tests/browser_iteration.py --inline` | **45/45 passed**, same Chromium |
| Uncaught page/console errors | None in either final browser suite |
| Responsive layouts | No document-level horizontal overflow at 320, 390, 768, 1024, 1366 and 1920 px |
| Playback DOM retention | No added/removed timeline-card or step nodes during the observed playback check |
| HTTP browser probe | Blocked by environment: `ERR_BLOCKED_BY_ADMINISTRATOR` on localhost |

The 93 unit tests comprise the 55 existing tests and 38 new tests. The two browser suites total 92 checks. Tests exercise grouped and branched history, its memory cap, stable project IDs, corrupted storage, sequential simulated-tab conflicts, recovery cancellation/confirmation, stale imports, presets, scale-locked harmony across all 31 scales and 12 roots, bar browsing, filtering, export modes and multiple audio request races.

The existing legacy generation golden hash is unchanged: `10b89a5172bc1b188e3102e815b3e84bcc3e4c3d963a8a4219685271aa6654b2`. Enabling scale-locked harmony changes harmony only, not generated lead, bass, drums or progression.

Native offline checks produced non-silent audio, exact sample-rounded loop length and silence at zero master volume. Tail-inclusive files were longer. Original checks still cover audible-clock position, mixed tempos, bounded queues, explicit stop cleanup, safe text rendering, native WAV/JSON downloads and repeat rendering within one PCM quantization level.

Responsive checks use 1920x1080, 1366x768, 1024x768, 768x1024, 390x844 and 320x700. The original suite checks an empty workspace fitting at 1366x768 and 1024x768; the additional suite checks populated libraries/timelines. Populated projects and narrow screens can still require vertical scrolling. No percentage CPU or memory improvement is claimed.

## Validation boundaries and operational limits

The environment again blocked ordinary localhost browser navigation. Both recorded browser suites therefore inject the exact local source assets and use an in-memory Storage adapter. DOM, audio contexts and downloads are native; disk persistence, actual cross-tab event delivery, HTTP relative-asset loading and a deployed Pages URL were not verified. Synthetic storage events and sequential simulated stores do not prove atomic multi-tab editing. localStorage read/check/write can still race under simultaneous writes.

Only Chromium was exercised locally. Firefox, Safari, physical touch devices, listening on the user's audio hardware and uninterrupted background playback remain unverified. GitHub Actions configuration now targets Node checks on Linux/Windows plus normal-HTTP Chromium tests; its presence alone is not a successful remote CI result. Consult the PR checks for remote status.

History is session-only, capped at 40 undo steps and an approximate 4 MiB budget, retaining at least the current snapshot. Project/import limits remain 128 library clips, 128 timeline clips and 1 MB per imported file. Musical export duration is capped at 180 seconds and native offline allocation at 8,388,608 mono samples including tails/preroll. Settings edits re-cue playback; they are not seamless automation. Loop-length WAVs use finite preroll, so universally click-free joins and byte-identical native rendering are not guaranteed.

Original ScriptProcessor crunch was already replaced with native WaveShaper processing in the initial pass; that deliberate timbral difference remains. The app still has no runtime dependencies or build requirement. Python/Playwright and Node are development/test tools only.
