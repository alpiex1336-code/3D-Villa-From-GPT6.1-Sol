const abortError=()=>new DOMException('下載已暫停','AbortError');
export async function preloadVersion(profileURL,{signal,originalRoot,onProgress=()=>{}}={}){
 if(!globalThis.caches)throw Error('此瀏覽器無法保存資產快取');
 const cache=await caches.open('nerida-lossless-assets-v1');
 const response=await fetch(profileURL,{signal});if(!response.ok)throw Error('無法讀取第二版下載清單');
 const spec=await response.json(),jobs=[];
 for(const [path,entry]of Object.entries(spec.files)){
  if(path.includes('_night.'))continue;
  if(entry.parts){entry.parts.forEach((part,i)=>jobs.push({url:new URL(part,spec.remoteRoot).href,bytes:Math.min(48*1048576,entry.transferBytes-i*48*1048576)}));}
  else jobs.push({url:new URL(path,originalRoot).href+'?nerida-sha='+entry.sha256,bytes:entry.bytes});
 }
 let done=0,completed=0,cacheHits=0;const total=jobs.reduce((s,j)=>s+j.bytes,0);
 for(const job of jobs){
  if(signal?.aborted)throw abortError();
  const cached=await cache.match(job.url);if(cached){await cached.body?.cancel();done+=job.bytes;completed++;cacheHits++;onProgress({done,total,completed,count:jobs.length,cacheHits});continue;}
  let stored=false,lastError;
  for(let attempt=0;attempt<4&&!stored;attempt++){
   if(signal?.aborted)throw abortError();let read=0;
   try{
    const r=await fetch(job.url,{signal});if(!r.ok){const e=Error('資產下載失敗 ('+r.status+')');e.permanent=r.status<500&&r.status!==408&&r.status!==429;throw e;}
    const stream=r.body.pipeThrough(new TransformStream({transform(chunk,controller){read+=chunk.byteLength;onProgress({done:done+read,total,completed,count:jobs.length,cacheHits});controller.enqueue(chunk);},flush(){if(read!==job.bytes)throw Error('資產長度不符');}}));
    await cache.put(job.url,new Response(stream,{headers:{'content-length':String(job.bytes)}}));stored=true;
   }catch(error){lastError=error;if(signal?.aborted||error.name==='AbortError')throw abortError();if(error.permanent||error.name==='QuotaExceededError')throw error;if(attempt<3)await new Promise(r=>setTimeout(r,500*2**attempt));}
  }
  if(!stored)throw lastError;done+=job.bytes;completed++;onProgress({done,total,completed,count:jobs.length,cacheHits});
 }
 return {done,total,completed,count:jobs.length,cacheHits};
}
