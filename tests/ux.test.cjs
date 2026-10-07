const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const html=readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
function preview() {
  const state={playMode:'loop',isPlaying:false,isStarting:false,activeTimelineClipIndex:0,params:{key:'C',scale:'minor',tempo:120,bars:4,leadOn:true},loop:{id:'editor'},timeline:[]};
  const ui=Object.fromEntries(['previewLabel','songTitle','metaTempo','metaBars','metaMode','currentBar','currentStep','playBtn','stopBtn','playState','transportHint','clearTimelineBtn','exportTimelineBtn','saveLoopBtn'].map(id=>[id,{}]));
  const ctx=vm.createContext({state,ui,prettyScaleName:x=>x});
  vm.runInContext(html.slice(html.indexOf('    function previewClip()'),html.indexOf('    function refreshUI()')),ctx);
  return {state,ui,run:code=>vm.runInContext(code,ctx)};
}
test('play controls explain empty arrangements, prevent duplicate starts and allow cancelling pending audio',()=>{
  const app=preview();app.run('updatePlaybackControls()');
  assert.equal(app.ui.playBtn.disabled,false);assert.equal(app.ui.stopBtn.disabled,true);
  app.state.isStarting=true;app.run('updatePlaybackControls()');
  assert.equal(app.ui.playBtn.disabled,true);assert.equal(app.ui.stopBtn.disabled,false);assert.equal(app.ui.playBtn.textContent,'Starting…');
  app.state.isStarting=false;app.state.playMode='timeline';app.run('updatePlaybackControls()');
  assert.equal(app.ui.playBtn.disabled,true);assert.equal(app.ui.clearTimelineBtn.disabled,true);assert.equal(app.ui.exportTimelineBtn.disabled,true);
  assert.match(app.ui.transportHint.textContent,/Add to arrangement/);assert.equal(app.ui.saveLoopBtn.textContent,'Save editor loop');
  app.state.timeline=[{id:'saved'}];app.run('updatePlaybackControls()');
  assert.equal(app.ui.playBtn.disabled,false);assert.equal(app.ui.exportTimelineBtn.disabled,false);
  app.state.playMode='loop';app.state.params.leadOn=false;app.run('updatePlaybackControls()');
  assert.match(app.ui.transportHint.textContent,/All layers are muted/);
});
test('preview follows actual arrangement clips and shows a useful empty state without editor fallback',()=>{
  const app=preview();app.run('refreshPreview()');assert.equal(app.ui.songTitle.textContent,'C minor loop');
  app.state.playMode='timeline';app.run('refreshPreview()');assert.equal(app.run('previewClip()'),undefined);
  assert.equal(app.ui.currentBar.textContent,'—');assert.equal(app.ui.songTitle.textContent,'Your song starts here');
  app.state.timeline=[{name:'Verse',params:{tempo:95,bars:2},loop:{id:'verse'}},{name:'Chorus',params:{tempo:160,bars:8},loop:{id:'chorus'}}];
  app.run('refreshPreview()');assert.equal(app.ui.songTitle.textContent,'Verse');assert.equal(app.ui.metaTempo.textContent,'95 BPM');assert.equal(app.ui.currentBar.textContent,'1 / 2');
  app.state.isPlaying=true;app.state.activeTimelineClipIndex=1;app.run('refreshPreview()');
  assert.equal(app.ui.songTitle.textContent,'Chorus');assert.equal(app.ui.metaTempo.textContent,'160 BPM');assert.equal(app.run('previewClip().loop.id'),'chorus');
  app.state.isPlaying=false;app.run('refreshPreview()');assert.equal(app.ui.songTitle.textContent,'Verse');
});
