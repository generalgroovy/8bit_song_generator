'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../core.js'),A=require('../audio.js');
class Param {
  constructor(){this.value=0;}
  setValueAtTime(value){this.value=value;}
  exponentialRampToValueAtTime(){} linearRampToValueAtTime(){} setTargetAtTime(value){this.value=value;} cancelScheduledValues(){}
}
class Node {
  constructor(){this.gain=new Param();this.frequency=new Param();this.delayTime=new Param();this.frequencyBinCount=128;}
  connect(){} disconnect(){} start(){} stop(){} getByteFrequencyData(data){data.fill(0);}
}
class Context {
  constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=8000;this.destination=new Node();this.requests=[];this.suspends=0;}
  resume(){return new Promise((resolve,reject)=>this.requests.push({resolve:()=>{this.state='running';resolve();},reject}));}
  suspend(){this.state='suspended';this.suspends++;return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
  createGain(){return new Node();} createAnalyser(){return new Node();}
  createDelay(){if(this.failBus)throw Error('graph failure');return new Node();}
  createBiquadFilter(){return new Node();} createWaveShaper(){return new Node();}
  createOscillator(){return new Node();} createBufferSource(){return new Node();}
  createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};}
}
const clip=()=>C.makeClip('Test',{...C.DEFAULTS,bars:1,tempo:190});
function lifecycle(name,run){test(name,async()=>{
  const old=global.AudioContext;global.AudioContext=Context;const engine=new A.Engine();
  try{await run(engine);}finally{await engine.dispose();if(old===undefined)delete global.AudioContext;else global.AudioContext=old;}
});}
lifecycle('Stop also suspends a resume promise that resolves after cancellation',async e=>{
  const start=e.start([clip()]);await e.stop();e.ctx.requests[0].resolve();assert.equal(await start,false);
  assert.equal(e.ctx.state,'suspended');assert.equal(e.voices.size,0);assert.equal(e.buses.size,0);assert.equal(e.timer,null);
});
lifecycle('an old successful resume cannot suspend a newer Play request',async e=>{
  const first=e.start([clip()]);await e.stop();const next=e.start([clip()]);
  e.ctx.requests[0].resolve();assert.equal(await first,false);e.ctx.requests[1].resolve();assert.equal(await next,true);
  assert.equal(e.ctx.state,'running');assert.equal(e.playing,true);assert.equal(e.starts,1);
});
lifecycle('overlapping Play calls have exactly one active schedule',async e=>{
  const first=e.start([clip()]),second=e.start([clip()]);e.ctx.requests[1].resolve();assert.equal(await second,true);
  const timer=e.timer;e.ctx.requests[0].resolve();assert.equal(await first,false);assert.equal(e.timer,timer);assert.equal(e.starts,1);
});
lifecycle('an old rejected resume cannot tear down newer playback',async e=>{
  const first=e.start([clip()]);const rejected=assert.rejects(first,/old failure/);const next=e.start([clip()]);
  e.ctx.requests[1].resolve();await next;const timer=e.timer;e.ctx.requests[0].reject(Error('old failure'));await rejected;
  assert.equal(e.playing,true);assert.equal(e.timer,timer);assert.equal(e.ctx.state,'running');
});
lifecycle('a rejected active start returns to a silent suspended state',async e=>{
  const start=e.start([clip()]);e.ctx.requests[0].reject(Error('denied'));await assert.rejects(start,/denied/);
  assert.equal(e.playing,false);assert.equal(e.wantsPlayback,false);assert.equal(e.ctx.state,'suspended');assert.equal(e.timer,null);
});
lifecycle('partial graph initialization failure cleans up transport state',async e=>{
  const start=e.start([clip()]);e.ctx.failBus=true;e.ctx.requests[0].resolve();await assert.rejects(start,/graph failure/);
  assert.equal(e.playing,false);assert.equal(e.buses.size,0);assert.equal(e.voices.size,0);assert.equal(e.ctx.state,'suspended');
});
lifecycle('repeated Stop is idempotent and clears scheduled voices and effects',async e=>{
  const start=e.start([clip()]);e.ctx.requests[0].resolve();await start;assert.ok(e.voices.size>0);await e.stop();await e.stop();
  assert.equal(e.voices.size,0);assert.equal(e.buses.size,0);assert.equal(e.visualQueue.length,0);assert.equal(e.timer,null);
});
lifecycle('large scheduler stalls skip stale notes instead of replaying them in a burst',async e=>{
  const start=e.start([clip()]);e.ctx.requests[0].resolve();await start;const count=e.visualQueue.length;
  e.ctx.currentTime=60;e.tick();assert.equal(e.resyncs,1);assert.ok(e.visualQueue.length-count<=3);
});
lifecycle('non-finite master volume is rejected before audio allocation',async e=>{
  await assert.rejects(e.start([clip()],NaN),/finite/);assert.equal(e.ctx,null);assert.throws(()=>e.setVolume(Infinity),/finite/);
});
