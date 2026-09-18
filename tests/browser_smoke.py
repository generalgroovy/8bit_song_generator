"""Real Chromium UI/audio checks. No app dependencies are installed.

Default: serves repository over localhost. Use --inline when browser policy blocks
local navigation; that mode injects the same assets and substitutes an in-memory
Storage adapter. It tests restoration logic, NOT disk-backed browser persistence.
"""
from __future__ import annotations
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
from threading import Thread
import wave
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'artifacts'

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def run() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--inline', action='store_true')
    args = parser.parse_args()
    ARTIFACTS.mkdir(exist_ok=True)
    checks: list[str] = []
    errors: list[str] = []
    layouts: list[dict] = []
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    html = (ROOT / 'index.html').read_text()
    html = re.sub(r'<script defer src="[^"]+"></script>', '', html)
    html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + (ROOT / 'styles.css').read_text() + '</style>')
    html = html.replace('</body>', ''.join('<script>' + (ROOT / name).read_text() + '</script>' for name in ['core.js', 'audio.js', 'session.js', 'app.js']) + '</body>')

    def check(condition, description):
        assert condition, description
        checks.append(description)
        print('PASS', description, flush=True)

    def mount(page):
        if args.inline:
            page.evaluate('''() => {
              if (!window.__testStore) {
                const store = new Map(); window.__testStore = store;
                Object.defineProperty(window, 'localStorage', {configurable:true, value:{
                  getItem:key=>store.get(key)??null,
                  setItem:(key,value)=>store.set(key,String(value)),
                  removeItem:key=>store.delete(key), clear:()=>store.clear(),
                  key:i=>[...store.keys()][i]??null, get length(){return store.size;}
                }});
              }
            }''')
            page.set_content(html)
        else:
            page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.wait_for_function('window.ChipApp !== undefined')

    def set_range(page, selector, value):
        page.locator(selector).evaluate('(el, value) => {el.value = value; el.dispatchEvent(new Event("input", {bubbles:true}));}', str(value))

    def snapshot(page):
        return page.evaluate('ChipApp.snapshot()')

    result = {'mode': 'inline / memory storage' if args.inline else 'HTTP / browser localStorage'}
    try:
        with sync_playwright() as p:
            executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
            launch = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
            if executable:
                launch['executable_path'] = executable
            browser = p.chromium.launch(**launch)
            result['browser'] = browser.version
            for width, height in [(1920, 1080), (1366, 768), (1024, 768), (768, 1024), (390, 844), (320, 700)]:
                context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=1)
                page = context.new_page()
                page.on('pageerror', lambda e: errors.append(str(e)))
                mount(page)
                layout = page.evaluate('''() => ({width:innerWidth, height:innerHeight,
                  documentWidth:document.documentElement.scrollWidth,
                  documentHeight:document.documentElement.scrollHeight,
                  timelineBottom:document.querySelector('#timelineDropzone').getBoundingClientRect().bottom})''')
                layouts.append(layout)
                check(layout['documentWidth'] <= width, f'No horizontal overflow at {width}px')
                if width in (1366, 1024):
                    check(layout['timelineBottom'] < height, f'Empty arranger visible without scrolling at {width} × {height}')
                if width <= 390:
                    check(page.locator('.controls details[open]').count() == 0, f'Advanced controls start collapsed at {width}px')
                page.screenshot(path=str(ARTIFACTS / f'layout-{width}.png'), full_page=True)
                context.close()

            context = browser.new_context(viewport={'width': 1366, 'height': 768}, accept_downloads=True)
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
            mount(page)
            check(page.locator('#scaleSelect option').count() == 31, '31 scales are selectable')
            check(page.locator('.step').count() == 64, 'Four persistent 16-step track rows')
            check(page.locator('#stopBtn').is_disabled(), 'Stop is disabled before playback')
            page.locator('#leadToggle').uncheck()
            check('muted' in page.locator('[data-track=lead]').get_attribute('class'), 'Muting updates the stopped pattern without regenerating notes')
            page.locator('#leadToggle').check()
            page.locator('#modeTimeline').check()
            check(page.locator('#playBtn').is_disabled(), 'Empty timeline cannot start audio')
            page.locator('#modeLoop').check()
            page.locator('#seedInput').fill('99999999')
            page.locator('#seedInput').blur()
            check(snapshot(page)['params']['seed'] == 999999 and page.locator('#seedInput').input_value() == '999999', 'Seed is clamped in state and input')
            page.locator('#seedInput').fill('4312')
            set_range(page, '#barsRange', 1)
            set_range(page, '#tempoRange', 190)
            hostile = 'Intro <img src=x onerror=alert(1)>'
            page.locator('#loopNameInput').fill(hostile)
            page.locator('#saveLoopBtn').click()
            check(page.locator('#savedLoops .clip-name').inner_text() == hostile and page.locator('#savedLoops img').count() == 0, 'Clip names render as text, never executable HTML')
            page.locator('#loopNameInput').fill('B section')
            page.locator('#seedInput').fill('4313')
            set_range(page, '#tempoRange', 140)
            page.locator('#keySelect').select_option('D')
            page.locator('#scaleSelect').select_option('dorian')
            page.locator('#saveLoopBtn').click()
            page.locator('#savedLoops .clip').last.locator('[data-action=add]').click()
            page.locator('#savedLoops .clip').first.locator('[data-action=add]').click()
            check([c['name'] for c in snapshot(page)['timeline']] == [hostile, 'B section'], 'Library adds independent clips in order')
            page.locator('#timelineItems .clip').first.locator('[data-action=copy]').click()
            check(len(snapshot(page)['timeline']) == 3, 'Timeline Copy duplicates exactly once')
            page.locator('#timelineItems .clip').last.locator('[data-action=left]').click()
            check([c['name'] for c in snapshot(page)['timeline']] == [hostile, 'B section', hostile], 'Keyboard/touch reorder buttons work')
            page.locator('#timelineItems .clip').first.locator('[data-action=remove]').click()
            page.locator('#undoBtn').click()
            check(len(snapshot(page)['timeline']) == 3, 'Removing a timeline clip can be undone')
            page.locator('#savedLoops .clip').first.drag_to(page.locator('#timelineDropzone'))
            check(len(snapshot(page)['timeline']) == 4, 'Drag-and-drop adds once (no bubbled duplicate drop)')
            page.locator('#clearTimelineBtn').click()
            check(len(snapshot(page)['timeline']) == 0, 'Clear empties only the timeline')
            page.locator('#undoBtn').click()
            check(len(snapshot(page)['timeline']) == 4 and len(snapshot(page)['savedLoops']) == 2, 'Clear is undoable and preserves the library')
            page.locator('#savedLoops .clip').last.locator('[data-action=remove]').click()
            check(len(snapshot(page)['timeline']) == 4, 'Library deletion does not break timeline snapshots')
            page.locator('#undoBtn').click()
            page.wait_for_timeout(250)
            before = snapshot(page)
            mount(page)
            restored = snapshot(page)
            check(restored['params'] == before['params'] and [c['name'] for c in restored['timeline']] == [c['name'] for c in before['timeline']], 'Project restore recovers parameters and arranged clips')

            page.locator('#modeTimeline').check()
            page.locator('#playBtn').click()
            page.wait_for_function('ChipApp.diagnostics().playing')
            page.evaluate('''() => {
              window.__firstClip = document.querySelector('#timelineItems .clip');
              window.__firstCell = document.querySelector('.step'); window.__addedNodes = 0;
              window.__observer = new MutationObserver(records => {for (const r of records) __addedNodes += r.addedNodes.length+r.removedNodes.length;});
              __observer.observe(document.querySelector('#timelineItems'),{childList:true,subtree:true});
              for(const row of document.querySelectorAll('.track-row .steps')) __observer.observe(row,{childList:true,subtree:true});
            }''')
            page.wait_for_timeout(800)
            check(page.evaluate('__firstClip === document.querySelector("#timelineItems .clip") && __firstCell === document.querySelector(".step") && __addedNodes === 0'), 'Playback does not rebuild timeline cards or step cells')
            check(page.locator('#keySelect').is_disabled(), 'Timeline playback clearly locks unrelated editor controls')
            page.wait_for_timeout(800)
            check(page.locator('#metaMode').text_content().startswith('Timeline · B section'), 'Mixed-tempo playback advances to the next clip')
            page.screenshot(path=str(ARTIFACTS / 'studio-playing.png'), full_page=True)
            page.locator('#stopBtn').click()
            page.wait_for_function('ChipApp.diagnostics().audioState === "suspended"')
            diag = page.evaluate('ChipApp.diagnostics()')
            check(not diag['playing'] and diag['voices'] == 0 and diag['buses'] == 0 and not diag['animationActive'], 'Stop cancels sources, effects, scheduler and animation')
            page.evaluate('__observer.disconnect()')
            page.locator('#modeLoop').check()
            page.evaluate('document.querySelector("#playBtn").click(); document.querySelector("#stopBtn").click()')
            page.wait_for_timeout(120)
            check(not page.evaluate('ChipApp.diagnostics().playing'), 'Stop wins over an asynchronous Play/resume race')
            page.locator('#playBtn').click()
            page.wait_for_function('ChipApp.diagnostics().playing')
            set_range(page, '#densityRange', 0.4)
            page.locator('#stopBtn').click()
            page.wait_for_timeout(200)
            check(not page.evaluate('ChipApp.diagnostics().playing'), 'Pending control debounce cannot restart after Stop')
            page.locator('#loopNameInput').focus()
            page.keyboard.press('Space')
            check(not page.evaluate('ChipApp.diagnostics().playing'), 'Space does not hijack text entry')
            page.locator('#loopNameInput').blur()
            page.locator('#workspace').focus()
            page.keyboard.press('Space')
            page.wait_for_function('ChipApp.diagnostics().playing')
            page.keyboard.press('Space')
            page.wait_for_timeout(100)
            check(not page.evaluate('ChipApp.diagnostics().playing'), 'Space starts and stops outside editable controls')
            clock = page.evaluate('''async () => {
              const e = new ChipAudio.Engine();
              await e.start([ChipCore.makeClip('Clock',{...ChipCore.DEFAULTS,tempo:70,bars:1})]);
              const early = e.takeVisualEvent() === null;
              await new Promise(r=>setTimeout(r,105));
              const heard = e.takeVisualEvent(); await e.dispose();
              return {early, heard:heard?.step};
            }''')
            check(clock['early'] and clock['heard'] == 0, 'Visual events follow audio time, not scheduling lookahead')
            bounded = page.evaluate('''async () => {
              const e=new ChipAudio.Engine();await e.start([ChipCore.makeClip('Queue',{...ChipCore.DEFAULTS,tempo:190,bars:1})],0);
              await new Promise(r=>setTimeout(r,2900));const count=e.diagnostics.queuedVisuals;await e.dispose();return count;
            }''')
            check(0 < bounded <= 32, 'Visual event history stays bounded without an animation consumer')
            audio = page.evaluate('''async () => {
              const p={...ChipCore.DEFAULTS,tempo:190,bars:1,seed:42,echo:0.35,crunch:0.85};
              const render=async params=>new Uint8Array(await (await ChipAudio.renderWav([ChipCore.makeClip('Test',params)],{sampleRate:8000})).arrayBuffer());
              const a=await render(p),b=await render(p),dry=await render({...p,echo:0}),clean=await render({...p,crunch:0});
              const v=new DataView(a.buffer),vb=new DataView(b.buffer);let peak=0,maxRepeatDifference=0;
              for(let i=44;i<a.length;i+=2){peak=Math.max(peak,Math.abs(v.getInt16(i,true)));if(i<b.length)maxRepeatDifference=Math.max(maxRepeatDifference,Math.abs(v.getInt16(i,true)-vb.getInt16(i,true)));}
              const differs=x=>a.slice(44,16000).some((n,i)=>n!==x[i+44]);
              return {riff:String.fromCharCode(...a.slice(0,4)),rate:v.getUint32(24,true),peak,
                repeatable:a.length===b.length&&maxRepeatDifference<=1,maxRepeatDifference,echo:differs(dry),crunch:differs(clean)};
            }''')
            check(audio['riff'] == 'RIFF' and audio['rate'] == 8000 and audio['peak'] > 100, 'Offline engine renders non-silent valid PCM WAV')
            check(audio['repeatable'], 'Repeated seeded WAVs agree within one 16-bit PCM quantization level')
            check(audio['echo'] and audio['crunch'], 'Echo and crunch affect rendered audio, not just the controls')
            with page.expect_download() as pending:
                page.locator('#exportLoopBtn').click()
            download = pending.value
            download.save_as(str(ARTIFACTS / 'test-loop.wav'))
            with wave.open(str(ARTIFACTS / 'test-loop.wav'), 'rb') as wav:
                check(wav.getframerate() == 44100 and wav.getsampwidth() == 2 and wav.getnchannels() == 1, 'Loop WAV button downloads 44.1 kHz / 16-bit mono audio')
            check(not page.evaluate('ChipApp.diagnostics().exportBusy'), 'Export restores controls after completion')
            with page.expect_download() as pending:
                page.locator('#backupBtn').click()
            pending.value.save_as(str(ARTIFACTS / 'test-project.json'))
            backup = json.loads((ARTIFACTS / 'test-project.json').read_text())
            check(backup['version'] == 1 and len(backup['timeline']) == 4, 'Project backup contains the full arrangement')
            imported = dict(backup)
            imported['name'] = 'Imported project'
            page.locator('#importInput').set_input_files({'name':'project.json','mimeType':'application/json','buffer':json.dumps(imported).encode()})
            page.wait_for_function('ChipApp.snapshot().name === "Imported project"')
            check(snapshot(page)['name'] == 'Imported project', 'Validated project import replaces state')
            page.locator('#undoBtn').click()
            check(snapshot(page)['name'] == backup['name'], 'Project import can be undone')
            page.locator('#importInput').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"version":99}'})
            page.wait_for_function('document.querySelector("#noticeText").textContent.startsWith("Import failed")')
            check(snapshot(page)['name'] == backup['name'], 'Invalid import leaves the project untouched')
            page.evaluate('''() => {window.__originalStorage=window.localStorage;Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>__originalStorage.getItem(k),setItem:()=>{throw new Error('quota');}}});}''')
            page.locator('#loopNameInput').fill('Still usable without storage')
            page.wait_for_timeout(250)
            check('unavailable' in page.locator('#storageState').inner_text(), 'Storage failure is visible and does not crash the app')
            page.evaluate('Object.defineProperty(window,"localStorage",{configurable:true,value:__originalStorage})')
            check(not errors, 'No uncaught page errors or console errors')
            page.screenshot(path=str(ARTIFACTS / 'studio-populated.png'), full_page=True)
            browser.close()
            result['passed'] = len(checks)
    finally:
        server.shutdown()
        result.update(checks=checks, layouts=layouts, errors=errors)
        (ARTIFACTS / 'browser-report.json').write_text(json.dumps(result, indent=2))
    print(f'\n{len(checks)} browser checks passed ({result["mode"]}).', flush=True)

if __name__ == '__main__':
    run()
