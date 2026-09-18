"""Presentation regressions: truthful glyphs, input, modal, motion and layout.

Normal mode uses HTTP/localStorage. --inline is the documented restricted-browser
fallback, not a disk-persistence or deployment test.
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
from playwright.sync_api import sync_playwright
from browser_smoke import ROOT, ARTIFACTS, QuietHandler


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--inline', action='store_true')
    args = parser.parse_args()
    ARTIFACTS.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    html = (ROOT / 'index.html').read_text()
    html = re.sub(r'<script defer src="[^"]+"></script>', '', html)
    html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>'+(ROOT/'styles.css').read_text()+'</style>')
    html = html.replace('</body>', ''.join('<script>'+(ROOT/name).read_text()+'</script>' for name in ['core.js','audio.js','session.js','app.js'])+'</body>')
    checks, errors, layouts = [], [], []
    result = {'mode': 'inline / memory storage' if args.inline else 'HTTP / browser localStorage'}

    def check(value, name):
        assert value, name
        checks.append(name)
        print('PASS', name, flush=True)

    try:
        with sync_playwright() as p:
            launch = {'headless': True, 'args': ['--no-sandbox','--disable-dev-shm-usage']}
            executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
            if executable: launch['executable_path'] = executable
            browser = p.chromium.launch(**launch)
            result['browser'] = browser.version
            page = browser.new_page(viewport={'width':1366,'height':768})
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
            if args.inline:
                page.evaluate('''()=>{const store=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}});}''')
                page.set_content(html)
            else:
                page.goto(f'http://127.0.0.1:{server.server_port}/')
            page.wait_for_function('window.ChipApp!==undefined')
            initial = page.evaluate('ChipApp.snapshot()')
            check(page.locator('.step').count()==64 and page.locator('.note-mark').count()==192, 'All 64 note inspectors retain three glyph nodes each')
            check(page.locator('.step[tabindex="0"]').count()==4, 'Four keyboard row entry points instead of 64 tab stops')
            check(page.evaluate("getComputedStyle(document.querySelector('.sequencer')).color==='rgb(243, 241, 219)'"), 'Pattern heading inherits readable screen text, not dark faceplate ink')
            check('Pattern contour' in page.locator('#scopeLabel').text_content(), 'Stopped display describes a real pattern, not a pretend spectrum')
            contour = page.locator('#viz').evaluate('el=>el.toDataURL()')
            check(page.locator('#viz').evaluate('el=>el.getContext("2d").getImageData(0,0,el.width,el.height).data.some(v=>v!==0)'), 'Stopped contour contains rendered pattern information')
            accurate = page.evaluate('''()=>{
              const p=ChipApp.snapshot().params,loop=ChipCore.generateLoop(p);
              return ['lead','bass','drums','harmony'].every(track=>[...document.querySelectorAll(`[data-track=${track}] .step`)].every((el,i)=>{
                const n=loop[track][i],active=track==='drums'?!!(n&&(n.kick||n.snare||n.hat)):!!n;
                const label=!active?'':track==='drums'?['kick','snare','hat'].map(k=>n[k]?k[0].toUpperCase():'·').join(''):ChipCore.noteName(track==='harmony'?n[0]:n.midi);
                const marks=!active?0:track==='drums'?['kick','snare','hat'].filter(k=>n[k]).length:track==='harmony'?n.length:1;
                return el.dataset.note===label&&el.querySelectorAll('.note-mark:not([hidden])').length===marks;
              }));
            }''')
            check(accurate, 'Note labels and individual drum/chord glyphs match the generated data')
            page.locator('#leadSteps .step').first.focus()
            page.keyboard.press('End')
            check(page.locator('#leadSteps .step').nth(15).evaluate('el=>el===document.activeElement'), 'End inspects the last step')
            page.keyboard.press('ArrowDown')
            check(page.locator('#bassSteps .step').nth(15).evaluate('el=>el===document.activeElement'), 'Down keeps the column and moves to the next voice')
            page.keyboard.press('Home')
            page.keyboard.press('ArrowRight')
            check(page.locator('#bassSteps .step').nth(1).evaluate('el=>el===document.activeElement'), 'Home and Right move within the focused row')
            check('Bass · Bar 1 · Step 2:' in page.locator('#noteReadout').inner_text(), 'Inspection gives exact voice, bar, step and note text')
            check(page.evaluate('ChipApp.snapshot()')==initial, 'Inspecting notes does not edit the project or seed')
            page.locator('#barSelect').select_option('2')
            check('Bar 3' in page.locator('#noteReadout').inner_text(), 'Selected note readout follows the newly inspected bar')
            page.locator('#leadToggle').uncheck()
            check(page.locator('[data-track=lead]').evaluate('el=>el.classList.contains("muted")'), 'Mute is indicated by row state as well as checkbox and color')
            page.locator('#leadToggle').check()
            page.locator('#rerollBtn').click()
            check(page.locator('#viz').evaluate('el=>el.toDataURL()')!=contour, 'A new seed redraws the actual contour')
            page.locator('#tempoRange').evaluate('el=>{el.value=70;el.dispatchEvent(new Event("input",{bubbles:true}));}')
            check(page.locator('#tempoRange').evaluate('el=>el.style.getPropertyValue("--fill")')=='0%', 'Slider fill starts at its actual minimum')
            page.locator('#tempoRange').evaluate('el=>{el.value=190;el.dispatchEvent(new Event("input",{bubbles:true}));}')
            check(page.locator('#tempoRange').evaluate('el=>el.style.getPropertyValue("--fill")')=='100%', 'Slider fill reaches its actual maximum')
            before_guide = page.evaluate('ChipApp.snapshot()')
            page.locator('#helpBtn').click()
            check(page.locator('#helpDialog').evaluate('el=>el.open') and page.locator('#closeHelpBtn').evaluate('el=>el===document.activeElement'), 'Native guide opens with focus on its close control')
            page.keyboard.press('Tab')
            check(page.evaluate('document.querySelector("#helpDialog").contains(document.activeElement)'), 'Tab focus stays inside the modal guide')
            page.keyboard.press('g')
            check(page.evaluate('ChipApp.snapshot()')==before_guide, 'Guide keyboard input cannot accidentally generate a new pattern')
            page.screenshot(path=str(ARTIFACTS/'style-guide.png'))
            page.keyboard.press('Escape')
            check(not page.locator('#helpDialog').evaluate('el=>el.open') and page.locator('#helpBtn').evaluate('el=>el===document.activeElement'), 'Escape closes the guide and returns focus')
            page.locator('#helpBtn').click();page.locator('#closeHelpBtn').click()
            check(not page.locator('#helpDialog').evaluate('el=>el.open'), 'Guide also closes with its visible button')
            page.emulate_media(reduced_motion='reduce')
            page.locator('#playBtn').click()
            page.wait_for_function('ChipApp.diagnostics().playing')
            page.wait_for_timeout(150)
            still = page.locator('#viz').evaluate('el=>el.toDataURL()')
            page.wait_for_timeout(300)
            check('Pattern contour' in page.locator('#scopeLabel').text_content() and page.locator('#viz').evaluate('el=>el.toDataURL()')==still, 'Reduced motion keeps the contour static during playback')
            page.locator('#stopBtn').click()
            page.emulate_media(reduced_motion='no-preference')
            page.locator('#playBtn').click()
            page.wait_for_function('document.querySelector("#scopeLabel").textContent==="Output spectrum"')
            check(page.evaluate('document.body.dataset.playing==="true"'), 'Live spectrum and transport indicate actual playback')
            page.locator('#stopBtn').click()
            page.wait_for_function('!ChipApp.diagnostics().animationActive')
            check('Pattern contour' in page.locator('#scopeLabel').text_content(), 'Stop restores the contour and stops the animation loop')
            # Muted saved clips must display their own checkbox state, not the editor's.
            page.locator('#leadToggle').uncheck();page.locator('#saveLoopBtn').click()
            page.locator('#savedLoops .clip').first.locator('[data-action=add]').click()
            page.locator('#leadToggle').check()
            page.locator('label:has(#modeTimeline)').click();page.locator('#playBtn').click()
            page.wait_for_function('ChipApp.diagnostics().playing && !document.querySelector("#leadToggle").checked')
            check(page.locator('#leadToggle').is_disabled() and not page.locator('#leadToggle').is_checked(), 'Timeline voice checkboxes reflect the sounding clip, not unrelated editor settings')
            check(page.evaluate('ChipApp.snapshot().params.leadOn'), 'Timeline display does not mutate the editor mute settings')
            page.locator('#stopBtn').click()
            check(page.locator('#leadToggle').is_checked(), 'Stop restores the editor voice checkboxes')
            page.locator('#clearTimelineBtn').click()
            page.locator('#savedLoops .clip').first.locator('[data-action=remove]').click()
            page.locator('label:has(#modeLoop)').click()
            # Build a reproducible display project from authored presets, no fabricated audio.
            preset_ids = page.locator('#presetSelect option').evaluate_all('els=>els.map(el=>el.value).filter(Boolean)')
            for value in preset_ids:
                page.locator('#presetSelect').select_option(value);page.locator('#saveLoopBtn').click()
            page.locator('#savedLoops .clip').nth(2).locator('[data-action=add]').click()
            page.locator('#savedLoops .clip').nth(4).locator('[data-action=add]').click()
            page.locator('#savedLoops .clip').nth(0).locator('[data-action=add]').click()
            check(page.locator('.clip-glyph').count()==9, 'Saved and arranged clips have real, retained contour thumbnails')
            page.locator('#presetSelect').select_option('night')
            page.locator('#loopNameInput').fill('A very long loop name <not markup> '+('abc '*15))
            page.locator('#saveLoopBtn').click()
            page.locator('#presetSelect').select_option('night')
            page.locator('#loopNameInput').blur()
            for width,height in [(1920,1080),(1366,768),(1024,768),(768,1024),(390,844),(320,700)]:
                page.set_viewport_size({'width':width,'height':height})
                if width<=740: page.locator('.controls details').evaluate_all('els=>els.forEach(el=>el.open=false)')
                layout=page.evaluate('''()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,minNoteWidth:Math.min(...[...document.querySelectorAll('.step')].map(el=>el.getBoundingClientRect().width)),patternWidth:document.querySelector('.pattern-scroll').clientWidth,patternContent:document.querySelector('.pattern-scroll').scrollWidth})''')
                layouts.append(layout)
                check(layout['documentWidth']<=width and layout['minNoteWidth']>=24, f'{width}px: no page overflow; note targets stay at least 24px wide')
                page.screenshot(path=str(ARTIFACTS/f'style-{width}.png'),full_page=True)
            check(layouts[-1]['patternContent']>layouts[-1]['patternWidth'], 'Narrow screen overflow stays in a scrollable pattern surface')
            page.locator('#leadSteps .step').first.focus();page.keyboard.press('End')
            check(page.locator('.pattern-scroll').evaluate('el=>el.scrollLeft>0'), 'Keyboard inspection scrolls the final step into view on mobile')
            page.locator('#helpBtn').click()
            check(page.locator('#helpDialog').evaluate('el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}'), 'Guide fits a 320px viewport with internal vertical scrolling')
            page.keyboard.press('Escape')
            page.emulate_media(forced_colors='active')
            check(page.locator('.step.active').first.evaluate('el=>getComputedStyle(el).borderTopStyle!=="none"'), 'Forced-colors mode retains active-note outlines')
            check(not errors, 'No uncaught page or console errors in presentation checks')
            browser.close()
    finally:
        server.shutdown()
        result.update(passed=len(checks),checks=checks,errors=errors,layouts=layouts)
        (ARTIFACTS/'visual-report.json').write_text(json.dumps(result,indent=2))
    print(f'\n{len(checks)} presentation checks passed ({result["mode"]}).',flush=True)

if __name__=='__main__': run()
