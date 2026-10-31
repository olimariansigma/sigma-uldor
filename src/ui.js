// DOM HUD, shop / jobs panels, toasts and floating money popups.
import * as THREE from 'three';
import { JOBS } from './jobs.js';

export const UPGRADES = [
  { id: 'hammer', icon: '🔨', name: 'Hammer', desc: (l) => ['Club hammer – 2 hits per brick', 'Steel sledge – 1 hit per brick', 'Heavy sledge – smashes nearby bricks too', 'Demolition breaker – wide smash radius'][l],
    levels: [0, 150, 650, 2200] },
  { id: 'carry', icon: '💪', name: 'Strength', desc: (l) => `Carry ${[3, 5, 8, 12, 20][l]} pieces of rubble`, levels: [0, 100, 350, 1000, 2600] },
  { id: 'rate', icon: '⚙️', name: 'Crusher Motor', desc: (l) => `Crush ${[1, 1.6, 2.5, 4, 6][l]} pieces per second`, levels: [0, 220, 800, 2200, 5200] },
  { id: 'sorter', icon: '💎', name: 'Gravel Sorter', desc: (l) => `Sell gravel for x${[1, 1.5, 2, 3][l]} value`, levels: [0, 400, 1600, 4800] },
  { id: 'excavator', icon: '🚜', name: 'TX330 Excavator', desc: (l) => l ? 'Owned – press E next to the cab to drive it' : 'Tracked demolition excavator with a sorting grapple', levels: [0, 900] },
  { id: 'grapple', icon: '🦾', name: 'Grapple Jaws', desc: (l) => `Excavator grabs up to ${[6, 10, 16, 24][l]} pieces`, levels: [0, 550, 1600, 3800], requires: 'excavator' },
];
export const STATS = {
  hammer: [{ dmg: 1, splash: 0 }, { dmg: 2, splash: 0 }, { dmg: 3, splash: 0.5 }, { dmg: 5, splash: 0.85 }],
  carry: [3, 5, 8, 12, 20], rate: [1, 1.6, 2.5, 4, 6], sorter: [1, 1.5, 2, 3], grapple: [6, 10, 16, 24],
};

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.popups = [];
    this.tab = 'tools';
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close(b.dataset.close)));
    $('shopBtn').addEventListener('click', () => this.toggle('shop'));
    $('helpBtn').addEventListener('click', () => this.toggle('help'));
    $('settingsBtn').addEventListener('click', () => this.toggle('settings'));
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { this.tab = t.dataset.tab; this.renderShop(); }));
    for (const id of ['shopBtn', 'helpBtn', 'settingsBtn']) $(id).addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
  }

  isOpen() { return ['shop', 'help', 'settings'].some((id) => !$(id).classList.contains('hidden')); }
  toggle(id) { if ($(id).classList.contains('hidden')) this.open(id); else this.close(id); }
  open(id) {
    for (const o of ['shop', 'help', 'settings']) if (o !== id) $(o).classList.add('hidden');
    $(id).classList.remove('hidden');
    if (id === 'shop') this.renderShop();
    this.game.input.releaseLock();
    this.game.audio.click();
  }
  close(id) { $(id).classList.add('hidden'); this.game.audio.click(); }

  renderShop() {
    const g = this.game, s = g.save;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === this.tab));
    const body = $('shopBody');
    body.innerHTML = '';
    if (this.tab === 'tools') {
      for (const u of UPGRADES) {
        const lvl = s.up[u.id] || 0;
        const max = lvl >= u.levels.length - 1;
        const cost = max ? 0 : u.levels[lvl + 1];
        const locked = u.requires && !s.up[u.requires];
        const el = document.createElement('div'); el.className = 'item';
        const pips = u.levels.length > 2 ? `<div class="pips">${u.levels.map((_, i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('')}</div>` : '';
        el.innerHTML = `<div class="ico">${u.icon}</div><div class="info"><b>${u.name}</b><div class="desc">${u.desc(lvl)}${!max ? `<br><span style="color:#f2b705">Next: ${u.desc(lvl + 1)}</span>` : ''}</div>${pips}</div>`;
        const btn = document.createElement('button'); btn.className = 'buy';
        if (max) { btn.textContent = 'MAXED'; btn.classList.add('max'); btn.disabled = true; }
        else if (locked) { btn.textContent = 'Needs excavator'; btn.disabled = true; }
        else { btn.textContent = `$${cost.toLocaleString()}`; btn.disabled = s.money < cost; }
        btn.addEventListener('click', () => g.buyUpgrade(u.id));
        el.appendChild(btn); body.appendChild(el);
      }
    } else {
      JOBS.forEach((j, i) => {
        const unlocked = s.unlocked.includes(j.id), done = s.done.includes(j.id), current = s.job === i;
        const prevDone = i === 0 || s.done.includes(JOBS[i - 1].id);
        const el = document.createElement('div'); el.className = 'item';
        el.innerHTML = `<div class="ico">${['🏠', '🏡', '🏭'][i]}</div><div class="info"><b>${j.name}</b>${done ? ' <span style="color:#6ee36a">✔ completed</span>' : ''}${current ? ' <span style="color:#f2b705">● on site</span>' : ''}<div class="desc">${j.desc}<br>Completion bonus: <b style="color:#7dff7a">$${j.bonus.toLocaleString()}</b></div></div>`;
        const btn = document.createElement('button'); btn.className = 'buy';
        if (!unlocked) {
          btn.textContent = prevDone ? `Unlock $${j.cost.toLocaleString()}` : 'Finish previous job';
          btn.disabled = !prevDone || s.money < j.cost;
        } else { btn.textContent = current ? 'Rebuild site' : 'Start job'; }
        btn.addEventListener('click', () => g.startJob(i));
        el.appendChild(btn); body.appendChild(el);
      });
    }
  }

  toast(msg, good = false, ms = 3200) {
    const el = document.createElement('div'); el.className = 'toast' + (good ? ' good' : ''); el.innerHTML = msg;
    $('toasts').appendChild(el);
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
    const w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    this.popups = this.popups.filter((p) => {
      p.t += dt;
      if (p.t > 1.4) { p.el.remove(); return false; }
      v.copy(p.pos); v.y += p.t * 1.2;
      v.project(camera);
      if (v.z > 1) { p.el.style.display = 'none'; return true; }
      p.el.style.display = '';
      p.el.style.left = ((v.x + 1) / 2 * w) + 'px';
      p.el.style.top = ((1 - v.y) / 2 * h) + 'px';
      p.el.style.opacity = String(Math.min(1, (1.4 - p.t) * 2));
      return true;
    });
  }

  setMoney(m, bump = false) {
    $('moneyVal').textContent = Math.floor(m).toLocaleString();
    if (bump) { const el = $('money'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  setJob(name, prog) {
    $('jobName').textContent = name;
    $('jobFill').style.width = Math.min(100, prog * 100 / 0.9) + '%';
    $('jobPct').textContent = `${Math.floor(prog * 100)}% cleared · goal 90%`;
  }
  setCarry(n, cap) {
    const el = $('carry');
    el.classList.toggle('hidden', n === 0);
    el.classList.toggle('full', n >= cap);
    $('carryVal').textContent = `${n}/${cap}`;
  }
  setPrompt(html) {
    const el = $('prompt');
    if (!html) { el.classList.add('hidden'); return; }
    if (el.innerHTML !== html) el.innerHTML = html;
    el.classList.remove('hidden');
  }
  setCrosshair(active, visible = true) {
    const c = $('crosshair'); c.classList.toggle('target', active); c.style.display = visible ? '' : 'none';
  }
  setMode(mode, touch) {
    $('vehicleHud').classList.toggle('hidden', mode !== 'excavator');
    $('keyHints').innerHTML = mode === 'excavator'
      ? '<kbd>W</kbd><kbd>S</kbd> drive · <kbd>A</kbd><kbd>D</kbd> steer<br><kbd>←</kbd><kbd>→</kbd> swing · <kbd>↑</kbd><kbd>↓</kbd> boom<br><kbd>R</kbd><kbd>F</kbd> arm · <kbd>Z</kbd><kbd>X</kbd> curl<br><kbd>Click</kbd>/<kbd>Space</kbd> grapple · <kbd>C</kbd> camera · <kbd>E</kbd> exit'
      : '<kbd>Click</kbd> hammer · <kbd>Q</kbd> pick up · <kbd>G</kbd> throw<br><kbd>E</kbd> use · <kbd>B</kbd> shop · <kbd>H</kbd> help';
    if (touch) {
      $('tbtns-foot').classList.toggle('hidden', mode !== 'foot');
      $('tbtns-exc').classList.toggle('hidden', mode !== 'excavator');
      $('stickR').classList.toggle('hidden', mode !== 'excavator');
      $('tbCam').classList.toggle('hidden', mode !== 'excavator');
      $('stickLLabel').textContent = mode === 'excavator' ? 'DRIVE' : 'MOVE';
    }
  }
  setUseButton(label) {
    const b = $('tbUse');
    if (!label) { b.classList.add('hidden'); return; }
    b.textContent = label; b.classList.remove('hidden');
  }
  setVehicle(open, load, cap) {
    $('vhGrab').textContent = open > 0.5 ? 'OPEN' : 'CLOSED';
    $('vhLoad').textContent = `${load}/${cap}`;
  }
}
