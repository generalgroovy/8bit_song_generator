/* Pure variation selection. Musical candidates come from the seeded generator. */
(function(root) {
  'use strict';
  const TRACKS = ['lead', 'bass', 'drums', 'harmony'];
  function vary(source, candidate, {track, bar = -1, amount = .5, seed = 1}) {
    if (!TRACKS.includes(track) || !Number.isInteger(bar) || bar < -1 || bar >= source.totalSteps / 16 ||
        ![.25,.5,1].includes(amount) || !Number.isInteger(seed) || seed < 1 || seed > 999999 ||
        candidate.totalSteps !== source.totalSteps) throw Error('Choose a layer, valid bar and change amount.');
    const result = JSON.parse(JSON.stringify(source));
    const differences = [];
    const start = bar < 0 ? 0 : bar * 16, end = bar < 0 ? source.totalSteps : start + 16;
    for (let i = start; i < end; i++) {
      if (JSON.stringify(source[track][i]) !== JSON.stringify(candidate[track][i])) differences.push(i);
    }
    // Stable shuffle picks an exact fraction of differing steps, including at least one.
    let value = seed >>> 0;
    for (let i = differences.length - 1; i > 0; i--) {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      const j = Math.floor((value / 4294967296) * (i + 1));
      [differences[i], differences[j]] = [differences[j], differences[i]];
    }
    const changed = Math.ceil(differences.length * amount);
    for (const i of differences.slice(0, changed)) result[track][i] = JSON.parse(JSON.stringify(candidate[track][i]));
    return {loop: result, changed};
  }
  const api = {vary};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MusicVariation = api;
})(globalThis);
