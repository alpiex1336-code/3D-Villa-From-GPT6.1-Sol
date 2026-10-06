// Explicit GPU/CPU cleanup before destroying an iframe; the parent retains only PNG and plain camera data.
export function releaseResources({scene,renderer,composer,controls=[],targets=[],extraMaterials=[]}){
 const geometries=new Set(),materials=new Set(extraMaterials),textures=new Set(),objects=[];
 const visit=value=>{if(!value)return;if(value.isTexture){textures.add(value);return;}if(Array.isArray(value))for(const item of value)visit(item);};
 scene.traverse(o=>{objects.push(o);if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m);if(o.skeleton)o.skeleton.dispose();o.shadow?.dispose();});
 for(const m of materials){for(const v of Object.values(m))visit(v);for(const u of Object.values(m.uniforms||{}))visit(u.value);}
 visit(scene.background);visit(scene.environment);for(const t of targets)visit(t.texture);
 const images=new Set();for(const texture of textures){const image=texture.source?.data;if(image?.close)images.add(image);texture.dispose();if(image?.data)image.data=null;}
 for(const image of images)image.close();for(const geometry of geometries)geometry.dispose();for(const m of materials)m.dispose();
 for(const o of objects){if(o.isReflector||o.isInstancedMesh)o.dispose?.();}
 for(const t of targets)t.dispose?.();for(const pass of composer.passes)pass.dispose?.();composer.dispose();for(const control of controls)control.dispose?.();scene.clear();scene.background=null;scene.environment=null;renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.width=1;renderer.domElement.height=1;
 return {geometries:geometries.size,materials:materials.size,textures:textures.size,closedImages:images.size,contextReleased:true};
}
