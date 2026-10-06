/* Desk Prancers: Prancers that live in a window.

   The engine behind "Let them out" on the site, the studio's desk room, and later
   the desktop app. Each cat is its own pet build (pet.html?seed=…), the exact
   cat its mint drew, alone on a transparent background. This file decides
   what every cat does from moment to moment and moves it; the cat draws
   itself. One animation loop runs every cat.

     const desk = new Desk(rootElement, { size: 110, perch: true, treats: true });
     await desk.add(seed, { id, name });
     desk.laser(true); desk.treat(x, y); desk.remove(id); desk.stop();

   What cats do, by temperament:
   - wander the floor (the bottom of the root), pause, loaf and nap; doze when
     the mouse has been quiet for a while, wake when you come back;
   - perch: jump up onto the page's buttons, cards and frames, sit there, ride
     along as you scroll, and hop down (or fall) when their spot moves away;
   - the pointer: Curious, Playful and Sweet cats come to see it, Shy and
     Grumpy ones keep away. Stroke a cat to pet it (eyes squeeze, hearts;
     Grumpy cats tolerate it only so long). Click for its own reaction;
   - laser: a red dot they chase, stalk and pounce on;
   - treats: double-click to drop a fish; the nearest cats trot over and eat;
   - two cats who meet stop and say hello. */

const TEMPS = {
  //            roam  pause loaf  nap   follow avoid perch laser
  Curious:   [1.1,  1.0,  0.7,  0.4,  1.0,   0,    1.2,  1.0],
  Playful:   [1.4,  0.6,  0.5,  0.3,  1.2,   0,    1.1,  1.4],
  Confident: [1.3,  1.0,  0.7,  0.4,  0.4,   0,    1.0,  0.8],
  Sassy:     [1.2,  1.2,  0.8,  0.4,  0.3,   0.2,  1.0,  0.6],
  Sweet:     [0.9,  1.0,  1.0,  0.6,  0.8,   0,    0.7,  0.8],
  Regal:     [0.7,  2.0,  1.0,  0.5,  0.2,   0.1,  1.8,  0.3],
  Chill:     [0.5,  0.8,  1.8,  1.8,  0.3,   0,    0.6,  0.4],
  Grumpy:    [0.6,  1.0,  1.6,  1.0,  0,     0.5,  0.9,  0.5],
  Shy:       [0.8,  1.0,  1.2,  0.8,  0,     1.0,  0.8,  0.7],
};
const [ROAM, PAUSE, LOAF, NAP, FOLLOW, AVOID, PERCH, LASER] = [0, 1, 2, 3, 4, 5, 6, 7];
/* page elements a cat may sit on */
const PERCHES = ".btn, .card, .frame, .stat, .temp, .pen, .gifout, .mintcat img, details summary, h2";
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (w) => { let t = 0; for (const k in w) t += w[k]; let x = Math.random() * t; for (const k in w) if ((x -= w[k]) < 0) return k; return Object.keys(w)[0]; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const BUSY = new Set(["air", "fall", "prep", "land", "react", "pet", "eat", "stalk", "greet"]);

export class Desk {
  constructor(root, { size = 110, floor = 8, perch = false, treats = false, contain = false, petUrl = new URL("pet.html", import.meta.url).href, onpoke = null } = {}) {
    this.root = root; this.doc = root.ownerDocument; this.win = this.doc.defaultView; this.size = size; this.floor = floor;
    this.perchOn = perch; this.petUrl = petUrl; this.onpoke = onpoke; this.contain = contain;   // contain: keep every cat wholly inside the root (a box on the page)
    this.cats = []; this.pointer = null; this.lastMove = performance.now(); this.running = true; this.treats = []; this.dot = null;
    this.tag = this._el("div", "position:absolute;z-index:999;pointer-events:none;padding:4px 10px;border-radius:999px;font:700 12px/1.3 ui-monospace,Menlo,monospace;" +
      "color:#f6effa;background:rgba(14,10,20,.86);border:1px solid #ff5fa2;box-shadow:0 0 12px rgba(255,95,162,.45);white-space:nowrap;opacity:0;transition:opacity .2s;transform:translate(-50%,-100%)");
    const W = this.win;
    this._move = (e) => {
      const p = this.pointer, now = performance.now();
      this.pointer = { x: e.clientX, y: e.clientY, t: now }; this.lastMove = now;
      if (p) this._stroke(e.clientX, e.clientY, Math.hypot(e.clientX - p.x, e.clientY - p.y), now);
      if (this.dot) this._dotAt(e.clientX, e.clientY);
      this._hover();
    };
    this._down = (e) => { const c = this._hit(e.clientX, e.clientY); if (c) { e.preventDefault(); this._poke(c); } };
    this._leave = () => { this.pointer = null; this._hover(); };
    this._dbl = (e) => {
      if (e.target.closest && e.target.closest("a,button,input,select,textarea,summary,label,iframe,[contenteditable]")) return;
      const s = W.getSelection && W.getSelection(); if (s) s.removeAllRanges();
      const r = this._rect();
      if (this.contain && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) return;   // a box only takes treats dropped in it
      this.treat(e.clientX - r.left, e.clientY - r.top);
    };
    this._scroll = () => { const now = performance.now(), y = W.scrollY, v = this._sy == null ? 0 : Math.abs(y - this._sy) / Math.max(0.016, (now - this._st) / 1000);
      this._sy = y; this._st = now;
      if (v > 4000) for (const c of this.cats) if (!c.surf && !BUSY.has(c.state) && c.state !== "nap" && c.tw[AVOID] > 0.4 && Math.random() < 0.5) this._react(c, now); };
    W.addEventListener("pointermove", this._move); W.addEventListener("pointerdown", this._down);
    this.doc.documentElement.addEventListener("pointerleave", this._leave); W.addEventListener("scroll", this._scroll, { passive: true });
    if (treats) W.addEventListener("dblclick", this._dbl);
    let last = performance.now();
    /* kind to laptops: at most ~30 frames a second (cats walk just as well; a 120 Hz screen would otherwise draw 120),
       and nothing at all while the root is scrolled out of view */
    this.visible = true;
    if (W.IntersectionObserver) { this._io = new W.IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }); this._io.observe(root); }
    const loop = (now) => { if (!this.running) return; W.requestAnimationFrame(loop);
      if (!this.visible) { last = now; return; }
      if (now - last < 31) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now; this._tick(dt, now); };
    W.requestAnimationFrame(loop);
  }
  _el(tag, css, text) { const e = this.doc.createElement(tag); e.style.cssText = css; if (text) e.textContent = text; this.root.appendChild(e); return e; }
  _rect() { return this.root.getBoundingClientRect(); }
  get floorY() { return this.root.clientHeight - this.floor; }

  /* add a cat by its mint seed; resolves once it's on the floor */
  add(seed, meta = {}) {
    if (!/^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(seed)) return Promise.reject(new Error("not a mint seed"));   // seeds are operation hashes
    const f = this.doc.createElement("iframe");
    f.src = this.petUrl + "?seed=" + encodeURIComponent(seed); f.title = meta.name || "Prancer"; f.setAttribute("aria-hidden", "true");
    /* color-scheme must match the pet page's, or a dark host paints an opaque box behind the frame */
    f.style.cssText = "position:absolute;left:0;top:0;border:0;background:transparent;color-scheme:normal;pointer-events:none;visibility:hidden";
    f.allowTransparency = true;
    this.root.appendChild(f);
    return new Promise((res, rej) => {
      f.onload = () => {
        const pet = f.contentWindow.__pet; if (!pet) { f.remove(); rej(new Error("pet build missing")); return; }
        const c = { id: meta.id ?? seed, meta, f, pet, I: pet.info, dir: Math.random() < 0.5 ? 1 : -1, sx: 0, depth: this.cats.length % 3,
          surf: null, air: null, state: "pause", until: 0, ctl: { walk: 0 }, pokes: [], petT: 0, petTotal: 0, cool: 0, puffT: 0,
          tw: TEMPS[pet.info.temperament] || TEMPS.Curious };
        this._size(c); c.sx = c.dir;
        c.cx = rnd(this._edge(c), Math.max(this._edge(c) + 1, this.root.clientWidth - this._edge(c))); c.gy = this.floorY - c.depth * 6;
        f.style.visibility = "visible";
        this.cats.push(c); this._choose(c, performance.now()); res(c);
      };
      f.onerror = rej;
    });
  }
  _size(c) { c.k = this.size / (c.I.box[3] * 0.62); c.W = c.I.box[2] * c.k; c.H = c.I.box[3] * c.k; c.half = c.W * c.I.body / 2;
    c.f.style.width = c.W + "px"; c.f.style.height = c.H + "px"; }
  remove(id) { const i = this.cats.findIndex((c) => c.id === id); if (i >= 0) { this.cats[i].f.remove(); this.cats.splice(i, 1); } }
  clear() { for (const c of this.cats) c.f.remove(); this.cats = []; for (const t of this.treats) t.el.remove(); this.treats = []; }
  stop() {
    this.running = false; if (this._io) this._io.disconnect(); this.laser(false); this.clear(); this.tag.remove();
    const W = this.win; W.removeEventListener("pointermove", this._move); W.removeEventListener("pointerdown", this._down); W.removeEventListener("dblclick", this._dbl);
    W.removeEventListener("scroll", this._scroll); this.doc.documentElement.removeEventListener("pointerleave", this._leave);
    if (this._cur) this.doc.documentElement.style.cursor = "";
  }
  setSize(size) { this.size = size; for (const c of this.cats) this._size(c); }

  /* ---- toys ---- */
  laser(on) {
    if (on && !this.dot) {
      this.dot = this._el("div", "position:absolute;z-index:1000;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;pointer-events:none;" +
        "background:radial-gradient(circle,#fff 0 18%,#ff2a3d 32%,rgba(255,42,61,.35) 60%,transparent 72%);box-shadow:0 0 14px 4px rgba(255,42,61,.55);opacity:0");
      this.doc.documentElement.classList.add("desk-laser");
      if (this.pointer) this._dotAt(this.pointer.x, this.pointer.y);
    } else if (!on && this.dot) {
      this.dot.remove(); this.dot = null; this.dotPos = null; this.doc.documentElement.classList.remove("desk-laser");
      for (const c of this.cats) if (c.state === "chase" || c.state === "stalk") { c.state = "pause"; c.until = 0; c.ctl = { walk: 0 }; }
    }
    return !!this.dot;
  }
  _dotAt(x, y) { const r = this._rect(); this.dotPos = { x: x - r.left, y: y - r.top, t: performance.now() }; Object.assign(this.dot.style, { left: this.dotPos.x + "px", top: this.dotPos.y + "px", opacity: 1 }); }
  /* drop a fish at (x, y) in the root; it falls to the floor and the nearest awake cats come for it */
  treat(x = rnd(80, this.root.clientWidth - 80), y = 60) {
    const el = this._el("div", "position:absolute;z-index:5;pointer-events:none;font-size:" + Math.round(this.size * 0.26) + "px;line-height:1;transform:translate(-50%,-100%);filter:drop-shadow(0 0 6px rgba(255,200,95,.6))", "🐟");
    const t = { el, x: clamp(x, 30, this.root.clientWidth - 30), y, vy: 0, down: false, eaten: false };
    this.treats.push(t); this._placeTreat(t);
    const now = performance.now();
    const fans = this.cats.filter((c) => !BUSY.has(c.state) && !(c.state === "nap" && c.tw[NAP] > 1.5))
      .sort((a, b) => Math.abs(a.cx - t.x) - Math.abs(b.cx - t.x)).slice(0, 2);
    for (const c of fans) this._goTreat(c, t, now);
    return t;
  }
  _placeTreat(t) { t.el.style.left = t.x + "px"; t.el.style.top = t.y + "px"; }
  _goTreat(c, t, now) {
    if (c.surf) { this._hopDown(c, now, t.x); c.after = () => this._goTreat(c, t, performance.now()); return; }
    c.state = "treat"; c.treat = t; c.until = now + 15000; c.ctl = { walk: 1.4 };
  }

  /* ---- what each cat decides to do next ---- */
  _choose(c, now) {
    if (c.next) { const n = c.next; c.next = null; n(); return; }
    const t = c.tw, idle = (now - this.lastMove) / 1000, sleepy = idle > 40 ? 4 : 1, near = this._near(c);
    const w = { walk: t[ROAM] / sleepy, pause: t[PAUSE], loaf: t[LOAF] * sleepy };
    if (c.state === "loaf") w.nap = t[NAP] * 2 * sleepy;                  // naps come out of a loaf
    if (near && t[FOLLOW] && !c.surf) w.follow = t[FOLLOW] * 2.5 / sleepy;
    if (near && t[AVOID] && near.d < 260) w.flee = t[AVOID] * 3;
    if (this.perchOn && !c.surf && idle < 60) w.perch = t[PERCH] * 0.9;
    if (c.surf) { w.walk *= 0.5; w.down = 0.6; w.loaf *= 1.5; }
    if (this.dot && Math.random() < t[LASER] * 0.6) w.chase = 4;
    const left = this.treats.find((x) => x.down && !x.eaten && !this.cats.some((o) => o.treat === x));   // a treat nobody is after
    if (left && c.state !== "nap") w.snack = 3;
    const s = pick(w);
    if (s === "snack") { this._goTreat(c, left, now); return; }
    c.state = s; c.ctl = { walk: 0 };
    const [lo, hi] = this._bounds(c);
    if (s === "walk") { c.target = clamp(c.cx + c.dir * rnd(100, 380) * (Math.random() < 0.3 ? -1 : 1), lo, hi); c.until = now + 14000; c.ctl = { walk: 1 }; }
    else if (s === "pause") c.until = now + rnd(1800, 5500);
    else if (s === "loaf") { c.until = now + rnd(9000, 26000); c.ctl = { walk: 0, rest: 1 }; }
    else if (s === "nap") { c.until = now + rnd(20000, 70000); c.ctl = { walk: 0, rest: 1, sleep: 1 }; }
    else if (s === "follow") { c.until = now + rnd(5000, 12000); c.ctl = { walk: 1 }; }
    else if (s === "flee") { c.target = near.dx > 0 ? lo : hi; c.until = now + 9000; c.ctl = { walk: 1.3 }; }
    else if (s === "down") this._hopDown(c, now);
    else if (s === "chase") { c.until = now + rnd(6000, 14000); }
    else if (s === "perch") {
      const p = this._perchFor(c);
      if (!p) { c.state = "pause"; c.until = now + 1500; }
      else { c.perch = p; c.target = clamp(p.x, lo, hi); c.until = now + 12000; c.ctl = { walk: 1 }; }
    }
  }
  /* the floor, or the top of whatever the cat is standing on, in root coordinates */
  _bounds(c) {
    if (c.surf) { const r = c.surf.getBoundingClientRect(), R = this._rect(), a = r.left - R.left + c.half * 0.5; return [a, Math.max(a, r.right - R.left - c.half * 0.5)]; }
    return [this._edge(c), this.root.clientWidth - this._edge(c)];
  }
  /* how near the side walls a cat's middle may come: on the open page a cat can step half off-screen; in a box, never */
  _edge(c) { return this.contain ? c.W * 0.55 : c.half * 0.6; }
  _perchable(el, c) {
    if (!el.isConnected || this.root.contains(el)) return null;
    const r = el.getBoundingClientRect(), R = this._rect(), top = r.top - R.top;
    if (r.width < c.half * 1.6 || r.height < 8 || r.left < R.left || r.right > R.right) return null;
    if (top < c.H * 0.75 || top > this.floorY - 50 || this.floorY - top > Math.min(460, this.root.clientHeight * 0.75)) return null;
    const cs = this.win.getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity < 0.2) return null;
    return { el, top, x0: r.left - R.left, x1: r.right - R.left };
  }
  _perchFor(c) {
    const taken = new Set(this.cats.map((o) => o.surf || (o.perch && o.perch.el)).filter(Boolean));
    const opts = [...this.doc.querySelectorAll(PERCHES)].map((el) => !taken.has(el) && this._perchable(el, c)).filter(Boolean)
      .filter((p) => Math.abs((p.x0 + p.x1) / 2 - c.cx) < 700);
    if (!opts.length) return null;
    opts.sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - c.cx) - Math.abs((b.x0 + b.x1) / 2 - c.cx));
    const p = opts[Math.floor(Math.random() * Math.min(3, opts.length))];
    p.x = clamp(c.cx, p.x0 + c.half * 0.7, Math.max(p.x0 + c.half * 0.7, p.x1 - c.half * 0.7));
    return p;
  }

  /* ---- jumping: crouch, arc, land ---- */
  _jump(c, now, x1, y1, surf, h) {
    const x0 = c.cx, y0 = c.gy, dx = x1 - x0;
    if (Math.abs(dx) > 6) c.dir = dx > 0 ? 1 : -1;
    c.state = "prep"; c.until = now + 280; c.ctl = { walk: 0, crouch: 1 };
    c.air = { x0, y0, x1, y1, surf, h: h ?? (y1 < y0 ? 40 : 24), t: 0, dur: 0.42 + Math.abs(y1 - y0) / 1400 + Math.abs(dx) / 1600, go: false };
  }
  _hopDown(c, now, toward) {
    const lo = this._edge(c), hi = this.root.clientWidth - this._edge(c), d = toward != null ? Math.sign(toward - c.cx) || c.dir : c.dir;
    this._jump(c, now, clamp(c.cx + d * rnd(50, 110), lo, hi), this.floorY - c.depth * 6, null, 22);
  }

  _near(c) {
    const p = this.pointer; if (!p || performance.now() - p.t > 8000) return null;
    const R = this._rect(), dx = p.x - (R.left + c.cx), d = Math.hypot(dx, p.y - (R.top + c.gy - c.H * 0.3));
    return d < 520 ? { dx, d } : null;
  }
  _react(c, now) { c.pet.react(); c.state = "react"; c.until = now + 2400; c.ctl = { walk: 0 }; }
  _fall(c) {
    const y1 = this.floorY - c.depth * 6;
    c.surf = null; c.state = "fall"; c.air = { x0: c.cx, y0: c.gy, x1: c.cx + c.dir * 30, y1, surf: null, h: 0, t: 0, dur: 0.3 + Math.sqrt(Math.max(0, y1 - c.gy)) / 40, go: true };
    this._puff(c, "!", "#ffc85f");
  }

  _tick(dt, now) {
    const idle = (now - this.lastMove) / 1000, floor = this.floorY;
    /* treats fall, then wait on the floor */
    for (const t of this.treats) if (!t.down) { t.vy += 2400 * dt; t.y = Math.min(floor, t.y + t.vy * dt); if (t.y >= floor) t.down = true; this._placeTreat(t); }
    for (const c of this.cats) {
      const near = this._near(c);
      /* the ground under the cat: the floor, or its perch (which scrolls with the page) */
      if (c.surf && !c.air) { const p = this._perchable(c.surf, c); if (!p) this._fall(c); else c.gy = p.top; }
      else if (!c.air) c.gy = floor - c.depth * 6;

      if (c.state === "nap" && idle < 1 && near && near.d < 300) { c.state = "pause"; c.until = now + 2500; c.ctl = { walk: 0, rest: 1 }; }
      if (c.state === "nap" && now > c.puffT) { c.puffT = now + 2600; this._puff(c, "z", "#b8accb"); }
      if (this.dot && !BUSY.has(c.state) && c.state !== "chase" && c.state !== "nap" && c.state !== "treat" && Math.random() < dt * c.tw[LASER] * 0.5) { c.state = "chase"; c.until = now + rnd(6000, 14000); }

      const [lo, hi] = this._bounds(c);
      let ctl = c.ctl;
      switch (c.state) {
        case "prep": if (now > c.until) { c.state = "air"; c.air.go = true; } break;
        case "air": case "fall": {
          const a = c.air; a.t += dt / a.dur; const u = Math.min(1, a.t);
          if (a.surf) { const p = this._perchable(a.surf, c); if (p) a.y1 = p.top; }
          c.cx = a.x0 + (a.x1 - a.x0) * u;
          c.gy = c.state === "fall" ? a.y0 + (a.y1 - a.y0) * u * u
            : a.y0 + (a.y1 - a.y0) * u - (Math.max(0, a.y0 - a.y1) * 0.35 + a.h) * 4 * u * (1 - u);
          ctl = { walk: 0, crouch: u > 0.8 ? 0.6 : 0 };
          if (u >= 1) { c.surf = a.surf; c.air = null; c.state = "land"; c.until = now + 260; c.ctl = { walk: 0, crouch: 0.7 }; }
          break; }
        case "land": if (now > c.until) { if (c.after) { const f = c.after; c.after = null; f(); } else this._choose(c, now); } break;
        case "react": case "greet": if (now > c.until) { c.mate = null; this._choose(c, now); } break;
        case "pet":
          if (now - c.petT > 900) { this._choose(c, now); break; }
          ctl = { walk: 0, pet: 1 }; if (now > c.puffT) { c.puffT = now + 520; this._puff(c, "♥", "#ff5fa2"); }
          if (c.tw[AVOID] >= 0.5 && c.petTotal > 3.5) {                 // enough is enough
            c.petTotal = 0; this._react(c, now);
            c.next = () => { if (c.surf) { this._hopDown(c, performance.now()); return; } const [l, h] = this._bounds(c); c.state = "flee"; c.target = c.cx < (l + h) / 2 ? h : l; c.until = performance.now() + 8000; c.ctl = { walk: 1.3 }; };
          }
          break;
        case "walk": case "flee": case "perch":
          if (Math.abs(c.target - c.cx) < 6 || now > c.until) {
            if (c.state === "perch" && c.perch && Math.abs(c.target - c.cx) < 40) {
              const p = this._perchable(c.perch.el, c); if (p) this._jump(c, now, c.cx, p.top, c.perch.el); else this._choose(c, now); c.perch = null;
            } else this._choose(c, now);
          } else c.dir = c.target > c.cx ? 1 : -1;
          break;
        case "follow":
          if (!near || now > c.until) this._choose(c, now);
          else { c.dir = near.dx > 0 ? 1 : -1; c.ctl = { walk: Math.abs(near.dx) > c.half * 1.3 ? 1 : 0 }; }
          break;
        case "chase": {
          if (!this.dot || !this.dotPos || now > c.until) { this._choose(c, now); break; }
          const d = this.dotPos, dx = d.x - c.cx, high = c.gy - d.y;
          if (c.surf && (Math.abs(dx) > 220 || high < -40)) { this._hopDown(c, now, d.x); c.after = () => { c.state = "chase"; c.until = performance.now() + rnd(4000, 9000); }; break; }
          c.dir = dx > 0 ? 1 : -1;
          if (Math.abs(dx) > c.half * 1.1) c.ctl = { walk: Math.abs(dx) > 260 ? 1.8 : 1.2 };
          else if (high > -20 && high < 260 && now - d.t < 3000) { c.state = "stalk"; c.until = now + rnd(350, 900); c.ctl = { walk: 0, crouch: 1 }; }
          else c.ctl = { walk: 0 };
          break; }
        case "stalk":
          if (now > c.until) {
            if (!this.dotPos) { this._choose(c, now); break; }
            const d = this.dotPos;
            this._jump(c, now, clamp(d.x, lo, hi), c.gy, c.surf, clamp(c.gy - d.y, 20, 260));
            c.after = () => { this._react(c, performance.now()); c.until = performance.now() + 900; c.next = () => { c.state = "chase"; c.until = performance.now() + rnd(4000, 9000); }; };
          }
          break;
        case "treat": {
          const t = c.treat;
          if (!t || (t.eaten && t.by !== c) || !this.treats.includes(t)) { c.treat = null; this._choose(c, now); break; }
          if (!t.down) { c.ctl = { walk: 0 }; c.dir = t.x > c.cx ? 1 : -1; break; }
          const headDx = c.W * (c.I.head - c.I.mid), want = t.x - c.dir * headDx, dx = want - c.cx;
          if (Math.abs(dx) < 8 || now > c.until) {
            if (Math.abs(dx) < 40) { c.state = "eat"; c.until = now + 2600; c.ctl = { walk: 0, sniff: 1 }; t.eaten = true; t.by = c; } else this._choose(c, now);
          } else { c.dir = (t.x > c.cx ? 1 : -1); c.ctl = { walk: Math.abs(dx) > 200 ? 1.5 : 1 }; }
          break; }
        case "eat":
          if (now > c.until) { const t = c.treat; if (t) { t.el.remove(); this.treats = this.treats.filter((x) => x !== t); } c.treat = null; this._puff(c, "♥", "#ff5fa2"); c.state = "pause"; c.until = now + 2500; c.ctl = { walk: 0 }; }
          else if (now > c.puffT) { c.puffT = now + 700; this._puff(c, "♪", "#ffc85f"); }
          break;
        default: if (now > c.until) this._choose(c, now);
      }

      /* turn: squash through zero, the way a side-on cat swings round */
      const turning = Math.sign(c.sx) !== c.dir;
      c.sx = clamp(c.sx + c.dir * dt * 7, -1, 1);
      ctl = { ...ctl, walk: turning || (c.air && c.air.go) ? 0 : ctl.walk };
      if (near && c.state !== "nap" && !ctl.sniff && !c.mate) {
        const R = this._rect(), hx = R.left + c.cx + c.dir * c.W * (c.I.head - c.I.mid), hy = R.top + c.gy - c.H * 0.45;
        ctl.look = { x: clamp((this.pointer.x - hx) / 260 * c.dir, -1, 1), y: clamp((this.pointer.y - hy) / 260, -1, 1) };
      }
      if (this.dotPos && (c.state === "chase" || c.state === "stalk")) {
        const R = this._rect(), hx = c.cx + c.dir * c.W * (c.I.head - c.I.mid), hy = c.gy - c.H * 0.45;
        ctl.look = { x: clamp((this.dotPos.x - hx) / 200 * c.dir, -1, 1), y: clamp((this.dotPos.y - hy) / 200, -1, 1) };
      }
      if (c.mate) ctl.look = { x: 1, y: 0 };
      const walked = c.pet.frame(dt, ctl) * c.I.speed * c.k * dt;
      if (!c.air || !c.air.go) {
        c.cx += walked * c.dir;
        if (c.cx < lo || c.cx > hi) {
          c.cx = clamp(c.cx, lo, hi);
          if (c.surf && (c.state === "walk" || c.state === "flee") && Math.random() < 0.6) this._hopDown(c, now);
          else if (c.state === "walk") this._choose(c, now);
        }
      }
      const ox = c.W * c.I.mid;
      c.f.style.transformOrigin = `${ox}px 0`;
      c.f.style.transform = `translate(${(c.cx - ox).toFixed(1)}px, ${(c.gy - c.H * c.I.ground).toFixed(1)}px) scaleX(${(Math.abs(c.sx) < 0.08 ? 0.08 * Math.sign(c.sx || 1) : c.sx).toFixed(3)})`;
      c.f.style.zIndex = String(c.surf || c.air ? 20 : 10 - c.depth);
    }
    this._greet(now);
    this._hover();
  }

  /* two cats on the same ground who meet, face to face, stop and say hello */
  _greet(now) {
    const free = this.cats.filter((c) => (c.state === "walk" || c.state === "pause" || c.state === "follow") && !c.air && now > c.cool);
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const a = free[i], b = free[j];
      if (a.surf !== b.surf || Math.abs(a.gy - b.gy) > 20 || Math.abs(a.cx - b.cx) > (a.half + b.half) * 0.95) continue;
      const [l, r] = a.cx < b.cx ? [a, b] : [b, a];
      l.dir = 1; r.dir = -1;
      for (const c of [a, b]) { c.state = "greet"; c.until = now + 2800; c.ctl = { walk: 0 }; c.cool = now + 30000; c.mate = c === a ? b : a; }
      const warm = (a.tw[FOLLOW] + a.tw[ROAM]) >= (b.tw[FOLLOW] + b.tw[ROAM]) ? a : b;
      setTimeout(() => { if (warm.state === "greet") { warm.pet.react(); this._puff(warm, warm.tw[AVOID] >= 0.5 ? "…" : "♥", "#ff5fa2"); } }, 700);
      return;
    }
  }

  /* little floating glyphs above a cat's head: hearts, z's, notes */
  _puff(c, glyph, color) {
    const x = c.cx + c.dir * c.W * (c.I.head - c.I.mid), y = c.gy - this.size * 0.95;
    const e = this._el("div", `position:absolute;left:${x}px;top:${y}px;z-index:30;pointer-events:none;font:700 ${Math.round(this.size * 0.2)}px/1 ui-monospace,Menlo,monospace;color:${color};text-shadow:0 0 8px ${color}`, glyph);
    const a = e.animate([{ transform: "translate(-50%,0) scale(.6)", opacity: 0 }, { transform: "translate(-50%,-14px) scale(1)", opacity: 1, offset: 0.25 },
      { transform: `translate(calc(-50% + ${Math.round(rnd(-14, 14))}px),-${Math.round(this.size * 0.55)}px) scale(1.1)`, opacity: 0 }], { duration: 1500, easing: "ease-out" });
    a.onfinish = () => e.remove();
  }

  /* ---- the pointer ---- */
  _hit(x, y) {
    for (const c of [...this.cats].sort((a, b) => (b.surf || b.air ? 1 : 0) - (a.surf || a.air ? 1 : 0) || a.depth - b.depth)) {
      const r = c.f.getBoundingClientRect(); if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const lx = (c.sx < 0 ? r.right - x : x - r.left) / Math.max(0.08, Math.abs(c.sx)), el = c.f.contentDocument.elementFromPoint(lx, y - r.top);
      if (el && el.ownerSVGElement) return c;
    }
    return null;
  }
  /* stroking: the pointer moving back and forth over a cat */
  _stroke(x, y, dist, now) {
    const c = this._hit(x, y); if (!c || c.air || this.dot) return;
    if (now - c.petT > 900) c.petAcc = 0;
    c.petAcc = (c.petAcc || 0) + dist; c.petT = now;
    if (c.state === "pet") { c.petTotal += dist / 400; return; }
    if (c.petAcc > 140 && !BUSY.has(c.state)) {
      if (c.state === "nap" || (c.tw[AVOID] >= 1 && !c.petted)) { c.petted = true; this._react(c, now); return; }   // shy cats flinch the first time
      c.state = "pet"; c.petTotal = 0; c.puffT = 0;
    }
  }
  _hover() {
    const p = this.pointer, c = p && !this.dot && this._hit(p.x, p.y);
    if (!!c !== this._cur) { this._cur = !!c; this.doc.documentElement.style.cursor = c ? "grab" : ""; }
    if (!c) { this.tag.style.opacity = 0; return; }
    const r = c.f.getBoundingClientRect(), R = this._rect();
    this.tag.textContent = `${c.meta.name || c.I.name} · ${c.I.temperament}`;
    this.tag.style.left = c.cx + "px";
    this.tag.style.top = (r.top + r.height * 0.42 - R.top) + "px"; this.tag.style.opacity = 1;
  }
  _poke(c) {
    const now = performance.now();
    c.pokes = c.pokes.filter((t) => now - t < 6000); c.pokes.push(now);
    if (this.onpoke) this.onpoke(c);
    if (c.air || c.state === "prep") return;
    this._react(c, now);
    /* poked too often, a grumpy (or shy) cat takes itself elsewhere */
    if (c.pokes.length >= 3 && c.tw[AVOID] > 0.2) c.next = () => {
      if (c.surf) { this._hopDown(c, performance.now()); return; }
      const [l, h] = this._bounds(c); c.state = "flee"; c.target = c.cx > (l + h) / 2 ? l : h; c.until = performance.now() + 9000; c.ctl = { walk: 1.3 };
    };
  }
}
