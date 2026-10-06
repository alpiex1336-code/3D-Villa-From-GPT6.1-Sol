(()=>{
 const control=document.createElement('div');control.id='nerida-version-switch';control.setAttribute('role','group');control.setAttribute('aria-label','比較 NERIDA 的兩版設計');
 control.innerHTML='<span class="nv-eyebrow">DESIGN EVOLUTION</span><div class="nv-options"><button type="button" data-version="1" aria-label="Version 1 原作" aria-pressed="true"><span>01</span>原作</button><button type="button" data-version="2" aria-label="Version 2 Atelier" aria-pressed="false"><span>02</span>Atelier</button></div>';
 const status=document.createElement('div');status.id='nerida-version-status';status.hidden=true;status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.innerHTML='<span class="nv-message"></span><div class="nv-track"><div class="nv-fill"></div></div>';
 document.body.append(control,status);
 const message=status.querySelector('.nv-message'),fill=status.querySelector('.nv-fill');
 let frame=null,preview=false,complete=false,failed=false,requested=1,active=1;
 function setVisibility(version){window.neridaSetVisible?.(version===1);frame?.contentWindow?.postMessage({type:'nerida-visibility',visible:version===2},location.origin);}
 function updateButtons(){for(const button of control.querySelectorAll('button')){button.setAttribute('aria-pressed',String(+button.dataset.version===requested));button.classList.toggle('nv-pending',+button.dataset.version===2&&requested===2&&!preview&&!failed);}}
 function progress(text,value){status.hidden=false;message.textContent=text;fill.style.width=`${Math.min(100,Math.max(0,value||0))}%`;}
 function reveal(){if(requested!==2||!preview)return;active=2;frame.classList.add('nv-visible');frame.setAttribute('aria-hidden','false');frame.inert=false;setVisibility(2);status.hidden=true;updateButtons();}
 function start(){
  frame?.remove();preview=false;complete=false;failed=false;
  frame=document.createElement('iframe');frame.id='nerida-v2-frame';frame.title='NERIDA Version 2 · Atelier';frame.allow='fullscreen; pointer-lock';frame.allowFullscreen=true;frame.setAttribute('aria-hidden','true');frame.inert=true;
  frame.src=new URL('v2/index.html',document.baseURI).href;document.body.append(frame);
  progress('Version 2 · 正在準備 Atelier 巡覽…',0);window.neridaSetVisible?.(false);updateButtons();
 }
 function select(version){
  requested=version;if(document.pointerLockElement)document.exitPointerLock();
  if(version===1){active=1;status.hidden=true;if(frame){frame.classList.remove('nv-visible');frame.setAttribute('aria-hidden','true');frame.inert=true;}setVisibility(1);updateButtons();return;}
  if(!frame||failed){start();return;}
  // Resuming a partially downloaded V2 does not discard its already loaded models.
  setVisibility(2);if(preview)reveal();else progress('Version 2 · 正在繼續準備巡覽…',0);updateButtons();
 }
 control.addEventListener('click',event=>{const button=event.target.closest('button[data-version]');if(button)select(+button.dataset.version);});
 window.addEventListener('message',event=>{
  if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.type!=='nerida-v2')return;
  const data=event.data;
  if(data.status==='progress'){if(requested===2&&!preview)progress(`Version 2 · ${Math.round(data.value||0)}% · ${data.text||'載入中'}`,data.value);}
  else if(data.status==='preview'){preview=true;failed=false;if(requested===2)reveal();else setVisibility(1);}
  else if(data.status==='ready'){preview=true;complete=true;failed=false;if(requested===2)reveal();else setVisibility(1);}
  else if(data.status==='error'){failed=!preview;if(requested===2){progress('Version 2 · '+(data.message||'載入失敗，請點 Atelier 重試'),0);if(!preview)window.neridaSetVisible?.(true);}updateButtons();}
 });
 window.neridaVersions={select,get state(){return {requested,active,preview,complete,failed};}};
 updateButtons();
})();
