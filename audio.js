/* Shared native Web Audio graph for audition and offline WAV rendering. */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.ChipCore;
  const MAX_RENDER_SECONDS = 180;
  const MAX_RENDER_SAMPLES = 8 * 1024 * 1024;
  function volumeLevel(value) {
    if(!Number.isFinite(value))throw new RangeError('Volume must be a finite number.');
    return Math.max(0,Math.min(1,value));
  }
  const noiseCaches = new WeakMap();
  const disconnect = node => { try { node.disconnect(); } catch { /* Already disconnected. */ } };
  function noiseBuffer(ctx, seed, duration) {
    let cache = noiseCaches.get(ctx);
    if (!cache) { cache = new Map(); noiseCaches.set(ctx,cache); }
    const key = `${seed}:${duration}`;
    if (cache.has(key)) return cache.get(key);
    // Bounded per-context cache; the same seed produces the same percussion in exports.
    if (cache.size >= 256) cache.delete(cache.keys().next().value);
    const buffer = ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    const rng = C.mulberry32(seed ^ Math.round(duration*100000));
    for (let i=0;i<samples.length;i++) samples[i]=rng()*2-1;
    cache.set(key,buffer);
    return buffer;
  }
  function createBus(ctx, destination, p) {
    const input = ctx.createGain(), dry = ctx.createGain(), delay = ctx.createDelay(0.4);
    const feedback = ctx.createGain(), wet = ctx.createGain(), filter = ctx.createBiquadFilter();
    const crusher = ctx.createWaveShaper();
    dry.gain.value=0.82;
    wet.gain.value=p.echo;
    delay.delayTime.value=Math.min(0.3,60/p.tempo/2);
    feedback.gain.value=0.15+p.echo*0.55;
    filter.type='lowpass';
    filter.frequency.value=Math.min(ctx.sampleRate*0.45,3500+(1-p.crunch)*4200);
    if (p.crunch>0) {
      const bits=Math.max(1,Math.round(16-p.crunch*12)), levels=2**(bits-1);
      const curve=new Float32Array(4097);
      for (let i=0;i<curve.length;i++) curve[i]=Math.round((i*2/(curve.length-1)-1)*levels)/levels;
      crusher.curve=curve;
    }
    input.connect(dry); dry.connect(filter);
    // Both dry and echo paths receive the voices (the previous delay had no input).
    input.connect(delay); delay.connect(feedback); feedback.connect(delay);
    delay.connect(wet); wet.connect(filter); filter.connect(crusher); crusher.connect(destination);
    return {input, dispose() { [input,dry,delay,feedback,wet,filter,crusher].forEach(disconnect); }};
  }
  const busKey = p => `${p.tempo}:${p.echo}:${p.crunch}`;
  function trackSource(source, nodes, voices) {
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      voices.delete(source);
      source.onended=null;
      [source,...nodes].forEach(disconnect);
    };
    // Offline rendering can outpace main-thread ended events. Keep its graph intact
    // until rendering finishes; early disconnects otherwise truncate filter tails.
    if (!voices.deferCleanup) source.onended=cleanup;
    voices.set(source,cleanup);
  }
  function tone(ctx, bus, voices, time, freq, duration, type, volume, glide=false) {
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.type=type;
    osc.frequency.setValueAtTime(freq,time);
    if (glide) osc.frequency.linearRampToValueAtTime(freq*0.997,time+duration);
    gain.gain.setValueAtTime(0.0001,time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001,volume),time+0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001,time+duration);
    osc.connect(gain); gain.connect(bus.input);
    trackSource(osc,[gain],voices);
    osc.start(time); osc.stop(time+duration+0.02);
  }
  function noise(ctx,bus,voices,p,time,duration,volume,freq) {
    const source=ctx.createBufferSource(), filter=ctx.createBiquadFilter(), gain=ctx.createGain();
    source.buffer=noiseBuffer(ctx,p.seed,duration);
    filter.type='bandpass'; filter.frequency.setValueAtTime(Math.min(freq,ctx.sampleRate*0.45),time);
    gain.gain.setValueAtTime(volume,time);
    gain.gain.exponentialRampToValueAtTime(0.0001,time+duration);
    source.connect(filter); filter.connect(gain); gain.connect(bus.input);
    trackSource(source,[filter,gain],voices);
    source.start(time); source.stop(time+duration+0.01);
  }
  function scheduleStep(ctx,bus,voices,clip,step,when) {
    const p=clip.params, loop=clip.loop, sixteenth=60/p.tempo/4;
    const lead=loop.lead[step],bass=loop.bass[step],drum=loop.drums[step],harm=loop.harmony[step];
    if (p.leadOn&&lead) tone(ctx,bus,voices,when,C.midiToFreq(lead.midi),sixteenth*Math.max(0.75,lead.len*0.92),p.leadWave,0.12*lead.vel,true);
    if (p.bassOn&&bass) tone(ctx,bus,voices,when,C.midiToFreq(bass.midi),sixteenth*Math.max(0.9,bass.len*1.35),p.bassWave,0.14*bass.vel);
    if (p.harmonyOn&&harm) harm.forEach((midi,i)=>tone(ctx,bus,voices,when,C.midiToFreq(midi),sixteenth*6.5,i===0?'triangle':'square',i===0?0.03:0.022));
    if (p.drumsOn&&drum) {
      if (drum.kick) {
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.type='sine'; osc.frequency.setValueAtTime(130,when);
        osc.frequency.exponentialRampToValueAtTime(42,when+0.09);
        gain.gain.setValueAtTime(0.25,when);
        gain.gain.exponentialRampToValueAtTime(0.0001,when+0.12);
        osc.connect(gain); gain.connect(bus.input); trackSource(osc,[gain],voices);
        osc.start(when); osc.stop(when+0.14);
      }
      if (drum.snare) noise(ctx,bus,voices,p,when,0.11,0.11,1800);
      if (drum.hat) noise(ctx,bus,voices,p,when,0.035,0.05,6000);
    }
  }
  function clearVoices(voices) {
    for (const [source,cleanup] of voices) {
      try { source.stop(); } catch { /* Already ended. */ }
      cleanup();
    }
    voices.clear();
  }
  class Engine {
    constructor() {
      this.ctx=null; this.master=null; this.analyser=null; this.data=null;
      this.voices=new Map(); this.buses=new Map(); this.visualQueue=[];
      this.playing=false; this.wantsPlayback=false; this.timer=null; this.revision=0; this.starts=0; this.resyncs=0;
    }
    ensureAudio() {
      if (this.ctx&&this.ctx.state!=='closed') return;
      const AC=root.AudioContext||root.webkitAudioContext;
      if (!AC) throw new Error('This browser does not support Web Audio. Try a current desktop or mobile browser.');
      this.ctx=new AC(); this.master=this.ctx.createGain(); this.analyser=this.ctx.createAnalyser();
      this.analyser.fftSize=256;
      this.data=new Uint8Array(this.analyser.frequencyBinCount);
      this.master.connect(this.analyser); this.analyser.connect(this.ctx.destination);
    }
    setVolume(value) {
      const level=volumeLevel(value);
      if (this.master) {
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.setTargetAtTime(level,this.ctx.currentTime,0.01);
      }
    }
    halt() {
      this.playing=false;
      if (this.timer!==null) clearInterval(this.timer);
      this.timer=null;
      clearVoices(this.voices);
      this.buses.forEach(bus=>bus.dispose()); this.buses.clear();
      this.visualQueue.length=0;
    }
    async start(sequence,volume=0.72) {
      const level=volumeLevel(volume),compiled=C.compileSequence(sequence);
      const ticket=++this.revision;
      this.wantsPlayback=true;this.halt();
      try {
        this.ensureAudio();
        const ctx=this.ctx;
        await ctx.resume();
        if (ticket!==this.revision) {
          // A canceled resume can finish AFTER Stop already saw a suspended context.
          // Do not suspend here when a newer Play request owns the same context.
          if(!this.wantsPlayback&&ctx.state!=='closed')await ctx.suspend().catch(()=>{});
          return false;
        }
        this.compiled=compiled;
        this.master.gain.cancelScheduledValues(ctx.currentTime);
        this.master.gain.setValueAtTime(level,ctx.currentTime);
        for (const clip of compiled.clips) {
          const key=busKey(clip.params);
          if (!this.buses.has(key)) this.buses.set(key,createBus(ctx,this.master,clip.params));
        }
        this.epoch=ctx.currentTime+0.04;this.cycle=0;this.eventIndex=0;
        this.playing=true;this.starts++;
        this.tick();this.timer=setInterval(()=>this.tick(),25);
        return true;
      } catch(error) {
        // An older rejected request must not tear down a newer successful start.
        if(ticket===this.revision){this.wantsPlayback=false;this.halt();if(this.ctx&&this.ctx.state!=='closed')await this.ctx.suspend().catch(()=>{});}
        throw error;
      }
    }
    advance() {
      this.eventIndex++;
      if (this.eventIndex===this.compiled.events.length) { this.eventIndex=0; this.cycle++; }
    }
    tick() {
      if (!this.playing||this.ctx.state!=='running') return;
      const now=this.ctx.currentTime, seq=this.compiled;
      let when=this.epoch+this.cycle*seq.duration+seq.events[this.eventIndex].offset;
      if (when<now-0.25) {
        // Skip missed events after a stalled/throttled tab; never burst overdue notes.
        const elapsed=Math.max(0,now+0.01-this.epoch);
        this.cycle=Math.floor(elapsed/seq.duration);
        const phase=elapsed-this.cycle*seq.duration;
        let lo=0,hi=seq.events.length;
        while (lo<hi) { const mid=(lo+hi)>>>1; if (seq.events[mid].offset<phase) lo=mid+1; else hi=mid; }
        this.eventIndex=lo;
        if (lo===seq.events.length) { this.eventIndex=0; this.cycle++; }
        this.resyncs++;
      }
      while (this.playing) {
        const event=seq.events[this.eventIndex];
        when=this.epoch+this.cycle*seq.duration+event.offset;
        if (when>=now+0.12) break;
        const clip=seq.clips[event.clipIndex];
        scheduleStep(this.ctx,this.buses.get(busKey(clip.params)),this.voices,clip,event.step,Math.max(now,when));
        this.visualQueue.push({when,step:event.step,clipIndex:event.clipIndex,clip});
        // A hidden tab has no animation consumer; keep only a bounded recent history.
        if (this.visualQueue.length>32) this.visualQueue.splice(0,this.visualQueue.length-32);
        this.advance();
      }
    }
    takeVisualEvent() {
      if (!this.ctx) return null;
      let event=null;
      const now=this.ctx.currentTime;
      while (this.visualQueue.length&&this.visualQueue[0].when<=now) event=this.visualQueue.shift();
      return event;
    }
    frequencies() { if (this.analyser) this.analyser.getByteFrequencyData(this.data); return this.data; }
    stop() {
      ++this.revision;this.wantsPlayback=false;this.halt();
      if (this.ctx&&this.ctx.state!=='closed') return this.ctx.suspend().catch(()=>{});
      return Promise.resolve();
    }
    get diagnostics() {
      return {playing:this.playing,audioState:this.ctx?.state||'uninitialized',voices:this.voices.size,
        buses:this.buses.size,queuedVisuals:this.visualQueue.length,starts:this.starts,resyncs:this.resyncs};
    }
    async dispose() { await this.stop(); if (this.ctx&&this.ctx.state!=='closed') await this.ctx.close(); }
  }
  function encodeWav(samples,sampleRate) {
    if (!(samples instanceof Float32Array)||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000) throw new Error('Invalid PCM data.');
    const bytes=new ArrayBuffer(44+samples.length*2),view=new DataView(bytes);
    const text=(at,str)=>{for(let i=0;i<str.length;i++)view.setUint8(at+i,str.charCodeAt(i));};
    text(0,'RIFF'); view.setUint32(4,36+samples.length*2,true); text(8,'WAVE'); text(12,'fmt ');
    view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
    view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*2,true);
    view.setUint16(32,2,true); view.setUint16(34,16,true); text(36,'data'); view.setUint32(40,samples.length*2,true);
    for(let i=0;i<samples.length;i++) {
      const s=Number.isFinite(samples[i])?Math.max(-1,Math.min(1,samples[i])):0;
      view.setInt16(44+i*2,s<0?s*0x8000:s*0x7fff,true);
    }
    return new Blob([bytes],{type:'audio/wav'});
  }
  function planRender(sequence,{volume=0.72,sampleRate=44100,loopable=false}={}) {
    if (!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||!Number.isFinite(volume)||volume<0||volume>1||typeof loopable!=='boolean') throw new Error('Invalid export settings.');
    const seq=C.compileSequence(sequence);
    if (seq.duration>MAX_RENDER_SECONDS) throw new Error(`Export is limited to ${MAX_RENDER_SECONDS/60} minutes per file to protect browser memory. Shorten the timeline.`);
    if(loopable&&seq.clips.length!==1)throw new Error('Loop-length export requires one loop. Use song export for an arrangement.');
    const tail=Math.max(...seq.clips.map(c=>6.5*60/c.params.tempo/4+(c.params.echo?Math.min(0.3,60/c.params.tempo/2)*6:0)))+0.05;
    // Pre-roll only the preceding effect-tail interval, not a whole extra long loop.
    const offsetFrames=loopable?Math.ceil(tail*sampleRate):0;
    const outputFrames=loopable?Math.round(seq.duration*sampleRate):Math.ceil((seq.duration+tail)*sampleRate);
    const renderFrames=offsetFrames+outputFrames;
    if(renderFrames>MAX_RENDER_SAMPLES)throw new Error('Export exceeds the sample memory budget. Use a lower sample rate or a shorter arrangement.');
    return {seq,sampleRate,volume,loopable,offsetFrames,outputFrames,renderFrames,preRoll:offsetFrames/sampleRate};
  }
  async function renderWav(sequence,{onProgress=()=>{},...options}={}) {
    const plan=planRender(sequence,options),{seq,sampleRate,volume,preRoll}=plan;
    const OAC=root.OfflineAudioContext||root.webkitOfflineAudioContext;
    if (!OAC) throw new Error('Offline audio export is not supported in this browser.');
    const ctx=new OAC(1,plan.renderFrames,sampleRate);
    const master=ctx.createGain();master.gain.value=volume;master.connect(ctx.destination);
    const voices=new Map(),buses=new Map();voices.deferCleanup=true;
    try {
      for (const clip of seq.clips) if (!buses.has(busKey(clip.params))) buses.set(busKey(clip.params),createBus(ctx,master,clip.params));
      let prepared=0;
      const firstCycle=plan.loopable?-Math.ceil(preRoll/seq.duration):0;
      for(let cycle=firstCycle;cycle<=0;cycle++)for(const event of seq.events) {
        const when=preRoll+cycle*seq.duration+event.offset;
        if(when<0)continue;
        const clip=seq.clips[event.clipIndex];
        scheduleStep(ctx,buses.get(busKey(clip.params)),voices,clip,event.step,when);
        if(prepared++%256===0){onProgress('Preparing audio…');await new Promise(resolve=>setTimeout(resolve,0));}
      }
      onProgress('Rendering WAV…');
      const result=await ctx.startRendering();
      onProgress('Encoding WAV…');
      return encodeWav(result.getChannelData(0).subarray(plan.offsetFrames,plan.offsetFrames+plan.outputFrames),sampleRate);
    } finally {clearVoices(voices);buses.forEach(bus=>bus.dispose());disconnect(master);}
  }
  const api=Object.freeze({Engine,renderWav,planRender,encodeWav,MAX_RENDER_SECONDS,MAX_RENDER_SAMPLES});
  if (typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.ChipAudio=api;
})(globalThis);
