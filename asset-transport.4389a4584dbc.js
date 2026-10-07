const profileVersions={"v1":"daa2c12774d7","v2":"03b6cd16e9c6"};
import {readPrepared,writePrepared,preparedStats,PREPARED_ENTRY_LIMIT} from './prepared-cache.4d83db8be22b.js';
import * as THREE from 'three';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {decodeTexture} from './texture-codec.8ce6b4308d14.js';
const stats={responseBytes:0,cacheHits:0,cacheWrites:0,cacheFailures:0,predecodedTextures:0,retries:0};
const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));
let worker,workerId=0;const jobs=new Map();
function decodeInWorker(buffer){
 if(typeof Worker==='undefined')return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer().then(decodeTexture);
 if(!worker){worker=new Worker(new URL('./delivery-worker.92b8af42e562.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{const job=jobs.get(data.id);if(!job)return;jobs.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data);};worker.onerror=event=>{for(const job of jobs.values())job.reject(Error(event.message||'Texture worker failed'));jobs.clear();worker.terminate();worker=null;};}
 return new Promise((resolve,reject)=>{const id=++workerId;jobs.set(id,{resolve,reject});worker.postMessage({id,buffer},[buffer]);});
}
export async function createDelivery(version,originalRoot){
 let spec;try{const response=await fetch(new URL(`./delivery-${version}.json?v=${profileVersions[version]}`,import.meta.url));if(!response.ok)throw Error('Delivery profile unavailable');spec=await response.json();}catch(error){console.warn('Using original delivery assets',error);spec={files:{},source_sha256:null};}
 let cache;try{if(globalThis.caches)cache=await caches.open('nerida-lossless-assets-v1');}catch{stats.cacheFailures++;}
 let active=true,disposed=false;const controller=new AbortController(),waiters=[];const check=()=>{if(disposed)throw new DOMException('Viewer disposed','AbortError');};
 const waitActive=()=>active?Promise.resolve():new Promise(resolve=>waiters.push(resolve));
 let transfers=0;const transferWaiters=[];
 async function read(url,key,total,onProgress){
  await waitActive();check();if(transfers>=2)await new Promise(resolve=>transferWaiters.push(resolve));else transfers++;
  try{for(let attempt=0;;attempt++){
   try{check();return await readOnce(url,key,total,onProgress);}catch(error){
    if(disposed||error.name==='AbortError'||attempt>=3||error.permanent)throw error;
    stats.retries++;await new Promise(resolve=>setTimeout(resolve,500*2**attempt));
   }
  }}finally{const next=transferWaiters.shift();if(next)next();else transfers--;}
 }
 async function readOnce(url,key,total,onProgress){
  await waitActive();check();
  let response;if(cache){try{response=await cache.match(key);if(response)stats.cacheHits++;}catch{stats.cacheFailures++;}}
  check();const cached=!!response;if(!response){response=await fetch(url,{signal:controller.signal});if(!response.ok){const error=Error(`Asset download failed (${response.status}): ${url}`);error.permanent=response.status<500&&response.status!==408&&response.status!==429;throw error;}}
  const reader=response.body?.getReader(),pieces=[];let loaded=0;
  if(reader){try{for(;;){const item=await reader.read();check();if(item.done)break;pieces.push(item.value);loaded+=item.value.byteLength;onProgress?.({loaded,total:total||Number(response.headers.get('content-length'))||0,lengthComputable:!!total,cached});}}finally{if(disposed)await reader.cancel().catch(()=>{});reader.releaseLock();}}
  else{const bytes=new Uint8Array(await response.arrayBuffer());pieces.push(bytes);loaded=bytes.length;onProgress?.({loaded,total:total||loaded,lengthComputable:true,cached});}
  check();const bytes=new Uint8Array(loaded);let offset=0;for(const piece of pieces){bytes.set(piece,offset);offset+=piece.length;}
  if(!cached){stats.responseBytes+=loaded;if(cache)try{await cache.put(key,new Response(bytes));stats.cacheWrites++;}catch{stats.cacheFailures++;}}
  return bytes;
 }
 async function packed(path,entry,onProgress){
  const progress=new Array(entry.parts.length).fill(0),results=new Array(entry.parts.length);let cursor=0;
  const update=(i,event)=>{progress[i]=event.loaded;onProgress?.({...event,loaded:progress.reduce((a,b)=>a+b,0),total:entry.transferBytes,lengthComputable:true});};
  const consume=async()=>{for(;;){const i=cursor++;if(i>=entry.parts.length)return;const url=new URL(entry.parts[i],spec.remoteRoot).href;results[i]=await read(url,url,0,event=>update(i,event));}};
  await Promise.all(Array.from({length:Math.min(3,entry.parts.length)},consume));
  check();const result=new Uint8Array(entry.transferBytes);let offset=0;for(const bytes of results){result.set(bytes,offset);offset+=bytes.length;}
  if(offset!==entry.transferBytes)throw Error('Compressed asset size mismatch: '+path);return result.buffer;
 }
 async function binary(path,onProgress){
  const entry=spec.files[path];let buffer;
  const reusable=entry?.parts&&entry.format!=='ntex-gzip'&&entry.bytes<=PREPARED_ENTRY_LIMIT&&typeof DecompressionStream!=='undefined';
  const preparedKey=reusable?'raw-'+entry.sha256:null;
  if(preparedKey){const stored=await readPrepared(preparedKey,entry.bytes,entry.sha256);check();if(stored){onProgress?.({loaded:entry.transferBytes,total:entry.transferBytes,cached:true,phase:'prepared-cache'});return stored;}}
  if(entry?.parts&&typeof DecompressionStream!=='undefined'){
   if(entry.format==='ntex-gzip')throw Error('Texture requires the texture decoder');
   const compressed=await packed(path,entry,onProgress);buffer=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }else{const url=new URL(path,originalRoot).href,key=entry?url+(url.includes('?')?'&':'?')+'nerida-sha='+entry.sha256:url;buffer=(await read(key,key,entry?.bytes,onProgress)).buffer;}
  check();if(entry&&buffer.byteLength!==entry.bytes)throw Error('Decoded asset size mismatch: '+path);if(preparedKey){await writePrepared(preparedKey,buffer,entry.sha256);check();}return buffer;
 }
 async function texture(path,onProgress){
  const entry=spec.files[path];
  if(entry?.format==='ntex-gzip'&&typeof DecompressionStream!=='undefined'){
   try{const packedBytes=await packed(path,entry,onProgress);check();const image=await decodeInWorker(packedBytes);check();
    if(image.width!==entry.width||image.height!==entry.height)throw Error('Texture delivery dimensions mismatch');
    const texture=new THREE.DataTexture(new Uint16Array(image.data),image.width,image.height,THREE.RGBAFormat,THREE.HalfFloatType);texture.colorSpace=THREE.LinearSRGBColorSpace;texture.flipY=false;texture.needsUpdate=true;stats.predecodedTextures++;return texture;
   }catch(error){check();console.warn('Lossless texture delivery failed; loading original EXR',path,error);if(cache)await Promise.all(entry.parts.map(part=>cache.delete(new URL(part,spec.remoteRoot).href).catch(()=>{})));const url=new URL(path,originalRoot).href,key=url+(url.includes('?')?'&':'?')+'nerida-sha='+entry.sha256;return new EXRLoader().setDataType(THREE.HalfFloatType).createDataTexture((await read(key,key,entry.bytes,onProgress)).buffer);}
  }
  return new EXRLoader().setDataType(THREE.HalfFloatType).createDataTexture(await binary(path,onProgress));
 }
 stats.prepared=preparedStats;
 return {spec,stats,
  dispose(){if(disposed)return;disposed=true;controller.abort();for(const resolve of waiters.splice(0))resolve();for(const resolve of transferWaiters.splice(0))resolve();if(worker){worker.terminate();worker=null;}for(const job of jobs.values())job.reject(new DOMException('Viewer disposed','AbortError'));jobs.clear();},
  setActive(value){active=value;if(value)for(const resolve of waiters.splice(0))resolve();},
  async model(entry,loader,onProgress){if(!spec.files[entry.file])return loader.loadAsync(new URL(entry.file,originalRoot).href,onProgress);const buffer=await binary(entry.file,onProgress);onProgress?.({loaded:spec.files[entry.file].transferBytes,total:spec.files[entry.file].transferBytes,phase:'decode'});await yieldUI();check();return loader.parseAsync(buffer,originalRoot.href);},
  texture,
  async hdr(path){return new HDRLoader().createDataTexture(await binary(path));},
  binary,
  async url(url){const absolute=new URL(url),base=new URL(originalRoot);if(absolute.origin!==base.origin||!absolute.pathname.startsWith(base.pathname))throw Error('Asset URL outside its source');return binary(decodeURIComponent(absolute.pathname.slice(base.pathname.length)));}
 };
}
