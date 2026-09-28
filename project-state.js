/* Portable data only: never restore audio nodes, timers or running transport. */
(function(root) {
  'use strict';
  const MAX_CLIPS = 64, MAX_BYTES = 5_000_000;
  const numbers = { tempo: [70,190,true], bars: [1,8,true], swing: [0,.35], density: [.2,1],
    variation: [0,1], octave: [3,6,true], arpBias: [0,1], echo: [0,.45], crunch: [0,.95], seed: [1,999999,true] };
  const fail = message => { throw Error(message); };
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  const finite = (value, min, max, integer = false) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
  function params(raw, scales) {
    if (!plain(raw)) fail('A clip has no musical settings.');
    const result = {};
    for (const [key, [min,max,integer]] of Object.entries(numbers)) {
      if (!finite(raw[key], min, max, integer)) fail(`Invalid ${key}; expected ${min}–${max}${integer ? ' as a whole number' : ''}.`);
      result[key] = raw[key];
    }
    if (!['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].includes(raw.key) || !scales.includes(raw.scale)) fail('Unknown key or scale.');
    result.key = raw.key; result.scale = raw.scale;
    for (const key of ['leadWave','bassWave']) {
      if (!['square','triangle','sawtooth'].includes(raw[key])) fail('Unknown waveform.');
      result[key] = raw[key];
    }
    for (const key of ['leadOn','bassOn','drumsOn','harmonyOn']) {
      if (typeof raw[key] !== 'boolean') fail('Track switches must be on or off.');
      result[key] = raw[key];
    }
    return result;
  }
  function loop(raw, p) {
    const size = p.bars * 16;
    if (!plain(raw) || raw.totalSteps !== size) fail('Clip length does not match its bars.');
    const result = { totalSteps: size };
    for (const key of ['lead','bass','drums','harmony']) {
      if (!Array.isArray(raw[key]) || raw[key].length !== size) fail(`Invalid ${key} sequence length.`);
      result[key] = raw[key].map(note => {
        if (key === 'drums') {
          if (!plain(note) || ['kick','snare','hat'].some(k => typeof note[k] !== 'boolean')) fail('Invalid drum step.');
          return { kick: note.kick, snare: note.snare, hat: note.hat };
        }
        if (note === null) return null;
        if (key === 'harmony') {
          if (!Array.isArray(note) || note.length < 1 || note.length > 8 || note.some(n => !finite(n,0,127,true))) fail('Invalid harmony note.');
          return [...note];
        }
        if (!plain(note) || !finite(note.midi,0,127,true) || !finite(note.len,1,16,true) || !finite(note.vel,0,1)) fail('Invalid note pitch, length or velocity.');
        return { midi: note.midi, len: note.len, vel: note.vel };
      });
    }
    if (!Array.isArray(raw.progression) || raw.progression.length !== p.bars || raw.progression.some(n => !finite(n,0,11,true))) fail('Invalid chord progression.');
    result.progression = [...raw.progression];
    return result;
  }
  function validate(raw, scales) {
    if (!plain(raw) || raw.format !== '8bit-music' || raw.version !== 1) fail('Choose an 8-Bit Music project JSON file (version 1).');
    if (!['loop','timeline'].includes(raw.playMode)) fail('Unknown playback mode.');
    if (typeof raw.name !== 'string' || raw.name.length > 120) fail('Project name must be at most 120 characters.');
    const p = params(raw.params, scales);
    const result = { format: '8bit-music', version: 1, name: raw.name, playMode: raw.playMode, params: p, loop: loop(raw.loop,p) };
    for (const key of ['savedLoops','timeline']) {
      if (!Array.isArray(raw[key]) || raw[key].length > MAX_CLIPS) fail(`Use at most ${MAX_CLIPS} clips in ${key === 'timeline' ? 'the timeline' : 'the library'}.`);
      const ids = new Set();
      result[key] = raw[key].map(clip => {
        if (!plain(clip) || typeof clip.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(clip.id) || ids.has(clip.id)) fail('Clip IDs must be unique and valid.');
        ids.add(clip.id);
        if (typeof clip.name !== 'string' || clip.name.length > 120) fail('Clip names must be at most 120 characters.');
        const p = params(clip.params, scales);
        return { id: clip.id, name: clip.name, params: p, loop: loop(clip.loop,p) };
      });
    }
    return result;
  }
  function parse(text, scales) {
    if (typeof text !== 'string' || text.length > MAX_BYTES) fail('Project file exceeds 5 MB.');
    let raw;
    try { raw = JSON.parse(text); } catch { fail('This file is not valid JSON. Choose an 8-Bit Music project backup.'); }
    return validate(raw, scales);
  }
  class History {
    constructor() { this.past = []; this.future = []; }
    trim() {
      while (this.past.length + this.future.length > 30 ||
          (this.past.length + this.future.length > 1 && [...this.past,...this.future].reduce((n,s) => n + s.length,0) > 4_000_000))
        (this.past.length >= this.future.length ? this.past : this.future).shift();
    }
    remember(project) {
      this.past.push(JSON.stringify(project)); this.future = [];
      // Both entry count and text size are bounded even for large arrangements.
      this.trim();
    }
    move(current, redo = false) {
      const from = redo ? this.future : this.past, to = redo ? this.past : this.future;
      if (!from.length) return null;
      to.push(JSON.stringify(current));
      const result = JSON.parse(from.pop());
      this.trim();
      return result;
    }
  }
  const api = { validate, parse, History, MAX_CLIPS, MAX_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MusicProject = api;
})(globalThis);
