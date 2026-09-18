(function () {
  'use strict';
  const C=window.ChipCore,A=window.ChipAudio,S=window.ChipSession;
  const ui=Object.fromEntries([...document.querySelectorAll('[id]')].map(el=>[el.id,el]));
  const STORAGE_KEY='8bit-loop-studio:v1';
  const engine=new A.Engine();
  let state={params:{...C.DEFAULTS},name:'New Loop',volume:0.72,playMode:'loop',savedLoops:[],timeline:[]};
  let startupMessage='',storageAvailable=true;
  const store=new S.ProjectStore(()=>localStorage,STORAGE_KEY,C.parseProject);
  try {
    const saved=store.load();
    if(saved) { state=saved; startupMessage='Restored your local project.'; }
  } catch(error) { storageAvailable=false; startupMessage=`Local project could not be restored: ${error.message} Use Project ↓ for backups.`; }
  state.loop=C.generateLoop(state.params);
  const history=new S.History(C.serializeProject(state));
  const fields={key:'keySelect',scale:'scaleSelect',tempo:'tempoRange',bars:'barsRange',swing:'swingRange',
    density:'densityRange',variation:'variationRange',octave:'octaveRange',arpBias:'arpRange',echo:'echoRange',
    crunch:'bitcrushRange',seed:'seedInput',harmonyMode:'harmonyModeSelect',leadWave:'leadWaveSelect',bassWave:'bassWaveSelect',
    leadOn:'leadToggle',bassOn:'bassToggle',drumsOn:'drumsToggle',harmonyOn:'harmonyToggle'};
  const patternKeys=new Set(['key','scale','bars','density','variation','octave','arpBias','seed','harmonyMode']);
  const outputs={tempo:'tempoValue',bars:'barsValue',swing:'swingValue',density:'densityValue',variation:'variationValue',
    octave:'octaveValue',arpBias:'arpValue',echo:'echoValue',crunch:'bitcrushValue'};
  const trackNames={lead:'leadSteps',bass:'bassSteps',drums:'drumSteps',harmony:'harmonySteps'};
  const cells={};
  let scopeClip=null,inspected=null;
  const theme=getComputedStyle(document.documentElement);
  const ink=Object.fromEntries(['lead','bass','drums','harmony'].map(k=>[k,theme.getPropertyValue(`--${k}`).trim()]));
  let frameId=null,lastFrame=0,starting=false,transportTicket=0,editTimer=null,saveTimer=null;
  let lastGridLoop=null,lastGridBar=-1,lastHighlight=-1,lastClipId=null,highlightedTimelineId=null;
  let exportBusy=false,drag=null,previewBar=0,importTicket=0;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const element=(tag,className='',text)=>{const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;};
  function updateHistory() {
    ui.undoBtn.disabled=exportBusy||!history.canUndo;ui.redoBtn.disabled=exportBusy||!history.canRedo;
    ui.undoBtn.title=history.canUndo?`Undo: ${history.undoLabel}`:'Nothing to undo';
    ui.redoBtn.title=history.canRedo?`Redo: ${history.redoLabel}`:'Nothing to redo';
  }
  function notice(message,{error=false}={}) {
    ui.noticeText.textContent=message;ui.notice.classList.toggle('error',error);
  }
  function storageUI() {
    ui.recoveryActions.hidden=!store.blocked;
    ui.storageState.textContent=store.blocked?'Autosave paused — saved data protected':storageAvailable?(store.last===null?'Local autosave':'Saved on this device'):'Autosave unavailable — use Project ↓';
  }
  function persistNow() {
    clearTimeout(saveTimer);saveTimer=null;
    try {store.save(C.serializeProject(state));storageAvailable=true;}
    catch {storageAvailable=false;}
    storageUI();
  }
  function persist(label='Edit project',group=null) {
    history.record(C.serializeProject(state),label,group);updateHistory();
    clearTimeout(saveTimer);saveTimer=setTimeout(persistNow,200);
  }
  function restoreSnapshot(text) {
    const restored=C.parseProject(text);
    stop();state={...restored,loop:C.generateLoop(restored.params)};
    syncInputs();renderEditor();renderLibrary();renderTimeline();updateHistory();persistNow();
  }
  function travelHistory(redo=false) {
    if(exportBusy)return;
    const label=redo?history.redoLabel:history.undoLabel;
    const text=redo?history.redo():history.undo();
    if(text!==null){restoreSnapshot(text);notice(`${redo?'Redone':'Undone'}: ${label}.`);}
  }
  function currentClip() { return {id:'editor',name:state.name||'Current loop',params:state.params,loop:state.loop}; }
  function showValues() {
    for(const [key,id] of Object.entries(outputs)) {
      const p=state.params[key];
      ui[id].textContent=key==='tempo'?`${p} BPM`:['bars','octave'].includes(key)?String(p):`${Math.round(p*100)}%`;
    }
    ui.presetSelect.value=C.PRESETS.find(p=>Object.keys(p.params).every(key=>p.params[key]===state.params[key]))?.id||'';
    ui.volumeValue.textContent=`${Math.round(state.volume*100)}%`;
    for(const input of document.querySelectorAll('input[type=range]')) {
      const value=input.id==='volumeRange'?state.volume*100:state.params[Object.keys(fields).find(k=>fields[k]===input.id)];
      const fill=(value-Number(input.min))/(Number(input.max)-Number(input.min))*100;
      input.style.setProperty('--fill',`${Math.max(0,Math.min(100,fill))}%`);
    }
  }
  function syncInputs() {
    for(const [key,id] of Object.entries(fields)) {
      if(typeof state.params[key]==='boolean')ui[id].checked=state.params[key];
      else ui[id].value=state.params[key];
    }
    ui.loopNameInput.value=state.name;
    ui.volumeRange.value=Math.round(state.volume*100);
    ui.modeLoop.checked=state.playMode==='loop'; ui.modeTimeline.checked=state.playMode==='timeline';
    showValues();
  }
  function showNow(clip,playing=false) {
    const p=clip.params;
    ui.songTitle.textContent=`${p.key} ${C.pretty(p.scale)}${playing&&state.playMode==='timeline'?'':' Loop'}`;
    ui.metaTempo.textContent=`${p.tempo} BPM`; ui.metaBars.textContent=`${p.bars} ${p.bars===1?'bar':'bars'}`;
    ui.metaSeed.textContent=`Seed ${p.seed}`;ui.loopDuration.textContent=`${C.duration(clip).toFixed(1)}s`;
    ui.metaMode.textContent=playing&&state.playMode==='timeline'?`Timeline · ${clip.name}`:'Editor preview';
    ui.moodLabel.textContent=p.tempo>=150?'Hyper':p.tempo<=95?'Laid-back':'Bouncy';
    const tracks=['lead','bass','drums','harmony'].filter(k=>p[`${k}On`]).map(k=>k[0].toUpperCase()+k.slice(1));
    ui.loopSummary.textContent=tracks.length?tracks.join(' · '):'All tracks muted';
    scopeClip=clip;
    if(!engine.playing||reducedMotion.matches)drawSpectrum();
  }
  function inspectStep(track,index) {
    inspected={track,index};
    for(const [key,refs] of Object.entries(cells))refs.forEach((cell,i)=>{
      cell.classList.toggle('inspected',key===track&&i===index);
      if(key===track)cell.tabIndex=i===index?0:-1;
    });
    ui.noteReadout.textContent=cells[track][index].getAttribute('aria-label');
  }
  function createSteps() {
    for(let i=1;i<=16;i++)ui.stepNumbers.append(element('span','',String(i).padStart(2,'0')));
    const tracks=Object.keys(trackNames);
    for(const [track,id] of Object.entries(trackNames)) {
      cells[track]=Array.from({length:16},(_,index)=>{
        const cell=element('button','step');cell.type='button';cell.tabIndex=index===0?0:-1;
        // Retain glyph nodes. Playback changes attributes/styles, never row children.
        for(let i=0;i<3;i++){const mark=element('i','note-mark');mark.setAttribute('aria-hidden','true');cell.append(mark);}
        cell.addEventListener('focus',()=>inspectStep(track,index));
        cell.addEventListener('click',()=>inspectStep(track,index));
        cell.addEventListener('keydown',event=>{
          if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
          let next=index,nextTrack=track;
          if(event.key==='ArrowLeft')next=Math.max(0,index-1);
          else if(event.key==='ArrowRight')next=Math.min(15,index+1);
          else if(event.key==='Home')next=0;
          else if(event.key==='End')next=15;
          else if(event.key==='ArrowUp')nextTrack=tracks[Math.max(0,tracks.indexOf(track)-1)];
          else if(event.key==='ArrowDown')nextTrack=tracks[Math.min(tracks.length-1,tracks.indexOf(track)+1)];
          else return;
          event.preventDefault();cells[nextTrack][next].focus();
        });
        ui[id].append(cell);return cell;
      });
    }
  }
  function barControls(bar,bars) {
    if(ui.barSelect.options.length!==bars)ui.barSelect.replaceChildren(...Array.from({length:bars},(_,i)=>new Option(`Bar ${i+1}`,String(i))));
    ui.barSelect.value=String(bar);
    const locked=engine.playing||starting;
    ui.barSelect.disabled=locked;ui.prevBarBtn.disabled=locked||bar===0;ui.nextBarBtn.disabled=locked||bar===bars-1;
  }
  function displayPattern(clip,localStep=0,playing=false) {
    const bar=Math.min(clip.params.bars-1,Math.floor(localStep/16));
    if(lastGridLoop!==clip.loop||lastGridBar!==bar) {
      for(const [track,refs] of Object.entries(cells)) {
        const pitches=track==='drums'?[]:clip.loop[track].flatMap(item=>item?(track==='harmony'?item:[item.midi]):[]);
        const low=pitches.length?Math.min(...pitches):0,high=pitches.length?Math.max(...pitches):1;
        refs.forEach((cell,i)=>{
          const item=clip.loop[track][bar*16+i];
          const active=track==='drums'?!!(item&&(item.kick||item.snare||item.hat)):!!item;
          const description=!active?'Rest':track==='drums'?['kick','snare','hat'].filter(k=>item[k]).join(' + '):track==='harmony'?item.map(C.noteName).join(', '):C.noteName(item.midi);
          cell.classList.toggle('active',active);
          cell.title=`Step ${i+1}: ${description}`;
          cell.setAttribute('aria-label',`${track[0].toUpperCase()+track.slice(1)} · Bar ${bar+1} · ${cell.title}`);
          cell.dataset.note=!active?'':track==='drums'?['kick','snare','hat'].map(k=>item[k]?k[0].toUpperCase():'·').join(''):C.noteName(track==='harmony'?item[0]:item.midi);
          const notes=!active?[]:track==='drums'?['kick','snare','hat'].map(k=>item[k]):track==='harmony'?item:[item.midi];
          [...cell.children].forEach((mark,j)=>{
            mark.hidden=track==='drums'?!notes[j]:notes[j]===undefined;
            mark.style.top=`${track==='drums'?14-j*5:3+Math.round((high-(notes[j]||0))/Math.max(1,high-low)*13)}px`;
          });
        });
      }
      lastGridLoop=clip.loop;lastGridBar=bar;
      if(inspected)ui.noteReadout.textContent=cells[inspected.track][inspected.index].getAttribute('aria-label');
    }
    // Mute state can change without regenerating the same note pattern.
    for(const [track,id] of Object.entries(trackNames)) {
      ui[id].closest('.track-row').classList.toggle('muted',!clip.params[`${track}On`]);
      ui[fields[`${track}On`]].checked=clip.params[`${track}On`];
    }
    const step=playing?localStep%16:-1;
    if(lastHighlight!==step) {
      for(const refs of Object.values(cells)) {
        if(lastHighlight>=0)refs[lastHighlight].classList.remove('playing');
        if(step>=0)refs[step].classList.add('playing');
      }
      lastHighlight=step;
    }
    barControls(bar,clip.params.bars);
    ui.currentBar.textContent=`${bar+1} / ${clip.params.bars}`;
    ui.currentStep.textContent=`${localStep%16+1} / 16`;
    ui.transportPosition.textContent=`Bar ${bar+1} · Step ${localStep%16+1}`;
  }
  function renderEditor() {
    showValues();
    if(!engine.playing||state.playMode==='loop') {
      previewBar=Math.min(previewBar,state.params.bars-1);
      showNow(currentClip());displayPattern(currentClip(),previewBar*16);lastClipId=null;
    }
  }
  function transportUI() {
    const active=engine.playing||starting;
    const lock=active&&state.playMode==='timeline';
    ui.playBtn.disabled=exportBusy||active||(state.playMode==='timeline'&&!state.timeline.length);
    ui.stopBtn.disabled=!active;
    ui.playState.textContent=starting?'Starting…':engine.playing?(state.playMode==='timeline'?'Playing timeline':'Playing loop'):'Stopped';
    ui.audioStatus.textContent=active?(reducedMotion.matches?'Playing':'Live'):'Ready';
    document.body.dataset.playing=String(engine.playing);
    for(const id of Object.values(fields))ui[id].disabled=lock;
    for(const id of ['rerollBtn','randomBtn','saveLoopBtn','loopNameInput','presetSelect'])ui[id].disabled=lock;
    ui.exportLoopBtn.disabled=exportBusy;
    ui.exportTimelineBtn.disabled=exportBusy||!state.timeline.length;
    ui.clearTimelineBtn.disabled=!state.timeline.length;
    ui.importBtn.disabled=exportBusy;ui.loopExportMode.disabled=exportBusy;
    barControls(Math.max(0,lastGridBar),Number(ui.barSelect.options.length)||state.params.bars);updateHistory();
  }
  function cancelFrame() { if(frameId!==null)cancelAnimationFrame(frameId);frameId=null; }
  const canvasContext=ui.viz.getContext('2d');
  function resizeCanvas() {
    const box=ui.viz.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
    const w=Math.max(1,Math.round(box.width*dpr)),h=Math.max(1,Math.round(box.height*dpr));
    if(ui.viz.width!==w||ui.viz.height!==h){ui.viz.width=w;ui.viz.height=h;}
    drawSpectrum();
  }
  function drawContour(ctx,w,h,clip) {
    if(!clip)return;
    const loop=clip.loop,p=clip.params,stepWidth=w/loop.totalSteps;
    const notes=loop.lead.filter(Boolean).map(n=>n.midi);
    const low=notes.length?Math.min(...notes):0,high=notes.length?Math.max(...notes):1;
    ctx.fillStyle='#5b6c584f';
    for(let bar=0;bar<p.bars;bar++)ctx.fillRect(bar*16*stepWidth,0,1,h);
    for(let step=0;step<loop.totalSteps;step++) {
      const x=step*stepWidth,lead=loop.lead[step];
      if(p.leadOn&&lead) {
        const y=4+(1-(lead.midi-low)/Math.max(1,high-low))*Math.max(1,h-15);
        ctx.fillStyle=ink.lead;ctx.fillRect(x,y,Math.max(1,stepWidth*.8),Math.max(2,h/24));
      }
      if(p.bassOn&&loop.bass[step]){ctx.fillStyle=ink.bass;ctx.fillRect(x,h-7,Math.max(1,stepWidth*.75),2);}
      const drum=loop.drums[step];
      if(p.drumsOn&&drum&&(drum.kick||drum.snare||drum.hat)){ctx.fillStyle=ink.drums;ctx.fillRect(x,h-2,Math.max(1,stepWidth*.45),2);}
      if(p.harmonyOn&&loop.harmony[step]){ctx.fillStyle=ink.harmony;ctx.fillRect(x,0,Math.max(1,stepWidth*.75),2);}
    }
  }
  function drawSpectrum() {
    const ctx=canvasContext,w=ui.viz.width,h=ui.viz.height;
    if(!ctx)return;
    ctx.clearRect(0,0,w,h);
    // At rest (or with reduced motion), show the actual loop, not fake audio.
    if(!engine.playing||reducedMotion.matches) {
      if(ui.scopeLabel.textContent!=='Pattern contour · all bars')ui.scopeLabel.textContent='Pattern contour · all bars';
      ui.viz.setAttribute('aria-label',`Pattern contour across ${scopeClip?.params.bars||state.params.bars} bars. Lead pitch, bass, drum and harmony onsets; use the pattern buttons for exact notes.`);
      drawContour(ctx,w,h,scopeClip||currentClip());return;
    }
    if(ui.scopeLabel.textContent!=='Output spectrum')ui.scopeLabel.textContent='Output spectrum';
    ui.viz.setAttribute('aria-label','Live output spectrum. Playback position is also shown in the transport.');
    ctx.fillStyle='#5b6c584f';for(let i=1;i<8;i++)ctx.fillRect(i*w/8,0,1,h);
    const data=engine.frequencies(),bins=64,bw=w/bins;
    for(let i=0;i<bins;i++) {
      const value=data?data[Math.min(data.length-1,Math.floor((i/bins)**1.5*data.length))]/255:0;
      const bh=Math.max(2,value*(h-5));
      ctx.fillStyle=i%4===0?ink.lead:ink.bass;ctx.fillRect(i*bw,h-bh,Math.max(1,bw-2),bh);
    }
  }
  function highlightTimeline(id) {
    if(highlightedTimelineId===id)return;
    for(const el of ui.timelineItems.children)el.classList.toggle('playing',el.dataset.timelineId===id);
    highlightedTimelineId=id;
  }
  function animate(time) {
    if(!engine.playing){frameId=null;return;}
    const event=engine.takeVisualEvent();
    if(event) {
      displayPattern(event.clip,event.step,true);
      if(event.clip.id!==lastClipId){showNow(event.clip,true);lastClipId=event.clip.id;}
      highlightTimeline(state.playMode==='timeline'?event.clip.id:null);
    }
    if(!reducedMotion.matches&&time-lastFrame>=32) {drawSpectrum();lastFrame=time;}
    frameId=requestAnimationFrame(animate);
  }
  async function play() {
    if(exportBusy){notice('Wait for the current WAV export to finish.');return;}
    clearTimeout(editTimer);editTimer=null;
    if(state.playMode==='timeline'&&!state.timeline.length){notice('Save a loop and add it to the timeline first.');return;}
    const ticket=++transportTicket;
    starting=true;transportUI();cancelFrame();
    try {
      const started=await engine.start(state.playMode==='timeline'?state.timeline:[currentClip()],state.volume);
      if(ticket!==transportTicket)return;
      starting=false;
      if(started){lastClipId=null;lastGridLoop=null;lastFrame=0;frameId=requestAnimationFrame(animate);}
      transportUI();
    } catch(error) {
      if(ticket!==transportTicket)return;
      starting=false;await engine.stop();transportUI();renderEditor();drawSpectrum();notice(error.message,{error:true});
    }
  }
  function stop() {
    ++transportTicket;starting=false;clearTimeout(editTimer);editTimer=null;
    engine.stop();cancelFrame();highlightTimeline(null);lastGridLoop=null;
    transportUI();renderEditor();drawSpectrum();
  }
  function parameterChanged(key,commit=false) {
    const el=ui[fields[key]];
    if(el.disabled)return;
    if(key==='seed'&&el.value===''&&!commit)return; // Do not fight intermediate number edits.
    const raw=typeof state.params[key]==='boolean'?el.checked:el.type==='range'||el.type==='number'?Number(el.value):el.value;
    const next=C.normalizeParams({...state.params,[key]:raw});
    if(commit&&el.type==='number')el.value=next[key];
    if(next[key]===state.params[key])return;
    state.params=next;
    if(patternKeys.has(key))state.loop=C.generateLoop(state.params);
    renderEditor();persist(`Change ${key}`,key);
    if((engine.playing||starting)&&state.playMode==='loop') {
      clearTimeout(editTimer);editTimer=setTimeout(play,100);
    }
  }
  function replaceSettings(params,name) {
    const wasPlaying=(engine.playing||starting)&&state.playMode==='loop';
    stop();previewBar=0;if(typeof name==='string')state.name=name;state.params=C.normalizeParams(params);state.loop=C.generateLoop(state.params);
    syncInputs();renderEditor();persist(name?`Apply ${name}`:'Generate pattern');if(wasPlaying)play();
  }
  function actionButton(action,label,title) {
    const button=element('button','',label);button.type='button';button.dataset.action=action;
    if(title){button.title=title;button.setAttribute('aria-label',title);}return button;
  }
  function clipCard(clip,kind,index) {
    const card=element('article','clip');card.draggable=true;card.dataset.kind=kind;card.dataset.id=clip.id;
    if(kind==='timeline')card.dataset.timelineId=clip.id;
    const top=element('div','clip-top');top.append(element('h3','clip-name',clip.name));
    if(kind==='timeline')top.append(element('span','badge',`#${index+1}`));
    card.append(top,element('p','clip-meta',`${clip.params.key} ${C.pretty(clip.params.scale)} · ${clip.params.tempo} BPM · ${clip.params.bars} bars · ${C.duration(clip).toFixed(1)}s`));
    const glyph=element('canvas','clip-glyph');glyph.width=256;glyph.height=48;glyph.setAttribute('aria-hidden','true');
    const ctx=glyph.getContext('2d');if(ctx)drawContour(ctx,glyph.width,glyph.height,clip);card.append(glyph);
    const actions=element('div','clip-actions');
    actions.append(actionButton('load','Load',`Load ${clip.name} into the editor; saved snapshots stay unchanged`));
    if(kind==='library')actions.append(actionButton('add','+ Add',`Add ${clip.name} to the timeline`));
    else {
      actions.append(actionButton('copy','Copy',`Duplicate ${clip.name}`));
      const left=actionButton('left','←',`Move ${clip.name} earlier`),right=actionButton('right','→',`Move ${clip.name} later`);
      left.disabled=index===0;right.disabled=index===state.timeline.length-1;actions.append(left,right);
    }
    const remove=actionButton('remove','×',`Remove ${clip.name} from ${kind==='library'?'library':'timeline'}`);
    remove.classList.add('remove','danger');actions.append(remove);card.append(actions);return card;
  }
  function renderLibrary() {
    const fragment=document.createDocumentFragment();
    const query=ui.librarySearch.value.trim().toLowerCase();
    const filtered=state.savedLoops.filter(c=>`${c.name} ${c.params.key} ${C.pretty(c.params.scale)} ${c.params.tempo} ${c.params.seed}`.toLowerCase().includes(query));
    filtered.forEach((clip,i)=>fragment.append(clipCard(clip,'library',i)));
    if(!filtered.length)fragment.append(element('p','empty-state',query?'No matching loops. Clear the filter to see your library.':'Save a loop, then add it to your timeline.'));
    ui.savedLoops.replaceChildren(fragment);ui.libraryCount.textContent=query?`${filtered.length} / ${state.savedLoops.length}`:state.savedLoops.length;
  }
  function renderTimeline() {
    const fragment=document.createDocumentFragment();
    state.timeline.forEach((clip,i)=>fragment.append(clipCard(clip,'timeline',i)));
    ui.timelineItems.replaceChildren(fragment);highlightedTimelineId=null;
    ui.timelineEmpty.hidden=state.timeline.length>0;
    ui.timelineCount.textContent=state.timeline.length;
    ui.timelineDuration.textContent=`${C.sequenceDuration(state.timeline).toFixed(1)}s total`;
    transportUI();
  }
  function mutateTimeline(change,message) {
    const wasPlaying=(engine.playing||starting)&&state.playMode==='timeline';
    if(wasPlaying)stop();
    change();renderTimeline();persist(message);notice(message);
    if(wasPlaying&&state.timeline.length)play();
  }
  function addToTimeline(id,index=state.timeline.length) {
    const clip=state.savedLoops.find(c=>c.id===id);if(!clip)return;
    if(state.timeline.length>=C.MAX_CLIPS){notice('Timeline is full (128 clips).',{error:true});return;}
    mutateTimeline(()=>state.timeline.splice(index,0,C.makeClip(clip.name,clip.params)),`Added “${clip.name}” to the timeline.`);
  }
  function loadClip(clip) {
    stop();previewBar=0;state.params={...clip.params};state.loop=C.generateLoop(state.params);state.name=clip.name;state.playMode='loop';
    syncInputs();renderEditor();transportUI();persist('Load clip');notice('Loaded into the editor. Saved clips remain unchanged; Save creates a new snapshot.');
  }
  function handleClipAction(event,kind) {
    const button=event.target.closest('button[data-action]'),card=event.target.closest('.clip');
    if(!button||!card||button.disabled)return;
    const list=kind==='library'?state.savedLoops:state.timeline,index=list.findIndex(c=>c.id===card.dataset.id),clip=list[index];
    if(!clip)return;
    const action=button.dataset.action;
    if(action==='load'){loadClip(clip);return;}
    if(action==='add'){addToTimeline(clip.id);return;}
    if(kind==='library'&&action==='remove') {
      state.savedLoops.splice(index,1);renderLibrary();persist('Remove library loop');
      notice('Removed from library. Existing timeline clips are kept. Undo is available.');return;
    }
    if(action==='copy') {
      if(list.length>=C.MAX_CLIPS){notice('Timeline is full (128 clips).',{error:true});return;}
      mutateTimeline(()=>list.splice(index+1,0,C.makeClip(clip.name,clip.params)),'Timeline clip duplicated.');
    } else if(action==='remove') {
      mutateTimeline(()=>state.timeline.splice(index,1),'Remove timeline clip');
    } else if(action==='left'||action==='right') {
      const newIndex=index+(action==='left'?-1:1);
      mutateTimeline(()=>C.moveClip(state.timeline,clip.id,newIndex),'Timeline order updated.');
      const moved=[...ui.timelineItems.children].find(c=>c.dataset.id===clip.id);
      // Preserve keyboard focus even when an arrow becomes disabled at an edge.
      (moved?.querySelector(`[data-action="${action}"]:not(:disabled)`)||moved?.querySelector('[data-action="load"]'))?.focus();
    }
  }
  function downloadBlob(blob,name) {
    const url=URL.createObjectURL(blob),anchor=element('a');anchor.href=url;anchor.download=name;
    document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  const filename=name=>(name||'loop').replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,64)||'loop';
  async function exportAudio(timeline) {
    if(exportBusy)return;
    if(timeline&&!state.timeline.length){notice('Add a clip to the timeline first.');return;}
    const sequence=timeline?state.timeline:[currentClip()];
    const loopable=!timeline&&ui.loopExportMode.value==='loop';
    const name=timeline?'timeline_arrangement':filename(state.name)+(loopable?'_loop':'');
    stop();exportBusy=true;transportUI();notice('Preparing audio…');
    try {
      const wav=await A.renderWav(sequence,{volume:state.volume,loopable,onProgress:message=>notice(message)});
      downloadBlob(wav,`${name}.wav`);notice(loopable?'Loop-length WAV exported: one cycle after effect pre-roll, without an added tail.':'WAV exported with the same instruments, echo and crunch as playback, including the effect tail.');
    } catch(error){notice(`Export failed: ${error.message}`,{error:true});}
    finally{exportBusy=false;transportUI();}
  }
  function bindDragEvents() {
    for(const container of [ui.savedLoops,ui.timelineItems]) {
      container.addEventListener('dragstart',event=>{
        const card=event.target.closest('.clip');if(!card)return;
        drag={kind:card.dataset.kind,id:card.dataset.id};card.classList.add('dragging');
        event.dataTransfer.setData('text/plain',JSON.stringify(drag));event.dataTransfer.effectAllowed=drag.kind==='library'?'copy':'move';
      });
      container.addEventListener('dragend',()=>{drag=null;document.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));ui.timelineDropzone.classList.remove('dragover');});
    }
    ui.timelineDropzone.addEventListener('dragover',event=>{if(!drag)return;event.preventDefault();event.dataTransfer.dropEffect=drag.kind==='library'?'copy':'move';ui.timelineDropzone.classList.add('dragover');});
    ui.timelineDropzone.addEventListener('dragleave',event=>{if(!ui.timelineDropzone.contains(event.relatedTarget))ui.timelineDropzone.classList.remove('dragover');});
    ui.timelineDropzone.addEventListener('drop',event=>{
      if(!drag)return;event.preventDefault();event.stopPropagation();ui.timelineDropzone.classList.remove('dragover');
      const target=event.target.closest('[data-timeline-id]');
      const targetIndex=target?state.timeline.findIndex(c=>c.id===target.dataset.id):state.timeline.length;
      if(drag.kind==='library')addToTimeline(drag.id,targetIndex);
      else {const id=drag.id;mutateTimeline(()=>C.moveClip(state.timeline,id,Math.min(targetIndex,state.timeline.length-1)),'Timeline order updated.');}
      drag=null;
    });
  }
  C.NOTES.forEach(note=>ui.keySelect.append(new Option(note,note)));
  Object.keys(C.SCALES).forEach(scale=>ui.scaleSelect.append(new Option(C.pretty(scale),scale)));
  C.PRESETS.forEach(preset=>ui.presetSelect.append(new Option(preset.name,preset.id)));
  createSteps();
  ui.presetSelect.addEventListener('change',()=>{const preset=C.PRESETS.find(p=>p.id===ui.presetSelect.value);if(preset){replaceSettings(preset.params,preset.name);notice(`Applied ${preset.name}. Undo restores your previous loop.`);}});
  ui.librarySearch.addEventListener('input',renderLibrary);
  function inspectBar(bar){if(engine.playing||starting)return;previewBar=Math.max(0,Math.min(state.params.bars-1,bar));displayPattern(currentClip(),previewBar*16);}
  ui.barSelect.addEventListener('change',()=>inspectBar(Number(ui.barSelect.value)));
  ui.prevBarBtn.addEventListener('click',()=>inspectBar(previewBar-1));
  ui.nextBarBtn.addEventListener('click',()=>inspectBar(previewBar+1));
  if(window.matchMedia('(max-width: 740px)').matches)document.querySelectorAll('.controls details').forEach(details=>{details.open=false;});
  for(const [key,id] of Object.entries(fields)) {
    ui[id].addEventListener('input',()=>parameterChanged(key));
    ui[id].addEventListener('change',()=>history.endGroup());
    ui[id].addEventListener('blur',()=>history.endGroup());
    // Only number validation needs a second event; ranges/selects regenerate once.
    if(ui[id].type==='number')ui[id].addEventListener('change',()=>parameterChanged(key,true));
  }
  ui.playBtn.addEventListener('click',play);
  ui.stopBtn.addEventListener('click',stop);
  ui.rerollBtn.addEventListener('click',()=>{let seed;do{seed=Math.floor(Math.random()*999999)+1;}while(seed===state.params.seed);replaceSettings({...state.params,seed});});
  ui.randomBtn.addEventListener('click',()=>replaceSettings(C.randomParams()));
  ui.volumeRange.addEventListener('input',()=>{state.volume=Number(ui.volumeRange.value)/100;engine.setVolume(state.volume);showValues();persist('Change volume','volume');});
  ui.loopNameInput.addEventListener('input',()=>{state.name=ui.loopNameInput.value.slice(0,96);persist('Rename editor loop','name');});
  ui.loopNameInput.addEventListener('blur',()=>history.endGroup());
  ui.volumeRange.addEventListener('change',()=>history.endGroup());
  for(const radio of [ui.modeLoop,ui.modeTimeline])radio.addEventListener('change',()=>{
    const wasPlaying=engine.playing||starting;stop();state.playMode=ui.modeTimeline.checked?'timeline':'loop';transportUI();persist('Change playback mode');
    if(wasPlaying&&(state.playMode==='loop'||state.timeline.length))play();
    else if(state.playMode==='timeline'&&!state.timeline.length)notice('Save a loop and use + Add to build a timeline.');
  });
  ui.saveLoopBtn.addEventListener('click',()=>{
    if(state.savedLoops.length>=C.MAX_CLIPS){notice('Library is full (128 loops). Export a project backup or remove unused loops.',{error:true});return;}
    const clip=C.makeClip(state.name,state.params);state.savedLoops.unshift(clip);ui.librarySearch.value='';renderLibrary();persist('Save loop');notice(`Saved “${clip.name}”. Use + Add to arrange it.`);
  });
  ui.savedLoops.addEventListener('click',event=>handleClipAction(event,'library'));
  ui.timelineItems.addEventListener('click',event=>handleClipAction(event,'timeline'));
  ui.clearTimelineBtn.addEventListener('click',()=>{
    mutateTimeline(()=>{state.timeline=[];},'Clear timeline');
  });
  ui.undoBtn.addEventListener('click',()=>travelHistory());
  ui.redoBtn.addEventListener('click',()=>travelHistory(true));
  ui.exportLoopBtn.addEventListener('click',()=>exportAudio(false));ui.exportTimelineBtn.addEventListener('click',()=>exportAudio(true));
  ui.backupBtn.addEventListener('click',()=>{downloadBlob(new Blob([C.serializeProject(state)],{type:'application/json'}),'8bit_project.json');notice('Project backup exported. Import restores the editor, library and timeline.');});
  ui.importBtn.addEventListener('click',()=>ui.importInput.click());
  ui.importInput.addEventListener('change',async()=>{
    const file=ui.importInput.files?.[0];ui.importInput.value='';if(!file)return;
    const ticket=++importTicket,before=C.serializeProject(state);
    try {
      if(file.size>1048576)throw new Error('Project files must be smaller than 1 MB.');
      const imported=C.parseProject(await file.text());
      if(ticket!==importTicket)return;
      if(exportBusy||C.serializeProject(state)!==before)throw new Error('The project changed while reading the file. Retry the import.');
      stop();previewBar=0;state={...imported,loop:C.generateLoop(imported.params)};
      syncInputs();renderEditor();renderLibrary();renderTimeline();persist('Import project');persistNow();
      notice('Project imported. Undo restores the previous project.');
    } catch(error){if(ticket===importTicket)notice(`Import failed: ${error.message} Your current project is unchanged.`,{error:true});}
  });
  ui.recoverBtn.addEventListener('click',()=>{
    try {
      const raw=store.readRaw();if(raw===null){notice('There is no saved data to download.');return;}
      downloadBlob(new Blob([raw],{type:'application/json'}),'8bit_saved_data_recovery.json');
      notice('Saved data downloaded unchanged. Autosave remains paused until you choose Keep this project.');
    } catch(error){notice(`Recovery failed: ${error.message}`,{error:true});}
  });
  ui.resumeSaveBtn.addEventListener('click',()=>{
    if(!window.confirm('Replace the browser saved project with this open project? Download Saved data first to keep the other version.'))return;
    try {store.save(C.serializeProject(state),{force:true});storageAvailable=true;storageUI();notice('This project is now saved on this device.');}
    catch(error){storageAvailable=false;storageUI();notice(error.message,{error:true});}
  });
  window.addEventListener('storage',event=>{
    if((event.key===STORAGE_KEY||event.key===null)&&store.externalChange(event.key===null?null:event.newValue)){
      storageUI();notice(store.reason,{error:true});
    }
  });
  document.addEventListener('keydown',event=>{
    if(ui.helpDialog.open||event.defaultPrevented||event.repeat||event.altKey)return;
    if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())) {
      // Text fields keep native editing undo; project history works elsewhere.
      if(event.target.closest('input[type=text],input[type=search],input[type=number],textarea,[contenteditable]'))return;
      event.preventDefault();travelHistory(event.key.toLowerCase()==='y'||event.shiftKey);return;
    }
    if(event.ctrlKey||event.metaKey||event.shiftKey)return;
    if(event.target.closest('input,select,textarea,button,summary,a,[contenteditable]'))return;
    if(event.code==='Space'){event.preventDefault();if(engine.playing||starting)stop();else play();}
    else if(event.key.toLowerCase()==='g'&&!ui.rerollBtn.disabled){event.preventDefault();ui.rerollBtn.click();}
  });
  ui.helpBtn.addEventListener('click',()=>ui.helpDialog.showModal());
  ui.closeHelpBtn.addEventListener('click',()=>ui.helpDialog.close());
  ui.helpDialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const targets=[...ui.helpDialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=targets[0],last=targets[targets.length-1];
    if(first&&((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last))){event.preventDefault();(event.shiftKey?last:first).focus();}
  });
  reducedMotion.addEventListener('change',()=>{drawSpectrum();transportUI();});
  bindDragEvents();
  if(window.ResizeObserver)new ResizeObserver(resizeCanvas).observe(ui.viz);
  else window.addEventListener('resize',resizeCanvas);
  window.addEventListener('pagehide',()=>{if(saveTimer)persistNow();stop();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(saveTimer)persistNow();cancelFrame();}else if(engine.playing&&frameId===null)frameId=requestAnimationFrame(animate);});
  syncInputs();renderEditor();renderLibrary();renderTimeline();resizeCanvas();
  updateHistory();storageUI();
  if(startupMessage)notice(startupMessage,{error:!storageAvailable});
  // Read-only diagnostics make regressions inspectable without exposing mutable state.
  window.ChipApp=Object.freeze({snapshot:()=>JSON.parse(C.serializeProject(state)),diagnostics:()=>({...engine.diagnostics,animationActive:frameId!==null,exportBusy,historyUndo:history.index,historyRedo:history.entries.length-history.index-1,autosaveBlocked:store.blocked})});
})();
