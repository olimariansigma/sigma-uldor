// Unified keyboard / mouse / touch input.
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

    const map = {
      KeyW: 'fwd', ArrowUp: 'up', KeyS: 'back', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'sleft', KeyD: 'right', ArrowRight: 'sright',
      ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump', KeyQ: 'pickup', KeyG: 'throw', KeyE: 'use', KeyB: 'shop', KeyH: 'help', KeyC: 'cam',
      KeyR: 'stickOut', KeyF: 'stickIn', KeyZ: 'curlIn', KeyX: 'curlOut', Escape: 'esc', Enter: 'use',
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
      if (!this.locked && this.enabled) { canvas.requestPointerLock && canvas.requestPointerLock(); }
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
    switch (a) {
      case 'hammer': return this.mouse.has('lmb') || this.tbtn.has('hammer');
      case 'pickup': return this.keys.has('pickup') || this.mouse.has('rmb') || this.tbtn.has('pickup');
      case 'throw': return this.keys.has('throw') || this.tbtn.has('throw');
      case 'sprint': return this.keys.has('sprint') || (this.touch && Math.hypot(this.sticks.L.x, this.sticks.L.y) > 0.95);
      case 'stickOut': return this.keys.has('stickOut') || this.tbtn.has('stickOut');
      case 'stickIn': return this.keys.has('stickIn') || this.tbtn.has('stickIn');
      case 'curlIn': return this.keys.has('curlIn') || this.tbtn.has('curlIn');
      case 'curlOut': return this.keys.has('curlOut') || this.tbtn.has('curlOut');
      default: return this.keys.has(a) || this.tbtn.has(a);
    }
  }
  pressed(a) {
    if (!this.enabled) return false;
    const alias = { jump: ['jump', 't_jump'], use: ['use', 't_use'], cam: ['cam', 't_cam'], grab: ['lmb', 'jump', 't_grab'], shop: ['shop'], help: ['help'], esc: ['esc'] }[a] || [a];
    return alias.some((x) => this.pressedSet.has(x));
  }
  get moveX() { return (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0) + this.sticks.L.x; }
  get moveY() { return (this.keys.has('fwd') ? 1 : 0) - (this.keys.has('back') ? 1 : 0) + this.sticks.L.y; }
  get armX() { return (this.keys.has('sright') ? 1 : 0) - (this.keys.has('sleft') ? 1 : 0) + this.sticks.R.x; }
  get armY() { return (this.keys.has('up') ? 1 : 0) - (this.keys.has('down') ? 1 : 0) + this.sticks.R.y; }
  consumeLook() {
    const s = 0.0024 * this.sensitivity;
    const r = { x: this.lookX * s, y: this.lookY * s * (this.invertY ? -1 : 1) };
    this.lookX = 0; this.lookY = 0;
    return r;
  }
  endFrame() { this.pressedSet.clear(); this.wheel = 0; }
  releaseLock() { if (document.exitPointerLock && this.locked) document.exitPointerLock(); }
}
