// Controller and keyboard input. Every button does something friendly.
//   Left stick / D-pad / WASD / arrows : move
//   A, X / Space                        : hop
//   B, bumpers, triggers / E, Enter     : make a sound (bark, meow, oink, roar, siren ...)
//   Y / Q, Tab                          : become the next character
//   Right stick / J, L, I, K            : turn the camera (optional)

function deadzone(x, y, dz) {
  const m = Math.hypot(x, y);
  if (m < dz) return [0, 0];
  const s = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [x * s, y * s];
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.prevPad = [];
    this.gesture = false;
    // Safari (iPad) starts sound only inside the event handler itself, so call onGesture here.
    const gesture = (e) => {
      this.gesture = true;
      if (this.onGesture) this.onGesture(e);
    };
    addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      gesture(e);
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('pointerdown', gesture);
    addEventListener('touchend', gesture);
  }

  poll() {
    const k = this.keys, p = this.pressed;
    const has = (...c) => c.some((x) => k.has(x));
    const hit = (...c) => c.some((x) => p.has(x));
    const out = { mx: 0, my: 0, cx: 0, cy: 0, jump: false, speak: false, swap: false, any: false, gesture: this.gesture };

    let mx = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
    let my = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0);
    out.cx = (has('KeyL') ? 1 : 0) - (has('KeyJ') ? 1 : 0);
    out.cy = (has('KeyI') ? 1 : 0) - (has('KeyK') ? 1 : 0);
    out.jump = hit('Space');
    out.speak = hit('KeyE', 'Enter');
    out.swap = hit('KeyQ', 'Tab');
    out.any = p.size > 0 || this.gesture;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const prev = this.prevPad[gp.index] || [];
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const edge = (i) => b(i) && !prev[i];

      let ax = gp.axes[0] || 0, ay = -(gp.axes[1] || 0);
      [ax, ay] = deadzone(ax, ay, 0.2);
      if (b(14)) ax -= 1;
      if (b(15)) ax += 1;
      if (b(12)) ay += 1;
      if (b(13)) ay -= 1;
      mx += ax;
      my += ay;

      const [rx, ry] = deadzone(gp.axes[2] || 0, -(gp.axes[3] || 0), 0.25);
      out.cx += rx;
      out.cy += ry;

      if (edge(0) || edge(2)) out.jump = true;
      if (edge(1) || edge(4) || edge(5) || edge(6) || edge(7)) out.speak = true;
      if (edge(3)) out.swap = true;
      for (let i = 0; i < gp.buttons.length; i++) if (edge(i)) out.any = true;
      if (Math.hypot(ax, ay) > 0.5) out.any = true;

      this.prevPad[gp.index] = gp.buttons.map((x) => x.pressed);
    }

    const m = Math.hypot(mx, my);
    if (m > 1) {
      mx /= m;
      my /= m;
    }
    out.mx = mx;
    out.my = my;

    p.clear();
    this.gesture = false;
    return out;
  }
}
