// Full-resolution GI: one decode in flight; upload immediately, then release CPU pixels.
export function createGILoader({textures,load,configure,upload,isDisposed,onUploaded=()=>{}}){
 let queue=Promise.resolve();
 return function imageTexture(url,onProgress){
  if(!textures.has(url)){
   const task=queue.then(async()=>{
    if(isDisposed())throw new DOMException('Viewer disposed','AbortError');
    const texture=await load(url,onProgress);
    if(isDisposed()){texture.dispose();if(texture.image?.data)texture.image.data=null;throw new DOMException('Viewer disposed','AbortError');}
    try{configure(texture);upload(texture);onUploaded(texture);return texture;}
    catch(error){texture.dispose();if(texture.image?.data)texture.image.data=null;throw error;}
   });
   textures.set(url,task);queue=task.catch(()=>{});
   task.catch(()=>{if(textures.get(url)===task)textures.delete(url);});
  }
  return textures.get(url);
 };
}
export async function releaseLighting({textures,bindings,materials,targets,reflections}){
 for(const {m}of bindings){m.lightMap=null;m.needsUpdate=true;}
 for(const m of materials){m.envMap=null;m.needsUpdate=true;}
 for(const promise of textures.values()){try{const t=await promise;t.dispose();if(t.image?.data)t.image.data=null;}catch{}}
 textures.clear();for(const t of targets)t.dispose();targets.length=0;reflections.day.length=0;reflections.night.length=0;
}
