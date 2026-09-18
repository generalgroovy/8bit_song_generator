'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {History,ProjectStore}=require('../session.js');
const C=require('../core.js');
const project=()=>({params:{...C.DEFAULTS},name:'Editor',playMode:'loop',volume:0.72,savedLoops:[],timeline:[]});
const memory=()=>{const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
test('history walks multiple changes in both directions without mutating snapshots',()=>{
  const h=new History('A');h.record('B','Generate');h.record('C','Save');
  assert.equal(h.undoLabel,'Save');assert.equal(h.undo(),'B');assert.equal(h.undo(),'A');assert.equal(h.undo(),null);
  assert.equal(h.redoLabel,'Generate');assert.equal(h.redo(),'B');assert.equal(h.redo(),'C');assert.equal(h.redo(),null);
});
test('range gestures coalesce, keeping their original undo point',()=>{
  const h=new History('A');h.record('B','Tempo','tempo',100);h.record('C','Tempo','tempo',150);
  assert.equal(h.entries.length,2);assert.equal(h.undo(),'A');assert.equal(h.redo(),'C');
});
test('separate gestures and long pauses remain separate undo steps',()=>{
  const h=new History('A');h.record('B','Tempo','tempo',100);h.endGroup();h.record('C','Tempo','tempo',110);
  h.record('D','Tempo','tempo',900);assert.equal(h.entries.length,4);
});
test('an edit after undo discards redo and does not coalesce with an old gesture',()=>{
  const h=new History('A');h.record('B','Tempo','tempo',100);h.record('C','Key','key',110);h.undo();
  h.record('D','Tempo','tempo',120);assert.equal(h.canRedo,false);assert.equal(h.undo(),'B');
});
test('identical snapshots are no-ops',()=>{const h=new History('A');assert.equal(h.record('A'),false);assert.equal(h.canUndo,false);});
test('history is capped at forty undo steps by default',()=>{
  const h=new History('0');for(let i=1;i<=500;i++)h.record(String(i));
  assert.equal(h.entries.length,41);assert.equal(h.current,'500');for(let i=0;i<40;i++)h.undo();assert.equal(h.current,'460');
});
test('history memory budget discards old entries but retains the current snapshot',()=>{
  const h=new History('A',{maxBytes:12});h.record('BBBB');h.record('CCCC');assert.ok(h.bytes<=12);assert.equal(h.current,'CCCC');
  h.record('D'.repeat(30));assert.equal(h.entries.length,1);assert.equal(h.current.length,30);
});
test('history rejects invalid options and non-text entries',()=>{
  assert.throws(()=>new History(null));assert.throws(()=>new History('A',{limit:1}));assert.throws(()=>new History('A',{maxBytes:NaN}));
  assert.throws(()=>new History('A').record({}));
});
test('history restoration keeps generated content and clip IDs stable',()=>{
  const p=project();p.savedLoops.push(C.makeClip('A',p.params));const a=C.serializeProject(p),h=new History(a);
  p.timeline.push(C.makeClip('A',p.params));h.record(C.serializeProject(p));assert.equal(C.serializeProject(C.parseProject(h.undo())),a);
});
test('invalid saved JSON is not overwritten by subsequent edits',()=>{
  const storage=memory();storage.setItem('p','{broken');const store=new ProjectStore(()=>storage,'p',JSON.parse);
  assert.throws(()=>store.load());assert.equal(store.blocked,true);assert.throws(()=>store.save('{}'));assert.equal(store.readRaw(),'{broken');
});
test('a valid saved project loads and saves normally',()=>{
  const storage=memory(),store=new ProjectStore(()=>storage,'p',JSON.parse);assert.equal(store.load(),null);
  store.save('{"a":1}');assert.equal(store.last,'{"a":1}');assert.deepEqual(store.load(),{a:1});
});
test('changed or deleted saved data is detected before write, even without a storage event',()=>{
  for(const next of ['other-tab',null]) {
    const storage=memory(),store=new ProjectStore(()=>storage,'p',JSON.parse);store.save('{}');
    if(next===null)storage.data.delete('p');else storage.setItem('p',next);
    assert.throws(()=>store.save('{"edit":1}'));assert.equal(store.blocked,true);assert.equal(store.readRaw(),next);
  }
});
test('two sequential tabs cannot silently overwrite each other',()=>{
  const storage=memory(),a=new ProjectStore(()=>storage,'p',JSON.parse),b=new ProjectStore(()=>storage,'p',JSON.parse);
  a.load();b.load();a.save('{"tab":"a"}');assert.throws(()=>b.save('{"tab":"b"}'));assert.equal(storage.getItem('p'),'{"tab":"a"}');
});
test('explicit replacement releases a protected save and refreshes its expected value',()=>{
  const storage=memory(),store=new ProjectStore(()=>storage,'p',JSON.parse);storage.setItem('p','bad');assert.throws(()=>store.load());
  store.save('{}',{force:true});assert.equal(store.blocked,false);store.save('{"ok":1}');assert.equal(store.readRaw(),'{"ok":1}');
});
test('failed writes do not advance the expected saved value; retry is possible',()=>{
  const storage=memory(),store=new ProjectStore(()=>storage,'p',JSON.parse);store.load();const write=storage.setItem;
  storage.setItem=()=>{throw Error('quota');};assert.throws(()=>store.save('{}'));assert.equal(store.last,null);
  storage.setItem=write;store.save('{}');assert.equal(store.last,'{}');
});
test('storage events only block when the observed value differs',()=>{
  const store=new ProjectStore(()=>memory(),'p',JSON.parse);assert.equal(store.externalChange(null),false);
  assert.equal(store.externalChange('{}'),true);assert.equal(store.blocked,true);
});
test('unavailable storage is surfaced to the caller',()=>{
  const store=new ProjectStore(()=>{throw Error('unavailable');},'p',JSON.parse);
  assert.throws(()=>store.load(),/unavailable/);assert.throws(()=>store.save('{}'),/unavailable/);
});
