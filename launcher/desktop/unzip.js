// Minimal ZIP extractor (stored + deflate entries, no ZIP64) so the launcher has no runtime dependencies.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

module.exports = function unzip(file, dest) {
  const buf = fs.readFileSync(file);
  // end of central directory record: search backwards for its signature
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const root = path.resolve(dest);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    const out = path.resolve(root, name);
    if (out !== root && !out.startsWith(root + path.sep)) throw new Error('unsafe path in zip: ' + name);
    if (name.endsWith('/')) { fs.mkdirSync(out, { recursive: true }); continue; }
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    const data = buf.subarray(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    const bytes = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : null;
    if (!bytes) throw new Error('unsupported compression in ' + name);
    if (bytes.length !== usize) throw new Error('size mismatch in ' + name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, bytes);
  }
};
