import {VersionManager} from './version-manager.b609778182b7.js';
import {preloadVersion} from './version-preload.df9fc54b82ef.js';
const config=JSON.parse(document.querySelector('#nerida-config').textContent);
const $=s=>document.querySelector(s),stage=$('#nerida-stage'),cover=$('#nv-snapshot'),divider=$('#nv-divider'),toggle=$('#nv-toggle'),download=$('#nv-download'),status=$('#nerida-version-status');
let frame=null,pending=null,snapshotURL=null,preloadAbort=null,preloadTask=null,preloadReady=false,lastProgress=0;
const records={created:0,destroyed:0,maxFrames:0,releases:[],cancelled:0};
stage.dataset.session=crypto.randomUUID();
const abortError=()=>new DOMException('切換已取消','AbortError');
function showStatus(text,value){status.hidden=false;$('#nv-message').textContent=text;$('#nv-progress').style.width=Math.max(0,Math.min(100,value||0))+'%';}
function stopPreload(){if(preloadAbort){preloadAbort.abort();preloadAbort=null;}download.classList.remove('nv-downloading');}
function releaseSnapshot(){cover.hidden=true;cover.removeAttribute('src');if(snapshotURL)URL.revokeObjectURL(snapshotURL);snapshotURL=null;}
const adapter={
 async capture(){
  if(!frame)return null;
  try{const captured=await frame.contentWindow.neridaLifecycle?.capture();if(captured?.blob){releaseSnapshot();snapshotURL=URL.createObjectURL(captured.blob);cover.src=snapshotURL;await cover.decode();cover.hidden=false;cover.style.clipPath='inset(0)';}return captured?{state:captured.state}:null;}catch{return null;}
 },
 async destroy(){
  if(pending){clearTimeout(pending.timer);pending.reject(abortError());pending=null;}
  if(!frame)return;
  try{const report=frame.contentWindow.neridaLifecycle?.dispose();if(report){records.releases.push(report);if(records.releases.length>12)records.releases.shift();}}catch{}
  const old=frame;frame=null;old.remove();records.destroyed++;stage.dataset.liveViewers='0';
  // Release the old document/context before creating the next renderer.
  await new Promise(resolve=>setTimeout(resolve,50));
 },
 async load(version,saved,signal){
  stopPreload();if(signal.aborted)throw abortError();
  const node=document.createElement('iframe');frame=node;node.id='nerida-scene-frame';node.title=version===1?'NERIDA Version 1 · 原作':'NERIDA Version 2 · Atelier';node.dataset.version=version;node.allow='fullscreen; pointer-lock';node.allowFullscreen=true;node.inert=true;node.setAttribute('aria-hidden','true');node.style.visibility='hidden';
  const url=new URL(`v${version}/index.html`,document.baseURI);url.searchParams.set('build',config['v'+version+'Build']);node.src=url.href;stage.append(node);records.created++;records.maxFrames=Math.max(records.maxFrames,stage.querySelectorAll('iframe').length);stage.dataset.liveViewers='1';
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{if(pending?.node===node){pending=null;reject(Error('載入時間較長，請按右側按鈕重試；已下載資產會保留'));}},180000);
   pending={node,version,saved,resolve,reject,timer,restoring:false};
   signal.addEventListener('abort',()=>{if(pending?.node===node){clearTimeout(timer);pending=null;records.cancelled++;reject(abortError());}},{once:true});
  });
 },
 async transition(previous,version){
  if(!frame)return;
  status.hidden=true;
  frame.style.visibility='visible';frame.inert=false;frame.setAttribute('aria-hidden','false');
  if(!cover.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const right=version===2;divider.hidden=false;divider.style.left=right?'100%':'0%';
   const options={duration:720,easing:'cubic-bezier(.25,.7,.25,1)',fill:'forwards'};
   const wipe=cover.animate([{clipPath:'inset(0)'},{clipPath:right?'inset(0 100% 0 0)':'inset(0 0 0 100%)'}],options);
   const line=divider.animate([{left:right?'100%':'0%'},{left:right?'0%':'100%'}],options);
   await Promise.allSettled([wipe.finished,line.finished]);wipe.cancel();line.cancel();divider.hidden=true;
  }
  releaseSnapshot();status.hidden=true;frame.focus();
 }
};
const manager=new VersionManager(adapter,state=>{
 stage.dataset.phase=state.phase;stage.dataset.activeVersion=state.active;stage.dataset.requestedVersion=state.requested;stage.dataset.swaps=state.swaps;stage.dataset.maxLiveViewers=records.maxFrames;stage.dataset.destroyedViewers=records.destroyed;stage.dataset.lifecycle=JSON.stringify(records.releases);stage.dataset.cancelledLoads=records.cancelled;
 const target=state.requested===1?2:1;toggle.dataset.target=target;toggle.setAttribute('aria-label',state.error?'重新載入'+(state.requested===1?'第一版':'第二版'):'切換至'+(target===1?'Version 1 原作':'Version 2 Atelier'));toggle.title=toggle.getAttribute('aria-label');$('#nv-toggle-number').textContent=String(target).padStart(2,'0');$('#nv-toggle-name').textContent=target===1?'原作':'Atelier';toggle.classList.toggle('nv-pending',state.busy);
 $('#nv-edition').textContent=state.requested===1?'01 · 原作':'02 · Atelier';document.body.classList.toggle('nv-busy',state.busy&&state.phase!=='transition');
 if(state.error){showStatus(state.error,0);toggle.classList.add('nv-error');}else toggle.classList.remove('nv-error');
 if(state.phase==='loading')showStatus('正在準備'+(state.sceneVersion===1?'第一版原作':'第二版 Atelier')+' · 完整畫質',0);
});
window.addEventListener('message',async event=>{
 if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;
 const data=event.data;if(data?.type!=='nerida-viewer')return;
 if(data.status==='progress'&&pending)showStatus(data.text, data.value);
 if(data.status==='error'&&pending){const job=pending;pending=null;clearTimeout(job.timer);job.reject(Error(data.message||'場景載入失敗'));}
 if(data.status==='context-lost'&&!manager.running){showStatus('繪圖資源已中斷；按右側按鈕可恢復目前版本',0);manager.active=0;manager.error='繪圖資源已中斷';manager.notify();}
 if(data.status==='ready'&&pending&&!pending.restoring){const job=pending;job.restoring=true;
  try{await job.node.contentWindow.neridaLifecycle.restore(job.saved);if(pending!==job)return;clearTimeout(job.timer);pending=null;job.resolve();}
  catch(error){if(pending===job){clearTimeout(job.timer);pending=null;job.reject(error);}}
 }
});
toggle.addEventListener('click',()=>manager.select(manager.error?manager.requested:(manager.requested===1?2:1)));
download.addEventListener('click',async()=>{
 if(preloadTask){stopPreload();download.setAttribute('aria-label','繼續預先下載第二版');return;}
 preloadAbort=new AbortController();const signal=preloadAbort.signal;download.classList.add('nv-downloading');download.setAttribute('aria-label','暫停第二版預先下載');
 showStatus('正在預先下載第二版日間資產 · 不建立 3D 場景',lastProgress);
 preloadTask=preloadVersion(new URL('./delivery-v2.json?v='+config.deliveryBuild,document.baseURI),{signal,originalRoot:config.v2OriginalRoot,onProgress:p=>{lastProgress=100*p.done/p.total;download.style.setProperty('--nv-download-progress',lastProgress+'%');download.title=`第二版預先下載 ${Math.round(lastProgress)}% · ${p.completed}/${p.count}`;if(!manager.running)showStatus(`第二版預先下載 ${Math.round(lastProgress)}% · ${(p.done/1048576).toFixed(0)}/${(p.total/1048576).toFixed(0)} MiB`,lastProgress);}})
 .then(()=>{preloadReady=true;download.classList.add('nv-downloaded');download.title='第二版日間資產已預存；切換時仍需模型解析與 GPU 準備';if(!manager.running)showStatus('第二版日間資產已預存 · 切換時仍需準備完整 3D',100);})
 .catch(error=>{if(error.name!=='AbortError'&&!manager.running)showStatus(error.name==='QuotaExceededError'?'瀏覽器快取空間不足；已保存資產保留，仍可直接切換第二版':error.message,0);})
 .finally(()=>{preloadTask=null;preloadAbort=null;download.classList.remove('nv-downloading');download.setAttribute('aria-label',preloadReady?'第二版資產已預先下載':'預先下載第二版日間資產');});
 await preloadTask;
});
$('#nv-status-close').addEventListener('click',()=>{if(!manager.running)status.hidden=true;});
window.neridaVersions={select:version=>manager.select(version),get state(){return {...manager.state,...records};}};
window.addEventListener('pagehide',()=>{stopPreload();try{frame?.contentWindow.neridaLifecycle?.dispose();}catch{}releaseSnapshot();});
manager.select(1);
