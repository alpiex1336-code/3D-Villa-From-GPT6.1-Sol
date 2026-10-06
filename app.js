import {releaseResources} from './viewer-lifecycle.640f856397fa.js';
import {releaseUploadedPixels} from './resident-textures.e8d6de2920a4.js';
import {createDelivery} from './asset-transport.f8fb4ec56162.js';
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
const siteBase=new URL('.',import.meta.url),assetUrl=path=>new URL(path.replace(/^\/+/,''),siteBase).href;
let viewerDisposed=false,frameRequest=0,sceneDecoder=null;
let delivery,viewerVisible=true;
viewerVisible=window.parent===window;
const diagnostics={ready:false,interactive:false,errors:[],source:null,models:[],lightmaps:0,frames:[],mode:'orbit',quality:'high',lighting:'day',probeCount:0};
window.addEventListener('error',e=>diagnostics.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>diagnostics.errors.push(String(e.reason)));
const scene=new THREE.Scene();scene.background=new THREE.Color('#a7bfc1');
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.07,8000);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false,preserveDrawingBuffer:false});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.035;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.transmissionResolutionScale=.75;
renderer.info.autoReset=false;$('#viewport').append(renderer.domElement);
const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
diagnostics.gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
$('#gpu-info').textContent=diagnostics.gpu;
const target=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType});target.samples=4;
const composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));
const aa=new SMAAPass();composer.addPass(aa);composer.addPass(new OutputPass());
const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.085;orbit.minDistance=.4;orbit.maxDistance=1200;orbit.maxPolarAngle=Math.PI*.94;
const pointer=new PointerLockControls(camera,renderer.domElement);
RectAreaLightUniformsLib.init();
const worldLight=new THREE.HemisphereLight(0xdde8ff,0x6e6249,.25);scene.add(worldLight);
const sun=new THREE.DirectionalLight(new THREE.Color(1,.88,.69),2.5);sun.position.set(-43,70,30);sun.target.position.set(0,6,0);scene.add(sun,sun.target);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-58;sun.shadow.camera.right=58;sun.shadow.camera.top=58;sun.shadow.camera.bottom=-58;sun.shadow.camera.near=1;sun.shadow.camera.far=200;sun.shadow.normalBias=.035;sun.shadow.bias=-.00008;sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;
const areaLights=[];
const raycaster=new THREE.Raycaster(),floorCaster=new THREE.Raycaster();raycaster.firstHitOnly=true;floorCaster.firstHitOnly=true;
const collisionMeshes=[], materials=new Set(), lightmapMaterials=[];
const pendingLightmaps=[],lightmapJobs=new Map(),lightmapFailures=[];
let lightmapJobsComplete=0,lightmapJobsExpected=0,lightmapPump=null,loadProgressValue=0;
const textures=new Map(),envTargets=[],reflectionMaps={day:[],night:[]};
const mirrors=[];let reflectionDepth=0,displayTick=0;
let lightingBusy=false,pendingLighting=null;
let manifest,mode='orbit',quality='high',light='day',speed=2.5,dirty=true,movingUntil=0,lastFrame=performance.now(),lastRendered=0,lastStats=0,transition=null,ready=false,interactive=false,probeBusy=false,measurement=null;
const keys=new Set(),moveVelocity=new THREE.Vector3();
const v1=new THREE.Vector3(),v2=new THREE.Vector3(),v3=new THREE.Vector3();
const rooms=[
 ['01 HERO','海崖全景','石灰岩、海風與開闊的地平線。','01_NERIDA_Hero.png'],
 ['02 COURTYARD','泳池庭院','水面、露台與環繞庭院的生活空間。','03_NERIDA_Courtyard.png'],
 ['03 SALON','客廳與閱讀區','亞麻、橡木與面向海岸的開放起居室。','04_NERIDA_Salon.png'],
 ['06 SUITE','主臥套房','柔軟織物、訂製家具與私密的海景陽台。','05_NERIDA_Suite.png'],
 ['04 SEA','臥室海景','從室內向海面與地平線望去。','06_NERIDA_Sea_View.png'],
 ['09 KITCHEN','廚房與餐廳','石質工作檯、家電與完整餐飲配置。','07_NERIDA_Kitchen.png'],
 ['10 BATH','石質衛浴','雙洗手盆、淋浴與暖色金屬細節。','08_NERIDA_Ensuite.png'],
 ['05 ARRIVAL','庭園入口','植被、踏石與住宅背面的到達動線。','09_NERIDA_Arrival.png'],
 ['07 OVERVIEW','基地鳥瞰','建築、泳池、海崖與連續的沿海地景。','10_NERIDA_Site.png'],
 ['02 COURTYARD','暮色庭院','暖色室內光照與暮色中的泳池。','02_NERIDA_Blue_Hour.png','night']
];
function zUp(a){return new THREE.Vector3(a[0],a[2],-a[1]);}
function progress(value,text){notifyHost('progress',{value,text});loadProgressValue=Math.max(loadProgressValue,Math.min(100,value));const pct=loadProgressValue;$('#load-progress').style.width=`${pct}%`;$('#load-status').textContent=text;const stream=$('#stream-status');if(interactive){stream.hidden=false;$('#stream-progress').style.width=`${pct}%`;$('#stream-message').textContent=text;}}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4000);}
function imageTexture(url,onProgress){if(!textures.has(url))textures.set(url,delivery.texture(url,onProgress).then(t=>{t.channel=1;t.flipY=false;t.repeat.set(1,-1);t.offset.y=1;t.colorSpace=THREE.LinearSRGBColorSpace;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return releaseUploadedPixels(t,bytes=>{diagnostics.releasedPixelBytes=(diagnostics.releasedPixelBytes||0)+bytes;});}));return textures.get(url);}
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

function queueLightmap(m,batch,label){
 const file=manifest.lightmaps[batch]?.day;if(!file)return;
 let job=lightmapJobs.get(file);
 if(!job){job={file,batch,label,materials:[],texture:null};lightmapJobs.set(file,job);pendingLightmaps.push(job);}
 if(job.texture){m.lightMap=job.texture;m.lightMapIntensity=Math.PI;patchLightmap(m);m.needsUpdate=true;lightmapMaterials.push({m,batch});}
 else job.materials.push(m);
}
async function pumpLightmaps(){
 if(lightmapPump){await lightmapPump;if(pendingLightmaps.length)await pumpLightmaps();return;}
 const running=(async()=>{
  while(pendingLightmaps.length){
   const jobs=pendingLightmaps.splice(0,8);
   await Promise.all(jobs.map(async job=>{
    try{
     const texture=await imageTexture(job.file,event=>{
      if(!event.lengthComputable||!event.total)return;
      const ratio=Math.max(0,Math.min(1,event.loaded/event.total));
      const value=14+(lightmapJobsComplete+ratio)/Math.max(1,lightmapJobsExpected)*67;
      const file=job.file.split('/').at(-1);
      progress(value,`正在載入${job.label}光照貼圖 ${lightmapJobsComplete}/${lightmapJobsExpected} · ${file} ${Math.round(ratio*100)}%`);
     });
     job.texture=texture;
     for(const m of job.materials){m.lightMap=texture;m.lightMapIntensity=Math.PI;patchLightmap(m);m.needsUpdate=true;lightmapMaterials.push({m,batch:job.batch});}
     diagnostics.lightmaps+=job.materials.length;dirty=true;displayTick++;
    }catch(error){lightmapFailures.push({file:job.file,error:String(error)});diagnostics.errors.push(String(error));}
    lightmapJobsComplete++;
    const value=14+lightmapJobsComplete/Math.max(1,lightmapJobsExpected)*67;
    progress(value,`日間光照貼圖 ${lightmapJobsComplete}/${lightmapJobsExpected}${lightmapFailures.length?` · ${lightmapFailures.length} 張失敗`:''}`);
   }));
  }
 })();
 lightmapPump=running;
 try{await running;}finally{if(lightmapPump===running)lightmapPump=null;}
 if(pendingLightmaps.length)await pumpLightmaps();
}
async function setupMesh(o,label){
 if(!o.isMesh)return;
 o.castShadow=true;o.receiveShadow=true;
 if(o.isInstancedMesh){o.computeBoundingSphere();o.computeBoundingBox();}
 const ms=Array.isArray(o.material)?o.material:[o.material];
 for(const m of ms){
  materials.add(m);m.envMapIntensity=.7;m.userData.nativeCubeAtlas=Object.keys(manifest.material_bakes).some(n=>m.name===n||m.name.startsWith(n+' |'));if(m.userData.nativeCubeAtlas)patchLightmap(m);
  for(const t of [m.map,m.normalMap,m.roughnessMap,m.metalnessMap])if(t)t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  if(m.name.includes('leaves')||m.name.includes('shrub')){m.side=THREE.DoubleSide;m.alphaTest=Math.max(.35,m.alphaTest);m.transparent=false;m.depthWrite=true;}
  if(m.name.includes('Silver mirror'))m.roughness=.045;
  if(m.name.includes('Architectural glass')){m.thickness=.012;m.ior=1.46;m.roughness=.012;m.envMapIntensity=1;}
  if(m.name.includes('Pool water')||m.name.includes('Mediterranean sea'))addWaterNormal(m);
  const batch=m.userData?.lightmap_batch;
  if(batch&&manifest.lightmaps[batch]){m.aoMap=null;queueLightmap(m,batch,label);}
 }
 // Ray collision is geometry-based, including glazing, openings and stairs.
 if(!o.isInstancedMesh && (o.userData?.source_collection==='01 Architecture'||o.parent?.userData?.source_collection==='01 Architecture'||ms.some(m=>m.userData?.lightmap_batch&&o.name.startsWith('WEB_BATCH')))){
  if(o.geometry.attributes.position.count<300000){o.geometry.boundsTree=new MeshBVH(o.geometry,{targetLeafSize:12});o.raycast=acceleratedRaycast;collisionMeshes.push(o);}
 }
}
function addWaterNormal(m){
 if(!addWaterNormal.texture){const n=256,data=new Uint8Array(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const u=x/n*Math.PI*2,v=y/n*Math.PI*2;let dx=0,dy=0;for(let k=1;k<=18;k++){const kx=((k*7)%17)-8,ky=((k*11)%19)-9,phase=k*2.399,amp=.035/Math.sqrt(k);const wave=Math.cos(u*kx+v*ky+phase);dx+=amp*kx/8*wave;dy+=amp*ky/8*wave;}const vec=new THREE.Vector3(-dx,-dy,1).normalize(),i=(y*n+x)*4;data[i]=Math.round((vec.x*.5+.5)*255);data[i+1]=Math.round((vec.y*.5+.5)*255);data[i+2]=Math.round((vec.z*.5+.5)*255);data[i+3]=255;}const t=new THREE.DataTexture(data,n,n);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(14,14);t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.needsUpdate=true;addWaterNormal.texture=t;}
 m.normalMap=addWaterNormal.texture;m.normalScale.set(.35,.35);m.roughness=.055;
 if(m.name.includes('Pool water')){m.ior=1.333;m.thickness=.7;m.attenuationColor=new THREE.Color(.4,.8,.74);m.attenuationDistance=7;}
}
function configureLights(){
 const spec=manifest.lights.find(l=>l.type==='SUN');if(spec){sun.position.copy(zUp(spec.direction).multiplyScalar(-90)).add(sun.target.position);sun.color.setRGB(...spec.color);sun.intensity=spec.energy;}
 // Area-light diffuse illumination is already in the Cycles lightmaps.
 // Source photographic fills also disable glossy visibility; avoid duplicate specular highlights.
}
function spatialInstances(root){
 const source=[];root.traverse(o=>{if(o.isInstancedMesh)source.push(o);});
 let before=0,after=0,chunks=0;
 for(const o of source){
  before+=o.count;const groups=new Map(),a=new THREE.Matrix4(),world=new THREE.Matrix4(),center=new THREE.Vector3();
  for(let i=0;i<o.count;i++){o.getMatrixAt(i,a);world.multiplyMatrices(o.matrixWorld,a);center.setFromMatrixPosition(world);const key=[Math.floor(center.x/16),Math.floor(center.z/16)].join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a.clone());}
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
  const sight=new THREE.Raycaster();sight.firstHitOnly=true;let lastTick=-1;
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
   if(probeBusy||reflectionDepth||!interactive||lastTick===displayTick||!visibleSurface(args[2]))return;
   lastTick=displayTick;
   const hidden=[];for(const m of materials)if(m.name.includes('Silver mirror')){hidden.push([m,m.visible]);m.visible=false;}
   reflectionDepth++;try{render.apply(this,args);}finally{for(const [m,v]of hidden)m.visible=v;reflectionDepth--;}
  };
  scene.add(mirror);mirrors.push(mirror);
 }
 diagnostics.planarMirrors=sources.length;diagnostics.planarReflectionPasses=mirrors.length;
}
async function loadModel(entry,loader,onProgress){try{return await delivery.model(entry,loader,onProgress);}catch(error){if(viewerDisposed)throw error;console.warn('Compressed delivery unavailable; using original model',error);return loader.loadAsync(assetUrl(entry.file),onProgress);}}
async function init(){
 try{
  manifest=await fetch(assetUrl('manifest.json')).then(r=>{if(!r.ok)throw Error('巡覽模型尚未完成匯出');return r.json();});diagnostics.source=manifest.source_sha256;lightmapJobsExpected=Object.keys(manifest.lightmaps).length;
  delivery=await createDelivery('v1',siteBase);
  delivery.setActive(true);
  if(delivery.spec.source_sha256&&delivery.spec.source_sha256!==manifest.source_sha256)throw Error('Delivery source mismatch');
  if(viewerDisposed){delivery.dispose();return;}diagnostics.delivery=delivery.stats;diagnostics.loading={startMs:0,previewMs:null,readyMs:null};
  progress(5,'正在載入天空與材質…');
  const hdr=await delivery.hdr('textures/sky.hdr');if(viewerDisposed){hdr.dispose();return;}hdr.mapping=THREE.EquirectangularReflectionMapping;scene.background=hdr;scene.environment=hdr;scene.backgroundRotation.y=Math.PI*2/3;scene.environmentRotation.y=Math.PI*2/3;scene.backgroundIntensity=.7;scene.environmentIntensity=.7;
  const draco=sceneDecoder=new DRACOLoader();draco.setDecoderPath(assetUrl('vendor/three/examples/jsm/libs/draco/gltf/'));draco.setWorkerLimit(2);
  const loader=new GLTFLoader();loader.setDRACOLoader(draco);
  const modelBytesTotal=manifest.models.reduce((sum,entry)=>sum+(entry.bytes||0),0);let modelBytesLoaded=0;
  for(let i=0;i<manifest.models.length;i++){
   const entry=manifest.models[i],label={'01 Architecture':'建築','02 Interiors':'室內家具','03 Outdoor furnishings':'戶外家具','04 Landscape':'海岸與植被','06 Lighting':'燈具'}[entry.collection]||entry.collection;
   progress(8+modelBytesLoaded/Math.max(1,modelBytesTotal)*48,`正在下載${label}模型…`);
   const gltf=await loadModel(entry,loader,event=>{
    const total=event.total||entry.bytes||0,loaded=event.loaded||0,ratio=total?Math.max(0,Math.min(1,loaded/total)):0;
    const value=8+(modelBytesLoaded+(entry.bytes||total)*ratio)/Math.max(1,modelBytesTotal||total)*48;
    const size=total?` · ${(loaded/1048576).toFixed(1)}/${(total/1048576).toFixed(1)} MB`:'';
    progress(value,`正在下載${label}模型 ${total?Math.round(ratio*100)+'%':''}${size}`);
   });
   modelBytesLoaded+=entry.bytes||0;scene.add(gltf.scene);gltf.scene.updateMatrixWorld(true);if(entry.collection==='04 Landscape')spatialInstances(gltf.scene);
   const meshes=[];gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
   progress(8+modelBytesLoaded/Math.max(1,modelBytesTotal)*48,`正在整理${label}模型與碰撞…`);
   for(let j=0;j<meshes.length;j+=8)await Promise.all(meshes.slice(j,j+8).map(o=>setupMesh(o,label)));
   diagnostics.models.push({file:entry.file,meshes:meshes.length,bytes:entry.bytes});
   if(i===0){
    configureLights();setupMirrors();goTo(0,false);setQuality('high',false);$('#places').hidden=true;$('#places-open').hidden=true;$('#lighting').disabled=true;
    void pumpLightmaps();progress(Math.max(12,loadProgressValue),'正在準備建築預覽…');
    await renderer.compileAsync(scene,camera);scene.updateMatrixWorld(true);renderer.shadowMap.needsUpdate=true;displayTick++;composer.render();
    diagnostics.loading.previewMs=performance.now()-diagnostics.loading.startMs;renderer.domElement.dataset.previewMs=String(Math.round(diagnostics.loading.previewMs));interactive=true;diagnostics.interactive=true;window.nerida.interactive=true;loading.hidden=true;dirty=true;
    progress(Math.max(13,loadProgressValue),'建築已可互動；其他模型與光照貼圖會在背景載入');
   }else void pumpLightmaps();
  }
  draco.dispose();await pumpLightmaps();createBookmarks();$('#places').hidden=false;$('#places-open').hidden=true;$('#lighting').disabled=false;goTo(0,false);setQuality('high',false);
  progress(88,'正在準備反射與陰影…');
  await renderer.compileAsync(scene,camera);
  scene.updateMatrixWorld(true);renderer.shadowMap.needsUpdate=true;displayTick++;composer.render();
  await buildProbes('day');
  progress(100,'巡覽準備完成');diagnostics.loading.readyMs=performance.now()-diagnostics.loading.startMs;renderer.domElement.dataset.readyMs=String(Math.round(diagnostics.loading.readyMs));renderer.domElement.dataset.deliveryResponseBytes=String(delivery.stats.responseBytes);renderer.domElement.dataset.deliveryCacheHits=String(delivery.stats.cacheHits);window.dispatchEvent(new Event("nerida-ready"));ready=true;diagnostics.ready=true;window.nerida.ready=true;
  loading.hidden=true;dirty=true;$('#quality').value='high';
  if(lightmapFailures.length){$('#stream-status').hidden=false;$('#stream-message').textContent=`場景已可使用，但 ${lightmapFailures.length} 張光照貼圖載入失敗；可重新載入再試。`;$('#stream-progress').style.width='100%';$('#stream-retry').hidden=false;}else $('#stream-status').hidden=true;
  console.info('NERIDA_READY',diagnostics);notifyHost('ready',{source:manifest.source_sha256});
 }catch(error){if(viewerDisposed)return;diagnostics.errors.push(String(error));console.error(error);notifyHost('error',{message:error.message});probeBusy=false;dirty=true;if(interactive){$('#stream-status').hidden=false;$('#stream-message').textContent='場景部分載入失敗：'+error.message;$('#stream-progress').style.width=`${loadProgressValue}%`;$('#stream-retry').hidden=false;}else{progress(0,'載入遇到問題：'+error.message);$('#retry').hidden=false;}}
}
function createBookmarks(){
 rooms.forEach((r,i)=>{const b=document.createElement('button');b.innerHTML=`<span>${String(i+1).padStart(2,'0')}</span>${r[1]}`;b.dataset.index=i;b.addEventListener('click',()=>goTo(i));$('#bookmarks').append(b);const fig=document.createElement('figure');const a=document.createElement('a');a.href=assetUrl('gallery/'+r[3]);a.target='_blank';a.rel='noopener';const img=document.createElement('img');img.src=new URL('./preview/v1_'+r[3].replace('.png','.webp'),import.meta.url).href;img.decoding='async';img.alt=r[1]+' — Blender Cycles 原始渲染';img.loading='lazy';a.append(img);const cap=document.createElement('figcaption');cap.textContent=String(i+1).padStart(2,'0')+' / '+r[1];fig.append(a,cap);$('#gallery-grid').append(fig);});
}
function goTo(index,animate=true){
 const r=rooms[index],data=manifest.cameras.find(c=>c.name.startsWith(r[0]));if(!data)return;
 if(pointer.isLocked)pointer.unlock();
 const position=zUp(data.position),direction=zUp(data.direction),look=position.clone().addScaledVector(direction,index===0||index===1||index===8?60:7);
 const vfov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(data.fov_horizontal/2)/Math.max(camera.aspect,1.5)));
 if(animate&&interactive)transition={start:performance.now(),duration:1000,from:camera.position.clone(),to:position,targetFrom:orbit.target.clone(),targetTo:look,fovFrom:camera.fov,fovTo:vfov};
 else{camera.position.copy(position);orbit.target.copy(look);camera.fov=vfov;camera.lookAt(look);camera.updateProjectionMatrix();}
 $('#view-number').textContent=String(index+1).padStart(2,'0')+' / 10';$('#view-title').textContent=r[1];$('#view-description').textContent=r[2];
 document.querySelectorAll('#bookmarks button').forEach(b=>b.classList.toggle('active',+b.dataset.index===index));
 if(ready&&(r[4]||'day')!==light)setLighting(r[4]||'day');
 dirty=true;movingUntil=performance.now()+1100;
}
async function buildProbes(variant){
 if(reflectionMaps[variant].length){assignProbes(variant);return;}
 probeBusy=true;for(const m of materials){m.envMap=null;}const positions=[[-8,6.6,-4],[8,6.6,-6],[-10,10.8,-4],[-2,10.8,-10],[0,6,9],[25,6.6,-6]];
 const pmrem=new THREE.PMREMGenerator(renderer);
 const visible=[];scene.traverse(o=>{if(o.isMesh&&(o.isReflector||(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.transmission>0||m.name.includes('Silver mirror')))){visible.push([o,o.visible]);o.visible=false;}});
 for(const p of positions){const rt=new THREE.WebGLCubeRenderTarget(256,{type:THREE.HalfFloatType,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});const cc=new THREE.CubeCamera(.1,1000,rt);cc.position.set(...p);cc.update(renderer,scene);const env=pmrem.fromCubemap(rt.texture);reflectionMaps[variant].push({position:cc.position.clone(),texture:env.texture});envTargets.push(env);rt.dispose();await new Promise(r=>setTimeout(r,0));}
 for(const [o,v]of visible)o.visible=v;pmrem.dispose();assignProbes(variant);probeBusy=false;diagnostics.probeCount=reflectionMaps[variant].length;
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
  renderer.toneMappingExposure=next==='day'?1.035:1.516;sun.shadow.needsUpdate=true;
  await buildProbes(next);$('#lighting').value=next;dirty=true;toast(next==='day'?'日間光照':'暮色光照');
 }catch(e){diagnostics.errors.push(String(e));toast('光照載入失敗，請重新載入頁面');}finally{$('#lighting').disabled=false;lightingBusy=false;const pending=pendingLighting;pendingLighting=null;if(pending&&pending!==light)await setLighting(pending);}
}
function setQuality(next,announce=true){
 quality=next;diagnostics.quality=next;
 const ratios={high:Math.min(devicePixelRatio,2),balanced:Math.min(devicePixelRatio,1.25),performance:1};renderer.setPixelRatio(ratios[next]);composer.setPixelRatio(ratios[next]);
 renderer.transmissionResolutionScale={high:.75,balanced:.5,performance:.35}[next];aa.enabled=next!=='performance';
 const samples={high:4,balanced:2,performance:0}[next];composer.renderTarget1.samples=samples;composer.renderTarget2.samples=samples;
 for(const mirror of mirrors){const rt=mirror.getRenderTarget(),size={high:2048,balanced:1024,performance:768}[next];rt.setSize(size,size);rt.samples=samples;}
 renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);dirty=true;$('#quality').value=next;
 if(announce)toast('畫面品質：'+{high:'高保真',balanced:'平衡',performance:'流暢'}[next]+'，模型細節維持完整');
}
function setMode(next){
 if(!interactive)return;if(pointer.isLocked)pointer.unlock();mode=next;diagnostics.mode=next;keys.clear();moveVelocity.set(0,0,0);orbit.enabled=next==='orbit';transition=null;
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));
 $('#walk-prompt').hidden=next==='orbit';$('#walk-mode-label').textContent=next==='walk'?'步行巡覽':'自由飛行';
 $('#instructions').textContent=next==='orbit'?'拖曳旋轉 · 滾輪縮放 · 右鍵平移':next==='walk'?'WASD 移動 · Shift 加速 · Esc 釋放滑鼠':'WASD 移動 · E / Q 升降 · Shift 加速 · Esc 釋放滑鼠';
 if(next==='walk'){
  if(camera.position.y>14||Math.abs(camera.position.x)>30||Math.abs(camera.position.z)>25){camera.position.set(-12,6.7,5.5);camera.lookAt(-6,6.7,-3);}
  settleGround(.65);toast('點一下畫面開始步行；Esc 可開啟選單');
 }else if(next==='fly')toast('點一下畫面開始飛行；E 上升、Q 下降');
 else{orbit.target.copy(camera.position).addScaledVector(camera.getWorldDirection(v1),8);orbit.update();}
 dirty=true;
}
function settleGround(maxRise=.32){
 floorCaster.set(camera.position.clone().add(new THREE.Vector3(0,maxRise,0)),new THREE.Vector3(0,-1,0));floorCaster.far=4;
 const hits=floorCaster.intersectObjects(collisionMeshes,false).filter(h=>{const m=Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material;return !m?.name.includes('Pool water')&&!m?.name.includes('glass');});
 const floor=hits.find(h=>h.face&&h.face.normal.clone().transformDirection(h.object.matrixWorld).y>.5);
 if(floor&&floor.point.y+1.65-camera.position.y<=maxRise){camera.position.y=floor.point.y+1.65;return true;}return false;
}
function blocked(from,to){
 if(!$('#collision').checked)return false;
 const delta=to.clone().sub(from),distance=delta.length();if(distance<1e-6)return false;delta.normalize();
 for(const y of [-1.3,-.75,-.1]){
  for(const side of [-.16,.16]){
   const origin=from.clone().add(new THREE.Vector3(delta.z*side,y,-delta.x*side));raycaster.set(origin,delta);raycaster.far=distance+.22;
   const h=raycaster.intersectObjects(collisionMeshes,false)[0];if(h && h.face && Math.abs(h.face.normal.clone().transformDirection(h.object.matrixWorld).y)<.8)return true;
  }
 }return false;
}
function updateMovement(dt){
 if(!pointer.isLocked)return false;
 const forward=camera.getWorldDirection(v1);if(mode==='walk'){forward.y=0;forward.normalize();}
 const right=v2.crossVectors(forward,camera.up).normalize(),desired=new THREE.Vector3();
 if(keys.has('KeyW')||keys.has('ArrowUp'))desired.add(forward);if(keys.has('KeyS')||keys.has('ArrowDown'))desired.sub(forward);
 if(keys.has('KeyD')||keys.has('ArrowRight'))desired.add(right);if(keys.has('KeyA')||keys.has('ArrowLeft'))desired.sub(right);
 if(mode==='fly'){if(keys.has('KeyE'))desired.y+=1;if(keys.has('KeyQ'))desired.y-=1;}
 if(desired.lengthSq())desired.normalize().multiplyScalar(speed*(keys.has('ShiftLeft')||keys.has('ShiftRight')?2.5:1));
 moveVelocity.lerp(desired,1-Math.exp(-14*dt));if(moveVelocity.length()<.005)moveVelocity.set(0,0,0);
 if(!moveVelocity.lengthSq())return false;
 const before=camera.position.clone(),step=moveVelocity.clone().multiplyScalar(dt),parts=Math.max(1,Math.ceil(step.length()/.08));step.divideScalar(parts);
 for(let i=0;i<parts;i++){
  const from=camera.position.clone(),to=from.clone().add(step);
  if(mode==='walk'){
   if(!blocked(from,to))camera.position.copy(to);
   else{const tx=from.clone().add(new THREE.Vector3(step.x,0,0));if(!blocked(from,tx))camera.position.copy(tx);const tz=camera.position.clone().add(new THREE.Vector3(0,0,step.z));if(!blocked(camera.position,tz))camera.position.copy(tz);}
   const oldY=camera.position.y;if(!settleGround(.3)&&$('#collision').checked)camera.position.copy(from);else if(!$('#collision').checked)camera.position.y=oldY;
  }else camera.position.copy(to);
 }
 camera.position.clamp(new THREE.Vector3(-600,-50,-800),new THREE.Vector3(600,500,500));
 return before.distanceToSquared(camera.position)>1e-8;
}
const lastPosition=new THREE.Vector3(),lastQuaternion=new THREE.Quaternion();
function frame(now){
 if(viewerDisposed||!viewerVisible){frameRequest=0;return;}
 frameRequest=requestAnimationFrame(frame);const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;
 if(!interactive||!viewerVisible||document.hidden||probeBusy)return;
 let moved=false;
 if(transition){const t=Math.min(1,(now-transition.start)/transition.duration),e=t*t*(3-2*t);camera.position.lerpVectors(transition.from,transition.to,e);orbit.target.lerpVectors(transition.targetFrom,transition.targetTo,e);camera.fov=THREE.MathUtils.lerp(transition.fovFrom,transition.fovTo,e);camera.updateProjectionMatrix();camera.lookAt(orbit.target);moved=true;if(t===1)transition=null;}
 else if(mode==='orbit')orbit.update();else moved=updateMovement(dt);
 if(measurement){if(measurement.type==='look'){camera.quaternion.copy(measurement.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin((now-measurement.start)*.0006)*.1,Math.sin((now-measurement.start)*.0008)*.4,0,'YXZ')));}else{camera.position.copy(measurement.center).add(new THREE.Vector3(Math.cos((now-measurement.start)*.00025)*measurement.radius,measurement.height,Math.sin((now-measurement.start)*.00025)*measurement.radius));camera.lookAt(measurement.center);}moved=true;}
 moved=moved||camera.position.distanceToSquared(lastPosition)>1e-9||1-Math.abs(camera.quaternion.dot(lastQuaternion))>1e-9;
 if(moved||dirty||now<movingUntil){
  const start=performance.now();renderer.info.reset();displayTick++;composer.render();const cpu=performance.now()-start;
  const info={time:now,interval:lastRendered?now-lastRendered:0,cpuMs:cpu,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,moving:moved};
  diagnostics.frames.push(info);if(diagnostics.frames.length>600)diagnostics.frames.shift();lastRendered=now;dirty=false;lastPosition.copy(camera.position);lastQuaternion.copy(camera.quaternion);
 }
 if(now-lastStats>750){lastStats=now;const f=diagnostics.frames.filter(f=>f.moving&&now-f.time<2500),mean=f.length?f.reduce((s,f)=>s+f.interval,0)/f.length:0;const last=diagnostics.frames.at(-1);
  $('#stats').innerHTML=`${f.length?Math.round(1000/mean)+' FPS（巡覽）':'靜止 · 按需渲染'}<br>${last?.calls||0} draw calls<br>${((last?.triangles||0)/1e6).toFixed(2)}M triangles / frame<br>${renderer.getPixelRatio().toFixed(2)}× · ${mode}`;
 }
}
renderer.domElement.addEventListener('pointerdown',e=>{if(mode!=='orbit'&&interactive&&!pointer.isLocked&&e.pointerType==='mouse')pointer.lock();});
$('#walk-prompt').addEventListener('click',()=>pointer.lock());
pointer.addEventListener('lock',()=>{document.body.classList.add('locked');$('#walk-prompt').hidden=true;$('#crosshair').hidden=false;dirty=true;});
pointer.addEventListener('unlock',()=>{document.body.classList.remove('locked');$('#crosshair').hidden=true;$('#walk-prompt').hidden=mode==='orbit';keys.clear();moveVelocity.set(0,0,0);});
pointer.addEventListener('change',()=>{dirty=true;movingUntil=performance.now()+100;});
orbit.addEventListener('change',()=>{dirty=true;movingUntil=performance.now()+150;});
window.addEventListener('keydown',e=>{
 if(!pointer.isLocked&&['INPUT','SELECT','BUTTON'].includes(document.activeElement?.tagName))return;
 if(e.code==='KeyH'&&!e.repeat){setMode('orbit');goTo(0);return;}
 if(e.code==='Escape'){if(pointer.isLocked)pointer.unlock();$('#settings').hidden=true;if($('#gallery').open)$('#gallery').close();}
 if(pointer.isLocked){if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);}
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();moveVelocity.set(0,0,0);});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);dirty=true;});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(!document.hidden)dirty=true;});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('#home').addEventListener('click',()=>{setMode('orbit');goTo(0);});
$('#settings-open').addEventListener('click',()=>$('#settings').hidden=!$('#settings').hidden);$('#settings-close').addEventListener('click',()=>$('#settings').hidden=true);
$('#places-close').addEventListener('click',()=>{$('#places').hidden=true;$('#places-open').hidden=false;});$('#places-open').addEventListener('click',()=>{$('#places').hidden=false;$('#places-open').hidden=true;});
$('#quality').addEventListener('change',e=>setQuality(e.target.value));$('#lighting').addEventListener('change',e=>setLighting(e.target.value));$('#stream-retry').addEventListener('click',()=>location.reload());
$('#speed').addEventListener('input',e=>{speed=+e.target.value;$('#speed-value').textContent=speed.toFixed(1)+' m/s';});$('#show-stats').addEventListener('change',e=>$('#stats').hidden=!e.target.checked);
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('此瀏覽器未提供全螢幕模式');}});
$('#capture').addEventListener('click',()=>{if(!interactive)return;displayTick++;composer.render();renderer.domElement.toBlob(blob=>{if(!blob)return;const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='NERIDA_'+light+'_'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('目前畫面已儲存');});});
$('#gallery-open').addEventListener('click',()=>$('#gallery').showModal());$('#gallery-close').addEventListener('click',()=>$('#gallery').close());$('#retry').addEventListener('click',()=>location.reload());
function measure(seconds,type){return new Promise(resolve=>{const saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),target:orbit.target.clone(),mode};measurement={type,start:performance.now(),center:new THREE.Vector3(0,7,0),radius:60,height:22,quaternion:saved.quaternion};setTimeout(()=>{measurement=null;camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);orbit.target.copy(saved.target);dirty=true;const f=diagnostics.frames.filter(x=>x.time>performance.now()-seconds*1000).slice(2),intervals=f.map(x=>x.interval).sort((a,b)=>a-b);resolve({type,seconds,frames:f.length,fps:f.length?1000/(f.reduce((s,x)=>s+x.interval,0)/f.length):0,p95FrameMs:intervals[Math.floor(intervals.length*.95)],quality,gpu:diagnostics.gpu,calls:f.at(-1)?.calls,triangles:f.at(-1)?.triangles,viewport:[innerWidth,innerHeight],pixelRatio:renderer.getPixelRatio()});},seconds*1000);});}
window.nerida={ready:false,interactive:false,diagnostics,renderer,scene,camera,goTo,setMode,setQuality,setLighting,collisionMeshes,measureOrbit:(seconds=10)=>measure(seconds,'orbit'),measureLook:(seconds=8)=>measure(seconds,'look')};

window.neridaSetVisible=value=>{const next=!!value;if(viewerDisposed)return;viewerVisible=next;if(!next){cancelAnimationFrame(frameRequest);frameRequest=0;keys.clear();moveVelocity.set(0,0,0);if(pointer.isLocked)pointer.unlock();}else{lastFrame=performance.now();dirty=true;if(!frameRequest)frameRequest=requestAnimationFrame(frame);}renderer.domElement.dataset.residentVisible=String(next);};
window.addEventListener('message',event=>{if(event.source===window.parent&&event.origin===location.origin&&event.data?.type==='nerida-visibility')window.neridaSetVisible(event.data.visible);});
// NERIDA_SINGLE_SCENE_LIFECYCLE_START
function notifyHost(status,details={}){if(window.parent!==window&&!viewerDisposed)window.parent.postMessage({type:'nerida-viewer',version:1,status,...details},location.origin);}
function saveView(){return {position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),target:mode==='orbit'?orbit.target.toArray():camera.getWorldDirection(camera.position.clone()).multiplyScalar(7).add(camera.position).toArray(),fov:camera.fov,light,quality,index:Number(document.querySelector('#bookmarks button.active')?.dataset.index??0)};}
async function waitForLighting(){const start=performance.now();while(lightingBusy||probeBusy){if(viewerDisposed)throw new DOMException('Viewer disposed','AbortError');if(performance.now()-start>30000)throw Error('光照切換尚未完成，請稍後重試');await new Promise(r=>setTimeout(r,20));}}
async function restoreView(saved){if(viewerDisposed)throw new DOMException('Viewer disposed','AbortError');await waitForLighting();if(saved){setMode('orbit');transition=null;camera.position.fromArray(saved.position);camera.quaternion.fromArray(saved.quaternion);orbit.target.fromArray(saved.target);camera.fov=saved.fov;camera.updateProjectionMatrix();orbit.update();if(quality!==(saved.quality||'high'))setQuality(saved.quality||'high',false);const index=saved.index,room=rooms[index];if(room){$('#view-number').textContent=String(index+1).padStart(2,'0')+' / '+rooms.length;$('#view-title').textContent=room[1];$('#view-description').textContent=room[2];document.querySelectorAll('#bookmarks button').forEach(b=>b.classList.toggle('active',+b.dataset.index===index));}else{$('#view-number').textContent='自由視角';$('#view-title').textContent='設計比較';$('#view-description').textContent='維持相同視角，查看兩版設計。';document.querySelectorAll('#bookmarks button').forEach(b=>b.classList.remove('active'));}if(saved.light&&saved.light!==light){const errors=diagnostics.errors.length;await setLighting(saved.light);if(light!==saved.light||diagnostics.errors.length!==errors)throw Error('光照切換未完成');}}if(viewerDisposed)throw new DOMException('Viewer disposed','AbortError');displayTick++;composer.render();dirty=true;}
let residentPreparation=null;
async function prepareResident(){if(residentPreparation)return residentPreparation;residentPreparation=(async()=>{window.neridaSetVisible(false);await waitForLighting();if(diagnostics.errors.length)throw Error('場景準備有未解決錯誤，請重試');const batches=[...new Set(lightmapMaterials.map(x=>x.batch))];for(const variant of ['night','day']){for(let i=0;i<batches.length;i++){if(viewerDisposed)throw new DOMException('Viewer disposed','AbortError');notifyHost('progress',{value:100,text:(variant==='night'?'預備夜間光照':'確認日間光照')+'… '+(i+1)+' / '+batches.length});const texture=await imageTexture(manifest.lightmaps[batches[i]][variant]);renderer.initTexture(texture);await new Promise(r=>setTimeout(r,0));}notifyHost('progress',{value:100,text:variant==='night'?'預備夜間反射與材質…':'完成日間反射與材質…'});const errors=diagnostics.errors.length;await setLighting(variant);if(light!==variant||reflectionMaps[variant].length!==6||diagnostics.errors.length!==errors)throw Error('日夜光照或反射準備未完成');await renderer.compileAsync(scene,camera);displayTick++;composer.render();}const allTextures=new Set();scene.traverse(o=>{for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean))for(const value of Object.values(m))if(value?.isTexture)allTextures.add(value);});for(const texture of allTextures)renderer.initTexture(texture);if(renderer.getContext().isContextLost())throw Error('GPU 資源不足，場景準備失敗');clearTimeout(toast.timer);$('#toast').hidden=true;renderer.domElement.dataset.residentPrepared='true';renderer.domElement.dataset.releasedPixelBytes=String(diagnostics.releasedPixelBytes||0);return true;})();return residentPreparation;}
function disposeViewer(){if(viewerDisposed)return null;viewerDisposed=true;viewerVisible=false;ready=false;cancelAnimationFrame(frameRequest);keys.clear();if(pointer.isLocked)pointer.unlock();delivery?.dispose();sceneDecoder?.dispose();clearTimeout(toast.timer);const report=releaseResources({scene,renderer,composer,controls:[orbit,pointer],targets:envTargets,extraMaterials:materials});for(const promise of textures.values())promise.then(t=>{t.dispose();if(t.image?.data)t.image.data=null;}).catch(()=>{});textures.clear();materials.clear();collisionMeshes.length=0;lightmapMaterials.length=0;mirrors.length=0;envTargets.length=0;reflectionMaps.day.length=0;reflectionMaps.night.length=0;lightmapJobs.clear();pendingLightmaps.length=0;renderer.domElement.dataset.disposed='true';return {version:1,...report};}
window.neridaLifecycle={prepare:prepareResident,restore:restoreView,dispose:disposeViewer,async capture(){await waitForLighting();const state=saveView();if(viewerDisposed||!interactive)return {state,blob:null};transition=null;keys.clear();if(pointer.isLocked)pointer.unlock();displayTick++;composer.render();const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/png'));return {state,blob};}};
window.addEventListener('pagehide',disposeViewer,{once:true});
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();if(!viewerDisposed){window.neridaSetVisible(false);notifyHost('context-lost');}});
// NERIDA_SINGLE_SCENE_LIFECYCLE_END
frameRequest=requestAnimationFrame(frame);init();
