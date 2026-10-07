# 8-Bit Music — hear any arrangement clip in context

Baseline: `b4513dba99b7e9b176f58d01c3c076eb68966f4b`, matching upstream main at inspection on 7 October 2026. Candidate branch: `codex/ux-flow-2026-10-07`. Runtime: `f1080039f40f1b1c7726068259480fdb8bf0e2a5`.

## Friction and behavior

Playback previously always set the arrangement position to zero. Hearing a later saved section required replaying the preceding clips or loading a copy into the editor. That made arrangement changes harder to compare and could displace an unrelated editor loop just to audition a saved section.

Every arrangement card now has **Play from here**. It selects Arrangement, starts at that clip's first step, continues through later clips and wraps to the start of the complete arrangement. The preview, clip name and active card follow the chosen position. **Stop** cancels the start or stops the playing audio. The main **Play arrangement** button restarts from clip one.

The editor's exact notes/settings/name, saved clips, arrangement data and Undo history remain intact. Starting is a transport operation. A later request replaces a pending start; Stop invalidates it. If clips are reordered while audio resume is pending, the chosen clip is found by its identity in the current order. If it has been removed, playback remains stopped with a recovery message. No new runtime dependency or project-format field was added.

## Verification boundary

Local `node --test tests/*.test.cjs`: **29 passed**, zero failed/skipped. Five focused tests exercise real transport functions with synthetic audio to verify chosen offsets, actual scheduled clip/step, complete-arrangement wrapping, editor preservation, pending cancellation, latest-request ownership and pending reorder/removal. Existing persistence, import/history, exact-note variation, audio-source cleanup, error recovery and WAV checks continue to pass. Browser-harness syntax and diff checks pass.

The existing CI browser suite additionally checks the direct action, source selection, named preview, active-card highlight, retained keyboard focus and unchanged musical state/history at 1440 × 900, 390 × 900, 320 × 900 and 844 × 420. [Candidate CI 37610892773](https://github.com/generalgroovy/8bit_song_generator/actions/runs/37610892773) passed the complete Node and browser workflows at the exact runtime above, with no page errors or horizontal overflow. Owner visually inspected the complete [desktop](docs/evidence/2026-10-07-flow-desktop.png) and [320px](docs/evidence/2026-10-07-flow-mobile.png) clip-start captures; the selected second clip and named transport agree, and card actions remain legible.

Independent source review accepted the exact runtime with no blockers, reran all 29 tests and independently verified CI. It inspected offset lookup/wrapping, pending cancellation, removal/reorder guards, preserved editor/library/history and focus behavior. The shared `ux-flow-2026-10-07/reviews/8bit-review.md` records acceptance.

Root CUA accepted desktop and **390 × 844**: saved Opening in C and Answer in D, appended both, started from Answer, confirmed Arrangement selection/active second clip with the editor still in D, then stopped playback. Shared `ux-flow-2026-10-07/evidence/8bit-arrangement-phone.png` retains the inspected phone capture. Root authorized normal main promotion after the reviewed checks passed.

Normal fast-forward main promotion completed. [Main Quality CI 37611525989](https://github.com/generalgroovy/8bit_song_generator/actions/runs/37611525989) and [Pages deployment 37611524566](https://github.com/generalgroovy/8bit_song_generator/actions/runs/37611524566) passed at the exact runtime. All three public runtime files (`index.html`, `project-state.js`, `pattern-tools.js`) match the committed SHA-256 bytes over certificate-validated HTTPS; shared `ux-flow-2026-10-07/evidence/8bit-public.json` records that verification. Embedded portfolio refresh is a separate root-owned release.

Only this feature's runtime, tests and documentation/evidence changed; the original checkout was clean. Published URL: [8-Bit Music](https://generalgroovy.github.io/8bit_song_generator/). The final report-only commit does not change the verified runtime. No local browser automation was run. Automated audio scheduling does not establish audible quality, musical suitability, device timing or human comprehension.
