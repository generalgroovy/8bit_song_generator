'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../core.js'),A=require('../audio.js');
test('six presets contain validated, reproducible, independent settings',()=>{
  assert.equal(C.PRESETS.length,6);assert.equal(new Set(C.PRESETS.map(p=>p.id)).size,6);
  for(const preset of C.PRESETS){assert.deepEqual(C.normalizeParams(preset.params,true),preset.params);assert.deepEqual(C.generateLoop(preset.params),C.generateLoop(preset.params));assert.equal(preset.params.harmonyMode,'scale');}
  assert.notEqual(C.PRESETS[0].params,C.PRESETS[1].params);
});
test('scale-locked harmony stays in every selected scale and key',()=>{
  for(const scale of Object.keys(C.SCALES))for(const key of C.NOTES){
    const p={...C.DEFAULTS,scale,key,bars:8,harmonyMode:'scale'},loop=C.generateLoop(p);
    const classes=new Set(C.SCALES[scale].map(n=>(n+C.NOTES.indexOf(key))%12));
    for(const chord of loop.harmony)if(chord)for(const midi of chord)assert.ok(classes.has((midi%12+12)%12),`${scale} ${key} ${midi}`);
  }
});
test('scale-lock changes only harmony, not RNG decisions in other tracks',()=>{
  const legacy=C.generateLoop(C.DEFAULTS),locked=C.generateLoop({...C.DEFAULTS,harmonyMode:'scale'});
  for(const k of ['lead','bass','drums','progression'])assert.deepEqual(locked[k],legacy[k]);
  assert.notDeepEqual(locked.harmony,legacy.harmony);
});
test('older version-one projects retain legacy voicing',()=>{
  const params={...C.DEFAULTS};delete params.harmonyMode;
  const loaded=C.parseProject(JSON.stringify({version:1,name:'Old',params,playMode:'loop',volume:0.72,savedLoops:[],timeline:[]}));
  assert.equal(loaded.params.harmonyMode,'legacy');assert.deepEqual(C.generateLoop(loaded.params),C.generateLoop(C.DEFAULTS));
});
test('invalid voicing is rejected rather than silently changing an imported project',()=>{
  for(const mode of ['anything',null,false,1])assert.throws(()=>C.normalizeParams({...C.DEFAULTS,harmonyMode:mode},true));
});
test('safe unique IDs survive import and duplicate/unsafe IDs are replaced',()=>{
  const clip=C.makeClip('Loop',C.DEFAULTS,'safe_id');
  const loaded=C.parseProject(JSON.stringify({version:1,name:'p',params:C.DEFAULTS,volume:0.5,playMode:'loop',savedLoops:[clip],timeline:[clip,{...clip,id:'bad"id'}]}));
  assert.equal(loaded.savedLoops[0].id,'safe_id');const ids=[...loaded.savedLoops,...loaded.timeline].map(c=>c.id);
  assert.equal(new Set(ids).size,3);assert.ok(ids.every(id=>/^[a-zA-Z0-9_-]{1,96}$/.test(id)));
});
test('loop-length WAV planning rounds to exactly one musical cycle',()=>{
  const clip=C.makeClip('Loop',{...C.DEFAULTS,tempo:123,bars:3}),plan=A.planRender([clip],{loopable:true});
  assert.equal(plan.outputFrames,Math.round(C.duration(clip)*44100));assert.ok(plan.offsetFrames>0);
  assert.equal(plan.renderFrames,plan.outputFrames+plan.offsetFrames);
});
test('tail WAV plan keeps note and effect releases after the musical duration',()=>{
  const clip=C.makeClip('Loop',C.DEFAULTS),plan=A.planRender([clip]);assert.equal(plan.offsetFrames,0);
  assert.ok(plan.outputFrames>C.duration(clip)*44100);assert.equal(plan.renderFrames,plan.outputFrames);
});
test('loop-length mode rejects multi-clip arrangements',()=>{
  const clip=C.makeClip('Loop',C.DEFAULTS);assert.throws(()=>A.planRender([clip,clip],{loopable:true}),/one loop/);
});
test('sample-memory guard rejects high-rate long renders before creating a context',async()=>{
  const clip=C.makeClip('Loop',{...C.DEFAULTS,bars:8,tempo:70});
  assert.throws(()=>A.planRender(Array(5).fill(clip),{sampleRate:192000}),/sample memory budget/);
  await assert.rejects(A.renderWav(Array(5).fill(clip),{sampleRate:192000}),/sample memory budget/);
});
test('ordinary three-minute 44.1 kHz renders remain within the sample budget',()=>{
  const clip=C.makeClip('Loop',{...C.DEFAULTS,bars:1,tempo:120}),plan=A.planRender(Array(90).fill(clip));
  assert.equal(plan.seq.duration,180);assert.ok(plan.renderFrames<=A.MAX_RENDER_SAMPLES);
});
test('export settings reject non-finite volume, bad rates and non-boolean loop modes',()=>{
  const clip=C.makeClip('Loop',C.DEFAULTS);
  for(const options of [{volume:NaN},{volume:2},{sampleRate:0},{sampleRate:44100.5},{loopable:'yes'}])assert.throws(()=>A.planRender([clip],options));
});
