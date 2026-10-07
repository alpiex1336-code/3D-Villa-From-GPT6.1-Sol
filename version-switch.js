import {VersionManager} from './version-manager.63d061ea63f5.js';
import {preloadVersion} from './version-preload.df9fc54b82ef.js';
const config=JSON.parse(document.querySelector('#nerida-config').textContent);
const $=s=>document.querySelector(s),stage=$('#nerida-stage'),cover=$('#nv-snapshot'),divider=$('#nv-divider'),toggle=$('#nv-toggle'),download=$('#nv-download'),status=$('#nerida-version-status');
const slots=new Map(),records={created:0,destroyed:0,maxFrames:0,releases:[]};
let snapshotURL=null,statusTimer=0,statusDismissed=false,backgroundTask=null,closed=false,downloaded=false;
const preloadAbort=new AbortController();
stage.dataset.session=crypto.randomUUID();
const label=v=>v===1?'第一版原作':'第二版續作';
function hideStatus(){clearTimeout(statusTimer);status.hidden=true;}
function showStatus(text,value=0,complete=false){clearTimeout(statusTimer);if(statusDismissed&&!complete)return;status.hidden=false;$('#nv-message').textContent=text;$('#nv-progress').style.width=Math.max(0,Math.min(100,value))+'%';if(complete)statusTimer=setTimeout(hideStatus,2800);}
function releaseSnapshot(){cover.hidden=true;cover.removeAttribute('src');if(snapshotURL)URL.revokeObjectURL(snapshotURL);snapshotURL=null;}
function updateDownload(){const busy=!!backgroundTask;download.classList.toggle('nv-downloading',busy&&!downloaded);download.classList.toggle('nv-downloaded',downloaded);download.setAttribute('aria-label',downloaded?'第二版續作日間資產已預存':busy?'正在預下載第二版續作':'預下載第二版續作');download.title=downloaded?'日間資產已存入快取；切換時仍需本機準備 3D':'預下载到磁碟快取，不建立第二個 3D 場景';}
const adapter={
 async capture(version){const slot=slots.get(version);if(!slot)return null;const captured=await slot.node.contentWindow.neridaLifecycle.capture();if(!captured?.blob)throw Error('無法保存目前畫面，請稍後再切換');releaseSnapshot();snapshotURL=URL.createObjectURL(captured.blob);cover.src=snapshotURL;await cover.decode();cover.hidden=false;cover.style.clipPath='inset(0)';return {state:captured.state};},
 async destroy(version){const slot=slots.get(version);if(!slot)return;slots.delete(version);if(slot.job){clearTimeout(slot.job.timer);slot.job.reject(new DOMException('場景已釋放','AbortError'));slot.job=null;}try{const report=slot.node.contentWindow.neridaLifecycle?.dispose();if(report){records.releases.push(report);if(records.releases.length>8)records.releases.shift();}}catch{}slot.node.remove();records.destroyed++;stage.dataset.liveViewers=String(slots.size);},
 async load(version,saved){
  if(closed)throw new DOMException('頁面已關閉','AbortError');
  if(slots.has(version))throw Error('Duplicate resident');
  statusDismissed=false;showStatus('正在準備'+label(version)+' · 完整模型與'+(saved?.light==='night'?'夜間':'日間')+'光照');
  const node=document.createElement('iframe');node.id='nerida-resident-v'+version;node.className='nerida-scene-frame';node.title='NERIDA Version '+version+' · '+(version===1?'原作':'續作');node.dataset.version=version;node.allow='fullscreen; pointer-lock';node.allowFullscreen=true;node.inert=true;node.setAttribute('aria-hidden','true');node.style.visibility='hidden';
  const slot={node,job:null};slots.set(version,slot);
  const task=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(slot.job){slot.job=null;reject(Error('準備時間較長，請重試；已下載資產會保留'));}},600000);slot.job={resolve,reject,timer,preparing:false};});
  const url=new URL(`v${version}/index.html`,document.baseURI);url.searchParams.set('build',config['v'+version+'Build']);if(saved?.light==='night')url.searchParams.set('lighting','night');node.src=url.href;stage.append(node);records.created++;records.maxFrames=Math.max(records.maxFrames,slots.size);stage.dataset.liveViewers=String(slots.size);updateDownload();return task;
 },
 async transition(previous,version,saved){
  const next=slots.get(version)?.node,old=slots.get(previous)?.node;if(!next)throw Error('Resident missing');
  await next.contentWindow.neridaLifecycle.restore(saved);
  if(closed)return;hideStatus();
  if(old){old.contentWindow.neridaSetVisible(false);old.inert=true;old.setAttribute('aria-hidden','true');old.style.visibility='hidden';}
  next.style.visibility='visible';next.inert=false;next.setAttribute('aria-hidden','false');next.contentWindow.neridaSetVisible(true);
  if(!cover.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const right=version===2;divider.hidden=false;
   const options={duration:1200,easing:'cubic-bezier(.25,.7,.25,1)',fill:'forwards'};
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
  const message='繪圖資源已被瀏覽器釋放；請重試'+label(data.version);if(job){slot.job=null;clearTimeout(job.timer);job.reject(Error(message));}else{cover.src=new URL('preview/v'+data.version+'_01_NERIDA_Hero.webp',document.baseURI).href;cover.hidden=false;cover.style.clipPath='inset(0)';manager.invalidate(data.version,message);await adapter.destroy(data.version);updateDownload();statusDismissed=false;showStatus(message);}
 }
});
toggle.addEventListener('click',()=>manager.select(manager.error?manager.requested:(manager.requested===1?2:1)));
function prepareSecond(){
 if(backgroundTask)return backgroundTask;
 if(downloaded){statusDismissed=false;showStatus('第二版日間資產已預存 · 切換時僅需本機準備 3D',100,true);return Promise.resolve();}
 statusDismissed=false;showStatus('正在預下載第二版日間資產…');
 backgroundTask=preloadVersion(new URL('delivery-v2.json?v='+config.deliveryBuild,document.baseURI).href,{signal:preloadAbort.signal,originalRoot:config.v2OriginalRoot,onProgress:p=>{if(closed)return;const value=p.done/Math.max(1,p.total)*100;if(!manager.running)showStatus('正在預下載第二版日間資產… '+p.completed+' / '+p.count,value);download.style.setProperty('--nv-download-progress',value+'%');}}).then(()=>{downloaded=true;if(!closed&&!manager.running){statusDismissed=false;showStatus('第二版日間資產已預存 · 切換時僅需本機準備 3D',100,true);}}).catch(error=>{if(!closed){statusDismissed=false;showStatus(error.message);}}).finally(()=>{backgroundTask=null;updateDownload();});updateDownload();return backgroundTask;
}
download.addEventListener('click',prepareSecond);
$('#nv-status-close').addEventListener('click',()=>{statusDismissed=true;hideStatus();});
window.neridaVersions={select:version=>manager.select(version),get state(){return {...manager.state,...records};}};
window.addEventListener('pagehide',()=>{closed=true;preloadAbort.abort();hideStatus();for(const v of [...slots.keys()])void adapter.destroy(v);releaseSnapshot();});
manager.select(1);
