// DOM HUD and panels (sandbox spawn menu, multiplayer, save slots, mixer, toasts).
import * as THREE from 'three';
import { MACHINES, BASE_MACHINES, TRUCK_SIZES, truckVariants, controlsFor } from './machines.js';
import { BUILDINGS } from './buildings.js';
import { fmtKg, fmtL, KG } from './crusher.js';
import { ic, iconize, fillIcons } from './icons.js';
import { MAX_CHARGES } from './fun.js';
import { paintOf } from './mx-vehicles.js';
import { RANKS, money } from './contracts.js';
import { TOOLS, UPGRADES, machinePrice, forSale, BUILDING_PRICE, Progression } from './progression.js';

const $ = (id) => document.getElementById(id);
const PANELS = ['spawn', 'multi', 'save', 'mixerPanel', 'help', 'settings', 'menu', 'contracts'];
const hex = (c) => '#' + c.getHexString();
const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const THUMB = (id) => `thumbs/m_${id}.webp`;
const TOOL = { brickclamp: 'Rotating brick clamp', grapple: 'Sorting grapple', shear: 'Demolition shear', claw: 'Log claw', bucket: 'Digging bucket', bigbucket: 'Rock bucket', minibucket: 'Mini bucket', crusher: 'Crusher bucket',
  breaker: 'Hydraulic breaker', orangepeel: 'Orange-peel grab', pulverizer: 'Pulverizer', tank: 'Water tank', skip: 'Concrete skip',
  magnet: 'Electromagnet', xball: 'Wrecking ball on a chain', blaster: 'Suction blaster + block cage', cutter: 'Twin drum cutter', saw: 'Diamond rock saw', auger: 'Auger drill', plate: 'Vibratory plate', forks: 'Pallet forks', jet: 'High-pressure water jet' };
const FAMILY = { roller: ['Tandem roller', 'Twin vibrating drums', 'Articulated drums'], paver: ['Paver', 'Hopper + screed', 'Rubber tracks'], loader: ['Wheel loader', '3 m bucket', 'Articulated wheels'],
  dozer: ['Bulldozer', 'Blade + ripper', 'Steel tracks'], dumper: ['Tracked dumper', 'Slewing tipping skip', 'Rubber tracks'], crane: ['Crawler crane', 'Wrecking ball', 'Crawler tracks'], painter: ['Road painter', 'Spray bar · 8 colours', '4x2 truck'], truck: ['Tipper truck', 'Tipping body', '8x4 · 2 steered axles'] };
const UNDER = { steel: 'Steel tracks', rubber: 'Rubber tracks', wheels: 'Wheels + outriggers', pontoon: 'Floating pontoons', spider: 'Walking legs', robot: 'Remote tracks', backhoe: '4 wheels + stabiliser legs' };
const TONS = { wh200: 38, bg90: 24, tx330: 30, k35: 3.5, hr450: 46, mw180: 18, tx700: 70, bx220: 22, mh24: 24, wh75: 7.5, amx: 25, gp300: 32, gx250: 26, lc200: 20, sx5: 9, dr160: 1.6, cr64: 9, ap600: 18, wl950: 24, dz80: 22, td6: 6, cc250: 80, lp20: 9 };
export function machineInfo(sp) {
  if (sp.family === 'excavator') {
    const type = sp.under === 'backhoe' ? 'Backhoe loader' : sp.under === 'robot' ? 'Demolition robot' : sp.under === 'spider' ? 'Walking excavator' : sp.under === 'wheels' ? (sp.cab === 'elevated' ? 'Wheeled material handler' : 'Wheeled excavator') : sp.under === 'pontoon' ? 'Amphibious excavator' : sp.boom === 'long' ? 'High-reach demolition' : sp.scale < 0.6 ? 'Mini excavator' : 'Crawler excavator';
    return { type, tool: TOOL[sp.attach] || 'Attachment', drive: UNDER[sp.under] || 'Tracks', tons: TONS[sp.id] ?? sp.tons, speed: sp.speed, tool2: sp.under === 'backhoe' ? 'Front loader bucket' : null };
  }
  if (sp.family === 'truck') {
    const z = TRUCK_SIZES[sp.size];
    return { type: `${z.label} tipper truck · ${z.drive}`, tool: sp.toolName, drive: `${z.drive} · ${z.axles.length} axles`, tons: sp.tons, speed: sp.speed };
  }
  const f = FAMILY[sp.family] || ['Machine', 'Tool', 'Tracks'];
  return { type: f[0], tool: f[1], drive: f[2], tons: TONS[sp.id] ?? sp.tons, speed: sp.speed };
}

export class UI {
  constructor(game) {
    this.game = game;
    this.popups = [];
    this.tab = 'machines';
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close(b.dataset.close)));
    $('spawnBtn').addEventListener('click', () => this.toggle('spawn'));
    $('multiBtn').addEventListener('click', () => this.toggle('multi'));
    $('saveBtn').addEventListener('click', () => this.toggle('save'));
    $('menuBtn').addEventListener('click', () => this.toggle('menu'));
    $('career').addEventListener('click', () => this.toggle('contracts'));
    $('career').addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    $('helpBtn').addEventListener('click', () => this.toggle('help'));
    $('settingsBtn').addEventListener('click', () => this.toggle('settings'));
    document.querySelectorAll('#spawn .tab').forEach((t) => t.addEventListener('click', () => { this.tab = t.dataset.tab; this.renderSpawn(); }));
    for (const id of ['spawnBtn', 'multiBtn', 'saveBtn', 'menuBtn', 'helpBtn', 'settingsBtn']) $(id).addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.cache = {};
    fillIcons();
    this.setupShowroom();
    document.querySelectorAll('#hotbar .hb').forEach((b) => {
      b.addEventListener('click', (e) => { e.stopPropagation(); this.game.selectTool(b.dataset.tool); });
      b.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    });
  }

  isOpen() { return PANELS.some((id) => !$(id).classList.contains('hidden')) || !!(this.game.showroom && this.game.showroom.active); }
  toggle(id) { if ($(id).classList.contains('hidden')) this.open(id); else this.close(id); }
  syncOpen() { document.body.classList.toggle('panel-open', PANELS.some((o) => !$(o).classList.contains('hidden'))); }
  open(id) {
    if (id === 'multi' && this.game.prog) { this.toast('🔨 Progression is a solo career. Play together in <b>Sandbox</b> mode (main menu)'); return; }
    for (const o of PANELS) if (o !== id) $(o).classList.add('hidden');
    $(id).classList.remove('hidden');
    this.syncOpen();
    this.refreshPanel(id);
    this.game.input.releaseLock();
    this.game.audio.click();
  }
  // gamepad: B goes back, D-pad / stick moves between buttons, A presses, LB / RB switch tabs
  padBack() {
    if (this.game.showroom && this.game.showroom.active) { this.closeShowroom(); this.open('spawn'); return; }
    for (const o of PANELS) if (!$(o).classList.contains('hidden')) this.close(o);
  }
  padScope() {
    if (this.game.showroom && this.game.showroom.active) return $('showroomUI');
    for (const o of PANELS) if (!$(o).classList.contains('hidden')) return $(o);
    return null;
  }
  padNav(P, scope = this.padScope()) {
    if (!scope) return;
    if (P.has('navB') && scope.id !== 'titleMenu') { this.padBack(); return; }
    const tabs = [...scope.querySelectorAll('.tab')];
    if (tabs.length && (P.has('navTabL') || P.has('navTabR'))) {
      const i = Math.max(0, tabs.findIndex((t) => t.classList.contains('active')));
      tabs[(i + (P.has('navTabR') ? 1 : -1) + tabs.length) % tabs.length].click(); return;
    }
    const items = [...scope.querySelectorAll('button, input, select, .mcard')].filter((e) => !e.disabled && e.offsetParent !== null && !e.closest('.hidden'));
    if (!items.length) return;
    let cur = document.activeElement; if (!items.includes(cur)) cur = null;
    if (P.has('navA')) { if (cur) cur.click(); else items[0].focus(); return; }
    const dir = P.has('navU') ? [0, -1] : P.has('navD') ? [0, 1] : P.has('navL') ? [-1, 0] : P.has('navR') ? [1, 0] : null;
    if (!dir) return;
    if (!cur) { items.forEach((e) => { if (!e.tabIndex || e.tabIndex < 0) e.tabIndex = 0; }); items[0].focus(); items[0].scrollIntoView({ block: 'nearest' }); return; }
    const r0 = cur.getBoundingClientRect(), c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
    let best = null, bd = Infinity;
    for (const e of items) {
      if (e === cur) continue;
      const r = e.getBoundingClientRect(), dx = r.left + r.width / 2 - c0[0], dy = r.top + r.height / 2 - c0[1];
      const along = dx * dir[0] + dy * dir[1]; if (along <= 4) continue;
      const across = Math.abs(dx * dir[1] - dy * dir[0]);
      const d = along + across * 2.2; if (d < bd) { bd = d; best = e; }
    }
    if (best) { if (!best.tabIndex || best.tabIndex < 0) best.tabIndex = 0; best.focus(); best.scrollIntoView({ block: 'nearest' }); }
  }
  close(id) { $(id).classList.add('hidden'); this.syncOpen(); this.game.audio.click(); }
  refreshPanel(id) {
    if (id === 'spawn') this.renderSpawn();
    if (id === 'multi') this.renderMulti();
    if (id === 'save') this.renderSave();
    if (id === 'menu') this.renderMenu();
    if (id === 'contracts') this.renderContracts();
    if (id === 'mixerPanel') this.renderMixer();
  }
  refreshOpen() { for (const id of ['spawn', 'multi', 'save', 'mixerPanel']) if (!$(id).classList.contains('hidden')) this.refreshPanel(id); }

  btn(label, cls, fn, disabled = false) {
    const b = document.createElement('button'); b.className = 'buy ' + (cls || ''); b.innerHTML = iconize(label); b.disabled = disabled;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }

  // ------------------------------------------------------------------ spawn menu
  renderSpawn() {
    const g = this.game;
    const prog = g.prog;
    document.querySelectorAll('#spawn .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === this.tab));
    document.querySelector('#spawn .panel-head h2').innerHTML = prog ? `Shop <span class="wallet">${money(prog.money)}</span>` : 'Sandbox';
    const body = $('spawnBody'); body.innerHTML = '';
    if (this.tab === 'machines') {
      const n = g.machines.size;
      const head = document.createElement('div'); head.className = 'sect'; head.textContent = prog ? `Your machines ${n} / 20 · tap one to look at it in 3D and buy it` : `Machines on site ${n} / 20 · tap one to inspect it in 3D`;
      body.appendChild(head);
      let lastFam = null, grid = null;
      const FAM = { excavator: 0, truck: 1 };
      const list = prog ? BASE_MACHINES.filter(forSale).sort((a, b) => ((FAM[a.family] ?? 2) - (FAM[b.family] ?? 2)) || machinePrice(a) - machinePrice(b)) : BASE_MACHINES; // cheapest first in each group
      for (const sp of list) {
        const famOf = (x) => x.family === 'excavator' ? 'Excavators' : x.family === 'truck' ? 'Tipper trucks' : 'Road & site machines';
        const fam = famOf(sp);
        if (fam !== lastFam) {
          lastFam = fam;
          const h = document.createElement('div'); h.className = 'sect'; h.textContent = fam + ` (${list.filter((x) => famOf(x) === fam).length})`; body.appendChild(h);
          grid = document.createElement('div'); grid.className = 'cards'; body.appendChild(grid);
        }
        const info = machineInfo(sp);
        const c = document.createElement('div'); c.className = 'mcard';
        c.innerHTML = `<div class="shot"><img src="${THUMB(sp.id)}" alt="" loading="lazy" draggable="false"></div>
          <span class="chip">${info.tool}</span><span class="paint" style="background:#${new THREE.Color(sp.paint).getHexString()}"></span>
          <div class="meta"><div class="brand">${sp.brand}</div><div class="model">${sp.model}</div><div class="desc">${info.type} · ${info.tons} t</div></div>`;
        if (prog) { const pr = machinePrice(sp); c.insertAdjacentHTML('beforeend', `<span class="price${prog.canAfford(pr) ? '' : ' poor'}">${money(pr)}</span>`); }
        c.addEventListener('click', () => this.openShowroom(sp.id));
        grid.appendChild(c);
      }
      if (n) {
        const h2 = document.createElement('div'); h2.className = 'sect'; h2.style.marginTop = '16px'; h2.textContent = prog ? 'Your machines (sell them back for half price)' : 'On site now'; body.appendChild(h2);
        for (const m of g.machines.values()) {
          const row = document.createElement('div'); row.className = 'slot';
          row.innerHTML = `<img class="thumb" src="${THUMB(m.spec.id)}" alt=""><div class="info"><b>${m.spec.brand} ${m.spec.model}</b><br>${m.driver >= 0 ? ic('user', 'inl') + 'driven by ' + g.playerName(m.driver) : 'parked'}</div>`;
          const sell = prog && m.family !== 'car' ? Math.round(machinePrice(m.spec) / 2 / 50) * 50 : 0;
          row.appendChild(this.btn(prog ? '💵 Sell ' + money(sell) : ic('trash', 'inl') + 'Remove', 'red', () => { if (prog && !confirm(`Sell the ${m.spec.brand} ${m.spec.model} for ${money(sell)}?`)) return; g.act('removeMachine', { id: m.id }); setTimeout(() => this.renderSpawn(), 150); }, (m.driver >= 0 && m.driver !== g.myId) || !!m.siteTruck));
          body.appendChild(row);
        }
      }
    } else if (this.tab === 'buildings') {
      const plots = ['Plot A (west)', 'Plot B (middle)', 'Plot C (east)'];
      const status = document.createElement('div'); status.className = 'sect';
      status.textContent = plots.map((p, i) => `${p}: ${g.plotName(i)}`).join(' · ');
      body.appendChild(status);
      if (prog) { const p = document.createElement('div'); p.className = 'sect'; p.innerHTML = `A new building to knock down costs <b>${money(BUILDING_PRICE)}</b> (it replaces what stands on that plot). Crushing it pays it back and more.`; body.appendChild(p); }
      const poor = prog && !prog.canAfford(BUILDING_PRICE);
      const grid = document.createElement('div'); grid.className = 'cards';
      for (const b of BUILDINGS) {
        const c = document.createElement('div'); c.className = 'mcard';
        c.innerHTML = `<div class="shot photo"><img src="thumbs/b_${b.id}.jpg" alt="" loading="lazy" draggable="false"></div><div class="meta"><div class="model">${b.name}</div><div class="desc">${b.desc}</div></div>`;
        const row = document.createElement('div'); row.className = 'row';
        ['A', 'B', 'C'].forEach((n, i) => row.appendChild(this.btn(n, i === 1 ? 'alt' : '', () => { if (prog && !confirm(`Buy the ${b.name} for ${money(BUILDING_PRICE)} on plot ${n}?`)) return; g.act('spawnBuilding', { def: b.id, plot: i }); this.close('spawn'); }, poor)));
        c.appendChild(row); grid.appendChild(c);
      }
      body.appendChild(grid);
      const row = document.createElement('div'); row.className = 'btn-row';
      ['A', 'B', 'C'].forEach((n, i) => row.appendChild(this.btn('Clear plot ' + n, 'red', () => g.act('clearPlot', { plot: i }))));
      body.appendChild(row);
    } else if (prog) {
      const h = document.createElement('div'); h.className = 'sect'; h.textContent = 'Tools'; body.appendChild(h);
      for (const [id, t] of Object.entries(TOOLS)) {
        const r = document.createElement('div'); r.className = 'slot shop-row';
        r.innerHTML = `<div class="ico big">${t.icon}</div><div class="info"><b>${t.name}</b><br><span class="dim">${t.what}</span></div>`;
        r.appendChild(prog.has(id) ? Object.assign(document.createElement('span'), { className: 'owned', textContent: '✓ Owned' })
          : this.btn('Buy ' + money(t.price), '', () => { prog.buyTool(id); this.renderSpawn(); }, !prog.canAfford(t.price)));
        body.appendChild(r);
      }
      const h2 = document.createElement('div'); h2.className = 'sect'; h2.style.marginTop = '14px'; h2.textContent = 'Upgrades'; body.appendChild(h2);
      for (const [id, u] of Object.entries(UPGRADES)) {
        const l = prog.up[id], max = l >= u.max, pr = max ? 0 : u.price(l);
        const r = document.createElement('div'); r.className = 'slot shop-row';
        r.innerHTML = `<div class="ico big">${u.icon}</div><div class="info"><b>${u.name}</b> · level ${l + 1} / ${u.max + 1}<br><span class="dim">${u.label(l)}${max ? ' (maxed)' : ' → ' + u.label(l + 1)}</span></div>`;
        r.appendChild(max ? Object.assign(document.createElement('span'), { className: 'owned', textContent: '★ Max' })
          : this.btn('Upgrade ' + money(pr), 'alt', () => { prog.buyUp(id); this.renderSpawn(); }, !prog.canAfford(pr)));
        body.appendChild(r);
      }
      const row = document.createElement('div'); row.className = 'btn-row';
      row.appendChild(this.btn('🧹 Remove loose rubble', 'red', () => { if (confirm('Throw away every loose block? (they would earn money in the crusher)')) g.act('clearRubble', {}); }));
      row.appendChild(this.btn('🫗 Empty mixer', 'red', () => g.act('mixer', { op: 'empty' })));
      row.appendChild(this.btn('📍 Back to spawn', 'alt', () => { g.player.teleport(g.spawnPoint()); this.close('spawn'); }));
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
  // big centre-screen popup (destruction combos, finished contracts, promotions)
  bigPop(html, cls = '') {
    const el = $('combo');
    el.innerHTML = html; el.className = cls;
    void el.offsetWidth; el.classList.add('pop');
  }

  // progression: a little "+$12" floating up from the wallet
  moneyTick(n) {
    const el = document.createElement('div'); el.className = 'mtick'; el.textContent = '+' + money(n);
    const r = $('career').getBoundingClientRect();
    el.style.left = (r.left + 12) + 'px'; el.style.top = (r.bottom + 2) + 'px';
    document.body.appendChild(el); setTimeout(() => el.remove(), 1500);
    this.setCareer();
  }

  // ------------------------------------------------------------------ contracts / career
  setCareer() {
    const c = this.game.contracts; if (!c) return;
    const r = c.rank, next = RANKS[r + 1];
    const prog = this.game.prog;
    const key = `${Math.round(prog ? prog.money : c.cash)}|${r}|${c.jobs.map((j) => j.id + ':' + Math.floor(Math.min(1, j.progress / j.target) * 40) + ':' + Math.ceil(j.bonusT / 10)).join(',')}`;
    if (this.cache.career === key) return;
    this.cache.career = key;
    $('cash').textContent = money(prog ? prog.money : c.cash);
    if (prog && !$('spawn').classList.contains('hidden')) { const w = document.querySelector('#spawn .wallet'); if (w) w.textContent = money(prog.money); }
    $('rankName').textContent = RANKS[r][1];
    $('rankBar').firstChild.style.width = (next ? Math.min(100, (c.earned - RANKS[r][0]) / (next[0] - RANKS[r][0]) * 100) : 100) + '%';
    $('jobsMini').innerHTML = c.jobs.map((j) => {
      const f = Math.min(1, j.progress / j.target);
      return `<div class="jm"><span class="ji">${j.icon}</span><span class="jt">${j.title}</span><span class="jp"><i style="width:${(f * 100).toFixed(0)}%"></i></span>${j.bonusT > 0 ? `<span class="jb">⏱${fmtT(j.bonusT)}</span>` : ''}</div>`;
    }).join('');
    if (!$('contracts').classList.contains('hidden')) this.renderContracts();
  }
  renderContracts() {
    const c = this.game.contracts, body = $('contractsBody'); if (!c) return;
    const r = c.rank, next = RANKS[r + 1];
    const prog = this.game.prog;
    const head = `<div class="car-head"><div><div class="dim">${prog ? 'Wallet' : 'Company cash'}</div><b class="big">${money(prog ? prog.money : c.cash)}</b></div><div><div class="dim">Rank</div><b>${RANKS[r][1]}</b>${next ? `<div class="dim small">${money(next[0] - c.earned)} more to ${next[1]}</div>` : '<div class="dim small">Top rank!</div>'}</div><div><div class="dim">Jobs done</div><b>${c.done}</b></div></div>`;
    body.innerHTML = head + '<div class="jobs"></div><p class="dim small">Finish a contract inside its ⏱ time for a 50% speed bonus. Your career is saved on this device and counts in any world, alone or with a crew. <kbd>J</kbd> opens this board.</p>';
    const list = body.querySelector('.jobs');
    for (const j of c.jobs) {
      const f = Math.min(1, j.progress / j.target), card = document.createElement('div'); card.className = 'job';
      const amount = j.type === 'demolish' ? `${Math.round(f * 100)}%` : j.type === 'crush' || j.type === 'cement' ? `${Math.round(j.progress * 4 / 459).toLocaleString('en-US')} / ${Math.round(j.target * 4 / 459).toLocaleString('en-US')} kg` : `${Math.floor(j.progress)} / ${j.target}`;
      card.innerHTML = `<div class="job-ico">${j.icon}</div><div class="job-main"><b>${j.title}</b><div class="dim small">${j.desc}</div><div class="job-bar"><i style="width:${(f * 100).toFixed(1)}%"></i></div><div class="job-meta"><span>${amount}</span><span class="pay">${money(j.reward)}${j.bonusT > 0 ? ` <em>+50% in ⏱${fmtT(j.bonusT)}</em>` : ''}</span></div></div>`;
      const sk = this.btn(c.skipT > 0 ? `Skip ${Math.ceil(c.skipT)}s` : 'Skip', 'alt', () => { if (c.skip(j.id)) { this.renderContracts(); this.setCareer(); } }, c.skipT > 0);
      sk.classList.add('job-skip'); card.appendChild(sk);
      list.appendChild(card);
    }
  }

  renderMenu() {
    const g = this.game, body = $('menuBody'); body.innerHTML = '';
    const row = document.createElement('div'); row.className = 'btn-row'; row.style.flexDirection = 'column';
    row.appendChild(this.btn('▶ Resume', '', () => this.close('menu')));
    row.appendChild(this.btn('📋 Contracts', 'alt', () => this.open('contracts')));
    const inc = g.incidents;
    if (!g.net.isClient) {
      if (inc.state) row.appendChild(this.btn('🚨 Hand this accident to another crew', 'alt', () => { g.act('incident', { op: 'skip' }); this.close('menu'); }));
      else row.appendChild(this.btn(`🚨 Report an accident now (next in ${Math.floor(inc.nextT / 60)}:${String(Math.floor(inc.nextT % 60)).padStart(2, '0')})`, 'alt', () => { g.act('incident', { op: 'start' }); this.close('menu'); }));
    }
    if (g.prog) row.appendChild(this.btn('🔄 Start over', 'red', () => this.progReset()));
    else row.appendChild(this.btn('🔄 New world', 'red', () => { if (confirm('Start a fresh world? (unsaved progress is lost)')) { g.act('newWorld', {}); this.close('menu'); } }, g.net.isClient));
    row.appendChild(this.btn('🏠 Main menu', 'alt', () => { if (g.prog) { g.progSave(); location.reload(); } else if (confirm('Go back to the main menu? (unsaved progress is lost, save first)')) location.reload(); }));
    body.appendChild(row);
    if (g.net.isClient) { const n = document.createElement('div'); n.className = 'dim'; n.style.marginTop = '8px'; n.textContent = 'Only the host can start a new world.'; body.appendChild(n); }
  }
  progReset() {
    const g = this.game;
    if (!confirm('Start progression over from scratch? Your money, tools, machines and house are wiped.')) return;
    g.prog.dead = true; Progression.reset(); g.deleteSlot('prog'); location.reload();
  }
  renderSave() {
    const g = this.game, body = $('saveBody');
    body.innerHTML = '';
    if (g.prog) {
      const p = g.prog;
      body.innerHTML = `<p>Progression saves itself every minute, after each purchase and when you close the game. Pick up where you left off with <b>PROGRESSION</b> on the main menu.</p>
        <div class="car-head"><div><div class="dim">Wallet</div><b class="big">${money(p.money)}</b></div><div><div class="dim">Earned in total</div><b>${money(p.earned)}</b></div><div><div class="dim">Crushed</div><b>${fmtKg(p.crushedKg / KG)}</b></div><div><div class="dim">Best house</div><b>${p.laidMax} blocks</b></div></div>`;
      const row = document.createElement('div'); row.className = 'btn-row';
      row.appendChild(this.btn('💾 Save now', '', () => { g.progSave(); this.toast('💾 Saved', true); }));
      row.appendChild(this.btn('🔄 Start over', 'red', () => this.progReset()));
      body.appendChild(row);
      return;
    }
    const info = document.createElement('p');
    info.innerHTML = g.net.isClient ? 'You can save the shared world to your device. To play a saved world, load it in solo mode or host it yourself.' : 'Saves the whole world: buildings, every loose block, machines, dust pile, mixer and road.';
    body.appendChild(info);
    for (const slot of ['auto', '1', '2', '3', '4', '5']) {
      const meta = g.slotMeta(slot);
      const r = document.createElement('div'); r.className = 'slot';
      r.innerHTML = `<div class="ico">${ic(slot === 'auto' ? 'clock' : 'save')}</div><div class="info"><b>${slot === 'auto' ? 'Autosave' : 'Slot ' + slot}</b><br>${meta ? new Date(meta.time).toLocaleString() + ' · ' + meta.summary : '<span style="opacity:.6">empty</span>'}</div>`;
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
    const me = g.players.get(g.myId), tc = me ? me.cement : { kg: 0 };
    const key = [mx.dust | 0, mx.water | 0, mx.progress != null ? Math.round(mx.progress * 10) : 0, mx.cement | 0, mx.status, g.bucket.kind, g.bucket.kg | 0, g.crusher.pileKg | 0, tc.kg | 0].join('|');
    if (this.cache.mixer === key && body.children.length) return;
    this.cache.mixer = key;
    const fillPct = Math.min(100, (mx.volume / mx.capacity) * 100), full = mx.room('dust') < 1;
    body.innerHTML = `
      <div class="mix-grid">
        <div class="mix-cell"><div>Dust</div><div class="v">${fmtKg(mx.dust)}</div><div class="sw" style="background:${hex(mx.dustCol)};opacity:${mx.dust ? 1 : 0.2}"></div></div>
        <div class="mix-cell"><div>Water</div><div class="v">${fmtL(mx.water)}</div><div class="sw" style="background:#3d7080;opacity:${mx.water ? 1 : 0.2}"></div></div>
        <div class="mix-cell"><div>Cement</div><div class="v">${fmtKg(mx.cement)}</div><div class="sw" style="background:${hex(mx.cementCol)};opacity:${mx.cement ? 1 : 0.2}"></div></div>
      </div>
      <p><b>${full && mx.dust > 0 && !mx.water ? 'Tub full of dust: add water to mix it' : full ? 'Tub full' : mx.status}</b> · Tub ${Math.round(fillPct)} % full · Dust pile: <b>${fmtKg(g.crusher.pileKg)}</b> · Your trowel: <b>${fmtKg(tc.kg)}</b></p>`;
    const row = document.createElement('div'); row.className = 'btn-row';
    const step = 25 / KG;
    row.appendChild(this.btn(full ? '➕ Tub full' : '➕ 25 kg dust from the pile', '', () => g.act('mixer', { op: 'dust', kg: step }), g.crusher.pileKg < 1 || full));
    row.appendChild(this.btn('💧 Add water (hose)', 'alt', () => g.act('mixer', { op: 'water' }), mx.room('water') < 0.5));
    const b = g.bucket;
    if (b.kind && b.kind !== 'cement') row.appendChild(this.btn(`🪣 Pour my bucket of ${b.kind} in`, 'alt', () => g.act('bucketPour', { target: 'mixer' })));
    row.appendChild(this.btn(ic('trowel', 'inl') + 'Take cement on my trowel', '', () => { g.act('takeCement', {}); }, mx.cement < 0.5));
    row.appendChild(this.btn('🫗 Empty the tub', 'red', () => g.act('mixer', { op: 'empty' })));
    body.appendChild(row);
  }

  // tool slots: hammer / trowel with how much cement is on it
  setHotbar() {
    const g = this.game, me = g.players.get(g.myId);
    const kg = me ? me.cement.kg : 0;
    document.querySelectorAll('#hotbar .hb').forEach((b) => b.classList.toggle('on', b.dataset.tool === g.tool));
    const tb = document.querySelector('#hotbar [data-tool="trowel"]');
    tb.classList.toggle('empty', !(kg > 0));
    $('trowelAmt').textContent = kg > 0 ? fmtKg(kg) : 'empty';
    $('trowelSw').style.background = kg > 0 ? hex(me.cement.color) : 'transparent';
    if (g.charges) { const left = MAX_CHARGES - g.charges.mine(g.myId).length; $('chargeAmt').textContent = `${left} left`; }
    if (g.demo) $('buildAmt').textContent = String(g.carriedBy(g.myId).filter((p) => p.brick).length);
    if (g.prog) for (const id of Object.keys(TOOLS)) {
      const locked = !g.prog.has(id), b = document.querySelector(`#hotbar [data-tool="${id}"]`);
      b.classList.toggle('locked', locked);
      if (locked) $({ charges: 'chargeAmt', build: 'buildAmt' }[id]).textContent = '🔒' + money(TOOLS[id].price);
    }
    const big = document.querySelector('#tbtns-foot [data-act="hammer"]');
    if (big) { const want = g.tool === 'trowel' ? 'trowel' : g.tool === 'charges' ? 'bomb' : g.tool === 'build' ? 'brick' : g.tool === 'scrape' ? 'trash' : 'hammer'; if (big.dataset.t !== want) { big.dataset.t = want; big.innerHTML = ic(want) + `<small>${{ trowel: 'LAY', bomb: 'PLANT', hammer: 'SMASH', brick: 'BUILD', trash: 'REMOVE' }[want]}</small>`; } }
    if (g.player && g.player.avatar) g.player.avatar.setTool(g.tool, me && me.cement.kg > 0 ? me.cement.color : null);
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
  setNet(html) { const el = $('netBadge'); el.classList.toggle('hidden', !html); if (html && this.cache.net !== html) { this.cache.net = html; el.innerHTML = iconize(html); } }

  toast(msg, good = false, ms = 2600) {
    ms = Math.min(ms, 6000); // keep every notice short-lived
    const el = document.createElement('div'); el.className = 'toast' + (good ? ' good' : ''); el.innerHTML = iconize(msg);
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
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
    $('bucketVal').textContent = `${b.kind} ${b.kind === 'water' ? fmtL(b.kg) : fmtKg(b.kg)}`;
  }
  setPrompt(html) {
    const el = $('prompt');
    if (!html) { el.classList.add('hidden'); this.cache.prompt = null; return; }
    if (this.cache.prompt !== html) { this.cache.prompt = html; el.innerHTML = iconize(html); }
    el.classList.remove('hidden');
  }
  setCrosshair(active, visible = true) { const c = $('crosshair'); c.classList.toggle('target', active); c.style.display = visible ? '' : 'none'; }
  setMode(mode, touch, machine = null) {
    document.body.classList.toggle('in-machine', mode === 'machine');
    $('vehicleHud').classList.toggle('hidden', mode !== 'machine');
    $('hotbar').classList.toggle('hidden', mode === 'machine');
    if (machine) {
      const ctl = controlsFor(machine);
      const setBtn = (act, txt) => { const el = document.querySelector(`#tbtns-exc [data-act="${act}"]`); if (!el) return; el.classList.toggle('hidden', !txt); if (txt) el.innerHTML = txt.includes('<') ? iconize(txt) : `${ic({ stickOut: 'armOut', stickIn: 'armIn', curlIn: 'curlIn', curlOut: 'curlOut' }[act] || 'grab')}<small>${txt}</small>`; };
      setBtn('stickOut', ctl.stickOut); setBtn('stickIn', ctl.stickIn); setBtn('curlIn', ctl.curlIn); setBtn('curlOut', ctl.curlOut); setBtn('grab', ctl.grab);
      const rl = document.querySelector('#stickR label'); if (rl) rl.textContent = ctl.right || '';
      $('stickR').classList.toggle('nostick', !ctl.right);
      this.machineHint = ctl.hint;
      $('vhName').textContent = machine.spec.brand + ' ' + machine.spec.model;
      $('vhImg').src = THUMB(machine.spec.id);
      $('vhToolLbl').textContent = machine.frontFrame ? 'Front bucket' : { grapple: 'Grapple', shear: 'Shear', orangepeel: 'Grab', pulverizer: 'Jaws', breaker: 'Hammer', skip: 'Gate', bucket: 'Bucket', bigbucket: 'Bucket', minibucket: 'Bucket', tank: 'Tank', claw: 'Claw', crusher: 'Crusher', brickclamp: 'Clamp', magnet: 'Magnet', xball: 'Chain', blaster: 'Vacuum', cutter: 'Drums', saw: 'Saw', auger: 'Drill', plate: 'Plate', forks: 'Forks', jet: 'Jet' }[machine.spec.attach]
        || { car: 'Pickup', roller: 'Vibration', paver: 'Paving', loader: 'Bucket', dozer: 'Blade', dumper: 'Skip', crane: 'Wrecking ball', truck: 'Body', painter: 'Paint' }[machine.family] || 'Tool';
    }
    $('keyHints').innerHTML = mode === 'machine'
      ? '<kbd>W</kbd><kbd>S</kbd> drive · <kbd>A</kbd><kbd>D</kbd> steer<br>' + (this.machineHint || '') + '<br><kbd>C</kbd> camera · <kbd>E</kbd> exit'
      : '<kbd>Click</kbd> hammer · <kbd>Q</kbd> pick up · <kbd>G</kbd> throw<br><kbd>E</kbd> use · <kbd>B</kbd> spawn · <kbd>M</kbd> online';
    if (touch) {
      $('tbtns-foot').classList.toggle('hidden', mode !== 'foot');
      $('tbtns-exc').classList.toggle('hidden', mode !== 'machine');
      $('tbtns-rot').classList.toggle('hidden', mode !== 'machine' || !(machine && controlsFor(machine).rot));
      if (machine) { const rl = controlsFor(machine).rotLabels || ['ROT', 'ROT']; document.querySelectorAll('#tbtns-rot small').forEach((e, i) => { e.textContent = rl[i]; }); }
      $('stickR').classList.toggle('hidden', mode !== 'machine' || $('stickR').classList.contains('nostick'));
      $('tbCam').classList.toggle('hidden', mode !== 'machine');
      $('tbHorn').classList.toggle('hidden', mode !== 'machine');
      $('stickLLabel').textContent = mode === 'machine' ? 'DRIVE' : 'MOVE';
    }
  }
  setUseButton(label) { const b = $('tbUse'); if (!label) { b.classList.add('hidden'); return; } if (b.dataset.l !== label) { b.dataset.l = label; b.innerHTML = iconize(label); } b.classList.remove('hidden'); }
  setVehicle(m) {
    const a = m.att, b = a.behaviour, on = m.openTarget > 0.5;
    const st = { breaker: on ? 'ON' : 'OFF', crusher: on ? 'CRUSHING' : 'OFF', roller: on ? 'VIBRATING' : 'OFF', paver: on ? 'PAVING' : 'OFF', skip: m.open > 0.5 ? 'OPEN' : 'CLOSED',
      scoop: m.payload.kg ? m.payload.kind : m.held.length ? 'loaded' : 'empty', blade: 'ready',
      magnet: on ? 'ON' : 'OFF', xball: on ? 'LONG CHAIN' : 'SHORT CHAIN', blaster: on ? 'SUCKING' : 'OFF', cutter: on ? 'CUTTING' : 'OFF', saw: on ? 'SPINNING' : 'OFF', auger: on ? 'DRILLING' : 'OFF', plate: on ? 'VIBRATING' : 'OFF', forks: on ? 'LOCKED' : 'FREE', jet: on ? 'SPRAYING' : 'OFF', bed: 'ready', car: 'ready', paint: (on ? 'SPRAYING ' : '') + paintOf(m)[0], ball: m.ballSt ? m.ballSt.v.length().toFixed(1) + ' m/s' : '—' }[b];
    $('vhGrab').textContent = m.frontFrame ? (m.openTarget > 0.5 ? 'TIPPED' : 'READY') + ' · ' + (m.rot > 0.45 ? 'UP' : 'DOWN') : st ?? (m.open > 0.5 ? 'OPEN' : 'CLOSED');
    if (a.cap || m.magSlots) {
      const n = m.magSlots ? (m.held2 || []).length : m.held.length, c = m.magSlots ? m.magSlots.length : a.cap;
      $('vhLoad').textContent = `${n} / ${c} blocks`; $('vhFill').style.width = Math.min(100, n / c * 100) + '%'; $('vhFill').style.background = '#7fd0ff';
      return;
    }
    if (m.frontFrame && (m.held2 || []).length && !m.held.length && !m.payload.kg) { $('vhLoad').textContent = `front: ${m.held2.length} pcs`; $('vhFill').style.width = Math.min(100, m.held2.length * 20) + '%'; $('vhFill').style.background = '#7fd0ff'; return; }
    const cap = a.bulk ? m.capacity() : Math.max(1, a.pieces);
    $('vhLoad').textContent = a.bulk ? (m.payload.kg ? `${m.payload.kind === 'water' ? fmtL(m.payload.kg) + ' water' : fmtKg(m.payload.kg) + ' ' + m.payload.kind}` : (m.held.length ? `${m.held.length} pcs` : 'empty')) : a.pieces ? `${m.held.length} pcs` : '—';
    $('vhFill').style.width = (a.bulk ? Math.min(100, m.payload.kg / cap * 100) : Math.min(100, m.held.length / cap * 100)) + '%';
    $('vhFill').style.background = m.payload.kind === 'water' ? '#3d7080' : m.payload.kg ? hex(m.payload.color) : '#7fd0ff';
  }

  // ------------------------------------------------------------------ showroom (3D preview before spawning)
  setupShowroom() {
    const sr = () => this.game.showroom;
    $('srBack').addEventListener('click', () => { this.closeShowroom(); this.open('spawn'); });
    $('srPrev').addEventListener('click', () => this.stepShowroom(-1));
    $('srNext').addEventListener('click', () => this.stepShowroom(1));
    $('srSpawn').addEventListener('click', () => {
      const g = this.game, id = sr().spec.id;
      if (g.machines.size >= 20) return;
      if (g.prog && !g.prog.canAfford(machinePrice(sr().spec))) { g.prog.spend(machinePrice(sr().spec), 'The ' + sr().spec.brand + ' ' + sr().spec.model); return; }
      g.act('spawnMachine', { spec: id, near: g.player.pos.toArray(), yaw: g.cam.yaw + Math.PI });
      this.closeShowroom();
    });
    const drag = $('srDrag'), pts = new Map();
    let last = null, pinch = 0;
    drag.addEventListener('pointerdown', (e) => { drag.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; sr().dragging = true; sr().idleT = 0; });
    drag.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const s = sr();
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) s.zoom = Math.min(1.8, Math.max(0.45, s.zoom * pinch / d));
        pinch = d; return;
      }
      if (last) { s.spin += (e.clientX - last[0]) * 0.008; s.pitch = Math.min(0.75, Math.max(0.02, s.pitch + (e.clientY - last[1]) * 0.004)); }
      last = [e.clientX, e.clientY]; s.idleT = 0;
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (!pts.size) { sr().dragging = false; last = null; } };
    drag.addEventListener('pointerup', up); drag.addEventListener('pointercancel', up);
    drag.addEventListener('wheel', (e) => { const s = sr(); s.zoom = Math.min(1.8, Math.max(0.45, s.zoom * (1 + Math.sign(e.deltaY) * 0.08))); e.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (!sr() || !sr().active) return;
      if (e.code === 'ArrowLeft') this.stepShowroom(-1);
      if (e.code === 'ArrowRight') this.stepShowroom(1);
      if (e.code === 'Escape') { this.closeShowroom(); this.open('spawn'); }
      if (e.code === 'Enter') $('srSpawn').click();
    });
  }
  openShowroom(id) {
    const s = this.game.showroom;
    for (const o of PANELS) $(o).classList.add('hidden');
    this.syncOpen();
    s.active = true; s.zoom = 1; s.pitch = 0.2; s.spin = 0.7; s.idleT = 0;
    s.show(id);
    this.fillShowroom();
    $('showroomUI').classList.remove('hidden'); $('hud').classList.add('hidden'); $('touch').style.visibility = 'hidden';
    this.game.input.releaseLock();
    this.game.audio.click();
  }
  stepShowroom(d) {
    const s = this.game.showroom, cur = s.spec.variantOf || s.spec.id, i = BASE_MACHINES.findIndex((m) => m.id === cur);
    s.show(BASE_MACHINES[(i + d + BASE_MACHINES.length) % BASE_MACHINES.length].id);
    this.fillShowroom();
    this.game.audio.click();
  }
  fillShowroom() {
    const sp = this.game.showroom.spec, info = machineInfo(sp), g = this.game;
    $('srBrand').textContent = sp.brand; $('srModel').textContent = sp.model; $('srType').textContent = info.type;
    $('srDesc').textContent = sp.desc;
    const base = sp.variantOf ? MACHINES.find((x) => x.id === sp.variantOf) : sp;
    $('srCount').textContent = `${BASE_MACHINES.indexOf(base) + 1} / ${BASE_MACHINES.length}`;
    // trucks: size picker (small 4x2 / medium 6x4 / big 8x4)
    const sz = $('srSizes');
    if (sp.family === 'truck') {
      sz.classList.remove('hidden');
      sz.innerHTML = truckVariants(sp.id).map((v) => `<button class="sr-size${v.id === sp.id ? ' on' : ''}" data-id="${v.id}"><b>${TRUCK_SIZES[v.size].label}</b><small>${TRUCK_SIZES[v.size].drive}</small></button>`).join('');
      sz.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { this.game.showroom.show(b.dataset.id); this.fillShowroom(); this.game.audio.click(); }));
    } else { sz.classList.add('hidden'); sz.innerHTML = ''; }
    $('srStats').innerHTML = [['Tool', info.tool], ['Drive', info.drive], ['Weight', info.tons + ' t'], ['Top speed', Math.round(sp.speed * 3.6) + ' km/h']]
      .map(([k, v]) => `<div class="sr-stat"><span>${k}</span><b>${v}</b></div>`).join('');
    const full = g.machines.size >= 20;
    $('srSpawn').disabled = full;
    $('srNote').textContent = full ? 'Site is full (20 machines). Remove one first.' : `${g.machines.size} / 20 machines on site`;
    if (g.prog) {
      const pr = machinePrice(sp), sold = forSale(sp);
      $('srSpawn').innerHTML = ic('spawn') + (sold ? 'BUY · ' + money(pr) : 'NOT FOR SALE');
      $('srSpawn').disabled = full || !sold;
      $('srSpawn').classList.toggle('poor', sold && !g.prog.canAfford(pr));
      if (!full) $('srNote').textContent = !sold ? 'Road machines are not sold in progression mode (no potholes here)' : g.prog.canAfford(pr) ? `You have ${money(g.prog.money)}` : `You have ${money(g.prog.money)}: ${money(pr - g.prog.money)} more to go. Keep crushing!`;
    }
  }
  closeShowroom() {
    this.game.showroom.close();
    $('showroomUI').classList.add('hidden'); $('hud').classList.remove('hidden'); $('touch').style.visibility = '';
  }
}
