// Optional development check: Playwright, no production dependency.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const {chromium} = await import(process.env.PLAYWRIGHT_PATH ? pathToFileURL(process.env.PLAYWRIGHT_PATH).href : 'playwright');
const root=path.resolve('.'), output=path.join(root,'test-results'); await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if (!['/','/index.html','/project-state.js','/pattern-tools.js','/favicon.ico'].includes(pathname)){res.writeHead(404).end();return;}
  if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
  try {res.writeHead(200,{'Content-Type':pathname.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'no-store'});res.end(await readFile(path.join(root,pathname==='/'?'index.html':pathname.slice(1))));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const report=[];
try {
  for(const [width,height] of [[1440,900],[390,900],[320,900],[844,420]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:width<500,reducedMotion:'reduce'});
    const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.screenshot({path:path.join(output,`first-use-${width}.png`),fullPage:true});
    assert.equal(await page.locator('#savePanel').getAttribute('open'),null);
    assert.equal(await page.locator('#saveLoopBtn').isVisible(),true);
    assert.equal(await page.locator('#stopBtn').isDisabled(),true);
    const notes=await page.locator('#leadSteps').boundingBox();assert.ok(notes.y<height || height===420,'Notes appear before deep controls and empty arrangement');
    await page.locator('#modeTimeline').check();
    assert.equal(await page.locator('#playBtn').isDisabled(),true);assert.equal(await page.locator('#clearTimelineBtn').isDisabled(),true);
    assert.match(await page.locator('#transportHint').textContent(),/Add to arrangement/);
    assert.equal(await page.locator('#leadSteps .step').count(),0);
    await page.locator('#modeLoop').check();
    assert.equal(await page.locator('#leadSteps .step').count(),16);
    await page.locator('#keySelect').focus();
    assert.match(await page.locator('#keySelect').getAttribute('aria-describedby'),/^help-/);
    await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#tooltip').evaluate(el=>el.classList.contains('visible')),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#tooltip').evaluate(el=>el.classList.contains('visible')),false);
    await page.locator('#variationPanel > summary').click();
    const original=await page.evaluate(()=>captureProject());
    await page.locator('#variationBar').selectOption('1');
    await page.locator('#variationAmount').selectOption('1');
    await page.locator('#varyBtn').click();
    const varied=await page.evaluate(()=>captureProject());
    assert.notDeepEqual(varied.loop.lead.slice(16,32),original.loop.lead.slice(16,32));
    assert.deepEqual(varied.loop.lead.slice(0,16),original.loop.lead.slice(0,16));
    for(const track of ['bass','drums','harmony']) assert.deepEqual(varied.loop[track],original.loop[track]);
    await page.locator('#leadToggle').uncheck();await page.locator('#leadToggle').check();
    await page.locator('#modeTimeline').check();await page.locator('#modeLoop').check();
    assert.deepEqual(await page.evaluate(()=>captureProject().loop),varied.loop);
    await page.locator('#undoProjectBtn').click();assert.deepEqual(await page.evaluate(()=>captureProject().loop),original.loop);
    await page.locator('#redoProjectBtn').click();assert.deepEqual(await page.evaluate(()=>captureProject().loop),varied.loop);
    await page.locator('#playBtn').click();await page.waitForFunction(()=>state.isPlaying);
    const delay=await page.evaluateHandle(()=>state.audio.delay);
    await page.locator('#stopBtn').click();
    assert.equal(await page.evaluate(old=>state.audio.delay!==old,delay),true);
    await page.locator('#playBtn').click();await page.waitForFunction(()=>state.isPlaying);
    await page.locator('#stopBtn').click();
    await delay.dispose();
    // AudioParam values reflect the next audio render quantum, not the DOM event turn.
    await page.waitForFunction(()=>state.audio.master.gain.value===0,{},{timeout:1000});
    assert.deepEqual(await page.evaluate(()=>({playing:state.isPlaying,sources:state.audio.sources.size,output:state.audio.master.gain.value})),{playing:false,sources:0,output:0});
    await page.locator('#savePanel > summary').click();
    await page.getByRole('textbox',{name:'Loop name',exact:true}).fill('Verse');
    await page.locator('#saveLoopBtn').click();assert.deepEqual(await page.evaluate(()=>state.savedLoops[0].loop),varied.loop);await page.locator('#savedLoops').getByRole('button',{name:'Add to arrangement',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Add to arrangement');
    assert.match(await page.locator('#clipStatus').textContent(),/1 clip/);
    await page.getByRole('textbox',{name:'Loop name',exact:true}).fill('Chorus');await page.locator('#rerollBtn').click();await page.locator('#saveLoopBtn').click();
    await page.locator('#savedLoops .loop-chip').first().getByRole('button',{name:'Add to arrangement',exact:true}).click();
    await page.locator('#timelineItems .timeline-item').nth(1).getByRole('button',{name:'Move clip earlier',exact:true}).click();
    assert.deepEqual(await page.locator('#timelineItems .loop-name').allTextContents(),['Chorus','Verse']);
    await page.locator('#modeTimeline').check();assert.equal(await page.locator('#songTitle').textContent(),'Chorus');
    await page.locator('#timelineItems .timeline-item').nth(1).getByRole('button',{name:'Edit copy',exact:true}).click();
    assert.equal(await page.locator('#modeLoop').isChecked(),true);assert.equal(await page.locator('#keySelect').evaluate(el=>el===document.activeElement),true);
    assert.deepEqual(await page.evaluate(()=>state.loop),varied.loop);
    // Undo the independent edit-copy load before testing the earlier reorder history.
    await page.locator('#undoProjectBtn').click();
    await page.locator('#undoProjectBtn').click();assert.deepEqual(await page.locator('#timelineItems .loop-name').allTextContents(),['Verse','Chorus']);
    await page.locator('#redoProjectBtn').click();assert.deepEqual(await page.locator('#timelineItems .loop-name').allTextContents(),['Chorus','Verse']);
    await page.locator('#clearTimelineBtn').click();assert.equal(await page.locator('#timelineItems .timeline-item').count(),0);
    await page.locator('#undoProjectBtn').click();assert.equal(await page.locator('#timelineItems .timeline-item').count(),2);
    await page.locator('#savedLoops .loop-chip').first().getByRole('button',{name:'Remove',exact:true}).click();
    assert.equal(await page.locator('#savedLoops .loop-chip').count(),1);assert.equal(await page.locator('#timelineItems .timeline-item').count(),2);
    await page.locator('#undoProjectBtn').click();
    const downloadPromise=page.waitForEvent('download');await page.locator('#saveProjectBtn').click();
    const download=await downloadPromise, stream=await download.createReadStream(),chunks=[];for await(const chunk of stream) chunks.push(chunk);
    const exported=Buffer.concat(chunks),saved=JSON.parse(exported.toString());assert.equal(saved.timeline.length,2);assert.equal(saved.savedLoops.length,2);
    const choose=page.waitForEvent('filechooser');await page.locator('#importProjectBtn').focus();await page.keyboard.press('Enter');
    await (await choose).setFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{bad')});
    await page.waitForFunction(()=>document.getElementById('projectStatus').textContent.includes('not valid JSON'));
    assert.equal(await page.locator('#timelineItems .timeline-item').count(),2);
    await page.locator('#clearTimelineBtn').click();
    await page.locator('#projectFile').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:exported});
    await page.waitForFunction(()=>document.querySelectorAll('#timelineItems .timeline-item').length===2);
    await page.locator('#undoProjectBtn').click();assert.equal(await page.locator('#timelineItems .timeline-item').count(),0);
    await page.locator('#redoProjectBtn').click();assert.equal(await page.locator('#timelineItems .timeline-item').count(),2);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('8bit-music.current.v1')||'null')?.timeline.length===2);
    await page.reload();assert.deepEqual(await page.locator('#timelineItems .loop-name').allTextContents(),['Chorus','Verse']);
    assert.match(await page.locator('#projectStatus').textContent(),/Restored/);
    // Corruption recovery uses the previous valid draft and never overwrites the original automatically.
    await page.evaluate(()=>{localStorage.setItem('8bit-music.backup.v1',localStorage.getItem('8bit-music.current.v1'));localStorage.setItem('8bit-music.current.v1','broken');});
    await page.reload();assert.match(await page.locator('#projectStatus').textContent(),/Recovered the previous draft/);
    await page.locator('#savePanel > summary').click();
    await page.locator('#clearTimelineBtn').click();await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>localStorage.getItem('8bit-music.current.v1')),'broken');
    await page.locator('#keepProjectBtn').click();assert.equal(await page.locator('#keepProjectBtn').isVisible(),false);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('8bit-music.current.v1')).timeline.length),0);
    await page.locator('#undoProjectBtn').click();
    const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(geometry.scroll<=width+1,JSON.stringify(geometry));
    await page.screenshot({path:path.join(output,`project-${width}.png`),fullPage:true});
    assert.deepEqual(errors,[]);report.push({width,height,checks:['direct save without disclosure','empty arrangement and actionable playback state','notes near playback','keyboard tooltip and Escape','add/edit-copy focus','preview follows arrangement','selected layer/bar variation','sound and mode preserve actual notes','variation undo/redo','Stop clears live scheduled sources','save retains varied notes','save/add/reorder/undo/redo','clear/restore','library removal preserves timeline','JSON keyboard export/import/error preservation','import undo/redo','autosave/reload','corrupt recovery','mobile width'],geometry});
    console.log(`PASS ${width}: complete project workflow`);await context.close();
  }
} finally {await writeFile(path.join(output,'project-report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
