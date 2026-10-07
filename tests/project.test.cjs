const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const Project = require('../project-state.js');
const html = readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const context = vm.createContext({});
vm.runInContext(html.slice(html.indexOf('    const NOTES ='),html.indexOf('    const ui =')),context);
vm.runInContext(html.slice(html.indexOf('    function mulberry32'),html.indexOf('    function createBitCrusher')),context);
vm.runInContext(html.slice(html.indexOf('    function getScaleMidis'),html.indexOf('    function generateLoop()')),context);
const scales = vm.runInContext('Object.keys(SCALES)',context);
function project() {
  const params = {key:'C',scale:'minor',tempo:120,bars:4,swing:.08,density:.68,variation:.46,octave:4,arpBias:.42,echo:.14,crunch:.35,seed:4312,leadWave:'square',bassWave:'triangle',leadOn:true,bassOn:true,drumsOn:true,harmonyOn:true};
  context.params = params;
  const loop = clone(vm.runInContext('generateLoopFromParams(params)',context));
  const clip = {id:'a',name:'First <literal>',params,loop};
  return {format:'8bit-music',version:1,name:'Current',playMode:'timeline',params,loop,savedLoops:[clone(clip)],timeline:[clone(clip),{...clone(clip),id:'b'}]};
}
test('portable project round trip retains actual notes, sound, library and arrangement independently', () => {
  const p = project(); p.timeline[1].loop.lead[0] = {midi:72,len:4,vel:.4};
  const restored = Project.parse(JSON.stringify(p),scales);
  assert.deepEqual(restored,p);
  restored.timeline[1].loop.lead[0].midi = 80;
  assert.equal(p.timeline[1].loop.lead[0].midi,72);
  assert.notDeepEqual(restored.loop.lead[0],restored.timeline[1].loop.lead[0]);
});
test('all supported scales and extreme legal generation settings produce valid portable notes', () => {
  for (const scale of scales) for (const octave of [3,6]) for (const bars of [1,8]) {
    const p = project(); Object.assign(p.params,{scale,octave,bars,seed:999999}); context.params=p.params;
    p.loop=clone(vm.runInContext('generateLoopFromParams(params)',context));
    assert.doesNotThrow(()=>Project.validate(p,scales));
  }
});
test('hostile or inconsistent imports fail before application and cannot inject state keys', () => {
  const changes = [p=>p.version=9,p=>p.params.tempo=0,p=>p.params.seed=Infinity,p=>p.params.scale='constructor',p=>p.params.leadOn='false',p=>p.loop.totalSteps=999999,
    p=>p.loop.lead[0]={midi:999,len:1,vel:.5},p=>p.loop.drums[0].kick='true',p=>p.loop.harmony[0]=[NaN],p=>p.timeline[1].id='a',p=>p.timeline[1].id='" onfocus=x',p=>p.name='x'.repeat(121),p=>p.timeline=Array(65).fill(p.timeline[0])];
  for (const change of changes) { const p=project(); change(p); assert.throws(()=>Project.validate(p,scales)); }
  assert.throws(()=>Project.parse('{bad',scales),/valid JSON/);
  assert.throws(()=>Project.parse('x'.repeat(5_000_001),scales),/5 MB/);
  const p=project();p.audio={running:true};p.loop.unknown='ignored';
  const clean=Project.validate(p,scales); assert.equal(clean.audio,undefined);assert.equal(clean.loop.unknown,undefined);
});
test('history restores exact clips across reorder, removal, clear and import, invalidates redo and bounds memory', () => {
  const history=new Project.History(); let p=project(), initial=clone(p);
  history.remember(p);p.timeline.reverse();const reversed=clone(p);
  history.remember(p);p.timeline.pop();
  history.remember(p);p.timeline=[];
  p=history.move(p);assert.equal(p.timeline.length,1);
  p=history.move(p);assert.deepEqual(p,reversed);
  p=history.move(p);assert.deepEqual(p,initial);
  p=history.move(p,true);assert.deepEqual(p,reversed);
  history.remember(p);assert.equal(history.future.length,0);
  for(let i=0;i<50;i++){history.remember(p);p.name='Step '+i;}
  assert.ok(history.past.length<=30);assert.ok(history.past.reduce((n,s)=>n+s.length,0)<=4_000_000);
});
function persistence(store) {
  const ui={loopNameInput:{value:'Current'},projectStatus:{setAttribute(){}},autosaveStatus:{},keepProjectBtn:{hidden:true},undoProjectBtn:{},redoProjectBtn:{}};
  const p=project(), state={...clone(p),isPlaying:false};
  const ctx=vm.createContext({ui,state,MusicProject:Project,SCALES:Object.fromEntries(scales.map(s=>[s,[]])),clone,
    setTimeout:()=>1,clearTimeout(){},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},stopPlayback(){state.isPlaying=false;},syncInputs(){},updateFx(){},refreshUI(){}});
  vm.runInContext(html.slice(html.indexOf('    const projectHistory'),html.indexOf('    const midiToFreq')),ctx);
  return {ui,state,run:s=>vm.runInContext(s,ctx)};
}
test('autosave roundtrip and malformed-current recovery preserve original storage until explicitly resumed', () => {
  const store=new Map(); const app=persistence(store);app.run('flushProject()');
  const saved=store.get('8bit-music.current.v1'); assert.ok(saved);
  app.state.timeline=[]; app.run('flushProject()'); assert.equal(store.get('8bit-music.backup.v1'),saved);
  store.set('8bit-music.current.v1','damaged');
  app.run('loadAutosave()'); assert.equal(app.state.timeline.length,2);assert.equal(app.ui.keepProjectBtn.hidden,false);
  app.state.timeline=[];app.run('flushProject()');assert.equal(store.get('8bit-music.current.v1'),'damaged');
  app.run("autosaveAllowed=true;lastSaved='';flushProject()");assert.equal(JSON.parse(store.get('8bit-music.current.v1')).timeline.length,0);
});
test('background autosave preserves actionable feedback and reports persistence separately', () => {
  const app=persistence(new Map());app.run("projectStatus('Project opened. Undo restores your previous workspace.');flushProject()");
  assert.equal(app.ui.projectStatus.textContent,'Project opened. Undo restores your previous workspace.');
  assert.match(app.ui.autosaveStatus.textContent,/Saved in this browser/);
});
test('Stop invalidates a pending audio resume before it can restart transport', async () => {
  let resolve, starts=0;
  const state={audio:{ctx:{state:'suspended',resume:()=>new Promise(r=>resolve=r),currentTime:0}},params:{bars:4},loop:{},timeline:[],playMode:'loop',isPlaying:false};
  const ctx=vm.createContext({state,ui:{playState:{},currentBar:{},currentStep:{}},initAudio(){},readInputs(){},generateLoop(){},updatePlaybackControls(){},refreshPreview(){},previewClip(){return {loop:state.loop};},renderStepGrids(){},renderTimeline(){},clearInterval(){},startTransportLoop(){starts++;}});
  vm.runInContext('let playRequest=0;'+html.slice(html.indexOf('    async function startPlayback('),html.indexOf('    function renderStepGrid(')),ctx);
  const start=vm.runInContext('startPlayback()',ctx);vm.runInContext('stopPlayback()',ctx);resolve();await start;
  assert.equal(starts,0);assert.equal(state.isPlaying,false);
});
test('oversized WAV fails before allocating its audio buffer', () => {
  const ctx=vm.createContext({});vm.runInContext(html.slice(html.indexOf('    function renderSequenceOffline('),html.indexOf('    function downloadBlob(')),ctx);
  assert.throws(()=>vm.runInContext('renderSequenceOffline([{loop:{totalSteps:128},params:{tempo:1}}])',ctx),/ten minutes/);
});
test('slow imports cannot overwrite subsequent edits or a more recently chosen backup', async () => {
  let current=project(), applies=0, message='';
  const ui={projectFile:{files:[],value:''}};
  const ctx=vm.createContext({ui,MusicProject:Project,SCALES:Object.fromEntries(scales.map(s=>[s,[]])),
    captureProject:()=>clone(current),rememberProject(){},applyProject:p=>{current=p;applies++;},refreshUI(){},projectStatus:m=>message=m});
  vm.runInContext('let importRequest=0;'+html.slice(html.indexOf('      ui.projectFile.onchange ='),html.indexOf('      ui.keepProjectBtn.onclick')),ctx);
  let resolve;
  ui.projectFile.files=[{size:100,text:()=>new Promise(r=>resolve=r)}];
  let pending=ui.projectFile.onchange(); current.name='New edit';resolve(JSON.stringify(project()));await pending;
  assert.equal(applies,0);assert.match(message,/workspace changed/);assert.equal(current.name,'New edit');
  ui.projectFile.files=[{size:100,text:()=>new Promise(r=>resolve=r)}];pending=ui.projectFile.onchange();
  const newer=project();newer.name='Newer backup';
  ui.projectFile.files=[{size:100,text:async()=>JSON.stringify(newer)}];await ui.projectFile.onchange();
  resolve(JSON.stringify(project()));await pending;
  assert.equal(applies,1);assert.equal(current.name,'Newer backup');
});
