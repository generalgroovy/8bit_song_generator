"""Additional native Chromium checks for the iterative reliability/workflow pass.

Normal mode serves real HTTP. --inline injects exact assets with in-memory storage
for locked-down environments; it does not claim disk persistence or HTTP coverage.
"""
from __future__ import annotations
import argparse
from functools import partial
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
from threading import Thread
import wave
from playwright.sync_api import sync_playwright
from browser_smoke import QuietHandler, ROOT, ARTIFACTS

KEY = '8bit-loop-studio:v1'


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--inline', action='store_true')
    args = parser.parse_args()
    ARTIFACTS.mkdir(exist_ok=True)
    checks, errors, contexts, layouts = [], [], [], []
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    html = (ROOT / 'index.html').read_text()
    html = re.sub(r'<script defer src="[^"]+"></script>', '', html)
    html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + (ROOT / 'styles.css').read_text() + '</style>')
    html = html.replace('</body>', ''.join('<script>' + (ROOT / name).read_text() + '</script>' for name in ['core.js', 'audio.js', 'session.js', 'app.js']) + '</body>')
    result = {'mode': 'inline / memory storage' if args.inline else 'HTTP / browser localStorage'}

    def check(condition, description):
        assert condition, description
        checks.append(description)
        print('PASS', description, flush=True)

    def snapshot(page):
        return page.evaluate('ChipApp.snapshot()')

    def set_range(page, selector, value):
        page.locator(selector).evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}', str(value))

    try:
        with sync_playwright() as p:
            launch = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
            executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
            if executable:
                launch['executable_path'] = executable
            browser = p.chromium.launch(**launch)
            result['browser'] = browser.version

            def open_page(raw=None, width=1366, height=768):
                context = browser.new_context(viewport={'width': width, 'height': height}, accept_downloads=True)
                contexts.append(context)
                if raw is not None and not args.inline:
                    context.add_init_script(f'if(location.protocol==="http:")localStorage.setItem({json.dumps(KEY)}, {json.dumps(raw)});')
                page = context.new_page()
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
                if args.inline:
                    page.evaluate('''({key,raw})=>{
                      const data=new Map();if(raw!==null)data.set(key,raw);
                      Object.defineProperty(window,'localStorage',{configurable:true,value:{
                        getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),clear:()=>data.clear()
                      }});
                    }''', {'key': KEY, 'raw': raw})
                    page.set_content(html)
                else:
                    page.goto(f'http://127.0.0.1:{server.server_port}/')
                page.wait_for_function('window.ChipApp !== undefined')
                return page

            page = open_page()
            initial = snapshot(page)
            check(page.locator('#presetSelect option').count() == 7, 'Six musical presets plus the custom/current selection')
            page.locator('#rerollBtn').click()
            first = snapshot(page)
            page.locator('#rerollBtn').click()
            second = snapshot(page)
            with page.expect_download():
                page.locator('#backupBtn').click()
            page.locator('#undoBtn').click()
            check(snapshot(page) == first, 'Status and download messages do not erase pattern Undo')
            page.locator('#undoBtn').click()
            check(snapshot(page) == initial, 'Multiple Undo steps recover the original pattern exactly')
            page.locator('#redoBtn').click()
            page.locator('#redoBtn').click()
            check(snapshot(page) == second, 'Redo replays complete project snapshots')
            page.locator('#undoBtn').click()
            page.locator('#keySelect').select_option('F')
            check(page.locator('#redoBtn').is_disabled(), 'Editing after Undo invalidates the obsolete redo branch')
            page.locator('#presetSelect').select_option('night')
            check(snapshot(page)['name'] == 'Night drive' and snapshot(page)['params']['harmonyMode'] == 'scale', 'Presets apply a named loop with scale-locked harmony')
            before = snapshot(page)
            count = page.evaluate('ChipApp.diagnostics().historyUndo')
            page.locator('#densityRange').evaluate('el=>{for(const v of [0.45,0.5,0.6]){el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}el.dispatchEvent(new Event("change",{bubbles:true}));}')
            check(page.evaluate('ChipApp.diagnostics().historyUndo') == count + 1, 'A continuous slider gesture makes one history entry')
            page.locator('#undoBtn').click()
            check(snapshot(page) == before, 'Undo restores the value before the complete slider gesture')
            page.locator('#workspace').focus()
            page.keyboard.press('Control+Shift+Z')
            check(snapshot(page)['params']['density'] == 0.6, 'Control-Shift-Z redoes project edits outside text fields')
            page.keyboard.press('Control+z')
            check(snapshot(page)['params']['density'] == before['params']['density'], 'Control-Z undoes project edits outside text fields')
            count = page.evaluate('ChipApp.diagnostics().historyUndo')
            page.locator('#loopNameInput').focus()
            page.keyboard.press('Control+z')
            check(page.evaluate('ChipApp.diagnostics().historyUndo') == count, 'Text inputs keep native undo rather than undoing the project')

            for preset in ['arcade', 'night', 'boss', 'puzzle', 'dungeon', 'savepoint']:
                page.locator('#presetSelect').select_option(preset)
                page.locator('#saveLoopBtn').click()
            saved = snapshot(page)
            page.locator('#undoBtn').click()
            check(len(snapshot(page)['savedLoops']) == 5, 'Saving a clip is undoable')
            page.locator('#redoBtn').click()
            check(snapshot(page) == saved, 'Redo restores the same clip identity, not a new ID')
            for query, expected in [('NIGHT', 'Night drive'), ('dorian', 'Night drive'), ('9142', 'Boss rush')]:
                page.locator('#librarySearch').fill(query)
                check(page.locator('#savedLoops .clip-name').all_text_contents() == [expected], f'Library filtering works for {query}')
            page.locator('#librarySearch').fill('.*')
            check(page.locator('#savedLoops .clip').count() == 0 and page.locator('#libraryCount').inner_text() == '0 / 6', 'Search treats metacharacters literally and explains no matches')
            page.locator('#librarySearch').fill('')
            check(snapshot(page) == saved, 'Filtering does not mutate the project or its history')
            page.locator('#savedLoops .clip').nth(2).locator('[data-action=add]').click()
            page.locator('#savedLoops .clip').nth(4).locator('[data-action=add]').click()
            page.locator('#savedLoops .clip').nth(0).locator('[data-action=add]').click()
            page.locator('#presetSelect').select_option('night')
            page.locator('#barSelect').select_option('2')
            check(page.locator('#currentBar').inner_text() == '3 / 4', 'Stopped preview can inspect the third bar')
            correct = page.evaluate('''()=>{
              const notes=ChipCore.generateLoop(ChipApp.snapshot().params).lead.slice(32,48);
              return [...document.querySelectorAll('#leadSteps .step')].every((el,i)=>el.title===`Step ${i+1}: ${notes[i]?ChipCore.noteName(notes[i].midi):'Rest'}`);
            }''')
            check(correct, 'Stopped bar preview shows notes from the selected bar, not bar one')
            page.locator('#nextBarBtn').click()
            set_range(page, '#barsRange', 2)
            check(page.locator('#barSelect').input_value() == '1' and page.locator('#barSelect option').count() == 2, 'Shrinking a loop clamps the inspected bar safely')
            page.locator('#playBtn').click()
            page.wait_for_function('ChipApp.diagnostics().playing')
            check(page.locator('#barSelect').is_disabled(), 'Bar inspection is locked while the audio-clock playhead is active')
            page.locator('#stopBtn').click()
            page.wait_for_function('ChipApp.diagnostics().audioState === "suspended"')
            page.locator('#harmonyModeSelect').select_option('legacy')
            check(snapshot(page)['params']['harmonyMode'] == 'legacy' and page.locator('#presetSelect').input_value() == '', 'Individual edits mark the preset as custom without erasing the selected sound')

            # Native AudioContext, with a controllable delay before its actual resume.
            race = page.evaluate('''async()=>{
              const e=new ChipAudio.Engine();e.ensureAudio();await e.ctx.suspend();
              const native=e.ctx.resume.bind(e.ctx);let release;
              e.ctx.resume=()=>new Promise((resolve,reject)=>{release=async()=>{try{await native();resolve();}catch(err){reject(err);}};});
              const pending=e.start([ChipCore.makeClip('Race',ChipCore.DEFAULTS)]);
              await e.stop();await release();await pending;const out=e.diagnostics;await e.dispose();return out;
            }''')
            check(not race['playing'] and race['audioState'] == 'suspended' and race['voices'] == 0, 'Native delayed-resume cancellation leaves no running audio context')

            audio = page.evaluate('''async()=>{
              const params={...ChipCore.DEFAULTS,bars:1,tempo:123,echo:0.4,crunch:0.6};
              const clip=ChipCore.makeClip('Loop-length',params);
              const read=async options=>new DataView(await (await ChipAudio.renderWav([clip],options)).arrayBuffer());
              const loop=await read({sampleRate:8000,loopable:true}),tail=await read({sampleRate:8000});
              const mute=await read({sampleRate:8000,loopable:true,volume:0});
              let peak=0,mutedPeak=0;for(let i=44;i<loop.byteLength;i+=2)peak=Math.max(peak,Math.abs(loop.getInt16(i,true)));
              for(let i=44;i<mute.byteLength;i+=2)mutedPeak=Math.max(mutedPeak,Math.abs(mute.getInt16(i,true)));
              return {frames:loop.getUint32(40,true)/2,expected:Math.round(ChipCore.duration(clip)*8000),tailFrames:tail.getUint32(40,true)/2,peak,mutedPeak};
            }''')
            check(audio['frames'] == audio['expected'] and audio['tailFrames'] > audio['frames'], 'Native loop-length WAV has exactly one sample-rounded cycle; tail export is longer')
            check(audio['peak'] > 100 and audio['mutedPeak'] == 0, 'Loop-length rendering produces audio and respects zero master volume')
            set_range(page, '#barsRange', 1)
            set_range(page, '#tempoRange', 123)
            page.locator('#loopExportMode').select_option('loop')
            page.evaluate('''()=>{
              window.__nativeRender=OfflineAudioContext.prototype.startRendering;
              OfflineAudioContext.prototype.startRendering=async function(){const result=await __nativeRender.call(this);await new Promise(r=>setTimeout(r,300));return result;};
            }''')
            with page.expect_download() as pending:
                page.locator('#exportLoopBtn').click()
                check(page.locator('#playBtn').is_disabled() and page.locator('#redoBtn').is_disabled(), 'Playback and history controls are guarded during WAV rendering')
                page.locator('#workspace').focus()
                page.keyboard.press('Space')
                check(not page.evaluate('ChipApp.diagnostics().playing'), 'Space cannot bypass the busy export guard')
            pending.value.save_as(str(ARTIFACTS / 'iteration-loop-length.wav'))
            page.evaluate('()=>{OfflineAudioContext.prototype.startRendering=__nativeRender;}')
            with wave.open(str(ARTIFACTS / 'iteration-loop-length.wav'), 'rb') as wav:
                check(wav.getnframes() == round(4*60/123*44100), 'Loop-length dropdown downloads the correct one-cycle WAV from the UI')
            check(not page.locator('#playBtn').is_disabled(), 'Export releases the playback guard after completion')

            # An asynchronous file read must not clobber edits made while it was pending.
            imported = snapshot(page)
            imported['name'] = 'Late import'
            page.evaluate('''()=>{
              window.__nativeFileText=File.prototype.text;
              File.prototype.text=async function(){await new Promise(r=>setTimeout(r,200));return __nativeFileText.call(this);};
            }''')
            page.locator('#importInput').set_input_files({'name': 'late.json', 'mimeType': 'application/json', 'buffer': json.dumps(imported).encode()})
            page.locator('#loopNameInput').fill('Edit while importing')
            page.wait_for_function('document.querySelector("#noticeText").textContent.startsWith("Import failed")')
            check(snapshot(page)['name'] == 'Edit while importing', 'Late imports cannot silently replace edits made during file reading')
            page.evaluate('()=>{File.prototype.text=__nativeFileText;}')

            corrupt = open_page(raw='{broken saved data')
            check(corrupt.evaluate('ChipApp.diagnostics().autosaveBlocked') and corrupt.locator('#recoveryActions').is_visible(), 'Corrupt autosave starts in protected recovery mode')
            corrupt.locator('#loopNameInput').fill('Unsaved recovery work')
            corrupt.wait_for_timeout(250)
            check(corrupt.evaluate('(key)=>localStorage.getItem(key)', KEY) == '{broken saved data', 'Editing a recovery session preserves original saved bytes')
            with corrupt.expect_download() as pending:
                corrupt.locator('#recoverBtn').click()
            pending.value.save_as(str(ARTIFACTS / 'iteration-recovery.json'))
            check((ARTIFACTS / 'iteration-recovery.json').read_text() == '{broken saved data', 'Saved-data recovery downloads the untouched original bytes')
            corrupt.once('dialog', lambda dialog: dialog.dismiss())
            corrupt.locator('#resumeSaveBtn').click()
            check(corrupt.evaluate('ChipApp.diagnostics().autosaveBlocked'), 'Canceling replacement keeps the saved-data protection')
            corrupt.once('dialog', lambda dialog: dialog.accept())
            corrupt.locator('#resumeSaveBtn').click()
            check(not corrupt.evaluate('ChipApp.diagnostics().autosaveBlocked') and json.loads(corrupt.evaluate('(key)=>localStorage.getItem(key)', KEY))['name'] == 'Unsaved recovery work', 'Confirmed replacement resumes autosave with the current project')

            conflict = open_page()
            conflict.locator('#loopNameInput').fill('Local edit')
            conflict.wait_for_timeout(250)
            conflict.evaluate('''key=>{localStorage.setItem(key,'other-tab-version');window.dispatchEvent(new StorageEvent('storage',{key,newValue:'other-tab-version'}));}''', KEY)
            check(conflict.evaluate('ChipApp.diagnostics().autosaveBlocked'), 'External storage change pauses autosave without changing the editor')
            conflict.locator('#loopNameInput').fill('More local work')
            conflict.wait_for_timeout(250)
            check(conflict.evaluate('(key)=>localStorage.getItem(key)', KEY) == 'other-tab-version' and snapshot(conflict)['name'] == 'More local work', 'Conflict protection keeps both stored and in-memory versions intact')

            page.locator('#presetSelect').select_option('night')
            page.locator('#loopNameInput').blur()
            page.locator('#savedLoops').evaluate('el=>el.scrollTop=0')
            page.evaluate('()=>document.activeElement.blur()')
            # Verify new controls fit at six sizes, including populated libraries and long names.
            for width, height in [(1920,1080),(1366,768),(1024,768),(768,1024),(390,844),(320,700)]:
                page.set_viewport_size({'width': width, 'height': height})
                if width <= 740:
                    page.locator('.controls details').evaluate_all('nodes=>nodes.forEach(n=>n.open=false)')
                layout = page.evaluate('''()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,sidebarScrollable:document.querySelector('.controls').scrollHeight>document.querySelector('.controls').clientHeight})''')
                layouts.append(layout)
                check(layout['documentWidth'] <= width, f'Populated iterative workspace has no horizontal overflow at {width}px')
                page.screenshot(path=str(ARTIFACTS / f'iteration-{width}.png'), full_page=True)
            result['passed'] = len(checks)
            check(not errors, 'No uncaught page or console errors in the iterative browser checks')
            result['passed'] = len(checks)
            for context in contexts:
                context.close()
            browser.close()
    finally:
        server.shutdown()
        result.update(checks=checks, errors=errors, layouts=layouts)
        (ARTIFACTS / 'iteration-report.json').write_text(json.dumps(result, indent=2))
    print(f'\n{len(checks)} iteration checks passed ({result["mode"]}).', flush=True)


if __name__ == '__main__':
    run()
