// Keep full-resolution GPU storage; drop only the already-uploaded CPU duplicate.
// A lost WebGL context must recreate this resident from the immutable asset cache.
export function releaseUploadedPixels(texture,onRelease=()=>{}){
 if(!texture.isDataTexture||!ArrayBuffer.isView(texture.image?.data))return texture;
 const previous=texture.onUpdate;
 texture.onUpdate=t=>{previous?.(t);if(ArrayBuffer.isView(t.image?.data)){const bytes=t.image.data.byteLength;t.image.data=null;onRelease(bytes);}t.onUpdate=null;};
 return texture;
}
