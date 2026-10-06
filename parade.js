/* The Prancer Parade: every minted Prancer marching down one street, on a loop.

   Nothing is live or stored: the line-up comes from the chain (TzKT), and where the
   parade is comes from the clock. Everyone computes the same position from the same time
   (PARADE_EPOCH), so everyone watching sees the same cat pass at the same moment.

   The line-up: a Grand Marshal and an honour guard (the rarest cats, by trait shares in
   rarity.json), then a section for each temperament. The line never breaks: each section is
   announced by a banner plane flying over as its first cats walk in. Each cat is
   its own pet build (pet.html?seed=…), drawn and stepped here; only the cats near the
   screen exist at any moment. */
import { lookup, clear } from "./address.js";
import { connectReadOnly, disconnectWallet } from "./connect.js";

const KT = "KT1RXwgJuhByMw1eK2JP6FekXF7ZeexdspHw", API = "https://api.tzkt.io/v1/";
const PARADE_EPOCH = Date.UTC(2026, 9, 6);                 // the parade stepped off
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v).replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" })[c]);
const street = $("street"), lane = $("lane");

/* sizes follow the street: a little smaller on phones */
let SIZE, GAP, SPEED, LANE_Y;
function measure() {
  const w = street.clientWidth, h = street.clientHeight;
  SIZE = w < 600 ? 92 : w < 1000 ? 112 : 130;               // cat height, px
  GAP = SIZE * (w < 600 ? 1.95 : 1.65);                      // one cat's place in the line (roomier on phones, for the name sashes)
  SPEED = SIZE * 0.27;                                       // the parade's pace, px/s (cats adjust their stride to keep it)
  LANE_Y = h * 0.745;                                        // where paws meet the carpet
}
measure();

/* ---- the scenery (drawn once) ---- */
{ let s = ""; let x = 0, i = 0;
  while (x < 1200) { const w = 50 + ((i * 37) % 70), h = 70 + ((i * 53) % 150); s += `<rect x="${x}" y="${240 - h}" width="${w}" height="${h}" fill="#140c1e"/>`;
    for (let wy = 240 - h + 12; wy < 230; wy += 18) for (let wx = x + 8; wx < x + w - 10; wx += 14) if ((wx * 7 + wy * 3 + i) % 5 === 0) s += `<rect x="${wx}" y="${wy}" width="6" height="8" fill="${(wx + wy) % 3 ? "#ffc85f" : "#ff5fa2"}" opacity=".55"/>`;
    x += w + 4; i++; }
  $("skyline").innerHTML = s;
  let bnt = '<path d="M0 18 Q300 60 600 18 T1200 18" fill="none" stroke="#3a2a4a" stroke-width="2"/>';
  for (let k = 0; k < 40; k++) { const t = k / 40, bx = t * 1200, by = 18 + 42 * Math.sin(Math.PI * ((t * 2) % 1)) * 0.95, c = ["#ff5fa2", "#ffc85f", "#7be3c7", "#9b8cff"][k % 4];
    bnt += k % 2 ? `<path d="M${bx - 11} ${by} L${bx + 11} ${by} L${bx} ${by + 22}Z" fill="${c}" opacity=".85"/>` : `<circle cx="${bx}" cy="${by + 3}" r="4" fill="#fff6c8"/><circle cx="${bx}" cy="${by + 3}" r="11" fill="#ffc85f" opacity=".18"/>`; }
  $("bunting").innerHTML = bnt;
  let cr = '<g class="row">'; for (let k = 0; k < 64; k++) { const cx = k * 19 + (k % 3) * 3, cy = 82 + (k % 4) * 6, r = 15 + (k % 3) * 2, c = ["#0b0711", "#130c1c", "#0f0918"][k % 3];
    cr += `<g fill="${c}"><circle cx="${cx}" cy="${cy}" r="${r}"/><path d="M${cx - r * 0.85} ${cy - r * 0.3} L${cx - r * 0.55} ${cy - r * 1.35} L${cx - r * 0.1} ${cy - r * 0.75}Z M${cx + r * 0.85} ${cy - r * 0.3} L${cx + r * 0.55} ${cy - r * 1.35} L${cx + r * 0.1} ${cy - r * 0.75}Z"/><rect x="${cx - r}" y="${cy}" width="${2 * r}" height="60"/></g>`; }
  $("crowdsvg").innerHTML = cr + "</g>"; }

/* ---- the line-up ---- */
const SECTIONS = [
  ["Regal", "Their Royal Highnesses", "one slow, royal nod"], ["Confident", "The Confident Strutters", "eyes front, tails high"],
  ["Sassy", "The Sass Squad", "chins up, side-eye ready"], ["Playful", "The Zoomies Brigade", "may break formation"],
  ["Curious", "The Curious Corps", "stopping to look at everything"], ["Sweet", "The Sweethearts", "slow blinks for all"],
  ["Shy", "The Shy Ones", "(hi)"], ["Chill", "The Chill Collective", "in no hurry whatsoever"], ["Grumpy", "The Grumpy Section", "attendance mandatory"],
];
let slots = [], planes = [], LOOP = 1, mine = new Set();
/* TzKT reads each token's metadata file from IPFS on its own schedule and can fall hours
   behind (objkt runs its own indexer, so it doesn't). For a token TzKT hasn't resolved yet, the
   site follows the contract's own token_metadata link and reads the file itself. If IPFS is slow
   too, the seed is still on chain: it's the mint's operation hash, so the cat can be drawn anyway. */
async function freshMeta(ids) {
  const out = {}; if (!ids.length) return out;
  const get = (u) => fetch(u, { signal: AbortSignal.timeout(8000) }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const SEED = /^o[1-9A-HJ-NP-Za-km-z]{50}$/, CID = /^ipfs:\/\/([A-Za-z0-9]{46,64})$/;
  try {
    const keys = await get(`${API}contracts/${KT}/bigmaps/token_metadata/keys?${ids.length > 1 ? "key.in=" + ids.join(",") : "key=" + ids[0]}&select=key,value`);
    await Promise.all(keys.map(async (k) => { try {
      const hx = String((k.value && k.value.token_info && k.value.token_info[""]) || ""), uri = hx.replace(/[0-9a-f]{2}/g, (h) => String.fromCharCode(parseInt(h, 16)));
      const cid = CID.exec(uri); if (!cid) return;
      const m = await get("https://ipfs.fileship.xyz/" + cid[1]);
      out[k.key] = { name: typeof m.name === "string" ? m.name : "", thumbnailUri: m.thumbnailUri, displayUri: m.displayUri,
        attributes: Array.isArray(m.attributes) ? m.attributes : [], aleaSeed: SEED.test(m.aleaSeed || "") ? m.aleaSeed : undefined };
    } catch (e) { /* this one falls back to its mint hash below */ } }));
  } catch (e) { /* likewise */ }
  const need = ids.filter((id) => !(out[id] && out[id].aleaSeed));
  if (need.length) try {
    const tr = await get(`${API}tokens/transfers?token.contract=${KT}&from.null=true&token.tokenId.in=${need.join(",")}&limit=1000&select=token.tokenId,transactionId`);
    const ops = tr.length ? await get(`${API}operations/transactions?id.in=${tr.map((t) => t.transactionId).join(",")}&limit=1000&select=id,hash,target`) : [];
    for (const t of tr) { const op = ops.find((o) => o.id === t.transactionId);
      if (op && op.target && op.target.address === KT && SEED.test(op.hash)) out[t["token.tokenId"]] = { name: "", attributes: [], ...(out[t["token.tokenId"]] || {}), aleaSeed: op.hash }; }
  } catch (e) { /* the cat waits for TzKT */ }
  return out;
}
async function lineUp() {
  const [tokens, rarity] = await Promise.all([
    fetch(`${API}tokens?contract=${KT}&limit=1000&select=tokenId,metadata`).then((r) => r.json()),
    fetch("rarity.json").then((r) => r.json()).catch(() => null)]);
  const fresh = tokens.filter((t) => !(t.metadata || {}).aleaSeed), got = await freshMeta(fresh.map((t) => t.tokenId));
  for (const t of fresh) t.metadata = got[t.tokenId] || {};   // without traits yet, a cat marches with the New Recruits
  const cats = tokens.map((t) => { const m = t.metadata || {}, f = Object.fromEntries((m.attributes || []).map((a) => [a.name, a.value]));
    const n = Number(t.tokenId) + 1, name = m.name ? String(m.name).replace(/^Prancers #\d+ · /, "") : "New Recruit";
    let score = 0; if (rarity) for (const [k, v] of Object.entries(f)) { const c = rarity.traits[k] && rarity.traits[k][v]; if (c) score += -Math.log(c / rarity.sample); }
    return { id: Number(t.tokenId), n, name, seed: m.aleaSeed, temp: f.Temperament, plain: f.Color === "White" || /solid white/i.test(f["White Spots"] || ""), score }; })
    .filter((c) => /^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(c.seed || ""));
  const leaders = cats.filter((c) => !c.plain).sort((a, b) => b.score - a.score).slice(0, 3), lead = new Set(leaders.map((c) => c.id));
  const out = [], heads = [];   // heads: [title, sub, gold, index of the section's first cat]
  const sign = (title, sub, gold) => heads.push({ title, sub, gold, first: out.length });
  if (leaders.length) { sign("★ Grand Marshal ★", "rarest cat on the street", true); out.push({ kind: "cat", cat: leaders[0], gold: true, w: GAP * 1.25 });
    if (leaders.length > 1) { sign("The Honour Guard", "next-rarest, in step", true); for (const c of leaders.slice(1)) out.push({ kind: "cat", cat: c, gold: true, w: GAP }); } }
  for (const [temp, title, sub] of SECTIONS) {
    const group = cats.filter((c) => c.temp === temp && !lead.has(c.id)).sort((a, b) => a.n - b.n);
    if (!group.length) continue;
    sign(title, sub); for (const c of group) out.push({ kind: "cat", cat: c, w: GAP });
  }
  const recruits = cats.filter((c) => !c.temp).sort((a, b) => a.n - b.n);
  if (recruits.length) { sign("The New Recruits", "fresh from the mint"); for (const c of recruits) out.push({ kind: "cat", cat: c, w: GAP }); }
  let at = 0; for (const s of out) { s.at = at + s.w / 2; at += s.w; }
  slots = out; LOOP = at + street.clientWidth * 0.6;          // a short empty stretch, then the head comes round again
  planes = heads.map((hd, k) => ({ ...hd, at: out[hd.first].at, alt: k % 2 }));
  planes.push({ title: "The Parade Goes On", sub: "back around in a moment", gold: true, at: at + GAP * 0.5, alt: planes.length % 2 });
  $("p-count").textContent = `${cats.length} Prancers marching · the whole parade passes in about ${Math.round(LOOP / SPEED / 60)} min`;
}

/* where the head of the parade is, for everyone, right now */
const head = () => (((Date.now() - PARADE_EPOCH) / 1000) * SPEED) % LOOP;
const screenX = (s, h) => ((((h - s.at) % LOOP) + LOOP) % LOOP) - 280;   // the slot's centre, in street px

/* ---- the marchers on screen ---- */
const live = new Map();   // slot index → { el(s), pet, … }
function spawn(i) {
  const s = slots[i], o = { s };
  {
    const f = document.createElement("iframe"); f.title = s.cat.name; f.setAttribute("aria-hidden", "true"); f.src = "pet.html?seed=" + encodeURIComponent(s.cat.seed);
    f.style.visibility = "hidden"; lane.appendChild(f); o.f = f;
    f.onload = () => { const pet = f.contentWindow && f.contentWindow.__pet; if (!pet) return; o.pet = pet; o.I = pet.info; size(o); f.style.visibility = "visible"; o.sash.style.visibility = ""; };
    o.sash = document.createElement("div"); o.sash.className = "sash" + (s.gold ? " gold" : ""); o.sash.style.visibility = "hidden"; o.sash.textContent = `#${s.cat.n} · ${s.cat.name}`; o.sash.style.maxWidth = GAP - 10 + "px"; lane.appendChild(o.sash);
  }
  live.set(i, o); return o;
}
function size(o) { const I = o.I, k = SIZE / (I.box[3] * 0.62); o.k = k; o.W = I.box[2] * k; o.H = I.box[3] * k; o.f.style.width = o.W + "px"; o.f.style.height = o.H + "px"; }
function drop(i) { const o = live.get(i); for (const k of ["el", "f", "sash", "spot", "banner"]) if (o[k]) o[k].remove(); live.delete(i); }

/* kind to laptops: at most ~30 frames a second, and nothing while the street is scrolled out of view */
let last = performance.now(), streetSeen = true;
new IntersectionObserver(([e]) => { streetSeen = e.isIntersecting; }).observe(street);
function tick(now) {
  if (!streetSeen || now - last < 31) { if (!streetSeen) last = now; requestAnimationFrame(tick); return; }
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (slots.length) {
    const h = head(), W = street.clientWidth;
    slots.forEach((s, i) => { const x = screenX(s, h), on = x > -320 && x < W + 320;
      if (on && !live.has(i)) spawn(i); else if (!on && live.has(i)) drop(i); });
    for (const [i, o] of live) {
      const x = screenX(o.s, h), bob = Math.sin(now / 1000 * Math.PI * 2 * 2) * 2;   // the banners bob to the march (120 BPM)
      if (!o.pet) continue;
      /* each cat keeps the parade's pace with its own gait: its stride quickens or slows, its paws stay planted */
      const w = Math.max(0.3, Math.min(2, SPEED / (o.I.speed * o.k)));
      o.pet.frame(dt, { walk: w });
      const ox = o.W * o.I.mid;
      o.f.style.transform = `translate(${(x - ox).toFixed(1)}px, ${(LANE_Y - o.H * o.I.ground).toFixed(1)}px)`;
      o.sash.style.transform = `translate(${x.toFixed(1)}px, ${(LANE_Y + 6).toFixed(1)}px) translateX(-50%)`;
      const isMine = mine.has(o.s.cat.id);
      o.sash.classList.toggle("mine", isMine);
      if ((isMine || o.s.gold) && !o.spot) { o.spot = document.createElement("div"); o.spot.className = "spot"; lane.insertBefore(o.spot, lane.firstChild); }
      if (o.spot) { o.spot.style.left = x + "px"; o.spot.style.height = LANE_Y + 10 + "px"; }
      if (isMine && !o.banner) { o.banner = document.createElement("div"); o.banner.className = "banner"; o.banner.textContent = "★ Your Prancer ★"; lane.appendChild(o.banner); burst(x, LANE_Y - SIZE, 60); }
      if (!isMine && o.banner) { o.banner.remove(); o.banner = null; }
      if (o.banner) o.banner.style.transform = `translate(${x.toFixed(1)}px, ${(LANE_Y - SIZE * 1.25 + bob).toFixed(1)}px) translate(-50%, -100%)`;
    }
    fly(h, W, now);
    const beat = (now / 500) % 1, row = document.querySelector("#crowd .row");
    if (row) row.style.transform = `translateY(${(Math.abs(Math.sin(beat * Math.PI)) * -3).toFixed(1)}px)`;
  }
  confetti(dt);
  requestAnimationFrame(tick);
}

/* ---- banner planes: one per section, crossing the sky as its first cats walk in ----
   Its place in the sky comes from the same clock as the cats: it starts across while the
   section's first cat is still ~600 px off-stage and is gone by the time that cat is a
   quarter of the way along. It flies against the parade, so its banner reads left to right. */
const flying = new Map();
const PLANE = '<svg viewBox="0 0 120 54" width="96" height="43" aria-hidden="true"><g fill="#1b1426" stroke="#ff5fa2" stroke-width="2.4" stroke-linejoin="round">' +
  '<path d="M14 27 Q16 17 34 17 L92 19 Q104 20 110 27 Q104 34 92 35 L34 37 Q16 37 14 27Z"/><path d="M50 18 L64 2 L74 2 L68 19Z"/><path d="M52 35 L68 52 L78 52 L70 35Z"/>' +
  '<path d="M96 20 L110 8 L116 8 L112 23Z"/></g><circle cx="40" cy="25" r="4" fill="#ffc85f"/><circle cx="54" cy="25" r="4" fill="#ffc85f"/>' +
  '<g class="prop"><rect x="8" y="12" width="3" height="30" rx="1.5" fill="#f6effa"/></g><circle cx="11" cy="27" r="3" fill="#ffc85f"/></svg>';
function fly(h, W, now) {
  planes.forEach((p, k) => {
    const xFirst = screenX(p, h), u = (xFirst + 600) / (W * 0.25 + 600);
    let o = flying.get(k);
    if (u < 0 || u > 1) { if (o) { o.el.remove(); flying.delete(k); } return; }
    if (!o) { o = { el: document.createElement("div") }; o.el.className = "plane" + (p.gold ? " gold" : "");
      o.el.innerHTML = PLANE + `<i class="rope"></i><div class="flag"><b>${esc(p.title)}</b><span>${esc(p.sub)}</span></div>`;
      $("sky-lane").appendChild(o.el); o.w = o.el.offsetWidth; flying.set(k, o); }
    const x = W + 60 - u * (W + o.w + 160), y = street.clientHeight * (p.alt ? 0.31 : 0.235) + Math.sin(now / 900 + k) * 4;
    o.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  });
}

/* ---- confetti ---- */
const cv = $("confetti"), cx = cv.getContext("2d"); let bits = [];
const fit = () => { const r = street.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; cx.setTransform(d, 0, 0, d, 0, 0); };
fit(); addEventListener("resize", () => { fit(); measure(); for (const o of live.values()) if (o.I) size(o); });
function burst(x, y, n = 40) { const C = ["#ff5fa2", "#ffc85f", "#7be3c7", "#9b8cff", "#ffffff"];
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 180 + Math.random() * 320;
    bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12, c: C[i % C.length], s: 4 + Math.random() * 5, life: 2.2 }); } }
let wasConfetti = false;
function confetti(dt) { if (!bits.length && !wasConfetti) return; wasConfetti = bits.length > 0;   // an empty sky costs nothing
  cx.clearRect(0, 0, cv.width, cv.height); bits = bits.filter((b) => (b.life -= dt) > 0);
  for (const b of bits) { b.vy += 520 * dt; b.vx *= 0.99; b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt;
    cx.save(); cx.globalAlpha = Math.min(1, b.life); cx.translate(b.x, b.y); cx.rotate(b.r); cx.fillStyle = b.c; cx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); cx.restore(); } }

/* a tap on a cat gets its reaction; a tap anywhere else, confetti */
street.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button")) return;
  const r = street.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  for (const o of live.values()) { if (!o.pet) continue; const fr = o.f.getBoundingClientRect();
    if (e.clientX < fr.left || e.clientX > fr.right || e.clientY < fr.top || e.clientY > fr.bottom) continue;
    const el = o.f.contentDocument.elementFromPoint(e.clientX - fr.left, e.clientY - fr.top);
    if (el && el.ownerSVGElement) { o.pet.react(); burst(x, y, 24); return; } }
  burst(x, y);
});

/* ---- the march, in step with the parade ---- */
const march = $("march");
$("sound").onclick = async () => {
  if (!march.paused) { march.pause(); $("sound").textContent = "🔊 Play the march"; $("sound").setAttribute("aria-pressed", "false"); return; }
  try { march.load(); await new Promise((r) => (march.readyState >= 1 ? r() : march.addEventListener("loadedmetadata", r, { once: true })));
    march.currentTime = ((Date.now() - PARADE_EPOCH) / 1000) % march.duration; await march.play();
    $("sound").textContent = "🔇 Mute the march"; $("sound").setAttribute("aria-pressed", "true"); } catch (e) {}
};
setInterval(() => { if (!march.paused && march.duration) { const want = ((Date.now() - PARADE_EPOCH) / 1000) % march.duration; if (Math.abs(march.currentTime - want) > 0.35) march.currentTime = want; } }, 5000);

/* ---- your cats: when they pass ---- */
const fmt = (s) => s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
function lists() {
  if (!slots.length) return;
  const h = head(), W = street.clientWidth, centre = W / 2;
  const when = (s) => { const x = screenX(s, h); if (x > -60 && x < W + 60) return 0; return ((((centre - x) % LOOP) + LOOP) % LOOP) / SPEED; };
  const catSlots = slots;
  $("p-mine").innerHTML = catSlots.filter((s) => mine.has(s.cat.id)).map((s) => [s, when(s)]).sort((a, b) => a[1] - b[1])
    .map(([s, t]) => `<li class="${t ? "" : "now"}"><b>#${s.cat.n} · ${esc(s.cat.name)}</b><span>${t ? "passes in " + fmt(t) : "marching now ★"}</span></li>`).join("");
  $("p-next").innerHTML = catSlots.map((s) => [s, when(s)]).filter(([, t]) => t > 0).sort((a, b) => a[1] - b[1]).slice(0, 5)
    .map(([s, t]) => `<li><b>#${s.cat.n} · ${esc(s.cat.name)}</b><span>${fmt(t)}</span></li>`).join("");
}
async function loadMine(a) {
  if (!a) { mine = new Set(); $("p-mine").innerHTML = ""; $("p-note").textContent = "Connecting only shares your address; nothing to sign."; return; }
  $("p-note").textContent = "Finding your cats…";
  const held = await fetch(`${API}tokens/balances?account=${a}&token.contract=${KT}&balance.gt=0&limit=1000&select=token.tokenId`).then((r) => r.json()).catch(() => []);
  mine = new Set(held.map((x) => Number(x)));
  $("p-note").innerHTML = mine.size ? `${mine.size} of your Prancers ${mine.size > 1 ? "are" : "is"} in the parade. <a href="#" id="p-change">Change address</a>` : 'No Prancers at this address yet. <a href="index.html#mint">Adopt one</a> and it joins the parade.';
  const ch = document.getElementById("p-change"); if (ch) ch.onclick = (e) => { e.preventDefault(); clear(); disconnectWallet(); };
  lists();
}
addEventListener("address:change", (e) => loadMine(e.detail));
$("p-watch").onsubmit = async (e) => { e.preventDefault(); try { $("p-note").textContent = "Looking up…"; await lookup($("p-addr").value); } catch (err) { $("p-note").textContent = err.message || "Couldn't find that address."; } };
$("p-connect").onclick = async () => { $("p-note").textContent = "Opening your wallet… it will only be asked for your address.";
  try { await lookup(await connectReadOnly()); } catch (e) { $("p-note").textContent = "Not connected. You can paste your address instead."; } };

/* a hook for the reel-capture tools, on localhost only: where everything is, from the same clock */
if (location.hostname === "localhost") window.__parade = { get slots() { return slots; }, get planes() { return planes; }, get LOOP() { return LOOP; },
  get SPEED() { return SPEED; }, head, screenX, epoch: PARADE_EPOCH, street };

lineUp().then(() => { lists(); setInterval(lists, 1000); }).catch(() => { $("p-count").textContent = "Couldn't reach the chain just now. Refresh to try again."; });
requestAnimationFrame(tick);
