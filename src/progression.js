// Progression mode: start with nothing but the hammer. Every kilogram you crush earns money; spend it in the Shop
// (B) on tools (cement trowel, build kit, demolition charges), machines and new buildings to knock down. Pressed
// blocks laid in your own house across the road earn more, and house milestones pay a bonus. No potholes in this
// mode. Solo only; it saves itself (its own world slot plus the wallet) and carries on where you left it.
import { SITE } from './site.js';
export const PROG_KEY = 'wreckingyard.progression';
export const PER_KG = 3;                       // $ per kg crushed
export const PER_BLOCK_LAID = 30;              // $ per new block laid in your house
export const BUILDING_PRICE = 2500;            // a new building to demolish
export const TOOLS = {
  build: { name: 'Build kit', price: 600, icon: '🧱', what: 'Lay pressed blocks on the slab across the road (tool 4)' },
  charges: { name: 'Demolition charges', price: 3000, icon: '🧨', what: 'Stick up to 8 charges on a wall and blow it (tool 3)' },
};
export const MILESTONES = [[20, 1000, 'Foundations laid'], [50, 2500, 'Walls going up'], [100, 5000, 'A real house'], [180, 9000, 'Dream home'], [300, 15000, 'Mansion']];
// upgrades bought in the Shop's Tools tab (sandbox has these as free sliders)
export const UPGRADES = {
  hammer: { name: 'Hammer', icon: '🔨', max: 3, price: (l) => [0, 800, 2500, 6000][l + 1], label: (l) => ['Club', 'Sledge', 'Heavy hammer', 'Breaker'][l] },
  carry: { name: 'Carry capacity', icon: '💪', max: 8, price: (l) => 250 + l * 200, label: (l) => (4 + l * 2) + ' blocks' },
  crusher: { name: 'Crusher speed', icon: '⚙️', max: 9, price: (l) => 400 + l * 300, label: (l) => (3 + l) + ' blocks/s' },
};
const NOT_SOLD = new Set(['lp20', 'ap600', 'cr64', 'pk1']); // road machines: no potholes in this mode

// a machine's price: by weight, special tools a bit dearer, trucks by size
export function machinePrice(sp) {
  const tons = sp.tons || 10;
  let p = 1200 + tons * 260;
  if (sp.family === 'truck') p = 2500 + tons * 180;
  if (['magnet', 'xball', 'blaster', 'cutter', 'saw', 'auger', 'plate', 'forks', 'jet'].includes(sp.attach) || sp.under === 'backhoe') p *= 1.35;
  return Math.round(p / 100) * 100;
}
export const forSale = (sp) => !NOT_SOLD.has(sp.variantOf || sp.id);
export const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

export class Progression {
  constructor(game, remote = false) {
    this.g = game; this.remote = remote; this.dirty = true;
    let s = null; if (!remote) { try { s = JSON.parse(localStorage.getItem(PROG_KEY)); } catch (e) { s = null; } }
    this.fresh = !s;
    s = s || {};
    this.money = s.money ?? 150; this.tools = s.tools || {}; this.laidMax = s.laidMax || 0; this.milestone = s.milestone || 0;
    this.earned = s.earned || 0; this.crushedKg = s.crushedKg || 0;
    if (this.tools.trowel && !remote) { delete this.tools.trowel; this.money += 400; } // the trowel is free now: refund it
    this.up = Object.assign({ hammer: 0, carry: 0, crusher: 0 }, s.up || {});
    this.snap = null; this.t = 0; this.saveT = 0;
  }
  // the shared career as the host sends it to everyone who joined
  pack() { return { money: Math.round(this.money), tools: this.tools, up: this.up, laidMax: this.laidMax, milestone: this.milestone, earned: Math.round(this.earned), crushedKg: Math.round(this.crushedKg) }; }
  unpack(s) {
    this.money = s.money; this.tools = s.tools || {}; this.up = Object.assign({ hammer: 0, carry: 0, crusher: 0 }, s.up || {});
    this.laidMax = s.laidMax || 0; this.milestone = s.milestone || 0; this.earned = s.earned || 0; this.crushedKg = s.crushedKg || 0;
  }
  save() {
    if (this.dead || this.remote) return;
    try { localStorage.setItem(PROG_KEY, JSON.stringify({ money: Math.round(this.money), tools: this.tools, laidMax: this.laidMax, milestone: this.milestone, earned: Math.round(this.earned), crushedKg: Math.round(this.crushedKg), up: this.up })); } catch (e) { /* storage full */ }
  }
  static reset() { try { localStorage.removeItem(PROG_KEY); } catch (e) { /* ignore */ } }

  has(tool) { return tool === 'hammer' || tool === 'trowel' || tool === 'scrape' || !!this.tools[tool]; }
  canAfford(n) { return this.money >= n; }
  spend(n, what, pid = this.g.myId) {
    if (this.money < n) { this.g.tell(pid, `💸 Not enough money: ${what} costs ${money(n)}, you have ${money(this.money)}`); if (pid === this.g.myId) this.g.audio.denied(); return false; }
    if (this.remote) return true; // only checks: the host takes the money
    this.money -= n; this.dirty = true; this.save(); this.g.ui.setCareer(); if (pid === this.g.myId && this.g.audio.cash) this.g.audio.cash();
    return true;
  }
  earn(n, quiet = true) { if (this.remote) return; this.money += n; this.earned += n; this.dirty = true; if (!quiet) this.g.ui.setCareer(); }
  buyTool(id, pid = this.g.myId) {
    const t = TOOLS[id]; if (!t || this.tools[id]) return false;
    if (this.remote) { this.g.act('buyTool', { id }); return true; }
    if (!this.spend(t.price, t.name, pid)) return false;
    this.tools[id] = true; this.dirty = true; this.save();
    this.g.tell(pid, `${t.icon} <b>${t.name}</b> bought!`, true);
    if (pid !== this.g.myId) this.g.ui.toast(`${t.icon} ${t.name} bought by a friend`, true, 3000);
    this.g.ui.setHotbar();
    return true;
  }

  // the upgrade levels drive the game settings in this mode (sandbox prefs stay untouched)
  apply() {
    const g = this.g, u = this.up;
    g.settings.hammer = u.hammer; g.settings.carry = 4 + u.carry * 2; g.settings.crusher = 3 + u.crusher;
    g.crusher.rate = g.settings.crusher;
    if (g.player && g.player.avatar) g.player.avatar.setHammer(u.hammer);
  }
  buyUp(key, pid = this.g.myId) {
    const U = UPGRADES[key], l = this.up[key]; if (!U || l >= U.max) return false;
    if (this.remote) { this.g.act('buyUp', { key }); return true; }
    if (!this.spend(U.price(l), U.name + ' upgrade', pid)) return false;
    this.up[key] = l + 1; this.apply(); this.dirty = true; this.save();
    this.g.tell(pid, `${U.icon} <b>${U.name}</b>: ${U.label(l + 1)}`, true);
    this.g.events.push(['set', { crusher: this.g.settings.crusher, grapple: this.g.settings.grapple }]); // the crusher belongs to everyone
    return true;
  }

  // what you crush and lay, counted every quarter second
  counters() {
    let laid = 0; const bp = SITE.buildPlot; for (const p of this.g.demo.pieces) if (p.brick && p.state === 0 && Math.abs(p.pos.x - bp.x) < bp.w / 2 + 12 && Math.abs(p.pos.z - bp.z) < bp.d / 2 + 12) laid++; // your house: on and around the build plot only
    return { crushed: this.g.crusher.totalKg, laid };
  }
  resync() { this.snap = this.counters(); }
  update(dt) {
    if (this.remote) return;
    this.t -= dt; if (this.t > 0) return;
    this.t = 0.25;
    if (this.dirty && this.g.net.isHost) { this.dirty = false; this.g.events.push(['prog', this.pack()]); }
    const c = this.counters(), s = this.snap;
    if (!s || c.crushed < s.crushed - 1) { this.snap = c; return; }
    const kg = (c.crushed - s.crushed) * 4 / 459;
    if (kg > 0) { this.crushedKg += kg; this.earn(kg * PER_KG); this.pending = (this.pending || 0) + kg * PER_KG; }
    if (c.laid > this.laidMax) {
      const n = c.laid - this.laidMax; this.laidMax = c.laid;
      this.earn(n * PER_BLOCK_LAID); this.pending = (this.pending || 0) + n * PER_BLOCK_LAID;
      while (this.milestone < MILESTONES.length && this.laidMax >= MILESTONES[this.milestone][0]) {
        const [blocks, bonus, name] = MILESTONES[this.milestone++];
        this.earn(bonus);
        this.g.netPop(`<b>🏠 ${name}!</b><small>${blocks} blocks laid · +${money(bonus)} bonus</small>`, 'job');
        this.g.audio.firework(this.g.camera.position.clone().setY(this.g.camera.position.y + 6), 0.05);
        if (this.g.audio.bigCash) this.g.audio.bigCash();
      }
    }
    this.snap = c;
    // a little "+$" now and then so you see the money come in
    this.payT = (this.payT || 0) - 0.25;
    if (this.pending >= 1 && this.payT <= 0) { this.payT = 1.2; this.g.ui.moneyTick(this.pending); this.g.events.push(['mt', Math.round(this.pending)]); this.pending = 0; }
    this.saveT -= 0.25;
    if (this.saveT <= 0) { this.saveT = 20; this.g.progSave(); } // wallet and world are saved together
  }
}
