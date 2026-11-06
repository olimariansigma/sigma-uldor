// Contracts: a career on top of the sandbox. Three paid jobs are always on the board (flatten a building, crush
// rubble, fix potholes, smash big, break blocks with a given machine, press / lay blocks, mix cement, paint patches).
// Finishing one pays cash (half again as a speed bonus inside the bonus time) and puts a new one up. Total earnings
// set your company rank. The career is the player's own (saved in the browser with the settings), and it counts
// what happens in whatever world you play in, alone or with a crew.
import { SITE } from './site.js';
import { BRICK_KG } from './brickpress.js';

export const RANKS = [
  [0, 'Rookie'], [5000, 'Labourer'], [15000, 'Operator'], [35000, 'Foreman'], [70000, 'Site Manager'], [120000, 'Demolition Boss'], [200000, 'Wrecking Legend'],
];
export function rankOf(earned) { let i = 0; while (i + 1 < RANKS.length && earned >= RANKS[i + 1][0]) i++; return i; }
const KG = 4 / 459; // display kilograms per sim unit
const kgText = (u) => `${Math.round(u * KG).toLocaleString('en-US')} kg`;
export const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

const TYPES = [['demolish', 3], ['crush', 3], ['drive', 3], ['potholes', 2], ['smash', 2], ['press', 1], ['lay', 1], ['cement', 1], ['paint', 1]];

export class Contracts {
  constructor(game) {
    this.g = game;
    const c = game.prefs.career || {};
    this.cash = c.cash || 0; this.earned = c.earned || 0; this.done = c.done || 0; this.nextId = c.nextId || 1;
    this.jobs = Array.isArray(c.jobs) ? c.jobs : [];
    this.snap = null; this.t = 0; this.saveT = 0; this.dirty = false; this.skipT = 0;
  }
  get rank() { return rankOf(this.earned); }
  save() { this.g.prefs.career = { cash: Math.round(this.cash), earned: Math.round(this.earned), done: this.done, nextId: this.nextId, jobs: this.jobs }; this.g.savePrefs(); this.dirty = false; }

  // ---------------------------------------------------------------- the board
  fill() {
    let added = false;
    for (let tries = 0; this.jobs.length < 3 && tries < 40; tries++) {
      const j = this.make(this.pickType());
      if (j) { this.jobs.push(j); added = true; }
    }
    if (added) { this.dirty = true; this.g.ui.renderContracts && this.g.ui.renderContracts(); }
  }
  pickType() {
    // the press's block count only exists on the host: a joined player gets no press contracts
    const have = new Set(this.jobs.map((j) => j.type)), client = this.g.net && this.g.net.isClient;
    const prog = this.g.prog, owned = prog ? [...this.g.machines.values()].some((m) => m.family === 'excavator') : true;
    const pool = TYPES.filter(([t]) => (!have.has(t) || t === 'drive') && !(client && t === 'press') && !(prog && (t === 'potholes' || t === 'paint' || (t === 'drive' && !owned))));
    let sum = pool.reduce((s, [, w]) => s + w, 0), r = Math.random() * sum;
    for (const [t, w] of pool) { r -= w; if (r <= 0) return t; }
    return pool[0][0];
  }
  make(type) {
    const g = this.g, L = Math.min(6, this.rank), id = this.nextId++;
    const job = { id, type, progress: 0, bonusT: 300 + L * 30 };
    if (type === 'demolish') {
      const taken = new Set(this.jobs.filter((j) => j.type === 'demolish').map((j) => j.bid));
      const cands = [];
      g.plots.forEach((bid, plot) => {
        if (bid == null || taken.has(bid)) return;
        const b = g.demo.buildings[bid]; if (!b || b.removed) return;
        if (this.removedFrac(b) > 0.3) return;
        cands.push({ bid, plot, name: g.plotName(plot), count: b.count });
      });
      if (!cands.length) return null;
      const c = cands[Math.floor(Math.random() * cands.length)];
      Object.assign(job, { icon: '🏚️', bid: c.bid, title: `Flatten the ${c.name}`, desc: `Knock down 90% of the ${c.name} on plot ${SITE.plotNames[c.plot]}`, target: 0.9, reward: 1500 + Math.min(c.count, 1500) * 1.5 + L * 300, bonusT: 480 + L * 30 });
    } else if (type === 'crush') {
      const blocks = 18 + L * 10;
      Object.assign(job, { icon: '⚙️', title: `Crush ${kgText(blocks * BRICK_KG)}`, desc: 'Feed rubble to the crusher (by hand, with a machine or through the truck intake)', target: blocks * BRICK_KG, reward: 700 + blocks * 45 });
    } else if (type === 'drive') {
      // in progression: one of the excavators you own
      const pool = g.prog ? [...new Set([...g.machines.values()].filter((m) => m.family === 'excavator').map((m) => m.spec))] : g.machineSpecs().filter((s) => s.family === 'excavator' && s.id !== this.lastDrive);
      if (!pool.length) return null;
      const s = pool[Math.floor(Math.random() * pool.length)]; this.lastDrive = s.id;
      const n = 20 + L * 8;
      Object.assign(job, { icon: s.icon || '🚜', param: s.id, title: `${n} blocks with the ${s.brand} ${s.model}`, desc: `Break ${n} blocks loose while driving the ${s.name} (spawn it from the Spawn menu)`, target: n, reward: 900 + n * 45 });
    } else if (type === 'potholes') {
      const open = g.road.holes.filter((h) => !(h.comp >= 1 && h.filled >= h.need)).length; if (!open) return null;
      const n = Math.min(open, 1 + Math.floor(L / 2));
      Object.assign(job, { icon: '🛣️', title: `Fix ${n} pothole${n > 1 ? 's' : ''} perfectly`, desc: 'Fill with cement, then roll or tamp until it shows ⭐', target: n, reward: 1100 * n + L * 150, bonusT: 420 + L * 30 });
    } else if (type === 'smash') {
      const n = 15 + L * 7;
      Object.assign(job, { icon: '💥', title: `${n}-block smash`, desc: `Bring down ${n} blocks in one go (a combo): charges, a wrecking ball or a big push`, target: n, reward: 500 + n * 35 });
    } else if (type === 'press') {
      const n = 4 + L * 2;
      Object.assign(job, { icon: '🧱', title: `Press ${n} blocks`, desc: 'Feed dust to the brick press (feeder belt or a bucket in the hopper)', target: n, reward: 400 + n * 160 });
    } else if (type === 'lay') {
      const n = 4 + L * 3;
      Object.assign(job, { icon: '🏠', title: `Lay ${n} blocks`, desc: 'Build on the slab across the road: mortar first, then lay pressed blocks (tool 4)', target: n, reward: 500 + n * 220 });
    } else if (type === 'cement') {
      const u = (3 + L * 2) * BRICK_KG;
      Object.assign(job, { icon: '🪣', title: `Mix ${kgText(u)} of cement`, desc: 'Put dust and water in the mixer', target: u, reward: 600 + (3 + L * 2) * 140 });
    } else if (type === 'paint') {
      const n = 1 + Math.floor(L / 3);
      Object.assign(job, { icon: '🎨', title: `Paint ${n} repaired patch${n > 1 ? 'es' : ''}`, desc: 'Drive the LP20 road painter over a repaired pothole with the sprayer on', target: n, reward: 1000 * n + L * 120 });
    }
    job.reward = Math.round(job.reward / 50) * 50;
    return job.icon ? job : null;
  }
  skip(id) {
    if (this.skipT > 0) return false;
    this.jobs = this.jobs.filter((j) => j.id !== id); this.skipT = 20; this.fill(); this.dirty = true;
    return true;
  }
  removedFrac(b) { let intact = 0; for (let i = b.start; i < b.start + b.count; i++) if (this.g.demo.pieces[i].state === 0) intact++; return 1 - intact / b.count; }

  // ---------------------------------------------------------------- counting what happens
  counters() {
    const g = this.g, demo = g.demo;
    let laid = 0; for (const p of demo.pieces) if (p.brick && p.state === 0) laid++;
    return { crushed: g.crusher.totalKg, pressed: g.press.made || 0, laid, cement: g.mixer.cement, detached: demo.detachCount || 0, holes: g.road.holes };
  }
  // a new world (or a loaded save): count from here, never what was already there
  resync() {
    const c = this.counters();
    for (const h of c.holes) { if (h.comp >= 1 && h.filled >= h.need) h._perfect = true; if (h.paintAmt >= 1) h._painted = true; }
    this.snap = c;
  }
  update(dt) {
    const g = this.g;
    if (!this.jobs.length || this.jobs.length < 3) this.fill();
    this.skipT = Math.max(0, this.skipT - dt);
    for (const j of this.jobs) if (j.bonusT > 0) j.bonusT = Math.max(0, j.bonusT - dt);
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    const c = this.counters(), s = this.snap;
    if (!s || c.holes !== s.holes || c.crushed < s.crushed - 1 || c.pressed < s.pressed) { this.resync(); return; }
    const d = { crushed: Math.max(0, c.crushed - s.crushed), pressed: Math.max(0, c.pressed - s.pressed), laid: Math.max(0, c.laid - s.laid), cement: Math.max(0, c.cement - s.cement), detached: Math.max(0, c.detached - s.detached), perfect: 0, painted: 0 };
    for (const h of c.holes) {
      if (!h._perfect && h.comp >= 1 && h.filled >= h.need) { h._perfect = true; d.perfect++; }
      if (!h._painted && h.paintAmt >= 1) { h._painted = true; d.painted++; }
    }
    this.snap = c;
    const driving = g.mode === 'machine' && g.driving ? (g.driving.spec.variantOf || g.driving.spec.id) : null;
    for (const j of this.jobs) {
      const before = j.progress;
      switch (j.type) {
        case 'demolish': {
          const b = g.demo.buildings[j.bid];
          if (!b || b.removed || !g.plots.includes(j.bid)) { j.void = true; break; }
          j.progress = Math.max(j.progress, this.removedFrac(b));
          break;
        }
        case 'crush': j.progress += d.crushed; break;
        case 'drive': if (g.prog && ![...g.machines.values()].some((m) => m.spec.id === j.param || m.spec.variantOf === j.param)) { j.void = true; break; } /* sold the excavator: the job could never finish */ if (driving === j.param) j.progress += d.detached; break;
        case 'potholes': j.progress += d.perfect; break;
        case 'press': j.progress += d.pressed; break;
        case 'lay': j.progress += d.laid; break;
        case 'cement': j.progress += d.cement; break;
        case 'paint': j.progress += d.painted; break;
      }
      if (j.progress !== before) this.dirty = true;
    }
    this.settle();
    this.saveT -= 0.25;
    if (this.dirty && this.saveT <= 0) { this.saveT = 5; this.save(); }
  }
  // the biggest smash so far counts toward a smash contract
  onCombo(n) { for (const j of this.jobs) if (j.type === 'smash' && n > j.progress) { j.progress = n; this.dirty = true; } this.settle(); }

  settle() {
    const g = this.g;
    const voided = this.jobs.filter((j) => j.void);
    for (const j of voided) g.ui.toast(`📋 Contract cancelled: ${j.title} (the building was removed). A new one is on the board.`, false, 5000);
    const finished = this.jobs.filter((j) => !j.void && j.progress >= j.target);
    if (!voided.length && !finished.length) return;
    const rank0 = this.rank;
    for (const j of finished) {
      const bonus = j.bonusT > 0 ? Math.round(j.reward * 0.5 / 50) * 50 : 0, pay = j.reward + bonus;
      if (g.prog) g.prog.earn(pay, false); else this.cash += pay;
      this.earned += pay; this.done++;
      g.ui.toast(`✅ <b>Contract done:</b> ${j.title}<br>+${money(j.reward)}${bonus ? ` + ${money(bonus)} speed bonus` : ''}`, true, 6000);
      g.ui.bigPop(`<b>✅ +${money(pay)}</b><small>${j.title}${bonus ? ' · SPEED BONUS' : ''}</small>`, 'job');
      g.audio.firework(g.camera.position.clone().setY(g.camera.position.y + 6), 0.05);
      if (g.audio.cash) g.audio.cash();
    }
    this.jobs = this.jobs.filter((j) => !j.void && !finished.includes(j));
    if (this.rank > rank0) {
      const name = RANKS[this.rank][1];
      setTimeout(() => { g.ui.bigPop(`<b>🏅 PROMOTED</b><small>You are now a ${name}</small>`, 'rank'); if (g.audio.bigCash) g.audio.bigCash(); g.ui.toast(`🏅 Promoted to <b>${name}</b>! Bigger contracts, bigger pay.`, true, 6000); }, finished.length ? 2400 : 0);
    }
    this.fill(); this.save();
    g.ui.setCareer();
  }
}
