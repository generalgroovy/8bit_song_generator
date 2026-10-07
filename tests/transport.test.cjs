const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const html=readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
test('transport redraws only when the displayed step or loop changes',()=>{
  let step=0,grids=0,timeline=0;
  const clip={loop:{},params:{bars:4}};
  const state={stepIndex:0};
  const context=vm.createContext({state,ui:{currentBar:{},currentStep:{}},getSequenceTotalSteps:()=>64,findClipAndLocalStep:()=>({clip,clipIndex:0,localStep:step}),refreshPreview(){},renderStepGrids(){grids++;},renderTimeline(){timeline++;}});
  vm.runInContext(html.slice(html.indexOf('    function transportTick()'),html.indexOf('    function startTransportLoop()')),context);
  for(let i=0;i<40;i++)vm.runInContext('transportTick()',context);
  assert.equal(grids,1);assert.equal(timeline,1);
  step=1;vm.runInContext('transportTick()',context);assert.equal(grids,2);
  clip.loop={};vm.runInContext('transportTick()',context);assert.equal(grids,3);
});
function integrated(){
  let grids=0,stops=0;
  const state={playMode:'loop',timeline:[],params:{bars:4},loop:{totalSteps:64},stepIndex:0};
  const context=vm.createContext({state,rememberProject(){},clone:x=>JSON.parse(JSON.stringify(x)),ui:{loopNameInput:{value:'Test'},currentBar:{},currentStep:{}},refreshPreview(){},renderStepGrids(){grids++;},renderTimeline(){},stopPlayback(){stops++;},refreshUI(){}});
  vm.runInContext(html.slice(html.indexOf('    function getSequence()'),html.indexOf('    function scheduleTone(')),context);
  vm.runInContext(html.slice(html.indexOf('    function transportTick()'),html.indexOf('    function startTransportLoop()')),context);
  vm.runInContext(html.slice(html.indexOf('    function removeTimelineItem('),html.indexOf('    function moveTimelineItem(')),context);
  return {state,context,run:code=>vm.runInContext(code,context),grids:()=>grids,stops:()=>stops};
}
test('actual sequence lookup preserves loop identity so unchanged playback redraws once',()=>{
  const app=integrated();
  for(let i=0;i<40;i++)app.run('transportTick()');
  assert.equal(app.grids(),1);
  app.state.stepIndex=1;app.run('transportTick()');assert.equal(app.grids(),2);
});
test('empty timeline never falls back to current loop, and last removal stops playback',()=>{
  const app=integrated();app.state.playMode='timeline';
  assert.equal(app.run('getSequenceTotalSteps()'),0);
  app.state.timeline=[{id:'only',loop:{totalSteps:16}}];
  app.run("removeTimelineItem('only')");assert.equal(app.stops(),1);assert.equal(app.run('getSequenceTotalSteps()'),0);
});
test('clear timeline stops its transport but preserves loop-mode playback',()=>{
  const app=integrated();app.state.playMode='timeline';app.run('clearTimeline()');assert.equal(app.stops(),1);
  app.state.playMode='loop';app.run('clearTimeline()');assert.equal(app.stops(),1);
});
test('library and timeline names are text, even when they contain HTML',()=>{
  const rendered=[];const name='<img src=x onerror=alert(1)>';
  const node=()=>{const label={};const element={dataset:{},querySelector:()=>label,querySelectorAll:()=>[{}, {}, {}, {}, {}],addEventListener(){}};rendered.push({element,label});return element;};
  const clip={id:'one',name,params:{tempo:120,bars:1,key:'C',scale:'major',leadWave:'square',seed:1},loop:{totalSteps:16}};
  const context=vm.createContext({state:{savedLoops:[clip],timeline:[clip]},ui:{savedLoops:{appendChild(){}},timelineItems:{appendChild(){}},timelineEmpty:{classList:{toggle(){}}}},document:{createElement:node},prettyScaleName:x=>x});
  vm.runInContext(html.slice(html.indexOf('    function preserveClipFocus('),html.indexOf('    ui.timelineDropzone.addEventListener')),context);
  vm.runInContext('renderLibrary();renderTimeline()',context);
  for(const {element,label} of rendered){assert.equal(label.textContent,name);assert.ok(!element.innerHTML.includes(name));}
});


test('timeline arrow actions reorder clips and keep focus on an available move control',()=>{
  let focus=0,refreshes=0;
  const state={timeline:[{id:'a'},{id:'b'},{id:'c'}]};
  const context=vm.createContext({state,rememberProject(){},refreshUI(){refreshes++;},ui:{timelineItems:{querySelector(){return {querySelector(selector){return {disabled:selector==='[data-move="-1"]',focus(){focus++;}};}};}}}});
  vm.runInContext(html.slice(html.indexOf('    function moveTimelineItem('),html.indexOf('    function renderLibrary(')),context);
  vm.runInContext("moveTimelineBy('b',-1)",context);
  assert.deepEqual(state.timeline.map(x=>x.id),['b','a','c']);
  assert.equal(focus,1);
  vm.runInContext("moveTimelineBy('b',-1)",context);
  assert.equal(refreshes,1);
  vm.runInContext("moveTimelineBy('b',1)",context);
  assert.deepEqual(state.timeline.map(x=>x.id),['a','b','c']);
});
