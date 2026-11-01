// DOM HUD and panels (sandbox spawn menu, multiplayer, save slots, mixer, toasts).
import * as THREE from 'three';
import { MACHINES } from './machines.js';
import { BUILDINGS } from './buildings.js';
import { fmtKg } from './crusher.js';

const $ = (id) => document.getElementById(id);
const PANELS = ['spawn', 'multi', 'save', 'mixerPanel', 'help', 'settings'];
const hex = (c) => '#' + c.getHexString();

export class UI {
  constructor(game) {
    this.game = game;
    this.popups = [];
    this.tab = 'machines';
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close(b.dataset.close)));
    $('spawnBtn').addEventListener('click', () => this.toggle('spawn'));
    $('multiBtn').addEventListener('click', () => this.toggle('multi'));
    $('saveBtn').addEventListener('click', () => this.toggle('save'));
    $('helpBtn').addEventListener('click', () => this.toggle('help'));
    $('settingsBtn').addEventListener('click', () => this.toggle('settings'));
    document.querySelectorAll('#spawn .tab').forEach((t) => t.addEventListener('click', () => { this.tab = t.dataset.tab; this.renderSpawn(); }));
    for (const id of ['spawnBtn', 'multiBtn', 'saveBtn', 'helpBtn', 'settingsBtn']) $(id).addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.cache = {};
  }

  isOpen() { return PANELS.some((id) => !$(id).classList.contains('hidden')); }
  toggle(id) { if ($(id).classList.contains('hidden')) this.open(id); else this.close(id); }
  open(id) {
    for (const o of PANELS) if (o !== id) $(o).classList.add('hidden');
    $(id).classList.remove('hidden');
    this.refreshPanel(id);
    this.game.input.releaseLock();
    this.game.audio.click();
  }
  close(id) { $(id).classList.add('hidden'); this.game.audio.click(); }
  refreshPanel(id) {
    if (id === 'spawn') this.renderSpawn();
    if (id === 'multi') this.renderMulti();
    if (id === 'save') this.renderSave();
    if (id === 'mixerPanel') this.renderMixer();
  }
  refreshOpen() { for (const id of ['spawn', 'multi', 'save', 'mixerPanel']) if (!$(id).classList.contains('hidden')) this.refreshPanel(id); }

  btn(label, cls, fn, disabled = false) {
    const b = document.createElement('button'); b.className = 'buy ' + (cls || ''); b.innerHTML = label; b.disabled = disabled;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }

  // ------------------------------------------------------------------ spawn menu
  renderSpawn() {
    const g = this.game;
    document.querySelectorAll('#spawn .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === this.tab));
    const body = $('spawnBody'); body.innerHTML = '';
    if (this.tab === 'machines') {
      const n = g.machines.size;
      const head = document.createElement('div'); head.className = 'sect'; head.textContent = `Machines on site: ${n} / 10`;
      body.appendChild(head);
      const grid = document.createElement('div'); grid.className = 'cards';
      for (const sp of MACHINES) {
        const c = document.createElement('div'); c.className = 'card';
        c.innerHTML = `<div class="top"><div class="ico">${sp.icon}</div><div><b>${sp.name}</b></div></div><div class="desc">${sp.desc}</div>`;
        const sw = document.createElement('div'); sw.className = 'swatch'; sw.style.background = '#' + new THREE.Color(sp.paint).getHexString(); c.querySelector('.top').appendChild(sw);
        const row = document.createElement('div'); row.className = 'row';
        row.appendChild(this.btn('Spawn here', '', () => { g.act('spawnMachine', { spec: sp.id, near: g.player.pos.toArray(), yaw: g.cam.yaw + Math.PI }); this.close('spawn'); }, n >= 10));
        c.appendChild(row); grid.appendChild(c);
      }
      body.appendChild(grid);
      if (n) {
        const h2 = document.createElement('div'); h2.className = 'sect'; h2.style.marginTop = '14px'; h2.textContent = 'Spawned machines'; body.appendChild(h2);
        for (const m of g.machines.values()) {
          const row = document.createElement('div'); row.className = 'slot';
          row.innerHTML = `<div class="ico" style="font-size:24px">${m.spec.icon}</div><div class="info"><b>${m.spec.name}</b><br>${m.driver >= 0 ? '🧑 driven by ' + g.playerName(m.driver) : 'parked'}</div>`;
          row.appendChild(this.btn('Remove', 'red', () => { g.act('removeMachine', { id: m.id }); setTimeout(() => this.renderSpawn(), 150); }, m.driver >= 0 && m.driver !== g.myId));
          body.appendChild(row);
        }
      }
    } else if (this.tab === 'buildings') {
      const plots = ['Plot A (centre)', 'Plot B (west)'];
      const status = document.createElement('div'); status.className = 'sect';
      status.textContent = plots.map((p, i) => `${p}: ${g.plotName(i)}`).join('   ·   ');
      body.appendChild(status);
      const grid = document.createElement('div'); grid.className = 'cards';
      for (const b of BUILDINGS) {
        const c = document.createElement('div'); c.className = 'card';
        c.innerHTML = `<div class="top"><div class="ico">${b.icon}</div><b>${b.name}</b></div><div class="desc">${b.desc}</div>`;
        const row = document.createElement('div'); row.className = 'row';
        row.appendChild(this.btn('Build on A', '', () => { g.act('spawnBuilding', { def: b.id, plot: 0 }); this.close('spawn'); }));
        row.appendChild(this.btn('Build on B', 'alt', () => { g.act('spawnBuilding', { def: b.id, plot: 1 }); this.close('spawn'); }));
        c.appendChild(row); grid.appendChild(c);
      }
      body.appendChild(grid);
      const row = document.createElement('div'); row.className = 'btn-row';
      row.appendChild(this.btn('Clear plot A', 'red', () => g.act('clearPlot', { plot: 0 })));
      row.appendChild(this.btn('Clear plot B', 'red', () => g.act('clearPlot', { plot: 1 })));
      body.appendChild(row);
    } else {
      const s = g.settings;
      const slider = (label, key, min, max, step, fmt, local = false) => {
        const r = document.createElement('div'); r.className = 'slider-row';
        r.innerHTML = `<span>${label}</span>`;
        const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = s[key];
        const out = document.createElement('output'); out.textContent = fmt(s[key]);
        inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); if (local) g.setLocal(key, +inp.value); else g.act('setting', { key, value: +inp.value }); });
        r.appendChild(inp); r.appendChild(out); body.appendChild(r);
      };
      slider('Hammer power', 'hammer', 0, 3, 1, (v) => ['Club', 'Sledge', 'Heavy', 'Breaker'][v], true);
      slider('Carry capacity', 'carry', 2, 30, 1, (v) => v + ' blocks', true);
      slider('Crusher speed', 'crusher', 1, 12, 1, (v) => v + ' /s');
      slider('Grapple capacity', 'grapple', 0.5, 3, 0.5, (v) => 'x' + v);
      const row = document.createElement('div'); row.className = 'btn-row';
      row.appendChild(this.btn('🧹 Remove loose rubble', 'red', () => g.act('clearRubble', {})));
      row.appendChild(this.btn('🕳️ Break the road', 'alt', () => g.act('breakRoad', {})));
      row.appendChild(this.btn('🛣️ Fix all potholes', '', () => g.act('fixRoad', {})));
      row.appendChild(this.btn('🫗 Empty mixer', 'red', () => g.act('mixer', { op: 'empty' })));
      row.appendChild(this.btn('⛰️ Clear dust pile', 'red', () => g.act('clearPile', {})));
      row.appendChild(this.btn('📍 Back to spawn', 'alt', () => { g.player.teleport(g.spawnPoint()); this.close('spawn'); }));
      body.appendChild(row);
    }
  }

  // ------------------------------------------------------------------ multiplayer
  renderMulti() {
    const g = this.game, net = g.net, body = $('multiBody');
    body.innerHTML = '';
    const p = (html) => { const d = document.createElement('div'); d.innerHTML = html; body.appendChild(d); return d; };
    const nameRow = document.createElement('div'); nameRow.className = 'slider-row';
    nameRow.innerHTML = '<span>Your name</span>';
    const ni = document.createElement('input'); ni.className = 'text-in'; ni.style.margin = '0'; ni.style.width = '200px'; ni.value = g.myName; ni.maxLength = 16;
    ni.addEventListener('change', () => g.setName(ni.value));
    nameRow.appendChild(ni); body.appendChild(nameRow);
    if (net.role === 'solo') {
      p('<p>Host a game and send the code to your friends. They can join from <b>PC or phone</b>. Your current world is shared with everyone.</p>');
      const row = document.createElement('div'); row.className = 'btn-row';
      row.appendChild(this.btn('🌐 Host a game', '', () => g.startHost()));
      body.appendChild(row);
      p('<div class="sect" style="margin-top:16px">Join a friend</div>');
      const jr = document.createElement('div'); jr.className = 'join-row'; jr.style.justifyContent = 'flex-start';
      const ci = document.createElement('input'); ci.className = 'text-in code-in'; ci.maxLength = 6; ci.placeholder = 'CODE';
      jr.appendChild(ci);
      const jb = this.btn('Join', 'alt', () => g.joinGame(ci.value)); jb.style.maxWidth = '120px';
      jr.appendChild(jb); body.appendChild(jr);
      if (this.netMsg) p(`<p style="color:#ffcf4d">${this.netMsg}</p>`);
    } else {
      p(`<div class="sect">${net.isHost ? 'You are hosting. Share this code:' : 'Connected to game'}</div><div class="bigcode">${net.code}</div>`);
      const list = document.createElement('div'); list.className = 'plist';
      for (const pl of g.players.values()) {
        const r = document.createElement('div');
        r.innerHTML = `<span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${pl.shirt};margin-right:8px"></span>${pl.name}${pl.id === g.myId ? ' (you)' : ''}${pl.id === 0 ? ' · host' : ''}</span>`;
        if (net.isHost && pl.id !== 0) r.appendChild(this.btn('Kick', 'red', () => g.kick(pl.id)));
        list.appendChild(r);
      }
      body.appendChild(list);
      const row = document.createElement('div'); row.className = 'btn-row';
      row.appendChild(this.btn(net.isHost ? 'Stop hosting' : 'Leave game', 'red', () => g.leaveGame()));
      body.appendChild(row);
    }
  }

  // ------------------------------------------------------------------ save slots
  renderSave() {
    const g = this.game, body = $('saveBody');
    body.innerHTML = '';
    const info = document.createElement('p');
    info.innerHTML = g.net.isClient ? 'You can save the shared world to your device. To play a saved world, load it in solo mode or host it yourself.' : 'Saves the whole world: buildings, every loose block, machines, dust pile, mixer and road.';
    body.appendChild(info);
    for (const slot of ['auto', '1', '2', '3', '4', '5']) {
      const meta = g.slotMeta(slot);
      const r = document.createElement('div'); r.className = 'slot';
      r.innerHTML = `<div class="ico" style="font-size:22px">${slot === 'auto' ? '⏱️' : '💾'}</div><div class="info"><b>${slot === 'auto' ? 'Autosave' : 'Slot ' + slot}</b><br>${meta ? new Date(meta.time).toLocaleString() + ' · ' + meta.summary : '<span style="opacity:.6">empty</span>'}</div>`;
      if (slot !== 'auto') r.appendChild(this.btn('Save', '', () => { g.saveSlot(slot); this.renderSave(); }));
      r.appendChild(this.btn('Load', 'alt', () => { g.loadSlot(slot); this.close('save'); }, !meta || g.net.isClient));
      if (meta && slot !== 'auto') r.appendChild(this.btn('🗑', 'red', () => { g.deleteSlot(slot); this.renderSave(); }));
      body.appendChild(r);
    }
    const row = document.createElement('div'); row.className = 'btn-row';
    row.appendChild(this.btn('🔄 New world', 'red', () => { if (confirm('Start a fresh world? (unsaved progress is lost)')) { g.act('newWorld', {}); this.close('save'); } }, g.net.isClient));
    body.appendChild(row);
  }

  // ------------------------------------------------------------------ mixer
  renderMixer() {
    const g = this.game, mx = g.mixer, body = $('mixerBody');
    const key = [mx.dust | 0, mx.water | 0, mx.cement | 0, mx.status, g.bucket.kind, g.bucket.kg | 0, g.crusher.pileKg | 0].join('|');
    if (this.cache.mixer === key && body.children.length) return;
    this.cache.mixer = key;
    body.innerHTML = `
      <div class="mix-grid">
        <div class="mix-cell"><div>Dust</div><div class="v">${fmtKg(mx.dust)}</div><div class="sw" style="background:${hex(mx.dustCol)};opacity:${mx.dust ? 1 : 0.2}"></div></div>
        <div class="mix-cell"><div>Water</div><div class="v">${Math.round(mx.water)} L</div><div class="sw" style="background:#3d7080;opacity:${mx.water ? 1 : 0.2}"></div></div>
        <div class="mix-cell"><div>Cement</div><div class="v">${fmtKg(mx.cement)}</div><div class="sw" style="background:${hex(mx.cementCol)};opacity:${mx.cement ? 1 : 0.2}"></div></div>
      </div>
      <p><b>${mx.status}</b> · mix ratio needs roughly 1 L of water per 3 kg of dust. Dust pile: <b>${fmtKg(g.crusher.pileKg)}</b></p>`;
    const row = document.createElement('div'); row.className = 'btn-row';
    row.appendChild(this.btn('➕ 50 kg dust from pile', '', () => g.act('mixer', { op: 'dust', kg: 50 }), g.crusher.pileKg < 1));
    row.appendChild(this.btn('➕ 250 kg dust', '', () => g.act('mixer', { op: 'dust', kg: 250 }), g.crusher.pileKg < 1));
    const b = g.bucket;
    row.appendChild(this.btn(b.kind ? `🪣 Pour my ${b.kind} in (${Math.round(b.kg)})` : '🪣 Your bucket is empty', 'alt', () => g.act('bucketPour', { target: 'mixer' }), !b.kind || b.kind === 'cement'));
    row.appendChild(this.btn('🪣 Fill my bucket with cement', 'alt', () => g.act('bucketFill', { source: 'mixer' }), mx.cement < 1 || (b.kind && b.kind !== 'cement') || b.kg >= 25));
    row.appendChild(this.btn('🫗 Empty the tub', 'red', () => g.act('mixer', { op: 'empty' })));
    body.appendChild(row);
  }

  // ------------------------------------------------------------------ HUD
  setDust(total, tally, pileKg, cement, road) {
    const k = [Math.round(total), Math.round(pileKg), Math.round(cement), road].join('|');
    if (this.cache.dust === k) return;
    this.cache.dust = k;
    $('dustTotal').textContent = fmtKg(total);
    $('pileKg').textContent = fmtKg(pileKg); $('cementKg').textContent = fmtKg(cement); $('roadFix').textContent = road;
    const sw = $('swatches'); sw.innerHTML = '';
    const list = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    const sum = list.reduce((a, b) => a + b[1], 0) || 1;
    for (const [h, kg] of list) { const i = document.createElement('i'); i.style.width = (kg / sum * 100) + '%'; i.style.background = '#' + new THREE.Color(h).getHexString(); i.title = fmtKg(kg); sw.appendChild(i); }
  }
  setNet(html) { const el = $('netBadge'); el.classList.toggle('hidden', !html); if (html && el.innerHTML !== html) el.innerHTML = html; }

  toast(msg, good = false, ms = 3200) {
    const el = document.createElement('div'); el.className = 'toast' + (good ? ' good' : ''); el.innerHTML = msg;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, ms);
  }
  popup(text, worldPos, color = null) {
    if (this.popups.length > 24) { const o = this.popups.shift(); o.el.remove(); }
    const el = document.createElement('div'); el.className = 'pop'; el.textContent = text;
    if (color) el.style.color = color;
    $('popups').appendChild(el);
    this.popups.push({ el, pos: worldPos.clone(), t: 0 });
  }
  updatePopups(dt, camera) {
    const w = window.innerWidth, h = window.innerHeight, v = new THREE.Vector3();
    this.popups = this.popups.filter((p) => {
      p.t += dt;
      if (p.t > 1.4) { p.el.remove(); return false; }
      v.copy(p.pos); v.y += p.t * 1.2; v.project(camera);
      if (v.z > 1) { p.el.style.display = 'none'; return true; }
      p.el.style.display = '';
      p.el.style.left = ((v.x + 1) / 2 * w) + 'px'; p.el.style.top = ((1 - v.y) / 2 * h) + 'px';
      p.el.style.opacity = String(Math.min(1, (1.4 - p.t) * 2));
      return true;
    });
  }
  setCarry(n, cap) {
    const el = $('carry');
    el.classList.toggle('hidden', n === 0); el.classList.toggle('full', n >= cap);
    $('carryVal').textContent = `${n}/${cap}`;
  }
  setBucket(b) {
    const el = $('bucketHud');
    el.classList.toggle('hidden', !b.kind);
    if (!b.kind) return;
    $('bucketSw').style.background = b.kind === 'water' ? '#3d7080' : hex(b.color);
    $('bucketVal').textContent = `${b.kind} ${Math.round(b.kg)} ${b.kind === 'water' ? 'L' : 'kg'}`;
  }
  setPrompt(html) {
    const el = $('prompt');
    if (!html) { el.classList.add('hidden'); return; }
    if (el.innerHTML !== html) el.innerHTML = html;
    el.classList.remove('hidden');
  }
  setCrosshair(active, visible = true) { const c = $('crosshair'); c.classList.toggle('target', active); c.style.display = visible ? '' : 'none'; }
  setMode(mode, touch, machine = null) {
    $('vehicleHud').classList.toggle('hidden', mode !== 'machine');
    if (machine) {
      $('vhName').textContent = machine.spec.name;
      $('vhToolLbl').textContent = { grapple: 'Grapple', shear: 'Shear', orangepeel: 'Grab', pulverizer: 'Jaws', breaker: 'Hammer', skip: 'Gate', bucket: 'Bucket', bigbucket: 'Bucket', minibucket: 'Bucket', tank: 'Tank' }[machine.spec.attach];
      const tg = $('tbGrab'); if (tg) tg.innerHTML = machine.spec.attach === 'breaker' ? '🔨<small>HAMMER</small>' : machine.spec.attach === 'skip' ? '🚪<small>GATE</small>' : machine.att.behaviour === 'scoop' ? '🪣<small>—</small>' : '✊<small>GRAB</small>';
    }
    $('keyHints').innerHTML = mode === 'machine'
      ? '<kbd>W</kbd><kbd>S</kbd> drive · <kbd>A</kbd><kbd>D</kbd> steer<br><kbd>←</kbd><kbd>→</kbd> swing · <kbd>↑</kbd><kbd>↓</kbd> boom<br><kbd>R</kbd><kbd>F</kbd> arm · <kbd>Z</kbd><kbd>X</kbd> curl / dump<br><kbd>Click</kbd>/<kbd>Space</kbd> tool · <kbd>C</kbd> camera · <kbd>E</kbd> exit'
      : '<kbd>Click</kbd> hammer · <kbd>Q</kbd> pick up · <kbd>G</kbd> throw<br><kbd>E</kbd> use · <kbd>B</kbd> spawn · <kbd>M</kbd> multiplayer';
    if (touch) {
      $('tbtns-foot').classList.toggle('hidden', mode !== 'foot');
      $('tbtns-exc').classList.toggle('hidden', mode !== 'machine');
      $('stickR').classList.toggle('hidden', mode !== 'machine');
      $('tbCam').classList.toggle('hidden', mode !== 'machine');
      $('stickLLabel').textContent = mode === 'machine' ? 'DRIVE' : 'MOVE';
    }
  }
  setUseButton(label) { const b = $('tbUse'); if (!label) { b.classList.add('hidden'); return; } if (b.textContent !== label) b.textContent = label; b.classList.remove('hidden'); }
  setVehicle(m) {
    const a = m.att;
    $('vhGrab').textContent = a.behaviour === 'breaker' ? (m.openTarget > 0.5 ? 'ON' : 'OFF') : a.behaviour === 'skip' ? (m.open > 0.5 ? 'OPEN' : 'CLOSED') : a.behaviour === 'scoop' ? (m.payload.kg ? m.payload.kind : 'empty') : (m.open > 0.5 ? 'OPEN' : 'CLOSED');
    const cap = a.bulk ? a.bulk.capacity * m.s ** 3 : Math.max(1, a.pieces);
    $('vhLoad').textContent = a.bulk ? (m.payload.kg ? `${Math.round(m.payload.kg)} ${m.payload.kind === 'water' ? 'L water' : 'kg ' + m.payload.kind}` : (m.held.length ? `${m.held.length} pcs` : 'empty')) : `${m.held.length} pcs`;
    $('vhFill').style.width = (a.bulk ? Math.min(100, m.payload.kg / cap * 100) : Math.min(100, m.held.length / cap * 100)) + '%';
    $('vhFill').style.background = m.payload.kind === 'water' ? '#3d7080' : m.payload.kg ? hex(m.payload.color) : '#7fd0ff';
  }
}
