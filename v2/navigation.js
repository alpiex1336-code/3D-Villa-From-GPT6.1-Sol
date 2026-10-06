import * as THREE from 'three';
import {MeshBVH,acceleratedRaycast} from 'three-mesh-bvh';
// Source24: independent solids and walkable top faces, metres / Y-up.
export class WalkController {
 constructor(){this.radius=.18;this.skin=.004;this.standingEye=1.65;this.crouchingEye=.90;this.eyeHeight=this.standingEye;this.maxStep=.34;this.maxDrop=.45;this.gravity=14;this.jumpSpeed=4.6;this.foot=null;this.grounded=false;this.verticalVelocity=0;this.jumpBuffered=0;this.crouched=false;this.floorRay=new THREE.Raycaster();this.floorRay.firstHitOnly=false;this.segment=new THREE.Line3();this.bodyRay=new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(0,1,0));this.box=new THREE.Box3();this.triPoint=new THREE.Vector3();this.segPoint=new THREE.Vector3();}
 async load(url,source,readBinary=async url=>fetch(url).then(r=>{if(!r.ok)throw Error("Navigation geometry missing");return r.arrayBuffer();})){const spec=await fetch(url).then(r=>{if(!r.ok)throw Error('Navigation metadata missing');return r.json();});if(spec.source_sha256!==source)throw Error('Navigation source mismatch');const base=new URL('.',url);
  for(const key of ['solid','ground','terrain']){const entry=spec[key],bytes=await readBinary(new URL(entry.file,base));if(bytes.byteLength!==entry.bytes)throw Error('Navigation geometry size mismatch');const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(bytes),3));g.boundsTree=new MeshBVH(g,{targetLeafSize:12});const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));m.raycast=acceleratedRaycast;m.updateMatrixWorld();this[key]=m;}
  this.spec=spec;
 }
 reset(){this.foot=null;this.grounded=false;this.verticalVelocity=0;this.jumpBuffered=0;this.crouched=false;this.eyeHeight=this.standingEye;}
 height(x,z,oldY,rise=this.maxStep,drop=this.maxDrop){this.floorRay.set(new THREE.Vector3(x,oldY+rise+.006,z),new THREE.Vector3(0,-1,0));this.floorRay.far=rise+drop+.012;
  const hit=this.floorRay.intersectObject(this.ground,false).find(h=>h.face?.normal.y>.55&&h.point.y<=oldY+rise+.006&&h.point.y>=oldY-drop-.006);return hit?.point.y;
 }
 support(x,z,oldY,rise=this.maxStep,drop=this.maxDrop){
  const centre=this.height(x,z,oldY,rise,drop);let best=centre;
  // Anticipate a stair nose over the actual footprint, not decorative textures.
  for(const [dx,dz]of [[this.radius+.012,0],[-this.radius-.012,0],[0,this.radius+.012],[0,-this.radius-.012]]){const h=this.height(x+dx,z+dz,oldY,rise,drop);if(h!==undefined)best=best===undefined?h:Math.max(best,h);}
  return best;
 }
 terrainLimit(eye){this.floorRay.set(new THREE.Vector3(eye.x,100,eye.z),new THREE.Vector3(0,-1,0));this.floorRay.far=150;const hit=this.floorRay.intersectObject(this.terrain,false).find(h=>h.face?.normal.y>0);if(hit&&eye.y<hit.point.y+.22){eye.y=hit.point.y+.22;return true;}return false;}
 overlaps(foot,bodyHeight=this.crouched?1.02:1.76){const r=this.radius;this.segment.start.copy(foot).y+=r+this.skin;this.segment.end.copy(foot).y+=bodyHeight-r;this.box.makeEmpty().expandByPoint(this.segment.start).expandByPoint(this.segment.end).expandByScalar(r);this.bodyRay.origin.copy(this.segment.start);let blocked=false;
  this.solid.geometry.boundsTree.shapecast({intersectsBounds:b=>b.intersectsBox(this.box),intersectsTriangle:tri=>{const crossing=this.bodyRay.intersectTriangle(tri.a,tri.b,tri.c,false,this.triPoint);if(crossing&&crossing.y<=this.segment.end.y){blocked=true;return true;}const dist=tri.closestPointToSegment(this.segment,this.triPoint,this.segPoint);if(dist<r-.002){blocked=true;return true;}return false;}});return blocked;
 }
 inPool(p){const pool=this.spec.pool;return p.x>pool.minX&&p.x<pool.maxX&&p.z>pool.minZ&&p.z<pool.maxZ;}
 setCrouched(value){if(!value&&this.foot&&this.overlaps(this.foot,1.76))return false;this.crouched=value;this.eyeHeight=value?this.crouchingEye:this.standingEye;return true;}
 toggleCrouch(){return this.setCrouched(!this.crouched);}
 jump(){this.jumpBuffered=.13;}
 candidate(from,x,z,collision=true){const y=this.support(x,z,from.y,this.maxStep,this.maxDrop);if(y===undefined)return null;const foot=new THREE.Vector3(x,y+this.skin,z);if(foot.y-from.y>this.maxStep+.012||from.y-foot.y>this.maxDrop+.012)return null;return collision&&this.overlaps(foot)?null:foot;}
 enter(eye){this.reset();
  // Entering from a submerged fly view retains an underwater crouched perspective.
  if(this.inPool(eye)&&eye.y<(this.spec.pool.waterY??4.76))this.setCrouched(true);
  const desiredY=eye.y-this.eyeHeight,same=[];
  for(const rise of [.35,1.8,6]){const y=this.height(eye.x,eye.z,desiredY,rise,Math.max(.5,rise));if(y!==undefined)same.push(new THREE.Vector3(eye.x,y+this.skin,eye.z));}
  same.sort((a,b)=>Math.abs(a.y-desiredY)-Math.abs(b.y-desiredY));const nearest=same[0];let chosen=same.filter(p=>Math.abs(p.y-desiredY)<=Math.max(1.8,Math.abs((nearest?.y??desiredY)-desiredY)+.3)).map(p=>this.candidate(p,p.x,p.z)).find(Boolean);
  if(!chosen){const candidates=[];for(const targetY of [desiredY,nearest?.y??desiredY])for(let ring=1;ring<=24;ring++)for(let k=0;k<24;k++){const a=k*Math.PI/12,x=eye.x+ring*.25*Math.cos(a),z=eye.z+ring*.25*Math.sin(a),y=this.height(x,z,targetY,.4,.5);if(y===undefined)continue;const p=this.candidate(new THREE.Vector3(x,y+this.skin,z),x,z);if(p)candidates.push(p);}const reference=new THREE.Vector3(eye.x,nearest?.y??desiredY,eye.z);candidates.sort((a,b)=>a.distanceToSquared(reference)-b.distanceToSquared(reference));chosen=candidates[0];}
  if(!chosen){const safe=[];for(const [x,y,z]of [[-12,5.02,3],[12,5.02,3],[0,5.02,1],[16.75,5.30,-2.3],[0,3.85,-16]]){const h=this.height(x,z,y,2,2);if(h===undefined)continue;const p=this.candidate(new THREE.Vector3(x,h+this.skin,z),x,z);if(p)safe.push(p);}safe.sort((a,b)=>Math.hypot(a.x-eye.x,a.z-eye.z)-Math.hypot(b.x-eye.x,b.z-eye.z));chosen=safe[0];if(!chosen)throw Error('No safe walking spawn');}
  const moved=Math.hypot(chosen.x-eye.x,chosen.z-eye.z)>.05;this.foot=chosen;this.grounded=true;eye.copy(chosen).y+=this.eyeHeight;return moved;
 }
 horizontal(x,z,collision){
  if(this.grounded){const p=this.candidate(this.foot,x,z,collision);if(p){this.foot=p;return true;}}
  const next=this.foot.clone();next.x=x;next.z=z;if(collision&&this.overlaps(next))return false;
  if(this.grounded){const h=this.support(x,z,this.foot.y,.015,this.maxDrop);if(h!==undefined){next.y=h+this.skin;if(collision&&this.overlaps(next))return false;}else this.grounded=false;}
  this.foot=next;return true;
 }
 vertical(dt,collision){
  this.jumpBuffered=Math.max(0,this.jumpBuffered-dt);
  if(this.grounded&&this.jumpBuffered>0){this.verticalVelocity=this.jumpSpeed;this.grounded=false;this.jumpBuffered=0;}
  if(this.grounded)return;
  const old=this.foot.clone();this.verticalVelocity-=this.gravity*dt;const dy=this.verticalVelocity*dt,next=old.clone();next.y+=dy;
  if(dy<=0){const floor=this.support(next.x,next.z,old.y,.012,Math.abs(dy)+.03);if(floor!==undefined&&next.y<=floor+this.skin&&floor<=old.y+.02){const landing=next.clone();landing.y=floor+this.skin;if(!collision||!this.overlaps(landing)){this.foot=landing;this.verticalVelocity=0;this.grounded=true;return;}}}
  if(collision&&this.overlaps(next)){let lo=0,hi=1;for(let k=0;k<10;k++){const mid=(lo+hi)/2,p=old.clone();p.y+=dy*mid;if(this.overlaps(p))hi=mid;else lo=mid;}this.foot.y=old.y+dy*lo;this.verticalVelocity=0;return;}
  this.foot=next;
 }
 move(eye,dx,dz,dt,collision=true){if(!this.foot)this.enter(eye);const old=eye.clone(),n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.035),Math.ceil(dt/(1/120))),step=dt/n;
  for(let i=0;i<n;i++){
   if(Math.abs(dx)+Math.abs(dz)>1e-10){const x=this.foot.x+dx/n,z=this.foot.z+dz/n;if(!this.horizontal(x,z,collision)){this.horizontal(x,this.foot.z,collision);this.horizontal(this.foot.x,z,collision);}}
   this.vertical(step,collision);
  }
  eye.x=this.foot.x;eye.z=this.foot.z;const target=this.foot.y+this.eyeHeight;eye.y=this.grounded?THREE.MathUtils.lerp(eye.y,target,1-Math.exp(-22*dt)):target;
  return old.distanceToSquared(eye)>1e-10;
 }
}
