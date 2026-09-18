/* Bounded session history and conservative, conflict-aware local persistence. */
(function (root) {
  'use strict';
  class History {
    constructor(initial,{limit=41,maxBytes=4*1024*1024}={}) {
      if(typeof initial!=='string'||!Number.isInteger(limit)||limit<2||!Number.isFinite(maxBytes)||maxBytes<1) throw new TypeError('Invalid history settings.');
      this.entries=[{text:initial,label:'Initial project'}];this.index=0;
      this.limit=limit;this.maxBytes=maxBytes;this.group=null;this.time=0;
    }
    get current(){return this.entries[this.index].text;}
    get bytes(){return this.entries.reduce((n,e)=>n+e.text.length*2,0);}
    get canUndo(){return this.index>0;}
    get canRedo(){return this.index<this.entries.length-1;}
    get undoLabel(){return this.canUndo?this.entries[this.index].label:'';}
    get redoLabel(){return this.canRedo?this.entries[this.index+1].label:'';}
    endGroup(){this.group=null;}
    record(text,label='Edit project',group=null,now=Date.now()) {
      if(typeof text!=='string')throw new TypeError('History snapshots must be strings.');
      if(text===this.current)return false;
      const merge=group!==null&&group===this.group&&now>=this.time&&now-this.time<700&&!this.canRedo&&this.index>0;
      this.entries.splice(this.index+1);
      if(merge)this.entries[this.index]={text,label};
      else {this.entries.push({text,label});this.index++;}
      this.group=group;this.time=now;
      // A single current snapshot is always retained, even if larger than the cap.
      while(this.entries.length>1&&(this.entries.length>this.limit||this.bytes>this.maxBytes)) {this.entries.shift();this.index--;}
      return true;
    }
    undo(){this.endGroup();if(!this.canUndo)return null;return this.entries[--this.index].text;}
    redo(){this.endGroup();if(!this.canRedo)return null;return this.entries[++this.index].text;}
  }
  class ProjectStore {
    constructor(getStorage,key,validate) {
      this.getStorage=getStorage;this.key=key;this.validate=validate;
      this.last=null;this.blocked=false;this.reason='';
    }
    load() {
      const text=this.getStorage().getItem(this.key);this.last=text;
      if(text===null)return null;
      try{return this.validate(text);}
      catch(error){this.blocked=true;this.reason='The saved project could not be read. Its original data is protected.';throw error;}
    }
    externalChange(text) {
      if(text!==this.last){this.blocked=true;this.reason='Another tab changed the saved project. Autosave is paused to protect both versions.';return true;}
      return false;
    }
    readRaw(){return this.getStorage().getItem(this.key);}
    save(text,{force=false}={}) {
      const storage=this.getStorage(),current=storage.getItem(this.key);
      if(!force) {
        this.externalChange(current);
        if(this.blocked)throw new Error(this.reason);
      }
      storage.setItem(this.key,text);
      this.last=text;this.blocked=false;this.reason='';
    }
  }
  const api=Object.freeze({History,ProjectStore});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.ChipSession=api;
})(globalThis);
