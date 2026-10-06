import {decodeTexture} from './texture-codec.js';
self.onmessage=async({data:{id,buffer}})=>{
 try{const raw=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),texture=decodeTexture(raw);self.postMessage({id,...texture},[texture.data]);}
 catch(error){self.postMessage({id,error:String(error)});}
};
