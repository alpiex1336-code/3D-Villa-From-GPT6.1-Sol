import {VersionManager} from './version-manager.766253f6a7f7.js';
const config=JSON.parse(document.querySelector('#nerida-config').textContent);
const $=s=>document.querySelector(s),stage=$('#nerida-stage'),cover=$('#nv-snapshot'),divider=$('#nv-divider'),toggle=$('#nv-toggle'),download=$('#nv-download'),status=$('#nerida-version-status');
const slots=new Map(),records={created:0,destroyed:0,maxFrames:0,releases:[]};
let snapshotURL=null,statusTimer=0,statusDismissed=false,backgroundTask=null,closed=false;
stage.dataset.session=crypto.randomUUID();
const label=v=>v===1?'第一版原作':'第二版續作';
function hideStatus(){clearTimeout(statusTimer);status.hidden=true;}
function showStatus(text,value=0,complete=false){clearTimeout(statusTimer);if(statusDismissed&&!complete)return;status.hidden=false;$('#nv-message').textContent=text;$('#nv-progress').style.width=Math.max(0,Math.min(100,value))+'%';if(complete)statusTimer=setTimeout(hideStatus,2800);}
function releaseSnapshot(){cover.hidden=true;cover.removeAttribute('src');if(snapshotURL)URL.revokeObjectURL(snapshotURL);snapshotURL=null;}
function updateDownload(){const done=manager.ready.has(2),busy=!!backgroundTask||slots.get(2)?.job;download.classList.toggle('nv-downloading',!!busy&&!done);download.classList.toggle('nv-downloaded',done);download.setAttribute('aria-label',done?'第二版續作已準備完成':busy?'第二版續作正在準備':'準備第二版續作');download.title=done?(manager.ready.has(1)?'兩版已常駐，可直接來回切換':'第二版續作已準備完成'):busy?'正在完成一次性的第二版模型與日夜光照準備':'準備第二版續作的完整 3D、日夜光照與反射';}
const adapter={
 async capture(version){const slot=slots.get(version);if(!slot)return null;try{const captured=await slot.node.contentWindow.neridaLifecycle.capture();if(captured?.blob){releaseSnapshot();snapshotURL=URL.createObjectURL(captured.blob);cover.src=snapshotURL;await cover.decode();cover.hidden=false;cover.style.clipPath='inset(0)';}return captured?{state:captured.state}:null;}catch{return null;}},
 async destroy(version){const slot=slots.get(version);if(!slot)return;slots.delete(version);if(slot.job){clearTimeout(slot.job.timer);slot.job.reject(new DOMException('場景已釋放','AbortError'));slot.job=null;}try{const report=slot.node.contentWindow.neridaLifecycle?.dispose();if(report){records.releases.push(report);if(records.releases.length>8)records.releases.shift();}}catch{}slot.node.remove();records.destroyed++;stage.dataset.liveViewers=String(slots.size);},
 async load(version){
  if(closed)throw new DOMException('頁面已關閉','AbortError');
  if(slots.has(version))throw Error('Duplicate resident');
  statusDismissed=false;showStatus('正在準備'+label(version)+' · 完整模型與日夜光照');
  const node=document.createElement('iframe');node.id='nerida-resident-v'+version;node.className='nerida-scene-frame';node.title='NERIDA Version '+version+' · '+(version===1?'原作':'續作');node.dataset.version=version;node.allow='fullscreen; pointer-lock';node.allowFullscreen=true;node.inert=true;node.setAttribute('aria-hidden','true');node.style.visibility='hidden';
  const slot={node,job:null};slots.set(version,slot);
  const task=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(slot.job){slot.job=null;reject(Error('準備時間較長，請重試；已下載資產會保留'));}},600000);slot.job={resolve,reject,timer,preparing:false};});
  const url=new URL(`v${version}/index.html`,document.baseURI);url.searchParams.set('build',config['v'+version+'Build']);node.src=url.href;stage.append(node);records.created++;records.maxFrames=Math.max(records.maxFrames,slots.size);stage.dataset.liveViewers=String(slots.size);updateDownload();return task;
 },
 async transition(previous,version,saved){
  const next=slots.get(version)?.node,old=slots.get(previous)?.node;if(!next)throw Error('Resident missing');
  try{await next.contentWindow.neridaLifecycle.restore(saved);}catch(error){releaseSnapshot();throw error;}
  if(closed)return;hideStatus();
  if(old){old.contentWindow.neridaSetVisible(false);old.inert=true;old.setAttribute('aria-hidden','true');old.style.visibility='hidden';}
  next.style.visibility='visible';next.inert=false;next.setAttribute('aria-hidden','false');next.contentWindow.neridaSetVisible(true);
  if(!cover.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const right=version===2;divider.hidden=false;
   const options={duration:720,easing:'cubic-bezier(.25,.7,.25,1)',fill:'forwards'};
   const wipe=cover.animate([{clipPath:'inset(0)'},{clipPath:right?'inset(0 100% 0 0)':'inset(0 0 0 100%)'}],options);
   const line=divider.animate([{left:right?'100%':'0%'},{left:right?'0%':'100%'}],options);
   await Promise.allSettled([wipe.finished,line.finished]);wipe.cancel();line.cancel();divider.hidden=true;
  }
  releaseSnapshot();next.focus();
  if(!slots.has(version)){if(old&&slots.has(previous)){old.style.visibility='visible';old.inert=false;old.setAttribute('aria-hidden','false');old.contentWindow.neridaSetVisible(true);}throw Error('繪圖資源已中斷，請重試目前切換');}
 }
};
const manager=new VersionManager(adapter,state=>{
 stage.dataset.phase=state.phase;stage.dataset.activeVersion=state.active;stage.dataset.requestedVersion=state.requested;stage.dataset.swaps=state.swaps;stage.dataset.maxLiveViewers=records.maxFrames;stage.dataset.destroyedViewers=records.destroyed;stage.dataset.preparedVersions=state.prepared.join(',');
 const target=state.requested===1?2:1;toggle.setAttribute('aria-label',state.error?'重試'+label(state.requested):'切換至 Version '+target+' '+(target===1?'原作':'續作'));toggle.title=toggle.getAttribute('aria-label');$('#nv-toggle-number').textContent=String(target).padStart(2,'0');$('#nv-toggle-name').textContent=target===1?'原作':'續作';toggle.classList.toggle('nv-pending',state.busy);toggle.classList.toggle('nv-error',!!state.error);
 $('#nv-edition').textContent=state.requested===1?'01 · 原作':'02 · 續作';document.body.classList.toggle('nv-busy',!state.active&&state.busy&&state.phase!=='transition');updateDownload();
 if(state.error){statusDismissed=false;showStatus(state.error);}
});
window.addEventListener('message',async event=>{
 if(event.origin!==location.origin)return;
 const data=event.data;if(data?.type!=='nerida-viewer')return;
 const slot=slots.get(data.version);if(!slot||event.source!==slot.node.contentWindow)return;const job=slot.job;
 if(data.status==='progress'&&job){showStatus(label(data.version)+' · '+data.text,data.value);if(data.version===2)download.style.setProperty('--nv-download-progress',Math.min(100,data.value||0)+'%');}
 if(data.status==='error'&&job){slot.job=null;clearTimeout(job.timer);job.reject(Error(data.message||'場景載入失敗'));}
 if(data.status==='ready'&&job&&!job.preparing){job.preparing=true;try{await slot.node.contentWindow.neridaLifecycle.prepare();if(slot.job!==job)return;slot.node.contentWindow.neridaSetVisible(false);slot.job=null;clearTimeout(job.timer);job.resolve();}catch(error){if(slot.job===job){slot.job=null;clearTimeout(job.timer);job.reject(error);}}}
 if(data.status==='context-lost'){
  const message='繪圖資源已被瀏覽器釋放；請重試'+label(data.version);if(job){slot.job=null;clearTimeout(job.timer);job.reject(Error(message));}else{manager.invalidate(data.version,message);await adapter.destroy(data.version);updateDownload();if(manager.active!==0){statusDismissed=false;showStatus(message);}}
 }
});
toggle.addEventListener('click',()=>manager.select(manager.error?manager.requested:(manager.requested===1?2:1)));
function prepareSecond(){
 if(backgroundTask)return backgroundTask;
 if(manager.ready.has(2)){statusDismissed=false;showStatus(manager.ready.has(1)?'兩版完整 3D 與日夜光照已準備完成，可直接切換':'第二版續作已準備完成',100,true);return Promise.resolve();}
 statusDismissed=false;backgroundTask=manager.prepare(2).then(()=>{if(!closed){statusDismissed=false;showStatus(manager.ready.has(1)?'兩版已準備完成 · 可直接來回切換':'第二版續作已準備完成',100,true);}}).catch(error=>{if(!closed){statusDismissed=false;showStatus(error.message);}}).finally(()=>{backgroundTask=null;updateDownload();});updateDownload();return backgroundTask;
}
download.addEventListener('click',prepareSecond);
$('#nv-status-close').addEventListener('click',()=>{statusDismissed=true;hideStatus();});
window.neridaVersions={select:version=>manager.select(version),get state(){return {...manager.state,...records};}};
window.addEventListener('pagehide',()=>{closed=true;hideStatus();for(const v of [...slots.keys()])void adapter.destroy(v);releaseSnapshot();});
manager.select(1).then(()=>{if(manager.ready.has(1)&&!closed)prepareSecond();});
