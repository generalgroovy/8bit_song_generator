const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const html=readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');

function app(suspended=false){
  const resumes=[], played=[];
  let starts=0, message='';
  const clip=(id,steps)=>({id,name:id,loop:{id,totalSteps:steps},params:{bars:steps/16,tempo:120,swing:0}});
  const state={playMode:'loop',isPlaying:false,isStarting:false,loop:{id:'editor',totalSteps:64},params:{bars:4},savedLoops:[clip('saved',16)],timeline:[clip('intro',16),clip('verse',32),clip('end',16)],activeTimelineClipIndex:0,
    audio:{ctx:{state:suspended?'suspended':'running',currentTime:0,resume:()=>new Promise(resolve=>resumes.push(resolve))},master:{gain:{setValueAtTime(){}}}}};
  const ui={loopNameInput:{value:'Unsaved editor'}};
  const context=vm.createContext({state,ui,initAudio(){},readInputs(){},syncInputs(){},refreshUI(){},refreshPreview(){},previewClip(){return state.timeline[state.activeTimelineClipIndex];},renderStepGrids(){},renderTimeline(){},clearInterval(){},updatePlaybackControls(){},startTransportLoop(){starts++;},projectStatus(value){message=value;},playLoopStep(loop,_params,step){played.push({id:loop.id,step});}});
  vm.runInContext('let playRequest=0;'+html.slice(html.indexOf('    function playTimelineFrom('),html.indexOf('    function renderStepGrid(')),context);
  vm.runInContext(html.slice(html.indexOf('    function getSequence()'),html.indexOf('    function scheduleTone(')),context);
  vm.runInContext(html.slice(html.indexOf('    function scheduleAhead()'),html.indexOf('    function transportTick()')),context);
  return {state,ui,resumes,played,run:code=>vm.runInContext(code,context),starts:()=>starts,message:()=>message};
}

test('Play from here switches to the chosen position without replacing editor or saved musical content',async()=>{
  const a=app(), before=JSON.stringify({loop:a.state.loop,params:a.state.params,saved:a.state.savedLoops,timeline:a.state.timeline});
  await a.run("playTimelineFrom('verse')");
  assert.equal(a.state.playMode,'timeline');assert.equal(a.state.isPlaying,true);
  assert.equal(a.state.stepIndex,16);assert.equal(a.state.activeTimelineClipIndex,1);
  a.run('scheduleAhead()');
  assert.deepEqual(a.played,[{id:'verse',step:0}]);
  assert.equal(JSON.stringify({loop:a.state.loop,params:a.state.params,saved:a.state.savedLoops,timeline:a.state.timeline}),before);
  assert.equal(a.ui.loopNameInput.value,'Unsaved editor');
});

test('starting from the last clip continues through the arrangement and wraps to its beginning',async()=>{
  const a=app();await a.run("playTimelineFrom('end')");
  assert.equal(a.state.stepIndex,48);
  a.state.stepIndex=63;a.run('scheduleAhead()');
  assert.deepEqual(a.played,[{id:'end',step:15}]);assert.equal(a.state.stepIndex,0);
  a.state.audio.ctx.currentTime=.125;a.run('scheduleAhead()');
  assert.deepEqual(a.played[1],{id:'intro',step:0});
});

test('Stop cancels a requested clip while audio resume is pending',async()=>{
  const a=app(true), pending=a.run("playTimelineFrom('verse')");
  assert.equal(a.state.isStarting,true);assert.equal(a.state.activeTimelineClipIndex,1);
  a.run('stopPlayback()');a.resumes[0]();await pending;
  assert.equal(a.state.isPlaying,false);assert.equal(a.state.isStarting,false);assert.equal(a.starts(),0);
});

test('selecting a different clip cancels a previous pending start and uses the newest request',async()=>{
  const a=app(true), old=a.run("playTimelineFrom('verse')"), latest=a.run("playTimelineFrom('end')");
  a.resumes[0]();await old;assert.equal(a.starts(),0);
  a.resumes[1]();await latest;
  assert.equal(a.starts(),1);assert.equal(a.state.stepIndex,48);assert.equal(a.state.activeTimelineClipIndex,2);
});

test('pending playback resolves the current clip order and cancels when the requested clip was removed',async()=>{
  const a=app(true), pending=a.run("playTimelineFrom('end')");
  a.state.timeline=[a.state.timeline[2],a.state.timeline[0],a.state.timeline[1]];
  a.resumes[0]();await pending;assert.equal(a.state.stepIndex,0);assert.equal(a.state.activeTimelineClipIndex,0);
  const b=app(true), removed=b.run("playTimelineFrom('verse')");
  b.state.timeline=b.state.timeline.filter(clip=>clip.id!=='verse');b.resumes[0]();await removed;
  assert.equal(b.starts(),0);assert.equal(b.state.isStarting,false);assert.equal(b.state.isPlaying,false);
  assert.match(b.message(),/removed before playback started/);
});
