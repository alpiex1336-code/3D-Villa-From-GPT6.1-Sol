// At most one live WebGL viewer. Disk caches are independent of GPU residency.
export class VersionManager {
 constructor(adapter,onState=()=>{}){this.adapter=adapter;this.onState=onState;this.requested=1;this.active=0;this.phase='idle';this.running=false;this.sceneVersion=0;this.swaps=0;this.error=null;this.ready=new Set();this.saved=null;}
 get state(){return {requested:this.requested,active:this.active,phase:this.phase,busy:this.running,sceneVersion:this.sceneVersion,swaps:this.swaps,error:this.error,prepared:[...this.ready]};}
 notify(){this.onState(this.state);}
 select(version){if(version!==1&&version!==2)return;this.requested=version;this.error=null;this.notify();if(!this.running)this.task=this.run();return this.task;}
 invalidate(version,message){this.ready.delete(version);if(this.active===version){this.active=0;this.error=message;this.phase='error';}this.notify();}
 async run(){this.running=true;this.notify();
  try{while(this.active!==this.requested){
   if(this.active){this.saved=(await this.adapter.capture(this.active))?.state||this.saved;await this.adapter.destroy(this.active);this.ready.clear();this.active=0;}
   const version=this.requested;this.sceneVersion=version;this.phase='loading';this.notify();
   try{await this.adapter.load(version,this.saved);}catch(error){await this.adapter.destroy(version);throw error;}
   if(this.requested!==version){await this.adapter.destroy(version);continue;}
   this.phase='transition';this.notify();
   try{await this.adapter.transition(0,version,this.saved);}catch(error){await this.adapter.destroy(version);throw error;}
   this.active=version;this.ready.add(version);this.sceneVersion=0;this.swaps++;this.phase='ready';this.notify();
  }}catch(error){this.sceneVersion=0;this.error=String(error.message||error);this.phase='error';}
  finally{this.running=false;this.notify();}
 }
}
