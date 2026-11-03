// Unified keyboard / mouse / touch / gamepad input.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = new Set();
    this.pressedSet = new Set();
    this.lookX = 0; this.lookY = 0;
    this.touch = 'ontouchstart' in window || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    this.sticks = { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } };
    this.tbtn = new Set();
    this.enabled = true;
    this.sensitivity = 1; this.invertY = false;
    this.wheel = 0;
    // gamepad (standard layout: Xbox, PlayStation, Switch Pro, most Bluetooth pads)
    this.pad = null; this.padHeld = new Set(); this.padPressed = new Set(); this.padRaw = [];
    this.padL = { x: 0, y: 0 }; this.padR = { x: 0, y: 0 }; this.padLook = { x: 0, y: 0 }; this.padArm = false;

    const map = {
      KeyW: 'fwd', ArrowUp: 'up', KeyS: 'back', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'sleft', KeyD: 'right', ArrowRight: 'sright',
      ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump', KeyQ: 'pickup', KeyG: 'throw', KeyE: 'use', KeyB: 'shop', KeyM: 'multi', KeyH: 'help', KeyJ: 'jobs', KeyC: 'cam',
      KeyR: 'stickOut', KeyF: 'stickIn', KeyZ: 'curlIn', KeyX: 'curlOut', KeyT: 'rotL', KeyY: 'rotR', Digit1: 'tool1', Digit2: 'tool2', Digit3: 'tool3', Digit4: 'tool4', KeyN: 'horn', KeyP: 'photo', Escape: 'esc', Enter: 'use',
    };
    this.map = map;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const a = map[e.code];
      if (!a) return;
      if (!this.keys.has(a)) this.pressedSet.add(a);
      this.keys.add(a);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { const a = map[e.code]; if (a) this.keys.delete(a); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.clear(); });

    canvas.addEventListener('mousedown', (e) => {
      if (this.touch) return;
      if (!this.locked && this.enabled && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } }
      const a = e.button === 0 ? 'lmb' : e.button === 2 ? 'rmb' : null;
      if (a) { this.mouse.add(a); this.pressedSet.add(a); }
    });
    window.addEventListener('mouseup', (e) => { const a = e.button === 0 ? 'lmb' : e.button === 2 ? 'rmb' : null; if (a) this.mouse.delete(a); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) { this.lookX += e.movementX; this.lookY += e.movementY; }
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });

    // touch look (anywhere not on a control)
    this.lookTouches = new Map();
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) this.lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        const p = this.lookTouches.get(t.identifier);
        if (!p) continue;
        this.lookX += (t.clientX - p.x) * 1.6; this.lookY += (t.clientY - p.y) * 1.6;
        p.x = t.clientX; p.y = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
    const endT = (e) => { for (const t of e.changedTouches) this.lookTouches.delete(t.identifier); };
    canvas.addEventListener('touchend', endT); canvas.addEventListener('touchcancel', endT);
  }

  bindTouchUI() {
    const stick = (el, key) => {
      const knob = el.querySelector('.knob');
      let id = null, cx = 0, cy = 0;
      const R = 52;
      const set = (x, y) => {
        let dx = x - cx, dy = y - cy;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.sticks[key].x = dx / R; this.sticks[key].y = -dy / R;
      };
      el.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0]; id = t.identifier;
        const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        set(t.clientX, t.clientY); e.preventDefault();
      }, { passive: false });
      el.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === id) set(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
      const end = (e) => { for (const t of e.changedTouches) if (t.identifier === id) { id = null; knob.style.transform = ''; this.sticks[key].x = 0; this.sticks[key].y = 0; } };
      el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
    };
    stick(document.getElementById('stickL'), 'L');
    stick(document.getElementById('stickR'), 'R');
    document.querySelectorAll('#touch [data-act]').forEach((b) => {
      const a = b.dataset.act;
      b.addEventListener('touchstart', (e) => { this.tbtn.add(a); this.pressedSet.add('t_' + a); b.classList.add('on'); e.preventDefault(); }, { passive: false });
      const up = (e) => { this.tbtn.delete(a); b.classList.remove('on'); e.preventDefault(); };
      b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
    });
  }

  held(a) {
    if (!this.enabled) return false;
    if (this.padHeld.has(a)) return true;
    switch (a) {
      case 'hammer': return this.mouse.has('lmb') || this.tbtn.has('hammer');
      case 'pickup': return this.keys.has('pickup') || this.mouse.has('rmb') || this.tbtn.has('pickup');
      case 'throw': return this.keys.has('throw') || this.tbtn.has('throw');
      case 'sprint': return this.keys.has('sprint') || (this.touch && Math.hypot(this.sticks.L.x, this.sticks.L.y) > 0.95) || (!this.padArm && Math.hypot(this.padL.x, this.padL.y) > 0.97);
      case 'stickOut': return this.keys.has('stickOut') || this.tbtn.has('stickOut');
      case 'stickIn': return this.keys.has('stickIn') || this.tbtn.has('stickIn');
      case 'curlIn': return this.keys.has('curlIn') || this.tbtn.has('curlIn');
      case 'curlOut': return this.keys.has('curlOut') || this.tbtn.has('curlOut');
      default: return this.keys.has(a) || this.tbtn.has(a);
    }
  }
  pressed(a) {
    if (!this.enabled) return false;
    const alias = { jump: ['jump', 't_jump'], use: ['use', 't_use'], cam: ['cam', 't_cam'], grab: ['lmb', 'jump', 't_grab', 'p_grab'], shop: ['shop'], help: ['help'], esc: ['esc'] }[a] || [a];
    return alias.some((x) => this.pressedSet.has(x));
  }
  get moveX() { return (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0) + this.sticks.L.x + this.padL.x; }
  get moveY() { return (this.keys.has('fwd') ? 1 : 0) - (this.keys.has('back') ? 1 : 0) + this.sticks.L.y + this.padL.y; }
  get armX() { return (this.keys.has('sright') ? 1 : 0) - (this.keys.has('sleft') ? 1 : 0) + this.sticks.R.x + (this.padArm ? this.padR.x : 0); }
  get armY() { return (this.keys.has('up') ? 1 : 0) - (this.keys.has('down') ? 1 : 0) + this.sticks.R.y + (this.padArm ? this.padR.y : 0); }
  consumeLook() {
    const s = 0.0024 * this.sensitivity;
    const r = { x: (this.lookX + this.padLook.x) * s, y: (this.lookY + this.padLook.y) * s * (this.invertY ? -1 : 1) };
    this.lookX = 0; this.lookY = 0; this.padLook.x = 0; this.padLook.y = 0;
    return r;
  }

  // ---- gamepad: polled once a frame. On foot: left stick walk, right stick look, A jump, B use, X pick up,
  // Y throw, RT hammer / tool, LT pick up, LB / RB change tool, L3 sprint, D-pad up shop, D-pad down contracts.
  // In a machine: left stick drive, right stick swing / boom, RB / LB arm out / in, RT / LT curl / dump, A tool,
  // B climb out, X / Y extra control (T / Y keys), D-pad left / right turn the camera, D-pad up cab camera,
  // D-pad down horn. Start: menu, Back / Select: help. In menus: D-pad moves, A presses, B goes back.
  pollPad(dt, inMachine) {
    this.padPressed = new Set();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let p = null;
    for (const q of pads) if (q && q.connected && q.mapping === 'standard') { p = q; break; }
    if (!p) for (const q of pads) if (q && q.connected) { p = q; break; }
    if (!p) {
      if (this.pad) { this.pad = null; this.padHeld.clear(); this.padRaw = []; this.padL = { x: 0, y: 0 }; this.padR = { x: 0, y: 0 }; if (this.onPad) this.onPad(null); }
      return;
    }
    if (this.pad !== p.id) { this.pad = p.id; if (this.onPad) this.onPad(p.id); }
    this.padArm = inMachine;
    const dz = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
    const ax = p.axes || [];
    this.padL = { x: dz(ax[0] || 0), y: -dz(ax[1] || 0) };
    this.padR = { x: dz(ax[2] || 0), y: -dz(ax[3] || 0) };
    const now = [];
    for (let i = 0; i < 17; i++) { const b = p.buttons[i]; now[i] = !!b && (b.pressed || b.value > 0.4); }
    const MAP = inMachine
      ? { 0: 'p_grab', 1: 'use', 2: 'rotL', 3: 'rotR', 4: 'stickIn', 5: 'stickOut', 6: 'curlOut', 7: 'curlIn', 12: 'cam', 13: 'horn', 8: 'help', 9: 'menu' }
      : { 0: 'jump', 1: 'use', 2: 'pickup', 3: 'throw', 4: 'toolPrev', 5: 'toolNext', 6: 'pickup', 7: 'hammer', 10: 'sprint', 12: 'shop', 13: 'jobs', 8: 'help', 9: 'menu' };
    const NAV = { 0: 'navA', 1: 'navB', 12: 'navU', 13: 'navD', 14: 'navL', 15: 'navR', 9: 'menu', 4: 'navTabL', 5: 'navTabR' };
    this.padHeld.clear();
    for (let i = 0; i < 17; i++) {
      const edge = now[i] && !this.padRaw[i];
      if (edge && NAV[i]) this.padPressed.add(NAV[i]);
      const a = MAP[i]; if (!a) continue;
      if (now[i]) this.padHeld.add(a);
      if (edge) { this.padPressed.add(a); if (this.enabled) this.pressedSet.add(a); }
    }
    // left stick flicks also move through menus
    const fl = this.padFlick || 0, sy = this.padL.y, sx = this.padL.x;
    const dir = sy > 0.7 ? 'navU' : sy < -0.7 ? 'navD' : sx > 0.7 ? 'navR' : sx < -0.7 ? 'navL' : null;
    if (dir && fl <= 0) { this.padPressed.add(dir); this.padFlick = 0.28; } else if (!dir) this.padFlick = 0; else this.padFlick = fl - dt;
    this.padRaw = now;
    // camera: right stick looks around on foot; in a machine the D-pad turns it (the right stick works the arm)
    const k = 1150 * dt;
    if (inMachine) { this.padLook.x += ((now[15] ? 1 : 0) - (now[14] ? 1 : 0)) * k * 0.8; }
    else { this.padLook.x += this.padR.x * k; this.padLook.y += -this.padR.y * k * 0.75; }
  }
  endFrame() { this.pressedSet.clear(); this.wheel = 0; }
  releaseLock() { if (document.exitPointerLock && this.locked) document.exitPointerLock(); }
}
