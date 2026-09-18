'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const tokens=Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})(?=;)/gi)].map(m=>[m[1],m[2]]));
function luminance(hex) {
  const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
function ratio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
for(const [fg,bg] of [['text','panel'],['muted','panel'],['muted','bg'],['screen-text','screen'],['screen-muted','screen'],['lead','screen'],['bass','screen'],['drums','screen'],['harmony','screen']]) {
  test(`Text palette: ${fg} on ${bg} meets 4.5:1`,()=>assert.ok(ratio(tokens[fg],tokens[bg])>=4.5));
}
test('Runtime asset links stay local and resolve',()=>{
  const refs=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(m=>m[1]);
  for(const ref of refs){if(ref.startsWith('data:'))continue;assert.ok(!/^(?:https?:)?\/\//.test(ref),ref);assert.ok(fs.existsSync(path.join(root,ref)),ref);}
});
test('HTML IDs are unique and explicit label targets exist',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
  for(const match of html.matchAll(/\b(?:for|aria-labelledby)="([^"]+)"/g))for(const id of match[1].split(' '))assert.ok(ids.includes(id),id);
});
test('Markdown links resolve after historical audits move out of the root',()=>{
  function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
  for(const file of [path.join(root,'README.md'),path.join(root,'CHANGELOG.md'),...walk(path.join(root,'docs'))].filter(f=>f.endsWith('.md'))){
    const text=fs.readFileSync(file,'utf8');
    for(const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)){
      const ref=match[1].split('#')[0];if(!ref||/^[a-z]+:/i.test(ref))continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(file),ref)),`${path.relative(root,file)} -> ${ref}`);
    }
  }
});
test('README remains a short start page, not another technical audit',()=>{
  const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
  assert.ok(readme.split(/\s+/).length<450);
  assert.ok(readme.includes('docs/guide.md')&&readme.includes('docs/development.md'));
});
