'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../core.js');
const A=require('../audio.js');
const project=()=>({params:{...C.DEFAULTS},name:'Editor',playMode:'loop',volume:0.72,
  savedLoops:[C.makeClip('Intro',C.DEFAULTS)],timeline:[C.makeClip('Intro',C.DEFAULTS)]});

test('default settings are valid and retain the reference seed',()=>{
  assert.deepEqual(C.normalizeParams({}),C.DEFAULTS);
  assert.deepEqual(C.normalizeParams(C.DEFAULTS,true),C.DEFAULTS);
  assert.equal(C.DEFAULTS.seed,4312);
});
test('reference generator snapshot remains stable',()=>{
  const digest=createHash('sha256').update(JSON.stringify(C.generateLoop(C.DEFAULTS))).digest('hex');
  assert.equal(digest,'10b89a5172bc1b188e3102e815b3e84bcc3e4c3d963a8a4219685271aa6654b2');
});
test('seeded RNG is reproducible and bounded',()=>{
  const a=C.mulberry32(42),b=C.mulberry32(42);
  for(let i=0;i<1000;i++){const n=a();assert.equal(n,b());assert.ok(n>=0&&n<1);}
});
test('all 31 original scales remain available',()=>assert.equal(Object.keys(C.SCALES).length,31));
for(const scale of Object.keys(C.SCALES))test(`generates deterministic bounded patterns: ${scale}`,()=>{
  const p={...C.DEFAULTS,scale,bars:8,seed:7919};
  const loop=C.generateLoop(p);
  assert.deepEqual(loop,C.generateLoop(p));
  assert.equal(loop.totalSteps,128);
  for(const track of ['lead','bass','drums','harmony'])assert.equal(loop[track].length,128);
  assert.equal(loop.progression.length,8);
  for(const track of ['lead','bass'])for(const note of loop[track])if(note){assert.ok(Number.isFinite(note.midi));assert.ok(note.len>0);assert.ok(note.vel>0&&note.vel<=1);}
});
test('new seeds produce different patterns',()=>assert.notDeepEqual(C.generateLoop(C.DEFAULTS),C.generateLoop({...C.DEFAULTS,seed:4313})));
test('FX, mute, tempo and wave changes do not alter the generated notes',()=>{
  assert.deepEqual(C.generateLoop(C.DEFAULTS),C.generateLoop({...C.DEFAULTS,tempo:190,echo:0.45,crunch:0.95,leadOn:false,bassWave:'sawtooth'}));
});
test('normalization clamps hostile and invalid numeric input',()=>{
  const p=C.normalizeParams({tempo:Infinity,seed:-1,bars:999,octave:4.8,swing:NaN,density:0});
  assert.equal(p.tempo,120);assert.equal(p.seed,1);assert.equal(p.bars,8);assert.equal(p.octave,5);assert.equal(p.swing,0.08);assert.equal(p.density,0.2);
});
test('strict projects reject invalid enums and numeric types',()=>{
  for(const invalid of [{tempo:'120'},{scale:'__proto__'},{seed:0},{bars:1.2},{leadWave:'sine'},{leadOn:'false'}])assert.throws(()=>C.normalizeParams({...C.DEFAULTS,...invalid},true));
});
test('randomized settings are valid across 100 seeds',()=>{
  for(let seed=1;seed<=100;seed++)assert.doesNotThrow(()=>C.normalizeParams(C.randomParams(C.mulberry32(seed)),true));
});
test('snapshots do not share parameters with the editor',()=>{
  const p={...C.DEFAULTS},clip=C.makeClip('Saved',p);p.seed=2;
  assert.equal(clip.params.seed,4312);assert.notDeepEqual(clip.loop,C.generateLoop(p));
});
test('blank names receive a label and long names are bounded',()=>{
  assert.equal(C.makeClip('  ',C.DEFAULTS).name,'Untitled loop');assert.equal(C.makeClip('x'.repeat(300),C.DEFAULTS).name.length,96);
});
test('mixed-tempo timeline has precise duration and ordered swung events',()=>{
  const a=C.makeClip('Fast',{...C.DEFAULTS,tempo:120,bars:1,swing:0.35});
  const b=C.makeClip('Slow',{...C.DEFAULTS,tempo:90,bars:2,swing:0.2});
  const seq=C.compileSequence([a,b]);
  assert.equal(seq.events.length,48);assert.ok(Math.abs(seq.duration-(2+16/3))<1e-10);
  assert.equal(seq.events[0].offset,0);assert.equal(seq.events[1].offset,0.125*1.35);
  assert.equal(seq.events[16].offset,2);assert.equal(seq.events[16].clipIndex,1);assert.equal(seq.events[16].step,0);
  for(let i=1;i<seq.events.length;i++)assert.ok(seq.events[i].offset>seq.events[i-1].offset);
  assert.ok(seq.events.at(-1).offset<seq.duration);
});
test('compiled sequence is a start-time snapshot, not a mutable reference',()=>{
  const clip=C.makeClip('Intro',C.DEFAULTS),seq=C.compileSequence([clip]);clip.params.tempo=70;clip.name='Changed';
  assert.equal(seq.clips[0].params.tempo,120);assert.equal(seq.clips[0].name,'Intro');
});
test('empty and oversized sequences are rejected before audio allocation',()=>{
  assert.throws(()=>C.compileSequence([]));assert.throws(()=>C.compileSequence(Array(129).fill(C.makeClip('x',C.DEFAULTS))));
});
test('project round-trip retains editor, library, timeline and deterministic notes',()=>{
  const original=project(),loaded=C.parseProject(C.serializeProject(original));
  assert.deepEqual(loaded.params,original.params);assert.equal(loaded.volume,0.72);assert.equal(loaded.name,'Editor');
  assert.deepEqual(loaded.timeline[0].loop,original.timeline[0].loop);assert.notEqual(loaded.timeline[0].id,loaded.savedLoops[0].id);
});
test('project JSON only stores compact parameters, not redundant note arrays',()=>assert.ok(!C.serializeProject(project()).includes('"progression"')));
test('malformed, unsupported and oversized project input is rejected',()=>{
  for(const text of ['{','null','{}','{"version":2}',' '.repeat(1048577)])assert.throws(()=>C.parseProject(text));
});
test('invalid imported data is rejected atomically',()=>{
  for(const mutate of [p=>p.timeline.push(null),p=>p.params.tempo=0,p=>p.volume=4,p=>p.savedLoops=Array(129).fill(p.savedLoops[0]),p=>p.playMode='unknown']){
    const p=project();mutate(p);assert.throws(()=>C.parseProject(JSON.stringify({version:1,...p})));
  }
});
test('HTML-shaped names remain plain data; unknown fields are ignored',()=>{
  const p=project();p.name='<img src=x onerror=alert(1)>';p.params.unknown='ignored';
  const loaded=C.parseProject(JSON.stringify({version:1,...p}));assert.equal(loaded.name,p.name);assert.ok(!('unknown' in loaded.params));
});
test('clip reorder supports both directions and rejects missing/bad targets',()=>{
  const list=['a','b','c'].map(id=>C.makeClip(id,C.DEFAULTS,id));
  assert.equal(C.moveClip(list,'a',2),true);assert.deepEqual(list.map(c=>c.id),['b','c','a']);
  assert.equal(C.moveClip(list,'a',0),true);assert.deepEqual(list.map(c=>c.id),['a','b','c']);
  for(const [id,index] of [['x',0],['a',-1],['a',3],['a',1.2],['a',0]])assert.equal(C.moveClip(list,id,index),false);
});
test('WAV encoder writes valid mono PCM headers and clamps samples',async()=>{
  const blob=A.encodeWav(new Float32Array([-2,-1,0,1,2,NaN]),44100),buffer=await blob.arrayBuffer(),v=new DataView(buffer);
  assert.equal(blob.type,'audio/wav');assert.equal(Buffer.from(buffer).subarray(0,4).toString(),'RIFF');
  assert.equal(v.getUint32(4,true),48);assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint32(24,true),44100);
  assert.equal(v.getUint16(34,true),16);assert.equal(v.getUint32(40,true),12);
  assert.deepEqual(Array.from({length:6},(_,i)=>v.getInt16(44+i*2,true)),[-32768,-32768,0,32767,32767,0]);
});
test('WAV encoder rejects unsupported rates and sample input',()=>{
  assert.throws(()=>A.encodeWav([],44100));assert.throws(()=>A.encodeWav(new Float32Array(1),0));
});
test('oversized WAV export fails before creating an offline context',async()=>{
  const clip=C.makeClip('Long',{...C.DEFAULTS,bars:8,tempo:70});
  await assert.rejects(A.renderWav(Array(10).fill(clip)),/limited to 3 minutes/);
});
test('all relative HTML assets exist and runtime has no remote dependencies',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const refs=[...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)].map(m=>m[1]).filter(r=>!r.startsWith('data:'));
  assert.ok(refs.length>=4);for(const ref of refs){assert.ok(!/^https?:/.test(ref));assert.ok(fs.existsSync(path.join(__dirname,'..',ref)));}
});
