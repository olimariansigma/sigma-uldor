// Peer-to-peer multiplayer over WebRTC (PeerJS). The host's room code is its peer id, so anyone on PC or
// phone can join by typing the code. JSON messages for events, Float32Array buffers for fast snapshots.
import { Peer } from 'peerjs';

const PREFIX = 'wreckingyard-v2-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CHUNK = 48000;
const ICE = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ],
};

export function makeCode() { let s = ''; for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; return s; }

export class Net {
  constructor() {
    this.role = 'solo';      // 'solo' | 'host' | 'client'
    this.peer = null; this.conns = new Map(); this.host = null;
    this.code = null; this.handlers = {};
    this.parts = new Map();
  }
  on(evt, fn) { this.handlers[evt] = fn; }
  emit(evt, ...a) { const f = this.handlers[evt]; if (f) f(...a); }
  get isHost() { return this.role === 'host'; }
  get isClient() { return this.role === 'client'; }
  get online() { return this.role !== 'solo'; }

  hostGame() {
    return new Promise((resolve, reject) => {
      const code = makeCode();
      const peer = new Peer(PREFIX + code, { config: ICE, debug: 0 });
      const to = setTimeout(() => reject(new Error('Could not reach the matchmaking server')), 15000);
      peer.on('open', () => { clearTimeout(to); this.peer = peer; this.role = 'host'; this.code = code; resolve(code); });
      peer.on('error', (e) => { clearTimeout(to); if (this.role !== 'host') reject(e); else this.emit('error', e); });
      peer.on('connection', (conn) => {
        if (window.__netdebug) console.log('[net] incoming connection', conn.peer, conn.serialization);
        conn.on('open', () => { if (window.__netdebug) console.log('[net] conn open (host side)'); this.conns.set(conn.peer, conn); this.emit('join', conn.peer); });
        conn.on('data', (d) => this.receive(conn.peer, d));
        conn.on('close', () => { this.conns.delete(conn.peer); this.emit('leave', conn.peer); });
        conn.on('error', () => { this.conns.delete(conn.peer); this.emit('leave', conn.peer); });
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
    });
  }

  joinGame(code) {
    code = code.trim().toUpperCase();
    return new Promise((resolve, reject) => {
      const peer = new Peer({ config: ICE, debug: 0 });
      const to = setTimeout(() => { reject(new Error('Timed out. Check the code and that the host is online.')); try { peer.destroy(); } catch (e) { /* ignore */ } }, 20000);
      peer.on('error', (e) => { clearTimeout(to); reject(new Error(e.type === 'peer-unavailable' ? 'No game with that code' : (e.message || 'Connection failed'))); });
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
        conn.on('open', () => { clearTimeout(to); this.peer = peer; this.host = conn; this.role = 'client'; this.code = code; resolve(); });
        conn.on('data', (d) => this.receive('host', d));
        conn.on('close', () => { if (this.role === 'client') { this.role = 'solo'; this.emit('lost'); } });
      });
    });
  }

  leave() {
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
    this.peer = null; this.conns.clear(); this.host = null; this.role = 'solo'; this.code = null;
  }

  kick(peerId) { const c = this.conns.get(peerId); if (c) c.close(); }

  // ---------- sending ----------
  sendRaw(conn, data) { try { if (conn && conn.open) conn.send(data); else if (window.__netdebug) console.log('[net] not open', !!conn); } catch (e) { console.error('[net] send failed', e && e.message, typeof data === 'string' ? data.length : data.byteLength); } }
  pack(obj) {
    const s = JSON.stringify(obj);
    if (s.length <= CHUNK) return [s];
    const id = Math.random().toString(36).slice(2, 8), n = Math.ceil(s.length / CHUNK), out = [];
    for (let i = 0; i < n; i++) out.push(JSON.stringify({ t: '#', id, i, n, d: s.slice(i * CHUNK, (i + 1) * CHUNK) }));
    return out;
  }
  // host -> one / all clients ; client -> host
  send(obj, peerId = null) {
    const parts = this.pack(obj);
    if (this.isClient) { for (const p of parts) this.sendRaw(this.host, p); return; }
    if (!this.isHost) return;
    if (peerId) { for (const p of parts) this.sendRaw(this.conns.get(peerId), p); return; }
    for (const c of this.conns.values()) for (const p of parts) this.sendRaw(c, p);
  }
  sendBin(floats, peerId = null) {
    const buf = new Float32Array(floats).buffer;
    if (this.isClient) { this.sendRaw(this.host, buf); return; }
    if (!this.isHost) return;
    if (peerId) { this.sendRaw(this.conns.get(peerId), buf); return; }
    for (const c of this.conns.values()) this.sendRaw(c, buf);
  }

  receive(from, d) {
    if (window.__netdebug) console.log('[net] recv from', from, typeof d, d && (d.byteLength || d.length), d && d.constructor && d.constructor.name);
    if (typeof d === 'string') {
      let m; try { m = JSON.parse(d); } catch (e) { return; }
      if (m.t === '#') {
        let p = this.parts.get(m.id); if (!p) { p = []; this.parts.set(m.id, p); }
        p[m.i] = m.d;
        if (p.filter((x) => x !== undefined).length === m.n) { this.parts.delete(m.id); this.receive(from, p.join('')); }
        return;
      }
      this.emit('msg', from, m);
    } else {
      const buf = d instanceof ArrayBuffer ? d : d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : null;
      if (buf) this.emit('bin', from, new Float32Array(buf));
    }
  }
}
