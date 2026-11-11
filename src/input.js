// Keyboard, mouse (pointer lock with drag-look fallback) and touch input.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.lookX = 0; this.lookY = 0;
    this.locked = false;
    this.dragLook = false;     // fallback when pointer lock is unavailable
    this.dragging = false;
    this.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.touchMove = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.touchLook = { id: null, x: 0, y: 0 };
    this.touchSprint = false;
    this.onLockChange = () => {};
    this.enabled = false;
    this._failAt = 0; this.lockFails = 0;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      if (this.enabled && ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (this.locked || (this.dragLook && this.dragging)) { this.lookX += e.movementX || 0; this.lookY += e.movementY || 0; }
    });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { this.dragging = true; this.pressed.add('Mouse0'); } });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.lockFails = 0;
      this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this._lockFailed());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    if (this.touch) this._initTouch();
  }

  // Browsers refuse a re-lock for a moment after Esc, so one failure is normal.
  // Only fall back to drag-to-look when locking keeps failing (e.g. a sandboxed frame).
  _lockFailed() {
    const now = performance.now();
    if (now - this._failAt < 150) return; // error event + promise rejection for the same attempt
    this._failAt = now;
    this.lockFails = (this.lockFails || 0) + 1;
    if (this.lockFails >= 3) { this.dragLook = true; this.onLockChange(false, true); }
  }

  requestLock() {
    if (this.touch || this.dragLook || this.locked) return;
    if (!this.canvas.requestPointerLock) { this.dragLook = true; this.onLockChange(false, true); return; }
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => this._lockFailed());
    } catch (e) { this._lockFailed(); }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  _initTouch() {
    const el = document.getElementById('touch');
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    const zone = document.getElementById('touchzone');
    zone.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.42 && this.touchMove.id === null) {
          this.touchMove.id = t.identifier; this.touchMove.ox = t.clientX; this.touchMove.oy = t.clientY;
          stick.style.display = 'block'; stick.style.left = t.clientX - 60 + 'px'; stick.style.top = t.clientY - 60 + 'px';
        } else if (this.touchLook.id === null) {
          this.touchLook.id = t.identifier; this.touchLook.x = t.clientX; this.touchLook.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchMove.id) {
          let dx = t.clientX - this.touchMove.ox, dy = t.clientY - this.touchMove.oy;
          const d = Math.hypot(dx, dy), m = 55;
          if (d > m) { dx *= m / d; dy *= m / d; }
          this.touchMove.x = dx / m; this.touchMove.y = dy / m;
          this.touchSprint = d > 95;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (t.identifier === this.touchLook.id) {
          this.lookX += (t.clientX - this.touchLook.x) * 2.2; this.lookY += (t.clientY - this.touchLook.y) * 2.2;
          this.touchLook.x = t.clientX; this.touchLook.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchMove.id) { this.touchMove.id = null; this.touchMove.x = this.touchMove.y = 0; this.touchSprint = false; stick.style.display = 'none'; knob.style.transform = ''; }
        if (t.identifier === this.touchLook.id) this.touchLook.id = null;
      }
    };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    for (const b of el.querySelectorAll('[data-key]')) {
      b.addEventListener('touchstart', (e) => { this.pressed.add(b.dataset.key); e.preventDefault(); e.stopPropagation(); }, { passive: false });
    }
  }

  // Snapshot for this frame; clears edge-triggered state.
  frame() {
    const k = this.keys, p = this.pressed;
    const f = {
      moveX: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.touchMove.x,
      moveZ: (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - this.touchMove.y,
      sprint: k.has('ShiftLeft') || k.has('ShiftRight') || this.touchSprint,
      crouchPressed: p.has('KeyC'),
      interact: p.has('KeyE') || (this.locked && p.has('Mouse0')),
      light: p.has('KeyF'),
      pause: p.has('Escape') || p.has('KeyP'),
      any: p.size > 0,
      lookX: this.lookX, lookY: this.lookY,
    };
    this.lookX = this.lookY = 0;
    p.clear();
    return f;
  }
}
