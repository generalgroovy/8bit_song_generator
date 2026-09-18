/* Pure, dependency-free music and project data. Also usable from Node tests. */
(function (root) {
  'use strict';
  const NOTES = Object.freeze(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);
  const SCALES = {
    major: [0,2,4,5,7,9,11], minor: [0,2,3,5,7,8,10],
    harmonic_minor: [0,2,3,5,7,8,11], melodic_minor: [0,2,3,5,7,9,11],
    dorian: [0,2,3,5,7,9,10], phrygian: [0,1,3,5,7,8,10],
    lydian: [0,2,4,6,7,9,11], mixolydian: [0,2,4,5,7,9,10], locrian: [0,1,3,5,6,8,10],
    pentatonic_major: [0,2,4,7,9], pentatonic_minor: [0,3,5,7,10], blues: [0,3,5,6,7,10],
    whole_tone: [0,2,4,6,8,10], chromatic: [0,1,2,3,4,5,6,7,8,9,10,11],
    double_harmonic: [0,1,4,5,7,8,11], hungarian_minor: [0,2,3,6,7,8,11],
    persian: [0,1,4,5,6,8,11], ukrainian_dorian: [0,2,3,6,7,9,10],
    romanian_minor: [0,2,3,6,7,9,10], phrygian_dominant: [0,1,4,5,7,8,10],
    lydian_dominant: [0,2,4,6,7,9,10], altered: [0,1,3,4,6,8,10],
    diminished_whole_half: [0,2,3,5,6,8,9,11], diminished_half_whole: [0,1,3,4,6,7,9,10],
    hirajoshi: [0,2,3,7,8], in_sen: [0,1,5,7,10], iwato: [0,1,5,6,10], yo: [0,2,5,7,9],
    enigmatic: [0,1,4,6,8,10,11], bebop_major: [0,2,4,5,7,8,9,11], bebop_dominant: [0,2,4,5,7,9,10,11]
  };
  Object.values(SCALES).forEach(Object.freeze);
  Object.freeze(SCALES);
  const DEFAULTS = Object.freeze({
    key:'C', scale:'minor', tempo:120, bars:4, swing:0.08, density:0.68,
    variation:0.46, octave:4, arpBias:0.42, echo:0.14, crunch:0.35, seed:4312,
    leadWave:'square', bassWave:'triangle', harmonyMode:'legacy', leadOn:true, bassOn:true, drumsOn:true, harmonyOn:true
  });
  const RANGES = Object.freeze({tempo:[70,190,true], bars:[1,8,true], swing:[0,0.35],
    density:[0.2,1], variation:[0,1], octave:[3,6,true], arpBias:[0,1], echo:[0,0.45],
    crunch:[0,0.95], seed:[1,999999,true]});
  const MAX_CLIPS = 128;
  const clone = x => JSON.parse(JSON.stringify(x));
  const pretty = s => s.split('_').map(p => p[0].toUpperCase()+p.slice(1)).join(' ');
  const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);
  const noteName = m => `${NOTES[((m % 12)+12)%12]}${Math.floor(m/12)-1}`;
  const pick = (rng, a) => a[Math.floor(rng() * a.length)];
  const chance = (rng, p) => rng() < p;
  const uid = () => root.crypto?.randomUUID?.() || `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normalizeParams(raw = {}, strict = false) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid sound settings.');
    const p = {...DEFAULTS};
    for (const [key, [min,max,integer]] of Object.entries(RANGES)) {
      const value = Number(raw[key] ?? p[key]);
      if (strict && (typeof raw[key] !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))) {
        throw new Error(`Invalid ${key} in project.`);
      }
      p[key] = Number.isFinite(value) ? Math.max(min,Math.min(max,integer ? Math.round(value) : value)) : p[key];
    }
    const choices = {key:NOTES, scale:Object.keys(SCALES), leadWave:['square','triangle','sawtooth'], bassWave:['square','triangle','sawtooth']};
    for (const [key, values] of Object.entries(choices)) {
      if (strict && !values.includes(raw[key])) throw new Error(`Invalid ${key} in project.`);
      if (values.includes(raw[key])) p[key] = raw[key];
    }
    // Version-1 projects predate scale-locked harmony; missing means legacy sound.
    if (Object.hasOwn(raw,'harmonyMode')) {
      if (strict && !['legacy','scale'].includes(raw.harmonyMode)) throw new Error('Invalid harmony mode in project.');
      if (['legacy','scale'].includes(raw.harmonyMode)) p.harmonyMode=raw.harmonyMode;
    }
    for (const key of ['leadOn','bassOn','drumsOn','harmonyOn']) {
      if (strict && typeof raw[key] !== 'boolean') throw new Error(`Invalid ${key} in project.`);
      if (typeof raw[key] === 'boolean') p[key] = raw[key];
    }
    return p;
  }
  function getScaleMidis(rootNote, scale, octave) {
    const base = 12 * (octave + 1) + NOTES.indexOf(rootNote);
    const out = [];
    for (let oct = 0; oct < 3; oct++) (SCALES[scale] || SCALES.minor).forEach(i => out.push(base+i+oct*12));
    return out;
  }
  // Preserve the v7 generator's RNG order and musical decisions for existing seeds.
  function generateLoop(params) {
    const p = normalizeParams(params);
    const rng = mulberry32(Number(p.seed) || 1);
    const totalSteps = p.bars * 16;
    const leadScale = getScaleMidis(p.key,p.scale,p.octave);
    const bassScale = getScaleMidis(p.key,p.scale,Math.max(1,p.octave-2));
    const progression = Array.from({length:p.bars}, () => pick(rng,[0,3,4,5]));
    const lead = [], bass = [], drums = [], harmony = [];
    let prevLead = leadScale[0];
    for (let step=0; step<totalSteps; step++) {
      const bar = Math.floor(step/16), pos = step%16, strongBeat = pos%4===0, offbeat = pos%2===1;
      const degree = progression[bar%progression.length];
      const chordPool = [degree,degree+2,degree+4].map(i => leadScale[i%leadScale.length]);
      const melodicPool = [...new Set([leadScale[degree%leadScale.length],leadScale[(degree+1)%leadScale.length],
        leadScale[(degree+2)%leadScale.length],leadScale[(degree+4)%leadScale.length],leadScale[(degree+6)%leadScale.length]])].sort((a,b)=>a-b);
      let leadNote = null;
      if (chance(rng,Math.min(0.97,p.density+(strongBeat?0.16:0)-(offbeat?0.06:0)))) {
        let candidate = pick(rng,chance(rng,p.arpBias)?chordPool:melodicPool);
        if (chance(rng,p.variation*0.65)) candidate += pick(rng,[-12,0,0,12]);
        while (Math.abs(candidate-prevLead)>8) candidate += candidate>prevLead?-12:12;
        prevLead = candidate;
        leadNote = {midi:candidate,len:strongBeat?1:(chance(rng,0.14)?2:1),vel:strongBeat?0.9:0.74};
      }
      lead.push(leadNote);
      let bassNote = null;
      if (strongBeat || chance(rng,0.16+p.variation*0.24)) {
        const bassDegree = chance(rng,0.18+p.variation*0.3)?degree+4:degree;
        bassNote = {midi:bassScale[bassDegree%bassScale.length]-12,len:strongBeat?2:1,vel:strongBeat?0.86:0.68};
      }
      bass.push(bassNote);
      drums.push({kick:strongBeat||(pos===10&&chance(rng,0.45+p.variation*0.3)),
        snare:pos===4||pos===12||(chance(rng,p.variation*0.16)&&(pos===7||pos===15)),
        hat:chance(rng,0.52+p.density*0.3)||pos%4===2});
      let harmonyNotes = null;
      if (pos===0||pos===8||(chance(rng,p.variation*0.12)&&pos===12)) {
        const rootNote = leadScale[degree%leadScale.length]-12;
        const minorish = ['minor','harmonic_minor','melodic_minor','dorian','phrygian','locrian','hungarian_minor',
          'persian','romanian_minor','ukrainian_dorian','blues','phrygian_dominant','altered','iwato','in_sen'];
        harmonyNotes = p.harmonyMode==='scale' ? chordPool.map(midi=>midi-12)
          : [rootNote,rootNote+(minorish.includes(p.scale)?3:4),rootNote+7];
      }
      harmony.push(harmonyNotes);
    }
    return {lead,bass,drums,harmony,progression,totalSteps};
  }
  function makeClip(name, params, id = uid()) {
    const p = normalizeParams(params);
    return {id, name:String(name || 'Untitled loop').trim().slice(0,96) || 'Untitled loop', params:p, loop:generateLoop(p)};
  }
  const duration = clip => clip.loop.totalSteps * 60 / clip.params.tempo / 4;
  const sequenceDuration = seq => seq.reduce((sum,c) => sum+duration(c),0);
  function compileSequence(sequence) {
    if (!Array.isArray(sequence)||!sequence.length||sequence.length>MAX_CLIPS) throw new Error('Add a clip to the timeline first (maximum 128 clips).');
    // One snapshot per transport start, never per step or animation frame.
    const clips = sequence.map(c => makeClip(c.name,c.params,c.id));
    const events = [];
    let cursor = 0;
    clips.forEach((clip,clipIndex) => {
      const sixteenth = 60/clip.params.tempo/4;
      for (let step=0; step<clip.loop.totalSteps; step++) {
        events.push({offset:cursor+step*sixteenth+(step%2?clip.params.swing*sixteenth:0),step,clipIndex});
      }
      cursor += duration(clip);
    });
    return {clips,events,duration:cursor};
  }
  function randomParams(rng = Math.random) {
    return normalizeParams({key:pick(rng,NOTES),scale:pick(rng,Object.keys(SCALES)),tempo:Math.floor(85+rng()*90),
      bars:pick(rng,[2,4,4,8]),swing:+(rng()*0.28).toFixed(2),density:+(0.35+rng()*0.58).toFixed(2),
      variation:+(rng()*0.9).toFixed(2),octave:pick(rng,[3,4,4,5]),arpBias:+(rng()*0.95).toFixed(2),
      echo:+(rng()*0.35).toFixed(2),crunch:+(rng()*0.9).toFixed(2),seed:Math.floor(1+rng()*999999),
      leadWave:pick(rng,['square','triangle','sawtooth']),bassWave:pick(rng,['triangle','square','sawtooth']),
      leadOn:chance(rng,0.92),bassOn:chance(rng,0.95),drumsOn:true,harmonyOn:chance(rng,0.85)});
  }
  function serializeProject(state) {
    const pack = c => ({id:c.id,name:c.name,params:c.params});
    return JSON.stringify({version:1,params:state.params,name:state.name,playMode:state.playMode,
      volume:state.volume,savedLoops:state.savedLoops.map(pack),timeline:state.timeline.map(pack)});
  }
  function parseProject(text) {
    if (typeof text !== 'string'||text.length>1048576) throw new Error('Project must be a JSON file smaller than 1 MB.');
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('The project is not valid JSON.'); }
    if (!data||data.version!==1) throw new Error('Unsupported project version.');
    const ids = new Set();
    const unpack = list => {
      if (!Array.isArray(list)||list.length>MAX_CLIPS) throw new Error('Invalid clip list (maximum 128 per list).');
      return list.map(c => {
        if (!c||typeof c.name!=='string') throw new Error('A clip is missing its name.');
        // Stable, bounded IDs preserve identity through undo/redo and round-trips.
        let id=c.id;
        if (typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,96}$/.test(id)||ids.has(id)) id=uid();
        ids.add(id);
        return makeClip(c.name,normalizeParams(c.params,true),id);
      });
    };
    if (typeof data.volume!=='number'||!Number.isFinite(data.volume)||data.volume<0||data.volume>1) throw new Error('Invalid project volume.');
    if (!['loop','timeline'].includes(data.playMode)||typeof data.name!=='string') throw new Error('Invalid editor settings.');
    return {params:normalizeParams(data.params,true),name:data.name.slice(0,96),playMode:data.playMode,
      volume:data.volume,savedLoops:unpack(data.savedLoops),timeline:unpack(data.timeline)};
  }
  function moveClip(list, fromId, toIndex) {
    const from = list.findIndex(c=>c.id===fromId);
    if (from<0||!Number.isInteger(toIndex)||toIndex<0||toIndex>=list.length||from===toIndex) return false;
    const [clip] = list.splice(from,1);
    list.splice(toIndex,0,clip);
    return true;
  }
  const PRESETS = Object.freeze([
    ['arcade','Arcade sprint',{key:'C',scale:'major',tempo:156,density:0.78,variation:0.38,arpBias:0.7,seed:8201,echo:0.1}],
    ['night','Night drive',{key:'D',scale:'dorian',tempo:112,swing:0.2,density:0.56,variation:0.4,seed:6284,echo:0.26,crunch:0.45}],
    ['boss','Boss rush',{key:'E',scale:'harmonic_minor',tempo:180,density:0.86,variation:0.72,seed:9142,leadWave:'sawtooth',crunch:0.72,echo:0.08}],
    ['puzzle','Pocket puzzle',{key:'G',scale:'pentatonic_major',tempo:104,density:0.45,variation:0.28,seed:3107,leadWave:'triangle',echo:0.12,crunch:0.18}],
    ['dungeon','Dungeon echo',{key:'A',scale:'phrygian',tempo:82,density:0.38,variation:0.3,octave:3,seed:7703,echo:0.4,crunch:0.48}],
    ['savepoint','Soft savepoint',{key:'F',scale:'lydian',tempo:90,density:0.35,variation:0.18,seed:1529,leadWave:'triangle',drumsOn:false,echo:0.32,crunch:0.1}]
  ].map(([id,name,params])=>Object.freeze({id,name,params:Object.freeze(normalizeParams({...DEFAULTS,...params,harmonyMode:'scale'}))})));
  const api = Object.freeze({NOTES,SCALES,DEFAULTS,RANGES,PRESETS,MAX_CLIPS,clone,pretty,midiToFreq,noteName,uid,mulberry32,
    normalizeParams,generateLoop,makeClip,duration,sequenceDuration,compileSequence,randomParams,serializeProject,parseProject,moveClip});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChipCore = api;
})(globalThis);
