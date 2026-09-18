(function () {
  'use strict';
  const C=window.ChipCore,A=window.ChipAudio;
  const ui=Object.fromEntries([...document.querySelectorAll('[id]')].map(el=>[el.id,el]));
  const STORAGE_KEY='8bit-loop-studio:v1';
  const engine=new A.Engine();
  let state={params:{...C.DEFAULTS},name:'New Loop',volume:0.72,playMode:'loop',savedLoops:[],timeline:[]};
  let startupMessage='',storageAvailable=true;
  try {
    const saved=localStorage.getItem(STORAGE_KEY);
    if(saved) { state=C.parseProject(saved); startupMessage='Restored your local project.'; }
  } catch(error) { storageAvailable=false; startupMessage=`Local project could not be restored: ${error.message} Use Project ↓ for backups.`; }
  state.loop=C.generateLoop(state.params);
  const fields={key:'keySelect',scale:'scaleSelect',tempo:'tempoRange',bars:'barsRange',swing:'swingRange',
    density:'densityRange',variation:'variationRange',octave:'octaveRange',arpBias:'arpRange',echo:'echoRange',
    crunch:'bitcrushRange',seed:'seedInput',leadWave:'leadWaveSelect',bassWave:'bassWaveSelect',
    leadOn:'leadToggle',bassOn:'bassToggle',drumsOn:'drumsToggle',harmonyOn:'harmonyToggle'};
  const patternKeys=new Set(['key','scale','bars','density','variation','octave','arpBias','seed']);
  const outputs={tempo:'tempoValue',bars:'barsValue',swing:'swingValue',density:'densityValue',variation:'variationValue',
    octave:'octaveValue',arpBias:'arpValue',echo:'echoValue',crunch:'bitcrushValue'};
  const trackNames={lead:'leadSteps',bass:'bassSteps',drums:'drumSteps',harmony:'harmonySteps'};
  const cells={};
  let frameId=null,lastFrame=0,starting=false,transportTicket=0,editTimer=null,saveTimer=null;
  let lastGridLoop=null,lastGridBar=-1,lastHighlight=-1,lastClipId=null,highlightedTimelineId=null;
  let exportBusy=false,undoAction=null,drag=null;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const element=(tag,className='',text)=>{const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;};
  function notice(message,{error=false,undo=null}={}) {
    ui.noticeText.textContent=message;
    ui.notice.classList.toggle('error',error);
    undoAction=undo;
    ui.undoBtn.hidden=!undo;
  }
  function persistNow() {
    clearTimeout(saveTimer); saveTimer=null;
    try { localStorage.setItem(STORAGE_KEY,C.serializeProject(state));storageAvailable=true;ui.storageState.textContent='Saved on this device'; }
    catch { storageAvailable=false;ui.storageState.textContent='Autosave unavailable — use Project ↓'; }
  }
  function persist() { clearTimeout(saveTimer);saveTimer=setTimeout(persistNow,200); }
  function currentClip() { return {id:'editor',name:state.name||'Current loop',params:state.params,loop:state.loop}; }
  function showValues() {
    for(const [key,id] of Object.entries(outputs)) {
      const p=state.params[key];
      ui[id].textContent=key==='tempo'?`${p} BPM`:['bars','octave'].includes(key)?String(p):`${Math.round(p*100)}%`;
    }
    ui.volumeValue.textContent=`${Math.round(state.volume*100)}%`;
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
  }
  function createSteps() {
    for(let i=1;i<=16;i++)ui.stepNumbers.append(element('span','',String(i)));
    for(const [track,id] of Object.entries(trackNames)) {
      cells[track]=Array.from({length:16},()=>{const cell=element('div','step');cell.setAttribute('role','img');ui[id].append(cell);return cell;});
    }
  }
  function displayPattern(clip,localStep=0,playing=false) {
    const bar=Math.min(clip.params.bars-1,Math.floor(localStep/16));
    if(lastGridLoop!==clip.loop||lastGridBar!==bar) {
      for(const [track,refs] of Object.entries(cells)) {
        refs.forEach((cell,i)=>{
          const item=clip.loop[track][bar*16+i];
          const active=track==='drums'?!!(item&&(item.kick||item.snare||item.hat)):!!item;
          const description=!active?'Rest':track==='drums'?['kick','snare','hat'].filter(k=>item[k]).join(' + '):track==='harmony'?item.map(C.noteName).join(', '):C.noteName(item.midi);
          cell.classList.toggle('active',active);
          cell.title=`Step ${i+1}: ${description}`;
          cell.setAttribute('aria-label',cell.title);
        });
      }
      lastGridLoop=clip.loop;lastGridBar=bar;
    }
    // Mute state can change without regenerating the same note pattern.
    for(const [track,id] of Object.entries(trackNames))
      ui[id].closest('.track-row').classList.toggle('muted',!clip.params[`${track}On`]);
    const step=playing?localStep%16:-1;
    if(lastHighlight!==step) {
      for(const refs of Object.values(cells)) {
        if(lastHighlight>=0)refs[lastHighlight].classList.remove('playing');
        if(step>=0)refs[step].classList.add('playing');
      }
      lastHighlight=step;
    }
    ui.currentBar.textContent=`${bar+1} / ${clip.params.bars}`;
    ui.currentStep.textContent=`${localStep%16+1} / 16`;
    ui.transportPosition.textContent=`Bar ${bar+1} · Step ${localStep%16+1}`;
  }
  function renderEditor() {
    showValues();
    if(!engine.playing||state.playMode==='loop') {
      showNow(currentClip());displayPattern(currentClip());lastClipId=null;
    }
  }
  function transportUI() {
    const active=engine.playing||starting;
    const lock=active&&state.playMode==='timeline';
    ui.playBtn.disabled=active||(state.playMode==='timeline'&&!state.timeline.length);
    ui.stopBtn.disabled=!active;
    ui.playState.textContent=starting?'Starting…':engine.playing?(state.playMode==='timeline'?'Playing timeline':'Playing loop'):'Stopped';
    ui.audioStatus.textContent=active?'Live':'Ready';
    for(const id of Object.values(fields))ui[id].disabled=lock;
    for(const id of ['rerollBtn','randomBtn','saveLoopBtn','loopNameInput'])ui[id].disabled=lock;
    ui.exportLoopBtn.disabled=exportBusy;
    ui.exportTimelineBtn.disabled=exportBusy||!state.timeline.length;
    ui.clearTimelineBtn.disabled=!state.timeline.length;
    ui.importBtn.disabled=exportBusy;
  }
  function cancelFrame() { if(frameId!==null)cancelAnimationFrame(frameId);frameId=null; }
  const canvasContext=ui.viz.getContext('2d');
  function resizeCanvas() {
    const box=ui.viz.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
    const w=Math.max(1,Math.round(box.width*dpr)),h=Math.max(1,Math.round(box.height*dpr));
    if(ui.viz.width!==w||ui.viz.height!==h){ui.viz.width=w;ui.viz.height=h;}
    drawSpectrum();
  }
  function drawSpectrum() {
    const ctx=canvasContext,w=ui.viz.width,h=ui.viz.height;
    if(!ctx)return;
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#202b40';
    for(let i=1;i<8;i++)ctx.fillRect(i*w/8,0,1,h);
    const data=engine.playing?engine.frequencies():null,bins=64,bw=w/bins;
    for(let i=0;i<bins;i++) {
      const value=data?data[Math.min(data.length-1,Math.floor((i/bins)**1.5*data.length))]/255:0;
      const bh=Math.max(2,value*(h-5));
      ctx.fillStyle=i%4===0?'#7cf7c5':'#8db7ff';ctx.fillRect(i*bw,h-bh,Math.max(1,bw-2),bh);
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
    if((!reducedMotion.matches&&time-lastFrame>=32)||(reducedMotion.matches&&event)) {drawSpectrum();lastFrame=time;}
    frameId=requestAnimationFrame(animate);
  }
  async function play() {
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
    renderEditor();persist();
    if((engine.playing||starting)&&state.playMode==='loop') {
      clearTimeout(editTimer);editTimer=setTimeout(play,100);
    }
  }
  function replaceSettings(params) {
    const wasPlaying=(engine.playing||starting)&&state.playMode==='loop';
    stop();state.params=C.normalizeParams(params);state.loop=C.generateLoop(state.params);
    syncInputs();renderEditor();persist();if(wasPlaying)play();
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
    state.savedLoops.forEach((clip,i)=>fragment.append(clipCard(clip,'library',i)));
    if(!state.savedLoops.length)fragment.append(element('p','empty-state','Save a loop, then add it to your timeline.'));
    ui.savedLoops.replaceChildren(fragment);ui.libraryCount.textContent=state.savedLoops.length;
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
  function mutateTimeline(change,message,undo=null) {
    const wasPlaying=(engine.playing||starting)&&state.playMode==='timeline';
    if(wasPlaying)stop();
    change();renderTimeline();persist();notice(message,{undo});
    if(wasPlaying&&state.timeline.length)play();
  }
  function addToTimeline(id,index=state.timeline.length) {
    const clip=state.savedLoops.find(c=>c.id===id);if(!clip)return;
    if(state.timeline.length>=C.MAX_CLIPS){notice('Timeline is full (128 clips).',{error:true});return;}
    mutateTimeline(()=>state.timeline.splice(index,0,C.makeClip(clip.name,clip.params)),`Added “${clip.name}” to the timeline.`);
  }
  function loadClip(clip) {
    stop();state.params={...clip.params};state.loop=C.generateLoop(state.params);state.name=clip.name;state.playMode='loop';
    syncInputs();renderEditor();transportUI();persist();notice('Loaded into the editor. Saved clips remain unchanged; Save creates a new snapshot.');
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
      const previous=state.savedLoops.slice();state.savedLoops.splice(index,1);renderLibrary();persist();
      notice('Removed from library. Existing timeline clips are kept.',{undo:()=>{state.savedLoops=previous;renderLibrary();persist();}});return;
    }
    if(action==='copy') {
      if(list.length>=C.MAX_CLIPS){notice('Timeline is full (128 clips).',{error:true});return;}
      mutateTimeline(()=>list.splice(index+1,0,C.makeClip(clip.name,clip.params)),'Timeline clip duplicated.');
    } else if(action==='remove') {
      const previous=state.timeline.slice();
      mutateTimeline(()=>state.timeline.splice(index,1),'Timeline clip removed.',()=>{mutateTimeline(()=>{state.timeline=previous;},'Timeline restored.');});
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
    const name=timeline?'timeline_arrangement':filename(state.name);
    stop();exportBusy=true;transportUI();notice('Preparing audio…');
    try {
      const wav=await A.renderWav(sequence,{volume:state.volume,onProgress:message=>notice(message)});
      downloadBlob(wav,`${name}.wav`);notice('WAV exported with the same instruments, echo and crunch as playback, including the effect tail.');
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
  createSteps();
  if(window.matchMedia('(max-width: 740px)').matches)document.querySelectorAll('.controls details').forEach(details=>{details.open=false;});
  for(const [key,id] of Object.entries(fields)) {
    ui[id].addEventListener('input',()=>parameterChanged(key));
    // Only number validation needs a second event; ranges/selects regenerate once.
    if(ui[id].type==='number')ui[id].addEventListener('change',()=>parameterChanged(key,true));
  }
  ui.playBtn.addEventListener('click',play);
  ui.stopBtn.addEventListener('click',stop);
  ui.rerollBtn.addEventListener('click',()=>{let seed;do{seed=Math.floor(Math.random()*999999)+1;}while(seed===state.params.seed);replaceSettings({...state.params,seed});});
  ui.randomBtn.addEventListener('click',()=>replaceSettings(C.randomParams()));
  ui.volumeRange.addEventListener('input',()=>{state.volume=Number(ui.volumeRange.value)/100;engine.setVolume(state.volume);showValues();persist();});
  ui.loopNameInput.addEventListener('input',()=>{state.name=ui.loopNameInput.value.slice(0,96);persist();});
  for(const radio of [ui.modeLoop,ui.modeTimeline])radio.addEventListener('change',()=>{
    const wasPlaying=engine.playing||starting;stop();state.playMode=ui.modeTimeline.checked?'timeline':'loop';transportUI();persist();
    if(wasPlaying&&(state.playMode==='loop'||state.timeline.length))play();
    else if(state.playMode==='timeline'&&!state.timeline.length)notice('Save a loop and use + Add to build a timeline.');
  });
  ui.saveLoopBtn.addEventListener('click',()=>{
    if(state.savedLoops.length>=C.MAX_CLIPS){notice('Library is full (128 loops). Export a project backup or remove unused loops.',{error:true});return;}
    const clip=C.makeClip(state.name,state.params);state.savedLoops.unshift(clip);renderLibrary();persist();notice(`Saved “${clip.name}”. Use + Add to arrange it.`);
  });
  ui.savedLoops.addEventListener('click',event=>handleClipAction(event,'library'));
  ui.timelineItems.addEventListener('click',event=>handleClipAction(event,'timeline'));
  ui.clearTimelineBtn.addEventListener('click',()=>{
    const previous=state.timeline.slice();
    mutateTimeline(()=>{state.timeline=[];},'Timeline cleared.',()=>{mutateTimeline(()=>{state.timeline=previous;},'Timeline restored.');});
  });
  ui.undoBtn.addEventListener('click',()=>{const undo=undoAction;undoAction=null;ui.undoBtn.hidden=true;if(undo){undo();notice('Change undone.');}});
  ui.exportLoopBtn.addEventListener('click',()=>exportAudio(false));ui.exportTimelineBtn.addEventListener('click',()=>exportAudio(true));
  ui.backupBtn.addEventListener('click',()=>{downloadBlob(new Blob([C.serializeProject(state)],{type:'application/json'}),'8bit_project.json');notice('Project backup exported. Import restores the editor, library and timeline.');});
  ui.importBtn.addEventListener('click',()=>ui.importInput.click());
  ui.importInput.addEventListener('change',async()=>{
    const file=ui.importInput.files?.[0];ui.importInput.value='';if(!file)return;
    try {
      if(file.size>1048576)throw new Error('Project files must be smaller than 1 MB.');
      const imported=C.parseProject(await file.text());
      const previous={params:state.params,name:state.name,volume:state.volume,playMode:state.playMode,savedLoops:state.savedLoops,timeline:state.timeline};
      stop();state={...imported,loop:C.generateLoop(imported.params)};syncInputs();renderEditor();renderLibrary();renderTimeline();persistNow();
      notice('Project imported.',{undo:()=>{stop();state={...previous,loop:C.generateLoop(previous.params)};syncInputs();renderEditor();renderLibrary();renderTimeline();persistNow();}});
    } catch(error){notice(`Import failed: ${error.message} Your current project is unchanged.`,{error:true});}
  });
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    if(event.target.closest('input,select,textarea,button,summary,a,[contenteditable]'))return;
    if(event.code==='Space'){event.preventDefault();if(engine.playing||starting)stop();else play();}
    else if(event.key.toLowerCase()==='g'&&!ui.rerollBtn.disabled){event.preventDefault();ui.rerollBtn.click();}
  });
  bindDragEvents();
  if(window.ResizeObserver)new ResizeObserver(resizeCanvas).observe(ui.viz);
  else window.addEventListener('resize',resizeCanvas);
  window.addEventListener('pagehide',()=>{if(saveTimer)persistNow();stop();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(saveTimer)persistNow();cancelFrame();}else if(engine.playing&&frameId===null)frameId=requestAnimationFrame(animate);});
  syncInputs();renderEditor();renderLibrary();renderTimeline();resizeCanvas();
  if(!storageAvailable)ui.storageState.textContent='Autosave unavailable — use Project ↓';
  if(startupMessage)notice(startupMessage,{error:!storageAvailable});
  // Read-only diagnostics make regressions inspectable without exposing mutable state.
  window.ChipApp=Object.freeze({snapshot:()=>JSON.parse(C.serializeProject(state)),diagnostics:()=>({...engine.diagnostics,animationActive:frameId!==null,exportBusy})});
})();
