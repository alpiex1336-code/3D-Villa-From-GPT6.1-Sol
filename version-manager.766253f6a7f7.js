// Two bounded residents. Selection changes never cancel or rebuild a healthy scene.
export class VersionManager {
 constructor(adapter,onState=()=>{}){this.adapter=adapter;this.onState=onState;this.requested=1;this.active=0;this.phase='idle';this.running=false;this.sceneVersion=0;this.swaps=0;this.error=null;this.ready=new Set();this.jobs=new Map();this.queue=Promise.resolve();}
 get state(){return {requested:this.requested,active:this.active,phase:this.phase,busy:this.running,sceneVersion:this.sceneVersion,swaps:this.swaps,error:this.error,prepared:[...this.ready]};}
 notify(){this.onState(this.state);}
 prepare(version){
  if(version!==1&&version!==2)return Promise.reject(Error('Unknown version'));
  if(this.ready.has(version))return Promise.resolve();
  if(this.jobs.has(version))return this.jobs.get(version);
  const task=this.queue.then(async()=>{
   this.sceneVersion=version;this.notify();
   try{await this.adapter.load(version);this.ready.add(version);}
   catch(error){await this.adapter.destroy(version);throw error;}
   finally{this.sceneVersion=0;this.notify();}
  });
  this.jobs.set(version,task);this.queue=task.catch(()=>{});
  task.then(()=>this.jobs.delete(version),()=>this.jobs.delete(version));return task;
 }
 select(version){if(version!==1&&version!==2)return;this.requested=version;this.error=null;this.notify();if(!this.running)this.task=this.run();return this.task;}
 invalidate(version,message){this.ready.delete(version);if(this.active===version){this.active=0;this.requested=version;this.error=message;this.phase='error';}this.notify();}
 async run(){this.running=true;this.notify();
  try{while(this.active!==this.requested){
   const version=this.requested;
   if(!this.ready.has(version)){this.phase='loading';this.notify();await this.prepare(version);}
   if(this.requested!==version)continue;
   const previous=this.active,captured=await this.adapter.capture(previous);
   this.phase='transition';this.notify();await this.adapter.transition(previous,version,captured?.state);this.active=version;this.swaps++;this.phase='ready';this.notify();
  }}catch(error){this.error=String(error.message||error);this.phase='error';}
  finally{this.running=false;this.notify();}
 }
}
