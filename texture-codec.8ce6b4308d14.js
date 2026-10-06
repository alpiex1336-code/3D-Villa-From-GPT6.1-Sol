export function decodeTexture(buffer){
 const bytes=new Uint8Array(buffer),view=new DataView(buffer);
 if(bytes.length<16||String.fromCharCode(...bytes.subarray(0,4))!=='NRTX'||view.getUint32(12,true)!==1)throw Error('Invalid lossless texture header');
 const width=view.getUint32(4,true),height=view.getUint32(8,true),n=width*height;
 if(!width||!height||width>16384||height>16384||bytes.length!==16+n*8)throw Error('Invalid lossless texture dimensions');
 const data=new Uint8Array(n*8);
 for(let plane=0;plane<8;plane++){let previous=0;for(let j=0;j<n;j++){previous=(previous+bytes[16+plane*n+j])&255;data[j*8+plane]=previous;}}
 return {width,height,data:data.buffer};
}
