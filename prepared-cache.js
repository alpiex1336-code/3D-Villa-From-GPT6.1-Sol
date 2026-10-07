// Optional, bounded disk cache. Never keeps decoded assets resident in JavaScript.
export const PREPARED_LIMIT=256*1048576,PREPARED_ENTRY_LIMIT=64*1048576;
export const preparedStats={hits:0,writes:0,failures:0,evictions:0};
let pending=Promise.resolve();
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
const keyURL=key=>new URL('./__nerida_prepared__/'+key,import.meta.url).href;
async function storage(){return globalThis.caches?caches.open('nerida-prepared-data-v1'):null;}
export async function readPrepared(key,expectedBytes,expectedHash){
 try{const cache=await storage();if(!cache)return null;const url=keyURL(key),r=await cache.match(url);if(!r)return null;
  const size=Number(r.headers.get('content-length'));if(!size||size>PREPARED_ENTRY_LIMIT||(expectedBytes&&size!==expectedBytes)){await cache.delete(url);return null;}
  const data=await r.arrayBuffer(),hash=expectedHash||r.headers.get('x-nerida-sha');if(data.byteLength!==size||!hash||await sha256(data)!==hash){await cache.delete(url);return null;}preparedStats.hits++;return data;
 }catch{preparedStats.failures++;return null;}
}
export async function writePrepared(key,bytes,expectedHash){
 if(bytes.byteLength>PREPARED_ENTRY_LIMIT)return false;
 const task=pending.then(async()=>{try{const cache=await storage();if(!cache)return false;const url=keyURL(key),hash=await sha256(bytes);if(expectedHash&&expectedHash!==hash)return false;
  const keys=await cache.keys();let total=bytes.byteLength;const sizes=[];
  for(const old of keys){if(old.url===url)continue;const r=await cache.match(old),size=Number(r?.headers.get('content-length')||0);await r?.body?.cancel();sizes.push([old,size]);total+=size;}
  for(const [old,size]of sizes){if(total<=PREPARED_LIMIT)break;await cache.delete(old);total-=size;preparedStats.evictions++;}
  await cache.put(url,new Response(bytes,{headers:{'content-length':String(bytes.byteLength),'x-nerida-sha':hash}}));preparedStats.writes++;return true;
 }catch{preparedStats.failures++;return false;}});pending=task.catch(()=>{});return task;
}
