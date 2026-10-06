import {releaseResources} from '../viewer-lifecycle.640f856397fa.js';
import {createDelivery} from '../asset-transport.f8fb4ec56162.js';
import {WalkController} from './navigation.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {PointerLockControls} from 'three/addons/controls/PointerLockControls.js';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {MeshBVH,acceleratedRaycast} from 'three-mesh-bvh';
const $=s=>document.querySelector(s), loading=$('#loading');
const siteBase=new URL('.',import.meta.url),localAssetUrl=path=>new URL(path.replace(/^\/+/,''),siteBase).href;
const assetRoot=new URL("https://raw.githubusercontent.com/alpiex1336-code/3D-Villa-From-GPT6.1-Sol/498824bf5abcabccbc59be5a11837864eb015c6e/_assets-v2/");
const assetUrl=path=>new URL(path.replace(/^\/+/,''),assetRoot).href;
let viewerDisposed=false,frameRequest=0,sceneDecoder=null;
let delivery,viewerVisible=true;
try{viewerVisible=window.parent===window||(window.parent.neridaVersions?.state.requested??2)===2;}catch{viewerVisible=true;}
const diagnostics={ready:false,errors:[],source:null,models:[],lightmaps:0,frames:[],mode:'orbit',quality:'high',lighting:'day',probeCount:0};
window.addEventListener('error',e=>diagnostics.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>diagnostics.errors.push(String(e.reason)));
const scene=new THREE.Scene();scene.background=new THREE.Color('#a7bfc1');
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.07,8000);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false,preserveDrawingBuffer:false});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.035;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.transmissionResolutionScale=1;
renderer.info.autoReset=false;$('#viewport').append(renderer.domElement);
const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
diagnostics.gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
$('#gpu-info').textContent=diagnostics.gpu;
const target=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType});target.samples=4;
const composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));
const aa=new SMAAPass();composer.addPass(aa);composer.addPass(new OutputPass());
const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.085;orbit.minDistance=.4;orbit.maxDistance=1200;orbit.maxPolarAngle=Math.PI*.94;
const pointer=new PointerLockControls(camera,renderer.domElement);
// Drag-look and keyboard movement work without browser Pointer Lock support.
const navCanvas=renderer.domElement;navCanvas.tabIndex=0;navCanvas.setAttribute('aria-label','3D 巡覽畫面：WASD 移動，拖曳轉向，Space 跳躍，C 蹲低，E / Q 飛行升降');
let navigationActive=false,lookDrag=null;
const navKeyDownTimes=new Map(),servicedNavKeys=new Set();
const lookEuler=new THREE.Euler(0,0,0,'YXZ');
function activateNavigation(){if(!ready||mode==='orbit')return;navigationActive=true;diagnostics.navigationInput=pointer.isLocked?'pointer-lock':'drag';navCanvas.focus({preventScroll:true});$('#walk-prompt').hidden=true;$('#crosshair').hidden=false;dirty=true;}
function pauseNavigation(){navigationActive=false;lookDrag=null;keys.clear();navKeyDownTimes.clear();servicedNavKeys.clear();moveVelocity.set(0,0,0);$('#crosshair').hidden=true;$('#walk-prompt').hidden=mode==='orbit';}
function requestMouseLock(){activateNavigation();try{const request=navCanvas.requestPointerLock?.();request?.catch?.(error=>{diagnostics.pointerLockError={name:error.name,message:error.message,documentFocused:document.hasFocus()};activateNavigation();toast('此瀏覽器無法鎖定滑鼠；請拖曳轉向，WASD 繼續移動');});}catch{activateNavigation();toast('請拖曳轉向，WASD 繼續移動');}}

RectAreaLightUniformsLib.init();
const worldLight=new THREE.HemisphereLight(0xdde8ff,0x6e6249,.25);scene.add(worldLight);
const sun=new THREE.DirectionalLight(new THREE.Color(1,.88,.69),2.5);sun.position.set(-43,70,30);sun.target.position.set(0,6,0);scene.add(sun,sun.target);
sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);sun.shadow.camera.left=-58;sun.shadow.camera.right=58;sun.shadow.camera.top=58;sun.shadow.camera.bottom=-58;sun.shadow.camera.near=1;sun.shadow.camera.far=200;sun.shadow.normalBias=.008;sun.shadow.bias=-.00008;sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;
const areaLights=[];
const raycaster=new THREE.Raycaster(),floorCaster=new THREE.Raycaster();raycaster.firstHitOnly=true;floorCaster.firstHitOnly=true;
const collisionMeshes=[], pendingCollisionMeshes=[], materials=new Set(), lightmapMaterials=[];
const textures=new Map(),envTargets=[],reflectionMaps={day:[],night:[]};
const mirrors=[];let reflectionDepth=0,displayTick=0;
let lightingBusy=false,pendingLighting=null;
let manifest,mode='orbit',quality='high',light='day',speed=2.5,dirty=true,movingUntil=0,lastFrame=performance.now(),lastRendered=0,lastStats=0,transition=null,previewReady=false,ready=false,probeBusy=false,measurement=null;
const keys=new Set(),moveVelocity=new THREE.Vector3();
const walker=new WalkController();
const v1=new THREE.Vector3(),v2=new THREE.Vector3(),v3=new THREE.Vector3();
const rooms=[
 ['01 HERO','海崖全景','石灰岩、海風與開闊的地平線。','01_NERIDA_Hero.png'],
 ['02 COURTYARD','泳池庭院','水面、露台與環繞庭院的生活空間。','03_NERIDA_Courtyard.png'],
 ['03 SALON','客廳與閱讀區','亞麻、橡木與面向海岸的開放起居室。','04_NERIDA_Salon.png'],
 ['06 SUITE','潮汐石室','化石石灰岩、起伏床背、雕刻床頭几與鼠尾草色織物。','05_NERIDA_Suite.png'],
 ['04 SEA','臥室海景','從室內向海面與地平線望去。','06_NERIDA_Sea_View.png'],
 ['09 KITCHEN','廚房與餐廳','石質工作檯、家電與完整餐飲配置。','07_NERIDA_Kitchen.png'],
 ['10 BATH','石質衛浴','雙洗手盆、淋浴與暖色金屬細節。','08_NERIDA_Ensuite.png'],
 ['05 ARRIVAL','庭園入口','植被、踏石與住宅背面的到達動線。','09_NERIDA_Arrival.png'],
 ['07 OVERVIEW','基地鳥瞰','建築、泳池、海崖與連續的沿海地景。','10_NERIDA_Site.png'],
 ['02 COURTYARD','暮色庭院','暖色室內光照與暮色中的泳池。','02_NERIDA_Blue_Hour.png','night'],
 ['11 INK','墨木織室','扭轉煙燻木肋、赤陶織物、訂製書寫角與低床。','11_NERIDA_Ink_Suite.png'],
 ['12 TIDE DETAIL','石室細部','床背銅嵌線、天然石紋、布料縫線與雕刻家具。','12_NERIDA_Tide_Detail.png'],
 ['13 INK DETAIL','墨木細部','連續曲面木肋、纖維織物與書寫家具。','13_NERIDA_Ink_Detail.png'],
 ['14 WC DETAIL','衛浴構造','中空陶瓷、座圈、鉸鏈、上掀蓋與安裝接點。','14_NERIDA_WC_Detail.png'],
 ['15 APPLIANCE','家電細部','獨立安裝櫃、爐腔、玻璃門、烤架與微波爐轉盤。','15_NERIDA_Appliance.png'],
 ['16 POOL','泳池細部','完整相接的入水階梯、踏面細紋與物理波紋水面。','16_NERIDA_Pool_Detail.png'],
 ['17 STUDY','書房與藏書','淡色橡木、書籍封面、紙頁與獨立桌面照明。','17_NERIDA_Study.png'],
 ['18 SCULPTURE','扭轉銅雕','原創扭轉曲面、固定底板與落地石質底座。','18_NERIDA_Sculpture.png']
];
function zUp(a){return new THREE.Vector3(a[0],a[2],-a[1]);}
function reportHost(status,details={}){if(window.parent!==window)window.parent.postMessage({type:'nerida-viewer',version:2,status,...details},location.origin);}
function progress(value,text){const pct=Math.max(0,Math.min(100,value));$('#load-progress').style.width=`${pct}%`;$('#load-status').textContent=text;const stream=$('#stream-status');if(stream&&!stream.hidden){$('#stream-progress').style.width=`${pct}%`;$('#stream-message').textContent=text;}reportHost('progress',{value:pct,text});}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4000);}
function imageTexture(url,onProgress){if(!textures.has(url))textures.set(url,delivery.texture(url,onProgress).then(t=>{t.channel=1;t.flipY=false;t.repeat.set(1,-1);t.offset.y=1;t.colorSpace=THREE.LinearSRGBColorSpace;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;}));return textures.get(url);}
function patchLightmap(m){
 m.onBeforeCompile=shader=>{
  if(m.lightMap){
   const maps=THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );','iblIrradiance += vec3( 0.0 );');
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`#if defined( RE_IndirectDiffuse )\nirradiance=vec3(0.0);\n#endif\n${maps}`)
    .replace('#include <lights_fragment_end>','#include <lights_fragment_end>\nreflectedLight.directDiffuse=vec3(0.0);');
  }
  if(m.userData.nativeCubeAtlas){
   const normalChunk=THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;',`
    vec3 pDx=dFdx(vViewPosition),pDy=dFdy(vViewPosition);
    vec2 uDx=dFdx(vNormalMapUv),uDy=dFdy(vNormalMapUv);
    float uvDet=uDx.x*uDy.y-uDx.y*uDy.x;
    vec3 atlasU=(pDx*uDy.y-pDy*uDx.y)/max(abs(uvDet),1e-12);
    vec3 atlasV=(pDy*uDx.x-pDx*uDy.x)/max(abs(uvDet),1e-12);
    vec2 physicalScale=clamp(vec2(3.0/max(length(atlasU),.01),2.0/max(length(atlasV),.01)),vec2(.01),vec2(4.0));
    mapN.xy *= normalScale*physicalScale;
   `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',normalChunk);
  }
 };
 m.customProgramCacheKey=()=> 'nerida-pbr-v2-'+!!m.lightMap+'-'+!!m.userData.nativeCubeAtlas;
}

async function setupMesh(o,{deferLightmaps=false,deferCollision=false}={}){
 if(!o.isMesh)return;
 o.castShadow=true;o.receiveShadow=true;
 if(o.isInstancedMesh){o.computeBoundingSphere();o.computeBoundingBox();}
 const ms=Array.isArray(o.material)?o.material:[o.material];
 for(const m of ms){
  materials.add(m);m.envMapIntensity=.7;m.userData.nativeCubeAtlas=Object.keys(manifest.material_bakes).some(n=>m.name===n||m.name.startsWith(n+' |'));if(m.userData.nativeCubeAtlas)patchLightmap(m);
  if(m.name.startsWith('ATELIER | sea sage wool')){
   const w=manifest.material_bakes['ATELIER | sea sage wool'];
   m.sheen=w.sheen_weight;m.sheenColor.setRGB(...w.sheen_tint.slice(0,3));m.sheenRoughness=w.sheen_roughness;
   diagnostics.woolMaterial={normalImageSize:m.normalMap?[m.normalMap.image.width,m.normalMap.image.height]:null,constantAlbedo:!m.map,sheen:m.sheen,sheenRoughness:m.sheenRoughness,nativeCubeAtlas:m.userData.nativeCubeAtlas};
  }
  for(const t of [m.map,m.normalMap,m.roughnessMap,m.metalnessMap])if(t)t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  if(m.name.includes('leaves')||m.name.includes('shrub')){m.side=THREE.DoubleSide;m.alphaTest=Math.max(.35,m.alphaTest);m.transparent=false;m.depthWrite=true;}
  if(m.name.includes('Silver mirror'))m.roughness=.045;
  if(m.name.startsWith('ATELIER | blown glass')){m.thickness=.004;m.ior=1.46;m.roughness=.026;m.envMapIntensity=.9;}
  if(m.name.startsWith('ATELIER | clear sanitary water')){const w=manifest.sanitary_water_optics;m.thickness=w?.depth_m??.042;m.ior=w?.ior??1.333;m.roughness=w?.roughness??.025;m.attenuationColor=new THREE.Color().setRGB(...(w?.absorption_color??[.98,.99,1]).map(c=>Math.exp(-(1-c)*(w?.absorption_density??.06))));m.attenuationDistance=1;}
  if(m.name.includes('Architectural glass')){m.thickness=.012;m.ior=1.46;m.roughness=.012;m.envMapIntensity=1;}
  if(m.name.includes('Pool water')||m.name.includes('Mediterranean sea'))addWaterNormal(m,o);
  const batch=m.userData?.lightmap_batch;
  if(batch && manifest.lightmaps[batch]){
   m.aoMap=null;m.lightMapIntensity=Math.PI;patchLightmap(m);lightmapMaterials.push({m,batch});
   if(!deferLightmaps){m.lightMap=await imageTexture(manifest.lightmaps[batch].day);m.needsUpdate=true;diagnostics.lightmaps++;}
  }
 }
 // Ray collision is geometry-based, including glazing, openings and stairs.
 if(!o.isInstancedMesh && (o.userData?.source_collection==='01 Architecture'||o.parent?.userData?.source_collection==='01 Architecture'||ms.some(m=>m.userData?.lightmap_batch&&o.name.startsWith('WEB_BATCH')))){
  if(o.geometry.attributes.position.count<300000){if(deferCollision)pendingCollisionMeshes.push(o);else indexCollisionMesh(o);}
 }
}
function indexCollisionMesh(o){o.geometry.boundsTree=new MeshBVH(o.geometry,{targetLeafSize:12});o.raycast=acceleratedRaycast;collisionMeshes.push(o);}
async function buildCollisionIndex(){for(let i=0;i<pendingCollisionMeshes.length;i+=6){for(const o of pendingCollisionMeshes.slice(i,i+6))indexCollisionMesh(o);progress(87+2*Math.min(1,(i+6)/Math.max(1,pendingCollisionMeshes.length)),'正在準備步行碰撞資料…');await new Promise(resolve=>setTimeout(resolve,0));}pendingCollisionMeshes.length=0;}
async function loadLightmaps(bindings,start,end,label='日間光照'){
 const byBatch=new Map();for(const binding of bindings){if(!byBatch.has(binding.batch))byBatch.set(binding.batch,[]);byBatch.get(binding.batch).push(binding.m);}
 const entries=[...byBatch.entries()];let loaded=0;
 for(let i=0;i<entries.length;i+=4){
  const chunk=entries.slice(i,i+4);
  const fractions=new Map(chunk.map(([batch])=>[batch,0]));
  const updateProgress=()=>{const fraction=[...fractions.values()].reduce((sum,value)=>sum+value,0);progress(start+(end-start)*(i+fraction)/Math.max(1,entries.length),`正在下載${label}貼圖… ${loaded} / ${entries.length}`);};
  await Promise.all(chunk.map(async([batch,meshes])=>{const texture=await imageTexture(manifest.lightmaps[batch].day,event=>{if(event.total)fractions.set(batch,event.loaded/event.total);updateProgress();});for(const m of meshes){m.lightMap=texture;m.needsUpdate=true;diagnostics.lightmaps++;}fractions.set(batch,1);}));
  loaded+=chunk.length;progress(start+(end-start)*loaded/Math.max(1,entries.length),`正在準備${label}貼圖… ${loaded} / ${entries.length}`);dirty=true;displayTick++;await new Promise(resolve=>setTimeout(resolve,0));
 }
}
async function loadModel(entry,loader,onProgress){if(!delivery.spec.files[entry.file]||(entry.remote_parts?.length&&typeof DecompressionStream==='undefined'))return loadOriginalModel(entry,loader,onProgress);try{return await delivery.model(entry,loader,onProgress);}catch(error){if(viewerDisposed)throw error;console.warn('Compressed delivery unavailable; using original model',error);return loadOriginalModel(entry,loader,onProgress);}}
async function loadOriginalModel(entry,loader,onProgress){
 if(!entry.remote_parts?.length)return loader.loadAsync(assetUrl(entry.file),onProgress);
 const pieces=[];let received=0;
 for(const part of entry.remote_parts){
  const response=await fetch(assetUrl(part));
  if(!response.ok)throw Error('模型分段下載失敗 ('+response.status+'): '+part);
  const reader=response.body?.getReader();
  if(reader){for(;;){const {done,value}=await reader.read();if(done)break;pieces.push(value);received+=value.byteLength;onProgress?.({loaded:received,total:entry.remote_bytes});}}
  else{const bytes=await response.arrayBuffer();pieces.push(bytes);received+=bytes.byteLength;onProgress?.({loaded:received,total:entry.remote_bytes});}
 }
 if(received!==entry.remote_bytes)throw Error('模型分段大小不符: '+entry.file);
 const blobUrl=URL.createObjectURL(new Blob(pieces,{type:'model/gltf-binary'}));
 try{onProgress?.({loaded:received,total:entry.remote_bytes,phase:'decode'});return await loader.loadAsync(blobUrl);}finally{URL.revokeObjectURL(blobUrl);}
}
function addWaterNormal(m,o){
 if(!addWaterNormal.texture){const n=256,data=new Uint8Array(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const u=x/n*Math.PI*2,v=y/n*Math.PI*2;let dx=0,dy=0;for(let k=1;k<=18;k++){const kx=((k*7)%17)-8,ky=((k*11)%19)-9,phase=k*2.399,amp=.035/Math.sqrt(k);const wave=Math.cos(u*kx+v*ky+phase);dx+=amp*kx/8*wave;dy+=amp*ky/8*wave;}const vec=new THREE.Vector3(-dx,-dy,1).normalize(),i=(y*n+x)*4;data[i]=Math.round((vec.x*.5+.5)*255);data[i+1]=Math.round((vec.y*.5+.5)*255);data[i+2]=Math.round((vec.z*.5+.5)*255);data[i+3]=255;}const t=new THREE.DataTexture(data,n,n);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(14,14);t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.needsUpdate=true;addWaterNormal.texture=t;}
 m.normalMap=addWaterNormal.texture.clone();
 if(manifest.revision&&m.name.includes('Pool water'))m.normalMap.repeat.set(.075,.075);
 m.normalScale.set(.28,.28);m.roughness=.045;
 if(m.name.includes('Pool water')){const w=manifest.water_optics,small=(o?.userData?.source_collection||o?.parent?.userData?.source_collection)==='02 Interiors';m.ior=w?.ior??1.333;m.roughness=w?.roughness??.065;m.thickness=small ? .02 : (w?.pool_thickness??1.16);if(w){m.attenuationColor=new THREE.Color().setRGB(...w.absorption_color.map(c=>Math.exp(-(1-c)*w.absorption_density)));m.attenuationDistance=1;}else{m.attenuationColor=new THREE.Color(.4,.8,.74);m.attenuationDistance=7;}if(small)m.normalScale.set(.06,.06);}
}
function configureLights(variant=light){
 const spec=(manifest.light_variants?.[variant]||manifest.lights).find(l=>l.type==='SUN');if(spec){sun.position.copy(zUp(spec.direction).multiplyScalar(-90)).add(sun.target.position);sun.color.setRGB(...spec.color);sun.intensity=spec.energy;}
 const world=manifest.world_variants?.[variant];if(world){scene.backgroundIntensity=world.background_strength;scene.environmentIntensity=world.background_strength;renderer.toneMappingExposure=2**world.exposure_stops;}
 // Area-light diffuse illumination is already in the Cycles lightmaps.
 // Source photographic fills also disable glossy visibility; avoid duplicate specular highlights.
}
async function spatialInstances(root){
 const source=[];root.traverse(o=>{if(o.isInstancedMesh)source.push(o);});
 let before=0,after=0,chunks=0;
 for(const o of source){
  before+=o.count;const groups=new Map(),a=new THREE.Matrix4(),world=new THREE.Matrix4(),center=new THREE.Vector3();
  for(let i=0;i<o.count;i++){o.getMatrixAt(i,a);world.multiplyMatrices(o.matrixWorld,a);center.setFromMatrixPosition(world);const key=[Math.floor(center.x/16),Math.floor(center.z/16)].join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a.clone());if(i&&i%12000===0)await new Promise(resolve=>setTimeout(resolve,0));}
  for(const [key,matrices] of groups){const chunk=new THREE.InstancedMesh(o.geometry,o.material,matrices.length);chunk.name=o.name+' | cell '+key;chunk.matrixAutoUpdate=false;chunk.matrix.copy(o.matrix);chunk.userData={...o.userData};matrices.forEach((m,i)=>chunk.setMatrixAt(i,m));chunk.instanceMatrix.needsUpdate=true;chunk.computeBoundingBox();chunk.computeBoundingSphere();o.parent.add(chunk);after+=chunk.count;chunks++;}
  o.parent.remove(o);o.dispose();
 }
 root.updateMatrixWorld(true);diagnostics.instanceCulling={before,after,chunks,sourceGroups:source.length};
 if(before!==after)throw Error('Instance count changed during spatial grouping');
}
function setupMirrors(){
 const sources=manifest.mirrors||[],groups=new Map();
 for(const data of sources){const key=data.position[1].toFixed(4);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(data);}
 for(const dataGroup of groups.values()){
  const center=dataGroup.reduce((v,d)=>v.add(zUp(d.position)),new THREE.Vector3()).multiplyScalar(1/dataGroup.length),shapes=[];
  center.z+=dataGroup[0].dimensions[1]/2+.004;
  for(const data of dataGroup){
  const [w,,h]=data.dimensions,r=.025,x=-w/2,y=-h/2,shape=new THREE.Shape();
  shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
   const p=zUp(data.position),geometry=new THREE.ShapeGeometry(shape,8);geometry.translate(p.x-center.x,p.y-center.y,0);shapes.push(geometry);
  }
  const merged=mergeGeometries(shapes);shapes.forEach(g=>g.dispose());
  const mirror=new Reflector(merged,{color:new THREE.Color(.5,.5,.5),textureWidth:2048,textureHeight:2048,clipBias:0,multisample:4});
  mirror.name='Planar reflection | shared coplanar mirrors';mirror.position.copy(center);
  const sight=new THREE.Raycaster();sight.firstHitOnly=true;let lastTick=-1,initialized=false;
  function visibleSurface(cam){
   for(const data of dataGroup){const p=zUp(data.position);p.z=center.z;if(cam.position.distanceTo(p)>12||cam.position.z<p.z)continue;
    for(const [dx,dy]of [[0,0],[-.4,-.4],[.4,-.4],[-.4,.4],[.4,.4]]){
     const point=p.clone().add(new THREE.Vector3(dx*data.dimensions[0],dy*data.dimensions[2],0)),direction=point.clone().sub(cam.position),distance=direction.length();sight.set(cam.position,direction.normalize());sight.far=distance-.015;
     const blocked=sight.intersectObjects(collisionMeshes,false).some(hit=>{const m=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;return !(m.transmission>.1||m.name.includes('glass'));});
     if(!blocked)return true;
    }
   }return false;
  }
  const render=mirror.onBeforeRender;mirror.onBeforeRender=function(...args){
   if(probeBusy||reflectionDepth||!ready||lastTick===displayTick||(initialized&&!visibleSurface(args[2])))return;
   lastTick=displayTick;
   const hidden=[];for(const m of materials)if(m.name.includes('Silver mirror')){hidden.push([m,m.visible]);m.visible=false;}
   reflectionDepth++;try{render.apply(this,args);initialized=true;}finally{for(const [m,v]of hidden)m.visible=v;reflectionDepth--;}
  };
  scene.add(mirror);mirrors.push(mirror);
 }
 diagnostics.planarMirrors=sources.length;diagnostics.planarReflectionPasses=mirrors.length;
}
async function init(){
 try{
  manifest=await fetch(assetUrl('manifest.json')).then(r=>{if(!r.ok)throw Error('巡覽模型尚未完成匯出');return r.json();});diagnostics.source=manifest.source_sha256;navCanvas.dataset.sourceSha256=manifest.source_sha256;
  delivery=await createDelivery('v2',assetRoot);
  delivery.setActive(viewerVisible);
  if(delivery.spec.source_sha256&&delivery.spec.source_sha256!==manifest.source_sha256)throw Error('Delivery source mismatch');
  if(viewerDisposed){delivery.dispose();return;}diagnostics.delivery=delivery.stats;diagnostics.loading={startMs:0,previewMs:null,readyMs:null};
  progress(5,'正在載入天空與材質…');
  const hdr=await delivery.hdr('textures/sky.hdr');if(viewerDisposed){hdr.dispose();return;}hdr.mapping=THREE.EquirectangularReflectionMapping;scene.background=hdr;scene.environment=hdr;scene.backgroundRotation.y=Math.PI*2/3;scene.environmentRotation.y=Math.PI*2/3;scene.backgroundIntensity=.7;scene.environmentIntensity=.7;
  const draco=sceneDecoder=new DRACOLoader();draco.setDecoderPath(localAssetUrl('../vendor/three/examples/jsm/libs/draco/gltf/'));draco.setWorkerLimit(2);
  const loader=new GLTFLoader();loader.setDRACOLoader(draco);
  const labels={'01 Architecture':'建築','02 Interiors':'室內家具','03 Outdoor furnishings':'戶外家具','04 Landscape':'海岸與植被','06 Lighting':'燈具'};
  const previewEntry=manifest.models.find(entry=>entry.collection==='01 Architecture');if(!previewEntry)throw Error('找不到建築模型');
  goTo(0,false);setQuality('high',false);createBookmarks();for(const b of document.querySelectorAll('[data-mode],#home,#capture'))b.disabled=true;
  const loadEntry=async(entry,range)=>{
   const label=labels[entry.collection]||entry.collection,span=range[1]-range[0];progress(range[0],`正在載入${label}模型…`);
   const gltf=await loadModel(entry,loader,event=>{if(event.phase==='decode')progress(range[0]+span*.73,`正在解碼${label}模型…`);else if(event.total)progress(range[0]+span*.72*event.loaded/event.total,`正在下載${label}模型… ${Math.round(event.loaded/event.total*100)}%`);});
   progress(range[0]+span*.74,`正在整理${label}模型…`);scene.add(gltf.scene);gltf.scene.updateMatrixWorld(true);if(entry.collection==='04 Landscape'){progress(range[0]+span*.76,'正在整理海岸植被…');await spatialInstances(gltf.scene);}
   const meshes=[];gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});const lightmapStart=lightmapMaterials.length;
   progress(range[0]+span*.82,`正在連接${label}材質…`);
   for(let j=0;j<meshes.length;j+=8){await Promise.all(meshes.slice(j,j+8).map(o=>setupMesh(o,{deferLightmaps:true,deferCollision:true})));if(j)await new Promise(resolve=>setTimeout(resolve,0));}
   diagnostics.models.push({file:entry.file,meshes:meshes.length,bytes:entry.remote_bytes||entry.bytes});progress(range[1],`${label}模型已加入場景`);
   return lightmapMaterials.slice(lightmapStart);
  };
  const architectureMaps=await loadEntry(previewEntry,[8,16]);
  configureLights();
  progress(16,'正在編譯建築預覽…');await renderer.compileAsync(scene,camera);scene.updateMatrixWorld(true);renderer.shadowMap.needsUpdate=true;diagnostics.loading.previewMs=performance.now()-diagnostics.loading.startMs;renderer.domElement.dataset.previewMs=String(Math.round(diagnostics.loading.previewMs));previewReady=true;dirty=true;displayTick++;composer.render();loading.hidden=true;$('#stream-status').hidden=false;$('#instructions').textContent='可先環繞查看；完整模型與光照正在背景載入';reportHost('preview',{source:manifest.source_sha256});
  progress(17,'正在補上建築日間光照…');await loadLightmaps(architectureMaps,17,43);
  const remaining=manifest.models.filter(entry=>entry!==previewEntry).sort((a,b)=>({ '03 Outdoor furnishings':0,'04 Landscape':1,'02 Interiors':2,'06 Lighting':3 }[a.collection]??4)-({ '03 Outdoor furnishings':0,'04 Landscape':1,'02 Interiors':2,'06 Lighting':3 }[b.collection]??4));
  const totalModelBytes=remaining.reduce((sum,entry)=>sum+(entry.remote_bytes||entry.bytes||0),0);let completedModelBytes=0;const remainingLightmaps=[];
  for(const entry of remaining){const bytes=entry.remote_bytes||entry.bytes||0,start=43+32*completedModelBytes/Math.max(1,totalModelBytes),end=43+32*(completedModelBytes+bytes)/Math.max(1,totalModelBytes);remainingLightmaps.push(...await loadEntry(entry,[start,end]));completedModelBytes+=bytes;}
  await loadLightmaps(remainingLightmaps,75,87);
  progress(87,'正在整理碰撞與步行資料…');await buildCollisionIndex();
  progress(92,'正在載入步行導覽資料…');await walker.load(assetUrl('navigation/manifest.json'),manifest.source_sha256,url=>delivery.url(url));diagnostics.navigationGeometry={source:walker.spec.source_sha256,solidTriangles:walker.spec.solid.triangles,groundTriangles:walker.spec.ground.triangles};
  setupMirrors();progress(93,'正在編譯完整場景…');await renderer.compileAsync(scene,camera);scene.updateMatrixWorld(true);renderer.shadowMap.needsUpdate=true;displayTick++;composer.render();
  ready=true;diagnostics.ready=true;window.nerida.ready=true;navCanvas.dataset.ready='true';navCanvas.dataset.source=manifest.source_sha256;for(const b of document.querySelectorAll('#bookmarks button,[data-mode],#home,#capture'))b.disabled=false;$('#instructions').textContent='拖曳旋轉 · 滾輪縮放 · 右鍵平移';dirty=true;draco.dispose();
  progress(94,'完整場景已載入，正在準備反射…');
  try{await buildProbes('day');}catch(error){if(viewerDisposed)return;diagnostics.errors.push(String(error));console.error(error);}
  progress(100,'巡覽準備完成');diagnostics.loading.readyMs=performance.now()-diagnostics.loading.startMs;renderer.domElement.dataset.readyMs=String(Math.round(diagnostics.loading.readyMs));renderer.domElement.dataset.deliveryResponseBytes=String(delivery.stats.responseBytes);renderer.domElement.dataset.deliveryCacheHits=String(delivery.stats.cacheHits);$('#stream-status').hidden=true;console.info('NERIDA_READY',diagnostics);reportHost('ready',{source:manifest.source_sha256});
 }catch(error){if(viewerDisposed)return;diagnostics.errors.push(String(error));console.error(error);if(previewReady){$('#stream-status').hidden=false;$('#stream-message').textContent='其餘場景載入失敗：'+error.message+'；重新整理可重試';$('#stream-retry').hidden=false;}else{progress(0,'載入遇到問題：'+error.message);$('#retry').hidden=false;}reportHost('error',{message:error.message});}
}
function createBookmarks(){
 [...rooms.map((r,i)=>[r,i]).filter(([r])=>!r[4]),...rooms.map((r,i)=>[r,i]).filter(([r])=>r[4])].forEach(([r,i])=>{const b=document.createElement('button');b.disabled=true;b.innerHTML=`<span>${String(i+1).padStart(2,'0')}</span>${r[4]?'暮色庭院 · 夜間':r[1]}`;b.dataset.index=i;b.addEventListener('click',()=>goTo(i));$('#bookmarks').append(b);const fig=document.createElement('figure');const a=document.createElement('a');a.href=assetUrl('gallery/'+r[3]);a.target='_blank';a.rel='noopener';const img=document.createElement('img');img.src=new URL('../preview/v2_'+r[3].replace('.png','.webp'),import.meta.url).href;img.decoding='async';img.alt=r[1]+' — Blender Cycles 原始渲染';img.loading='lazy';a.append(img);const cap=document.createElement('figcaption');cap.textContent=String(i+1).padStart(2,'0')+' / '+r[1];fig.append(a,cap);$('#gallery-grid').append(fig);});
}
function goTo(index,animate=true){
 if(!ready&&animate)return;
 const r=rooms[index],data=manifest.cameras.find(c=>c.name.startsWith(r[0]));if(!data)return;
 // A bookmarked composition returns to orbit so a low detail camera cannot inherit walking ground constraints.
 if(ready&&mode!=='orbit')setMode('orbit');
 if(pointer.isLocked)pointer.unlock();
 const position=zUp(data.position),direction=zUp(data.direction),look=position.clone().addScaledVector(direction,index===0||index===1||index===8?60:7);
 const vfov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(data.fov_horizontal/2)/Math.max(camera.aspect,1.5)));
 if(animate&&ready)transition={start:performance.now(),duration:1000,from:camera.position.clone(),to:position,targetFrom:orbit.target.clone(),targetTo:look,fovFrom:camera.fov,fovTo:vfov};
 else{camera.position.copy(position);orbit.target.copy(look);camera.fov=vfov;camera.lookAt(look);camera.updateProjectionMatrix();}
 $('#view-number').textContent=String(index+1).padStart(2,'0')+' / '+rooms.length;$('#view-title').textContent=r[1];$('#view-description').textContent=r[2];
 document.querySelectorAll('#bookmarks button').forEach(b=>b.classList.toggle('active',+b.dataset.index===index));
 if(index===0)$('#places').scrollTop=0;else document.querySelector('#bookmarks button.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
 if(ready&&(r[4]||'day')!==light)setLighting(r[4]||'day');
 dirty=true;movingUntil=performance.now()+1100;
}
async function buildProbes(variant){
 if(reflectionMaps[variant].length){assignProbes(variant);return;}
 probeBusy=true;for(const m of materials){m.envMap=null;}const positions=[[-8,6.6,-4],[8,6.6,-6],[-10,10.8,-4],[-2,10.8,-10],[0,6,9],[25,6.6,-6]];
 const pmrem=new THREE.PMREMGenerator(renderer);
 const visible=[];scene.traverse(o=>{if(o.isMesh&&(o.isReflector||(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.transmission>0||m.name.includes('Silver mirror')))){visible.push([o,o.visible]);o.visible=false;}});
 try{for(let i=0;i<positions.length;i++){const p=positions[i],rt=new THREE.WebGLCubeRenderTarget(512,{type:THREE.HalfFloatType,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});try{const cc=new THREE.CubeCamera(.1,1000,rt);cc.position.set(...p);cc.update(renderer,scene);const env=pmrem.fromCubemap(rt.texture);reflectionMaps[variant].push({position:cc.position.clone(),texture:env.texture});envTargets.push(env);}finally{rt.dispose();}progress(94+6*(i+1)/positions.length,`正在準備反射環境… ${i+1} / ${positions.length}`);await new Promise(r=>setTimeout(r,0));}}
 finally{for(const [o,v]of visible)o.visible=v;pmrem.dispose();probeBusy=false;dirty=true;}
 assignProbes(variant);diagnostics.probeCount=reflectionMaps[variant].length;
}
function assignProbes(variant){
 scene.traverse(o=>{if(!o.isMesh)return;const box=new THREE.Box3().setFromObject(o),center=box.getCenter(new THREE.Vector3());
  if(center.distanceTo(new THREE.Vector3(0,7,0))>55)return;
  const probe=reflectionMaps[variant].reduce((a,b)=>a.position.distanceToSquared(center)<b.position.distanceToSquared(center)?a:b);
  for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.metalness>.3||m.transmission>.1){m.envMap=probe.texture;m.envMapIntensity=.75;m.needsUpdate=true;}
 });
}
async function setLighting(next){
 if(!ready)return;
 if(lightingBusy||probeBusy){pendingLighting=next;return;}
 if(next===light)return;lightingBusy=true;
 $('#lighting').disabled=true;toast('正在切換光照…');
 try{
  // Load first; commit all scene state together after decoding completes.
  const maps=await Promise.all(lightmapMaterials.map(({batch})=>imageTexture(manifest.lightmaps[batch][next])));
  light=next;diagnostics.lighting=next;
  lightmapMaterials.forEach(({m},i)=>{m.lightMap=maps[i];m.needsUpdate=true;});
  scene.backgroundIntensity=next==='day'?.7:.11;scene.environmentIntensity=next==='day'?.7:.16;worldLight.intensity=next==='day'?.25:.08;
  sun.intensity=next==='day'?2.5:.05;sun.color.setRGB(...(next==='day'?[1,.88,.69]:[.48,.58,1]));
  for(const a of areaLights)a.intensity=a.userData.baseIntensity*(next==='day'?1:1.8);
  renderer.toneMappingExposure=next==='day'?1.035:1.516;configureLights(next);sun.shadow.needsUpdate=true;
  await buildProbes(next);$('#lighting').value=next;dirty=true;toast(next==='day'?'日間光照':'暮色光照');
 }catch(e){diagnostics.errors.push(String(e));toast('光照載入失敗，請重新載入頁面');}finally{$('#lighting').disabled=false;lightingBusy=false;const pending=pendingLighting;pendingLighting=null;if(pending&&pending!==light)await setLighting(pending);}
}
function setQuality(next,announce=true){
 quality=next;diagnostics.quality=next;
 const ratios={high:Math.min(devicePixelRatio,2),balanced:Math.min(devicePixelRatio,1.25),performance:1};renderer.setPixelRatio(ratios[next]);composer.setPixelRatio(ratios[next]);
 renderer.transmissionResolutionScale={high:1,balanced:.5,performance:.35}[next];aa.enabled=next!=='performance';
 const samples={high:4,balanced:2,performance:0}[next];composer.renderTarget1.samples=samples;composer.renderTarget2.samples=samples;
 for(const mirror of mirrors){const rt=mirror.getRenderTarget(),size={high:2048,balanced:1024,performance:768}[next];rt.setSize(size,size);rt.samples=samples;}
 renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);dirty=true;$('#quality').value=next;
 if(announce)toast('畫面品質：'+{high:'高保真',balanced:'平衡',performance:'流暢'}[next]+'，模型細節維持完整');
}
function setMode(next){
 if(!ready)return;if(pointer.isLocked)pointer.unlock();mode=next;diagnostics.mode=next;keys.clear();navKeyDownTimes.clear();servicedNavKeys.clear();moveVelocity.set(0,0,0);orbit.enabled=next==='orbit';transition=null;
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));
 $('#walk-prompt').hidden=true;$('#mouse-lock').hidden=next==='orbit';navigationActive=next!=='orbit';lookDrag=null;$('#walk-mode-label').textContent=next==='walk'?'步行巡覽':'自由飛行';
 if(next!=='walk')walker.reset();
 if(next!=='orbit'){camera.fov=60;camera.updateProjectionMatrix();}
 $('#instructions').textContent=next==='orbit'?'拖曳旋轉 · 滾輪縮放 · 右鍵平移':next==='walk'?'拖曳轉向 · WASD 移動 · Space 跳躍 · C 蹲低 · Shift 加速 · Esc 暫停':'拖曳轉向 · WASD 移動 · E / Q 升降 · Esc 暫停';
 if(next==='walk'){
  const rehome=walker.enter(camera.position);
  diagnostics.walkRepositioned=rehome;activateNavigation();toast('WASD 步行；Space 跳躍、C 蹲低查看水下；Esc 暫停');
 }else if(next==='fly'){walker.terrainLimit(camera.position);activateNavigation();toast('WASD 飛行，拖曳轉向；E 上升、Q 下降');}
 else{orbit.target.copy(camera.position).addScaledVector(camera.getWorldDirection(v1),8);orbit.update();}
 dirty=true;
}
function updateMovement(dt){
 if(mode==='orbit'||!navigationActive)return false;
 for(const key of keys)servicedNavKeys.add(key);
 const forward=camera.getWorldDirection(v1);if(mode==='walk'){forward.y=0;forward.normalize();}
 const right=v2.crossVectors(forward,camera.up).normalize(),desired=new THREE.Vector3();
 if(keys.has('KeyW')||keys.has('ArrowUp'))desired.add(forward);if(keys.has('KeyS')||keys.has('ArrowDown'))desired.sub(forward);
 if(keys.has('KeyD')||keys.has('ArrowRight'))desired.add(right);if(keys.has('KeyA')||keys.has('ArrowLeft'))desired.sub(right);
 if(mode==='fly'){if(keys.has('KeyE'))desired.y+=1;if(keys.has('KeyQ'))desired.y-=1;}
 if(desired.lengthSq())desired.normalize().multiplyScalar(speed*(keys.has('ShiftLeft')||keys.has('ShiftRight')?2.5:1));
 moveVelocity.lerp(desired,1-Math.exp(-14*dt));if(moveVelocity.length()<.005)moveVelocity.set(0,0,0);
 if(!moveVelocity.lengthSq())return mode==='walk'?walker.move(camera.position,0,0,dt,$('#collision').checked):false;
 const before=camera.position.clone(),step=moveVelocity.clone().multiplyScalar(dt),parts=Math.max(1,Math.ceil(step.length()/.08));step.divideScalar(parts);
 for(let i=0;i<parts;i++){
  const from=camera.position.clone(),to=from.clone().add(step);
  if(mode==='walk'){
   walker.move(camera.position,step.x,step.z,dt/parts,$('#collision').checked);
  }else {camera.position.copy(to);walker.terrainLimit(camera.position);}
 }
 camera.position.clamp(new THREE.Vector3(-600,-50,-800),new THREE.Vector3(600,500,500));
 return before.distanceToSquared(camera.position)>1e-8;
}
const lastPosition=new THREE.Vector3(),lastQuaternion=new THREE.Quaternion();
function frame(now){
 if(viewerDisposed)return;
 frameRequest=requestAnimationFrame(frame);const dt=Math.min(.25,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
 if(!previewReady||!viewerVisible||document.hidden||probeBusy)return;
 let moved=false;
 if(transition){const t=Math.min(1,(now-transition.start)/transition.duration),e=t*t*(3-2*t);camera.position.lerpVectors(transition.from,transition.to,e);orbit.target.lerpVectors(transition.targetFrom,transition.targetTo,e);camera.fov=THREE.MathUtils.lerp(transition.fovFrom,transition.fovTo,e);camera.updateProjectionMatrix();camera.lookAt(orbit.target);moved=true;if(t===1)transition=null;}
 else if(mode==='orbit')orbit.update();else {const steps=Math.max(1,Math.ceil(dt/.05));for(let i=0;i<steps;i++)moved=updateMovement(dt/steps)||moved;}
 if(measurement){if(measurement.type==='look'){camera.quaternion.copy(measurement.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin((now-measurement.start)*.0006)*.1,Math.sin((now-measurement.start)*.0008)*.4,0,'YXZ')));}else{camera.position.copy(measurement.center).add(new THREE.Vector3(Math.cos((now-measurement.start)*.00025)*measurement.radius,measurement.height,Math.sin((now-measurement.start)*.00025)*measurement.radius));camera.lookAt(measurement.center);}moved=true;}
 moved=moved||camera.position.distanceToSquared(lastPosition)>1e-9||1-Math.abs(camera.quaternion.dot(lastQuaternion))>1e-9;
 if(moved||dirty||now<movingUntil){
  const start=performance.now();renderer.info.reset();displayTick++;composer.render();const cpu=performance.now()-start;
  const info={time:now,interval:lastRendered?now-lastRendered:0,cpuMs:cpu,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,moving:moved};
  diagnostics.frames.push(info);if(diagnostics.frames.length>600)diagnostics.frames.shift();lastRendered=now;dirty=false;lastPosition.copy(camera.position);lastQuaternion.copy(camera.quaternion);
 }
 if(now-lastStats>750){lastStats=now;const f=diagnostics.frames.filter(f=>f.moving&&now-f.time<2500),mean=f.length?f.reduce((s,f)=>s+f.interval,0)/f.length:0;const last=diagnostics.frames.at(-1);
  $('#stats').innerHTML=`${f.length?Math.round(1000/mean)+' FPS（巡覽）':'靜止 · 按需渲染'}<br>${last?.calls||0} draw calls<br>${((last?.triangles||0)/1e6).toFixed(2)}M triangles / frame<br>${renderer.getPixelRatio().toFixed(2)}× · ${mode}${mode==='orbit'?'':'<br>位置 '+camera.position.toArray().map(v=>v.toFixed(3)).join(' / ')+' m'}`;
 }
}
navCanvas.addEventListener('pointerdown',e=>{
 if(mode==='orbit'||!ready||e.button!==0)return;
 activateNavigation();if(pointer.isLocked)return;
 lookDrag={id:e.pointerId,x:e.clientX,y:e.clientY};navCanvas.setPointerCapture(e.pointerId);e.preventDefault();
});
navCanvas.addEventListener('pointermove',e=>{
 if(!lookDrag||e.pointerId!==lookDrag.id||pointer.isLocked)return;
 lookEuler.setFromQuaternion(camera.quaternion);lookEuler.y-=(e.clientX-lookDrag.x)*.003;lookEuler.x-=(e.clientY-lookDrag.y)*.003;
 lookEuler.x=THREE.MathUtils.clamp(lookEuler.x,-Math.PI/2+.02,Math.PI/2-.02);camera.quaternion.setFromEuler(lookEuler);
 lookDrag.x=e.clientX;lookDrag.y=e.clientY;dirty=true;movingUntil=performance.now()+150;
});
function finishLook(e){if(lookDrag?.id===e.pointerId)lookDrag=null;}
navCanvas.addEventListener('pointerup',finishLook);navCanvas.addEventListener('pointercancel',finishLook);navCanvas.addEventListener('lostpointercapture',finishLook);
$('#walk-prompt').addEventListener('click',activateNavigation);
$('#mouse-lock').addEventListener('click',requestMouseLock);
document.addEventListener('pointerlockerror',()=>{activateNavigation();toast('已使用拖曳轉向；WASD 與 E / Q 可正常移動');});
pointer.addEventListener('lock',()=>{activateNavigation();clearTimeout(toast.timer);$('#toast').hidden=true;document.body.classList.add('locked');dirty=true;});
pointer.addEventListener('unlock',()=>{document.body.classList.remove('locked');pauseNavigation();});
pointer.addEventListener('change',()=>{dirty=true;movingUntil=performance.now()+100;});
orbit.addEventListener('change',()=>{dirty=true;movingUntil=performance.now()+150;});
window.addEventListener('keydown',e=>{
 if(e.code==='Escape'){if(pointer.isLocked)pointer.unlock();else if(mode!=='orbit')pauseNavigation();$('#settings').hidden=true;if($('#gallery').open)$('#gallery').close();return;}
 if(!pointer.isLocked&&['INPUT','SELECT','BUTTON'].includes(document.activeElement?.tagName))return;
 if(e.code==='KeyH'&&!e.repeat){setMode('orbit');goTo(0);return;}
 if(navigationActive&&mode!=='orbit'&&(pointer.isLocked||document.activeElement===navCanvas)){if(mode==='walk'&&!e.repeat){if(e.code==='Space')walker.jump();if(e.code==='KeyC')walker.toggleCrouch();}if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyC'].includes(e.code))e.preventDefault();if(!keys.has(e.code))navKeyDownTimes.set(e.code,performance.now());keys.add(e.code);}
});
// Preserve short physical key taps that begin and end between GPU frames.
window.addEventListener('keyup',e=>{
 if(keys.has(e.code)&&navKeyDownTimes.has(e.code)&&!servicedNavKeys.has(e.code)&&navigationActive){
  const dt=Math.min(.08,Math.max(.03,(performance.now()-navKeyDownTimes.get(e.code))/1000));if(updateMovement(dt))dirty=true;
 }
 keys.delete(e.code);navKeyDownTimes.delete(e.code);servicedNavKeys.delete(e.code);
});window.addEventListener('blur',()=>{keys.clear();navKeyDownTimes.clear();servicedNavKeys.clear();lookDrag=null;moveVelocity.set(0,0,0);});
navCanvas.addEventListener('blur',()=>{if(!pointer.isLocked){keys.clear();navKeyDownTimes.clear();servicedNavKeys.clear();moveVelocity.set(0,0,0);}});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);dirty=true;});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(document.hidden){keys.clear();navKeyDownTimes.clear();servicedNavKeys.clear();lookDrag=null;moveVelocity.set(0,0,0);}else dirty=true;});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('#home').addEventListener('click',()=>{setMode('orbit');goTo(0);});
$('#settings-open').addEventListener('click',()=>$('#settings').hidden=!$('#settings').hidden);$('#settings-close').addEventListener('click',()=>$('#settings').hidden=true);
$('#places-close').addEventListener('click',()=>{$('#places').hidden=true;$('#places-open').hidden=false;});$('#places-open').addEventListener('click',()=>{$('#places').hidden=false;$('#places-open').hidden=true;});
$('#quality').addEventListener('change',e=>setQuality(e.target.value));$('#lighting').addEventListener('change',e=>setLighting(e.target.value));
$('#collision').addEventListener('change',e=>{if(mode==='walk'&&e.target.checked){diagnostics.walkRepositioned=walker.enter(camera.position);dirty=true;}});
$('#speed').addEventListener('input',e=>{speed=+e.target.value;$('#speed-value').textContent=speed.toFixed(1)+' m/s';});$('#show-stats').addEventListener('change',e=>$('#stats').hidden=!e.target.checked);
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('此瀏覽器未提供全螢幕模式');}});
$('#capture').addEventListener('click',()=>{if(!ready)return;displayTick++;composer.render();renderer.domElement.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='NERIDA_'+light+'_'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('目前畫面已儲存');});});
$('#gallery-open').addEventListener('click',()=>$('#gallery').showModal());$('#gallery-close').addEventListener('click',()=>$('#gallery').close());$('#retry').addEventListener('click',()=>location.reload());
$('#stream-retry').addEventListener('click',()=>location.reload());
function measure(seconds,type){return new Promise(resolve=>{const saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),target:orbit.target.clone(),mode};measurement={type,start:performance.now(),center:new THREE.Vector3(0,7,0),radius:60,height:22,quaternion:saved.quaternion};setTimeout(()=>{measurement=null;camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);orbit.target.copy(saved.target);dirty=true;const f=diagnostics.frames.filter(x=>x.time>performance.now()-seconds*1000).slice(2),intervals=f.map(x=>x.interval).sort((a,b)=>a-b);resolve({type,seconds,frames:f.length,fps:f.length?1000/(f.reduce((s,x)=>s+x.interval,0)/f.length):0,p95FrameMs:intervals[Math.floor(intervals.length*.95)],quality,gpu:diagnostics.gpu,calls:f.at(-1)?.calls,triangles:f.at(-1)?.triangles,viewport:[innerWidth,innerHeight],pixelRatio:renderer.getPixelRatio()});},seconds*1000);});}
window.nerida={ready:false,diagnostics,renderer,scene,camera,walker,goTo,setMode,setQuality,setLighting,collisionMeshes,measureOrbit:(seconds=10)=>measure(seconds,'orbit'),measureLook:(seconds=8)=>measure(seconds,'look')};

window.neridaSetVisible=value=>{viewerVisible=!!value;delivery?.setActive(viewerVisible);if(!viewerVisible){keys.clear();moveVelocity.set(0,0,0);if(pointer.isLocked)pointer.unlock();}else{lastFrame=performance.now();dirty=true;}};
window.addEventListener('message',event=>{if(event.source===window.parent&&event.origin===location.origin&&event.data?.type==='nerida-visibility')window.neridaSetVisible(event.data.visible);});
// NERIDA_SINGLE_SCENE_LIFECYCLE_START
function notifyHost(status,details={}){if(window.parent!==window&&!viewerDisposed)window.parent.postMessage({type:'nerida-viewer',version:2,status,...details},location.origin);}
function saveView(){return {position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),target:mode==='orbit'?orbit.target.toArray():camera.getWorldDirection(camera.position.clone()).multiplyScalar(7).add(camera.position).toArray(),fov:camera.fov,light,quality,index:Number(document.querySelector('#bookmarks button.active')?.dataset.index??0)};}
async function restoreView(saved){if(!saved||viewerDisposed)return;setMode('orbit');transition=null;camera.position.fromArray(saved.position);camera.quaternion.fromArray(saved.quaternion);orbit.target.fromArray(saved.target);camera.fov=saved.fov;camera.updateProjectionMatrix();orbit.update();setQuality(saved.quality||'high',false);const index=saved.index,room=rooms[index];if(room){$('#view-number').textContent=String(index+1).padStart(2,'0')+' / '+rooms.length;$('#view-title').textContent=room[1];$('#view-description').textContent=room[2];document.querySelectorAll('#bookmarks button').forEach(b=>b.classList.toggle('active',+b.dataset.index===index));}else{$('#view-number').textContent='自由視角';$('#view-title').textContent='設計比較';$('#view-description').textContent='維持相同視角，查看兩版設計。';document.querySelectorAll('#bookmarks button').forEach(b=>b.classList.remove('active'));}if(saved.light&&saved.light!==light)await setLighting(saved.light);if(viewerDisposed)throw new DOMException('Viewer disposed','AbortError');displayTick++;composer.render();dirty=true;}
function disposeViewer(){if(viewerDisposed)return null;viewerDisposed=true;viewerVisible=false;ready=false;cancelAnimationFrame(frameRequest);keys.clear();if(pointer.isLocked)pointer.unlock();delivery?.dispose();sceneDecoder?.dispose();clearTimeout(toast.timer);const report=releaseResources({scene,renderer,composer,controls:[orbit,pointer],targets:envTargets,extraMaterials:materials});for(const promise of textures.values())promise.then(t=>{t.dispose();if(t.image?.data)t.image.data=null;}).catch(()=>{});textures.clear();materials.clear();collisionMeshes.length=0;pendingCollisionMeshes.length=0;lightmapMaterials.length=0;mirrors.length=0;envTargets.length=0;reflectionMaps.day.length=0;reflectionMaps.night.length=0;renderer.domElement.dataset.disposed='true';return {version:2,...report};}
window.neridaLifecycle={restore:restoreView,dispose:disposeViewer,async capture(){const state=saveView();if(viewerDisposed||!previewReady)return {state,blob:null};transition=null;keys.clear();if(pointer.isLocked)pointer.unlock();displayTick++;composer.render();const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/png'));return {state,blob};}};
window.addEventListener('pagehide',disposeViewer,{once:true});
renderer.domElement.addEventListener('webglcontextlost',()=>{if(!viewerDisposed)notifyHost('context-lost');});
// NERIDA_SINGLE_SCENE_LIFECYCLE_END
frameRequest=requestAnimationFrame(frame);init();
