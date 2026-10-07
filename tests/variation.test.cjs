const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const Variation = require('../pattern-tools.js');
const Project = require('../project-state.js');
const html = readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const clone = x => JSON.parse(JSON.stringify(x));
const params = {key:'C',scale:'minor',tempo:120,bars:4,swing:.08,density:.68,variation:.46,octave:4,arpBias:.42,echo:.14,crunch:.35,seed:4312,leadWave:'square',bassWave:'triangle',leadOn:true,bassOn:true,drumsOn:true,harmonyOn:true};
function generator() {
  const context = vm.createContext({params:clone(params)});
  vm.runInContext(html.slice(html.indexOf('    const NOTES ='),html.indexOf('    const ui =')),context);
  vm.runInContext(html.slice(html.indexOf('    function mulberry32'),html.indexOf('    function createBitCrusher')),context);
  vm.runInContext(html.slice(html.indexOf('    function getScaleMidis'),html.indexOf('    function generateLoop()')),context);
  return context;
}
test('constrained variations preserve other layers, all other bars and progression; deterministic and independent', () => {
  const ctx = generator(), source = clone(vm.runInContext('generateLoopFromParams(params)',ctx));
  ctx.source=source;
  const candidate = clone(vm.runInContext('generateLoopFromParams({...params,seed:84122},source.progression)',ctx));
  assert.deepEqual(candidate.progression,source.progression);
  for (const track of ['lead','bass','drums','harmony']) for (const amount of [.25,.5,1]) {
    const options={track,amount,bar:1,seed:73};
    const a=Variation.vary(source,candidate,options), b=Variation.vary(source,candidate,options);
    assert.deepEqual(a,b);
    for(const other of ['lead','bass','drums','harmony']) if(other!==track) assert.deepEqual(a.loop[other],source[other]);
    assert.deepEqual(a.loop.progression,source.progression);
    assert.deepEqual(a.loop[track].slice(0,16),source[track].slice(0,16));
    assert.deepEqual(a.loop[track].slice(32),source[track].slice(32));
    const differences=source[track].slice(16,32).filter((n,i)=>JSON.stringify(n)!==JSON.stringify(candidate[track][i+16])).length;
    assert.equal(a.changed,Math.ceil(differences*amount));
    a.loop.drums[0].kick=!a.loop.drums[0].kick;
    assert.notDeepEqual(a.loop.drums[0],source.drums[0]);
  }
  assert.equal(Variation.vary(source,source,{track:'lead'}).changed,0);
  for(const options of [{track:'unknown'},{track:'lead',bar:4},{track:'lead',bar:NaN},{track:'lead',amount:0},{track:'lead',seed:0}]) assert.throws(()=>Variation.vary(source,candidate,options));
});
test('Save Loop snapshots actual imported or varied notes and leaves editor and older clips intact', () => {
  const ctx=generator(), loop=clone(vm.runInContext('generateLoopFromParams(params)',ctx));
  loop.lead[0]={midi:72,len:16,vel:.3};
  const before=clone(loop), state={params:clone(params),loop,savedLoops:[],isPlaying:true};let remembers=0;
  Object.assign(ctx,{state,MusicProject:Project,ui:{loopNameInput:{value:'Edited'},clipStatus:{}},readInputs(){},rememberProject(){remembers++;},clone,uid:()=> 'first',refreshUI(){},projectStatus(){}});
  vm.runInContext(html.slice(html.indexOf('    function saveCurrentLoop()'),html.indexOf('    function loadLoop(')),ctx);
  vm.runInContext('saveCurrentLoop()',ctx);
  assert.deepEqual(state.savedLoops[0].loop,before);assert.deepEqual(state.loop,before);assert.equal(remembers,1);assert.equal(state.isPlaying,true);
  state.loop.lead[0].midi=80;assert.equal(state.savedLoops[0].loop.lead[0].midi,72);
});
test('sound, mute and transport input events never regenerate actual notes; composing gestures undo once', () => {
  const ids=['keySelect','scaleSelect','barsRange','densityRange','variationRange','octaveRange','arpRange','seedInput','swingRange','leadWaveSelect','bassWaveSelect','leadToggle','bassToggle','drumsToggle','harmonyToggle','echoRange','bitcrushRange','tempoRange','modeLoop','modeTimeline','variationTrack','varyBtn'];
  const ui=Object.fromEntries(ids.map(id=>[id,{events:{},addEventListener(event,fn){this.events[event]=fn;}}]));
  let regenerations=0, remembers=0, stops=0;
  const ctx=vm.createContext({ui,state:{audio:null,params:{seed:42}},rememberProject(){remembers++;},readInputs(){},generateLoop(){regenerations++;},refreshUI(){},stopPlayback(){stops++;},updateVariationChoices(){},varyCurrentLayer(){}});
  vm.runInContext(html.slice(html.indexOf('      const compose ='),html.indexOf('      ui.playBtn.onclick')),ctx);
  for(const id of ['swingRange','leadWaveSelect','bassWaveSelect','leadToggle','bassToggle','drumsToggle','harmonyToggle','echoRange','bitcrushRange','tempoRange']) ui[id].events.input();
  ui.modeTimeline.events.change(); assert.equal(regenerations,0);assert.equal(stops,1);
  ui.densityRange.events.input();ui.densityRange.events.input();ui.densityRange.events.change();
  assert.equal(remembers,1);assert.equal(regenerations,3);
  ui.densityRange.events.input();ui.densityRange.events.change();assert.equal(remembers,2);
});
test('actual UI variation is a single undoable edit and survives complete project validation', () => {
  const ctx=generator(), loop=clone(vm.runInContext('generateLoopFromParams(params)',ctx));
  const state={params:clone(params),loop,savedLoops:[{id:'library',name:'Original',params:clone(params),loop:clone(loop)}],timeline:[]};
  const history=new Project.History();
  const capture=()=>({format:'8bit-music',version:1,name:'Example',params:clone(state.params),loop:clone(state.loop),savedLoops:clone(state.savedLoops),timeline:[],playMode:'loop'});
  state.loop.progression=[11,8,2,0];
  state.loop.harmony[32]=[60,67,74,81];
  const before=capture();
  const ui={variationTrack:{value:'lead'},variationBar:{value:'2'},variationAmount:{value:'1'},variationStatus:{}};
  Object.assign(ctx,{state,ui,MusicVariation:Variation,rememberProject:()=>history.remember(capture()),refreshUI(){},Math:Object.create(Math)});
  ctx.Math.random=()=>.834122;
  vm.runInContext(html.slice(html.indexOf('    function varyCurrentLayer()'),html.indexOf('    function randomizeSettings()')),ctx);
  vm.runInContext('varyCurrentLayer()',ctx);
  assert.equal(history.past.length,1);assert.deepEqual(state.savedLoops,before.savedLoops);assert.deepEqual(state.params,before.params);
  assert.notDeepEqual(state.loop.lead,before.loop.lead);
  const saved=Project.parse(JSON.stringify(capture()),vm.runInContext('Object.keys(SCALES)',ctx));
  assert.deepEqual(saved.loop,state.loop);assert.deepEqual(history.move(capture()),before);
  const beforeHarmony=clone(state.loop);
  ui.variationTrack.value='harmony';vm.runInContext('varyCurrentLayer()',ctx);
  assert.deepEqual(state.loop.progression,beforeHarmony.progression);
  for(const track of ['lead','bass','drums']) assert.deepEqual(state.loop[track],beforeHarmony[track]);
  assert.deepEqual(state.loop.harmony.slice(0,32),beforeHarmony.harmony.slice(0,32));
  assert.deepEqual(state.loop.harmony.slice(48),beforeHarmony.harmony.slice(48));
  assert.doesNotThrow(()=>Project.validate(capture(),vm.runInContext('Object.keys(SCALES)',ctx)));
});
test('Stop mutes output, terminates all scheduled voices and replaces the echo buffer before restart', () => {
  let stopped=0, disconnected=0, muted=0;
  const node=()=>({connect(){},disconnect(){disconnected++;},gain:{value:0},delayTime:{value:0}});
  const source={stop(){stopped++;},disconnect(){disconnected++;}};
  const audio={sources:new Map([[source,[node()]]]),master:{gain:{cancelScheduledValues(){},setValueAtTime(value){muted=value;}}},dry:node(),delay:node(),feedback:node(),wet:node(),ctx:{currentTime:12,createDelay:node,createGain:node}};
  const oldDelay=audio.delay;
  const ctx=vm.createContext({state:{audio,params:clone(params)}});
  vm.runInContext(html.slice(html.indexOf('    function silenceAudio()'),html.indexOf('    function renderStepGrid(')),ctx);
  vm.runInContext('silenceAudio()',ctx);
  assert.equal(stopped,1);assert.equal(muted,0);assert.equal(audio.sources.size,0);assert.ok(disconnected>=5);assert.notEqual(audio.delay,oldDelay);
  vm.runInContext('silenceAudio()',ctx);assert.equal(stopped,1);
});
test('WAV output has a valid mono PCM header, expected duration and non-silent samples', async () => {
  const ctx=generator(), loop=clone(vm.runInContext('generateLoopFromParams({...params,bars:1})',ctx));
  Object.assign(ctx,{midiToFreq:m=>440*Math.pow(2,(m-69)/12),Blob,sequence:[{params:{...params,bars:1},loop}]});
  vm.runInContext(html.slice(html.indexOf('    function floatTo16BitPCM('),html.indexOf('    function downloadBlob(')),ctx);
  const rendered=vm.runInContext('renderSequenceOffline(sequence)',ctx);
  const wav=await rendered.arrayBuffer();
  assert.equal(wav.byteLength,44+Math.ceil(2.6*44100)*2);
  const bytes=new Uint8Array(wav);assert.equal(String.fromCharCode(...bytes.slice(0,4)),'RIFF');
  const view=new DataView(wav);assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint32(24,true),44100);assert.equal(view.getUint16(34,true),16);
  const samples=new Int16Array(wav.slice(44));assert.ok(samples.some(n=>Math.abs(n)>100));
});

test('audio resume errors stay stopped and report recoverable feedback', async () => {
  let message='';
  const state={audio:{ctx:{state:'suspended',resume:async()=>{throw Error('Unavailable');}}},params:{},timeline:[],playMode:'loop',isPlaying:false};
  const ctx=vm.createContext({state,readInputs(){},initAudio(){},updatePlaybackControls(){},projectStatus:m=>message=m});
  vm.runInContext('let playRequest=0;'+html.slice(html.indexOf('    async function startPlayback('),html.indexOf('    function stopPlayback()')),ctx);
  await vm.runInContext('startPlayback()',ctx);
  assert.equal(state.isPlaying,false);assert.match(message,/Try Play again/);
});
