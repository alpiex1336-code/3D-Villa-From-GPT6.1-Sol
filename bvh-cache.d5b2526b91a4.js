import {MeshBVH} from 'three-mesh-bvh';
import {readPrepared,writePrepared,sha256} from './prepared-cache.4d83db8be22b.js';
export const bvhStats={hits:0,builds:0,failures:0};
const bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
// The reordered index is part of the serialization; restore it along with roots.
export function encodeBVH(data){
 const parts=[...data.roots.map(b=>new Uint8Array(b)),...(data.index?[bytes(data.index)]:[]),...(data.indirectBuffer?[bytes(data.indirectBuffer)]:[])];
 const header=new TextEncoder().encode(JSON.stringify({version:data.version,roots:data.roots.map(b=>b.byteLength),index:data.index?{type:data.index.BYTES_PER_ELEMENT,length:data.index.length}:null,indirect:data.indirectBuffer?{type:data.indirectBuffer.BYTES_PER_ELEMENT,length:data.indirectBuffer.length}:null}));
 const result=new Uint8Array(4+header.length+parts.reduce((n,b)=>n+b.length,0));new DataView(result.buffer).setUint32(0,header.length,true);result.set(header,4);let offset=4+header.length;for(const part of parts){result.set(part,offset);offset+=part.length;}return result.buffer;
}
export function decodeBVH(buffer){
 const view=new DataView(buffer),length=view.getUint32(0,true);if(length>65536||length+4>buffer.byteLength)throw Error('Invalid BVH header');
 const spec=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,length)));if(spec.version!==1||!Array.isArray(spec.roots)||!spec.roots.length)throw Error('Unsupported BVH data');let offset=4+length;
 const take=n=>{if(!Number.isSafeInteger(n)||n<=0||offset+n>buffer.byteLength)throw Error('Invalid BVH size');const b=buffer.slice(offset,offset+n);offset+=n;return b;};
 const array=s=>{if(!s)return null;if(![2,4].includes(s.type))throw Error('Invalid BVH index type');const raw=take(s.type*s.length);return s.type===2?new Uint16Array(raw):new Uint32Array(raw);};
 const result={version:1,roots:spec.roots.map(take),index:array(spec.index),indirectBuffer:array(spec.indirect)};if(offset!==buffer.byteLength)throw Error('Invalid BVH trailing bytes');return result;
}
export async function cachedBVH(geometry){
 if(geometry.boundsTree)return geometry.boundsTree;
 const options={targetLeafSize:12};let key;
 try{const p=geometry.attributes.position,i=geometry.index;if(p.isInterleavedBufferAttribute)throw Error('Unsupported interleaved position');
  const meta=JSON.stringify({schema:'bvh-0.9.15-v1',options,position:[p.itemSize,p.count,p.normalized,p.array.constructor.name],index:i?[i.count,i.array.constructor.name]:null,groups:geometry.groups,drawRange:geometry.drawRange});
  const signature=meta+':'+await sha256(bytes(p.array))+':'+(i?await sha256(bytes(i.array)):'none');key='bvh-'+await sha256(new TextEncoder().encode(signature));
  const stored=await readPrepared(key);if(stored){geometry.boundsTree=MeshBVH.deserialize(decodeBVH(stored),geometry,options);bvhStats.hits++;return geometry.boundsTree;}
 }catch{bvhStats.failures++;}
 geometry.boundsTree=new MeshBVH(geometry,options);bvhStats.builds++;
 if(key)try{await writePrepared(key,encodeBVH(MeshBVH.serialize(geometry.boundsTree,{cloneBuffers:false})));}catch{bvhStats.failures++;}
 return geometry.boundsTree;
}
