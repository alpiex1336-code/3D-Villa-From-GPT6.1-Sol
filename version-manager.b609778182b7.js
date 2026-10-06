export class VersionManager {
 constructor(adapter,onState=()=>{}){this.adapter=adapter;this.onState=onState;this.requested=1;this.active=0;this.phase='idle';this.running=false;this.abort=null;this.sceneVersion=0;this.swaps=0;this.error=null;this.saved=null;}
 get state(){return {requested:this.requested,active:this.active,phase:this.phase,busy:this.running,sceneVersion:this.sceneVersion,swaps:this.swaps,error:this.error};}
 notify(){this.onState(this.state);}
 select(version){if(version!==1&&version!==2)return;this.requested=version;this.error=null;if(this.abort&&this.sceneVersion!==version)this.abort.abort();this.notify();if(!this.running)this.task=this.run();return this.task;}
 async run(){this.running=true;this.notify();
  try{while(this.active!==this.requested||this.error){
   const previous=this.active;this.phase='releasing';this.notify();
   const captured=await this.adapter.capture();if(captured?.state)this.saved=captured.state;
   await this.adapter.destroy();this.active=0;
   const version=this.requested;this.sceneVersion=version;this.abort=new AbortController();this.phase='loading';this.notify();
   try{await this.adapter.load(version,this.saved,this.abort.signal);}catch(error){
    await this.adapter.destroy();if(error.name==='AbortError')continue;this.error=String(error.message||error);this.phase='error';this.notify();break;
   }
   this.abort=null;
   if(this.requested!==version){await this.adapter.destroy();continue;}
   this.phase='transition';this.notify();await this.adapter.transition(previous,version);this.active=version;this.swaps++;this.phase='ready';this.notify();
  }}catch(error){await this.adapter.destroy();this.active=0;this.error=String(error.message||error);this.phase='error';}
  finally{this.abort=null;this.running=false;this.notify();}
 }
}
