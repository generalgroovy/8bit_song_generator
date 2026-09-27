const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const html=readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
test('transport redraws only when the displayed step or loop changes',()=>{
  let step=0,grids=0,timeline=0;
  const clip={loop:{},params:{bars:4}};
  const state={stepIndex:0};
  const context=vm.createContext({state,ui:{currentBar:{},currentStep:{}},getSequenceTotalSteps:()=>64,findClipAndLocalStep:()=>({clip,clipIndex:0,localStep:step}),renderStepGrids(){grids++;},renderTimeline(){timeline++;}});
  vm.runInContext(html.slice(html.indexOf('    function transportTick()'),html.indexOf('    function startTransportLoop()')),context);
  for(let i=0;i<40;i++)vm.runInContext('transportTick()',context);
  assert.equal(grids,1);assert.equal(timeline,1);
  step=1;vm.runInContext('transportTick()',context);assert.equal(grids,2);
  clip.loop={};vm.runInContext('transportTick()',context);assert.equal(grids,3);
});
