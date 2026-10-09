/* Read only the LinkedIn CSVs needed by Network Compass. No archive bytes leave this page. */
(() => {
  'use strict';
  const allowed = new Set(['connections.csv','messages.csv','invitations.csv','profile.csv','recommendations_given.csv','recommendations_received.csv','endorsement_given_info.csv','endorsement_received_info.csv']);
  const maxEntry = 80 * 1024 * 1024, maxTotal = 120 * 1024 * 1024;
  const decoder = new TextDecoder('utf-8', { fatal: false });
  async function readLinkedInZip(file) {
    if (file.size > 100 * 1024 * 1024) throw new Error('ZIP exceeds the 100 MB limit.');
    const buffer = await file.arrayBuffer(), bytes = new Uint8Array(buffer), view = new DataView(buffer);
    if (bytes.length < 22) throw new Error('This is not a valid ZIP archive.');
    const u16 = p => view.getUint16(p, true), u32 = p => view.getUint32(p, true);
    let end = -1;
    for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
      if (u32(p) === 0x06054b50 && p + 22 + u16(p + 20) === bytes.length) { end = p; break; }
    }
    if (end < 0) throw new Error('Could not read the ZIP directory.');
    const count = u16(end + 10), size = u32(end + 12), start = u32(end + 16);
    if (count > 5000 || count === 65535 || size === 0xffffffff || start === 0xffffffff || start + size > end) throw new Error('ZIP structure or file count is unsupported.');
    const entries = new Map(); let p = start, total = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > end || u32(p) !== 0x02014b50) throw new Error('Damaged ZIP directory.');
      const flags = u16(p + 8), method = u16(p + 10), compressed = u32(p + 20), uncompressed = u32(p + 24);
      const nameLength = u16(p + 28), extraLength = u16(p + 30), commentLength = u16(p + 32), offset = u32(p + 42);
      const next = p + 46 + nameLength + extraLength + commentLength;
      if (next > end) throw new Error('Damaged ZIP directory.');
      const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength)); p = next;
      if (name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) continue;
      const parts = name.split('/');
      if (parts.length > 2) continue;
      const key = parts.at(-1).toLowerCase();
      if (!allowed.has(key)) continue;
      if (entries.has(key)) throw new Error(`The ZIP contains multiple ${key} files. Choose an unambiguous export.`);
      if (flags & 1 || ![0,8].includes(method) || compressed === 0xffffffff || uncompressed === 0xffffffff || uncompressed > maxEntry || (total += uncompressed) > maxTotal) throw new Error(`Cannot safely read ${key} from this ZIP.`);
      entries.set(key, { method, compressed, uncompressed, offset, name: key });
    }
    const result = {};
    for (const [key, entry] of entries) {
      const o = entry.offset;
      if (o + 30 > bytes.length || u32(o) !== 0x04034b50) throw new Error(`Damaged ${key} entry.`);
      const from = o + 30 + u16(o + 26) + u16(o + 28);
      if (from + entry.compressed > bytes.length) throw new Error(`Truncated ${key} entry.`);
      let data = bytes.subarray(from, from + entry.compressed);
      if (entry.method === 8) {
        if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open compressed ZIP files. Import the CSVs individually.');
        try {
          const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
          const chunks=[]; let length=0;
          while (true) {
            const {done,value}=await reader.read(); if(done)break;
            length+=value.length;
            if(length>entry.uncompressed || length>maxEntry){await reader.cancel();throw new Error('Expanded data exceeds the declared size.');}
            chunks.push(value);
          }
          data=new Uint8Array(length); let cursor=0;
          for(const chunk of chunks){data.set(chunk,cursor);cursor+=chunk.length;}
        } catch { throw new Error(`Could not decompress ${key}. Try an updated browser or another export.`); }
      }
      if (data.length !== entry.uncompressed || data.length > maxEntry) throw new Error(`Size check failed for ${key}.`);
      result[key] = decoder.decode(data);
    }
    if (!Object.keys(result).length) throw new Error('No supported LinkedIn CSVs were found in the ZIP.');
    return result;
  }
  globalThis.readLinkedInZip = readLinkedInZip;
})();
