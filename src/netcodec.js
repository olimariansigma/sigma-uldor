// Binary wire formats. Every binary message starts with a one-byte kind:
//   1 player pose (client -> host)      2 machine pose (client -> host)    : kind, 3 pad bytes, float32[]
//   3 snapshot (host -> one client)     : kind, nPlayers, nMachines, 0, float32[players*9 + machines*14],
//                                         uint16 nPieces, then 15 bytes per piece (uint16 id, uint8 quaternion
//                                         index, int16 x3 position in cm, int16 x3 quaternion "smallest three")
// A loose block costs 15 bytes instead of 32 as plain floats.
export const PLAYER_F = 9, MACHINE_F = 14, PIECE_B = 15;
const QS = 32767 / Math.SQRT1_2;

export function encodeFloats(kind, arr) {
  const buf = new ArrayBuffer(4 + arr.length * 4), dv = new DataView(buf);
  dv.setUint8(0, kind);
  for (let i = 0; i < arr.length; i++) dv.setFloat32(4 + i * 4, arr[i], true);
  return buf;
}
// -> Float32Array with the kind in [0] (the layout the handlers always used)
export function decodeFloats(buf) {
  const dv = new DataView(buf), n = (buf.byteLength - 4) >> 2, out = new Float32Array(n + 1);
  out[0] = dv.getUint8(0);
  for (let i = 0; i < n; i++) out[i + 1] = dv.getFloat32(4 + i * 4, true);
  return out;
}
export const kindOf = (buf) => (buf.byteLength ? new DataView(buf).getUint8(0) : 0);

const clamp16 = (v) => Math.max(-32767, Math.min(32767, Math.round(v)));
// head: float list (players then machines), pieces: [{id, pos, quat}]
export function encodeSnapshot(np, nm, head, pieces) {
  const buf = new ArrayBuffer(4 + head.length * 4 + 2 + pieces.length * PIECE_B), dv = new DataView(buf);
  dv.setUint8(0, 3); dv.setUint8(1, np); dv.setUint8(2, nm);
  let o = 4;
  for (let i = 0; i < head.length; i++, o += 4) dv.setFloat32(o, head[i], true);
  dv.setUint16(o, pieces.length, true); o += 2;
  for (const p of pieces) {
    const q = p.quat, c = [q.x, q.y, q.z, q.w];
    let big = 0; for (let k = 1; k < 4; k++) if (Math.abs(c[k]) > Math.abs(c[big])) big = k;
    const sg = c[big] < 0 ? -1 : 1;
    dv.setUint16(o, p.id, true); dv.setUint8(o + 2, big);
    dv.setInt16(o + 3, clamp16(p.pos.x * 100), true); dv.setInt16(o + 5, clamp16(p.pos.y * 100), true); dv.setInt16(o + 7, clamp16(p.pos.z * 100), true);
    let w = o + 9;
    for (let k = 0; k < 4; k++) if (k !== big) { dv.setInt16(w, clamp16(c[k] * sg * QS), true); w += 2; }
    o += PIECE_B;
  }
  return buf;
}
// -> { np, nm, head: Float32Array, pieces: Float32Array [id, px, py, pz, qx, qy, qz, qw]* }
export function decodeSnapshot(buf) {
  const dv = new DataView(buf), np = dv.getUint8(1), nm = dv.getUint8(2), nh = np * PLAYER_F + nm * MACHINE_F;
  const head = new Float32Array(nh);
  let o = 4;
  for (let i = 0; i < nh; i++, o += 4) head[i] = dv.getFloat32(o, true);
  const n = dv.getUint16(o, true); o += 2;
  const pieces = new Float32Array(n * 8), c = [0, 0, 0, 0];
  for (let i = 0; i < n; i++, o += PIECE_B) {
    const big = dv.getUint8(o + 2);
    let w = o + 9, s = 0;
    for (let k = 0; k < 4; k++) if (k !== big) { c[k] = dv.getInt16(w, true) / QS; s += c[k] * c[k]; w += 2; }
    c[big] = Math.sqrt(Math.max(0, 1 - s));
    pieces.set([dv.getUint16(o, true), dv.getInt16(o + 3, true) / 100, dv.getInt16(o + 5, true) / 100, dv.getInt16(o + 7, true) / 100, c[0], c[1], c[2], c[3]], i * 8);
  }
  return { np, nm, head, pieces };
}
