/* Minimal MP4 (ISO BMFF) writer for one H.264 track from WebCodecs (AVCC chunks): ftyp + moov first (fast start) + mdat. No audio:
 * Instagram adds music in the app. */
const ascii=s=>Uint8Array.from(s,c=>c.charCodeAt(0));
const u32=(...v)=>{const b=new Uint8Array(v.length*4),d=new DataView(b.buffer);v.forEach((x,i)=>d.setUint32(i*4,x>>>0));return b;};
const i32=(...v)=>{const b=new Uint8Array(v.length*4),d=new DataView(b.buffer);v.forEach((x,i)=>d.setInt32(i*4,x|0));return b;};
const u16=(...v)=>{const b=new Uint8Array(v.length*2),d=new DataView(b.buffer);v.forEach((x,i)=>d.setUint16(i*2,x&0xffff));return b;};
function box(type,...parts){
  const size=8+parts.reduce((n,p)=>n+p.byteLength,0),out=new Uint8Array(size);new DataView(out.buffer).setUint32(0,size);out.set(ascii(type),4);
  let o=8;for(const p of parts){out.set(p,o);o+=p.byteLength;}return out;
}
const full=(type,version,flags,...parts)=>box(type,Uint8Array.of(version,flags>>16&255,flags>>8&255,flags&255),...parts);
const MATRIX=u32(0x10000,0,0,0,0x10000,0,0,0,0x40000000);
const COLOR={primaries:{bt709:1,bt470bg:5,smpte170m:6},transfer:{bt709:1,smpte170m:6,'iec61966-2-1':13},matrix:{rgb:0,bt709:1,bt470bg:5,smpte170m:6}};

export function createMp4Muxer({width,height,timescale=90000}){
  const samples=[];let description=null,colorSpace=null;
  return {
    /** WebCodecs EncodedVideoChunk + metadata, in output (decode) order. */
    addChunk(chunk,meta){
      if(meta?.decoderConfig?.description){const d=meta.decoderConfig.description;description=new Uint8Array(d instanceof ArrayBuffer?d:d.buffer,d.byteOffset??0,d.byteLength).slice();}
      if(meta?.decoderConfig?.colorSpace)colorSpace=meta.decoderConfig.colorSpace;
      const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);samples.push({data,pts:chunk.timestamp,duration:chunk.duration??0,key:chunk.type==='key'});
    },
    get sampleCount(){return samples.length;},
    finalize(){
      if(!samples.length)throw new Error('Video karesi üretilemedi.');
      if(!description)throw new Error('H.264 yapılandırması (avcC) alınamadı.');
      const ticks=us=>Math.round(us*timescale/1e6),pts=samples.map(s=>ticks(s.pts)),first=Math.min(...pts),sorted=[...pts].sort((a,b)=>a-b);
      const frame=Math.max(1,ticks(samples[0].duration)||(sorted[1]-sorted[0])||Math.round(timescale/30)),dts=sorted.map(p=>p-first);
      const deltas=dts.map((d,i)=>i<dts.length-1?dts[i+1]-d:frame),offsets=pts.map((p,i)=>p-first-dts[i]),duration=dts[dts.length-1]+frame;
      const runs=(list)=>{const r=[];for(const v of list){const last=r[r.length-1];if(last&&last[1]===v)last[0]++;else r.push([1,v]);}return r;};
      const stts=runs(deltas),ctts=offsets.some(o=>o!==0)?runs(offsets):null,keys=samples.flatMap((s,i)=>s.key?[i+1]:[]);
      const ms=Math.round(duration/timescale*1000),bytes=samples.reduce((n,s)=>n+s.data.byteLength,0),bitrate=Math.round(bytes*8/Math.max(.001,duration/timescale));
      const colr=colorSpace&&COLOR.primaries[colorSpace.primaries]!==undefined&&COLOR.transfer[colorSpace.transfer]!==undefined&&COLOR.matrix[colorSpace.matrix]!==undefined
        ?[box('colr',ascii('nclx'),u16(COLOR.primaries[colorSpace.primaries],COLOR.transfer[colorSpace.transfer],COLOR.matrix[colorSpace.matrix]),Uint8Array.of(colorSpace.fullRange?0x80:0))]:[];
      const name=new Uint8Array(32);
      const avc1=box('avc1',new Uint8Array(6),u16(1),u16(0,0),u32(0,0,0),u16(width,height),u32(0x480000,0x480000,0),u16(1),name,u16(0x18,0xffff),box('avcC',description),box('pasp',u32(1,1)),box('btrt',u32(0,bitrate,bitrate)),...colr);
      const ftyp=box('ftyp',ascii('isom'),u32(0x200),ascii('isomiso2avc1mp41'));
      const moov=offset=>box('moov',
        full('mvhd',0,0,u32(0,0,1000,ms,0x10000),u16(0x100,0),u32(0,0),MATRIX,u32(0,0,0,0,0,0,2)),
        box('trak',full('tkhd',0,3,u32(0,0,1,0,ms,0,0),u16(0,0,0,0),MATRIX,u32(width*0x10000,height*0x10000)),
          box('mdia',full('mdhd',0,0,u32(0,0,timescale,duration),u16(0x55c4,0)),full('hdlr',0,0,u32(0),ascii('vide'),u32(0,0,0),ascii('VideoHandler\0')),
            box('minf',full('vmhd',0,1,u16(0,0,0,0)),box('dinf',full('dref',0,0,u32(1),full('url ',0,1))),
              box('stbl',full('stsd',0,0,u32(1),avc1),full('stts',0,0,u32(stts.length),...stts.map(([n,d])=>u32(n,d))),
                ...(keys.length<samples.length?[full('stss',0,0,u32(keys.length,...keys))]:[]),
                ...(ctts?[full('ctts',1,0,u32(ctts.length),...ctts.map(([n,o])=>new Uint8Array([...u32(n),...i32(o)])))]:[]),
                full('stsc',0,0,u32(1,1,samples.length,1)),full('stsz',0,0,u32(0,samples.length,...samples.map(s=>s.data.byteLength))),full('stco',0,0,u32(1,offset)))))));
      const head=moov(0).byteLength,mdat=u32(8+bytes);
      return new Blob([ftyp,moov(ftyp.byteLength+head+8),mdat,ascii('mdat'),...samples.map(s=>s.data)],{type:'video/mp4'});
    },
  };
}
