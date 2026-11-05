/** Match recordings travel as one gzip file: "ALS1", the JSON header's length, the header (typed arrays replaced by placeholders), then
 * the arrays' bytes, each on an 8-byte boundary. The full recording (~9 MB) and the reel's trimmed one (~0.2 MB) use the same format. */
const MAGIC = 0x414c5331;
const TYPES = { Float32Array, Float64Array, Int32Array, Uint32Array, Int16Array, Uint16Array, Int8Array, Uint8Array } as const;
type TypeName = keyof typeof TYPES;
const align8 = (n: number) => (n + 7) & ~7;

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function encodeRecording(value: unknown): Promise<Uint8Array> {
  const arrays: ArrayBufferView[] = [], offsets: number[] = [];let size = 0;
  const header = new TextEncoder().encode(JSON.stringify(value, (_key, v: unknown) => {
    if (!ArrayBuffer.isView(v) || v instanceof DataView) return v;
    const type = v.constructor.name;if (!(type in TYPES)) throw new Error(`Kayıtta desteklenmeyen dizi: ${type}`);
    arrays.push(v);offsets.push(size);size += align8(v.byteLength);
    return { $ta: arrays.length - 1, type, offset: offsets.at(-1), bytes: v.byteLength };
  }));
  const start = align8(8 + header.length), out = new Uint8Array(start + size), view = new DataView(out.buffer);
  view.setUint32(0, MAGIC);view.setUint32(4, header.length);out.set(header, 8);
  arrays.forEach((a, i) => out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), start + offsets[i]!));
  return through(out, new CompressionStream('gzip'));
}

export async function decodeRecording<T>(bytes: ArrayBuffer | Uint8Array): Promise<T> {
  const raw = await through(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), new DecompressionStream('gzip'));
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (raw.byteLength < 8 || view.getUint32(0) !== MAGIC) throw new Error('Maç kaydı okunamadı.');
  const length = view.getUint32(4), start = align8(8 + length), base = raw.byteOffset + start;
  return JSON.parse(new TextDecoder().decode(raw.subarray(8, 8 + length)), (_key, v: { $ta?: number; type?: TypeName; offset?: number; bytes?: number } | unknown) => {
    if (!v || typeof v !== 'object' || typeof (v as { $ta?: unknown }).$ta !== 'number') return v;
    const p = v as { type: TypeName; offset: number; bytes: number };
    return new TYPES[p.type](raw.buffer.slice(base + p.offset, base + p.offset + p.bytes) as ArrayBuffer);
  }) as T;
}
