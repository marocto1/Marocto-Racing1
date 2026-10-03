import {deflateSync} from 'node:zlib';

const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);crcTable[n]=c>>>0;}
function crc32(buffer){let c=0xffffffff;for(const b of buffer)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(type,data=Buffer.alloc(0)){
  const name=Buffer.from(type,'ascii'),body=Buffer.isBuffer(data)?data:Buffer.from(data),out=Buffer.allocUnsafe(12+body.length);
  out.writeUInt32BE(body.length,0);name.copy(out,4);body.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,body])),8+body.length);return out;
}
export function encodePngRgba(width,height,rgba){
  width=Number(width);height=Number(height);const pixels=Buffer.isBuffer(rgba)?rgba:Buffer.from(rgba);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192)throw Error('invalid PNG dimensions');
  if(pixels.length!==width*height*4)throw Error(`RGBA byte length mismatch: ${pixels.length} != ${width*height*4}`);
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  const stride=width*4,scan=Buffer.allocUnsafe((stride+1)*height);
  for(let y=0;y<height;y++){const dst=y*(stride+1);scan[dst]=0;pixels.copy(scan,dst+1,y*stride,(y+1)*stride);}
  return Buffer.concat([PNG_SIGNATURE,chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scan,{level:9})),chunk('IEND')]);
}
export const PNG_SIGNATURE_BYTES=PNG_SIGNATURE;
