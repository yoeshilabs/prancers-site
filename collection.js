/* Your collection: everything you hold across the line-up, in one place. Tabs per collection (with counts),
   a grid of covers, and a live viewer for the one you pick: play with it, make a GIF of it in the Lab, or
   open it on objkt. Fed by me.js (one read of all four contracts). */
import { me, who } from "./me.js";
import { LINEUP } from "./chain.js";
const $ = (id) => document.getElementById(id), host = $("coll");
const esc = (v) => String(v).replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" })[c]);
const LAB = { prancers: "Prancers", pads: "Prancer Pads", pfp: "Prancer PFP", ride: "Wild Ride" };
let tab = "all", pick = null;
const list = () => { const S = me(); return tab === "all" ? LINEUP.flatMap(([k]) => S.all[k] || []) : S.all[tab] || []; };
function render() {
  const S = me();
  if (S.status !== "ready" || !S.total) { host.hidden = true; return; }
  host.hidden = false;
  const counts = Object.fromEntries(LINEUP.map(([k]) => [k, (S.all[k] || []).length]));
  $("coll-tabs").innerHTML = [["all", "All", S.total], ...LINEUP.filter(([k]) => counts[k]).map(([k, , l]) => [k, l, counts[k]])]
    .map(([k, l, n]) => `<button type="button" role="tab" data-ct="${k}" aria-selected="${k === tab}">${esc(l)}<small>${n}</small></button>`).join("");
  $("coll-tabs").querySelectorAll("[data-ct]").forEach((b) => b.onclick = () => { tab = b.dataset.ct; render(); });
  const items = list();
  if (!pick || !Object.values(S.all).flat().some((c) => c.kt === pick.kt && c.id === pick.id)) pick = items[0] || null;
  $("coll-grid").innerHTML = items.map((c, i) => `<button type="button" class="tok${pick && c.kt === pick.kt && c.id === pick.id ? " on" : ""}" data-i="${i}" title="${esc(c.name)}">
      ${c.thumb ? `<img src="${esc(c.thumb)}" alt="" loading="lazy">` : `<span class="ph">${esc(LAB[c.coll])}</span>`}<span class="nm">${esc(c.name)}</span><span class="cl">${esc(LAB[c.coll])}</span></button>`).join("");
  $("coll-grid").querySelectorAll("[data-i]").forEach((b) => b.onclick = () => { pick = items[+b.dataset.i]; render(); });
  view();
}
let shown = "";
function view() {
  if (!pick) return;
  const gen = LINEUP.find(([k]) => k === pick.coll)[3], key = pick.kt + pick.id;
  if (shown !== key && pick.seed) { $("coll-stage").src = `${gen}?seed=${encodeURIComponent(pick.seed)}`; shown = key; }
  $("coll-name").textContent = pick.name; $("coll-kind").textContent = LAB[pick.coll] + (pick.temp ? " · " + pick.temp : "");
  $("coll-objkt").href = `https://objkt.com/tokens/${pick.kt}/${pick.id}`;
  $("coll-gif").onclick = () => window.toLab && window.toLab(pick.coll, pick.seed);
  $("coll-gif").disabled = !pick.seed;
}
$("coll-who").textContent = "";
addEventListener("me:change", () => { $("coll-who").textContent = who(); render(); }); render();
