/* You, once, for the whole site.
   Connect a wallet (read-only: connect.js) or paste an address or .tez name, and every tool on
   every page uses your Prancers: the studio's traits, GIFs and Desk Prancers, and the Parade.
   Only the address is remembered (in this browser, for your next visit); it's public, and
   "Forget" clears it. Pages listen for "me:change" on window; detail is the state below. */
import { connectReadOnly, disconnectWallet } from "./connect.js";
import { lookup } from "./address.js";
import { holdings } from "./chain.js";

const KEY = "prancers.me", TZ = /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/;
const S = { address: null, name: "", cats: [], status: "none", note: "" };   // status: none · loading · ready · error
const emit = () => dispatchEvent(new CustomEvent("me:change", { detail: S }));
const store = (a) => { try { if (a) localStorage.setItem(KEY, a); else localStorage.removeItem(KEY); } catch (e) { /* private mode: just this visit */ } };
export const me = () => S;
export const short = (a) => a.slice(0, 5) + "…" + a.slice(-4);
export const who = () => S.name || (S.address ? short(S.address) : "");

/* the .tez name an address has chosen to show, if any */
async function tezName(a) {
  try {
    const r = await fetch("https://api.tezos.domains/graphql", { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(6000),
      body: JSON.stringify({ query: "query($a:String!){reverseRecord(address:$a){domain{name}}}", variables: { a } }) }).then((x) => x.json());
    const n = r && r.data && r.data.reverseRecord && r.data.reverseRecord.domain && r.data.reverseRecord.domain.name;
    return typeof n === "string" && /^[a-z0-9.-]+\.tez$/i.test(n) ? n : "";
  } catch (e) { return ""; }
}
async function load(a) {
  Object.assign(S, { address: a, name: "", cats: [], status: "loading", note: "Finding your cats…" }); emit();
  try {
    const retry = async (f, n = 3) => { for (let i = 0; ; i++) { try { return await f(); } catch (e) { if (i >= n - 1) throw e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); } } };   // TzKT rate-limits bursts
    const [cats, name] = await Promise.all([retry(() => holdings(a)), tezName(a)]);
    if (S.address !== a) return;
    Object.assign(S, { cats, name, status: "ready", note: "" });
  } catch (e) { if (S.address !== a) return; Object.assign(S, { status: "error", note: "Couldn't read your Prancers just now. Try again in a moment." }); }
  emit();
}
export async function useAddress(input) { const a = await lookup(input); store(a); await load(a); return a; }
export async function connect() { return useAddress(await connectReadOnly()); }
export function forget() { store(null); disconnectWallet(); Object.assign(S, { address: null, name: "", cats: [], status: "none", note: "" }); emit(); }
export const reload = () => S.address && load(S.address);
{ let a = null; try { a = localStorage.getItem(KEY); } catch (e) {} if (a && TZ.test(a)) load(a); }

/* ------------------------------------------------------------------ the shared controls */
const esc = (v) => String(v).replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" })[c]);
const NOTE = "Read-only: the wallet is asked for your address and nothing else. No signing, no transactions.";
const why = (e) => /abort|reject|cancel|closed/i.test(String(e && (e.message || e.errorType || e)))
  ? "Not connected. You can paste your address instead." : "Your wallet didn't connect read-only, so we stopped there. Paste your address instead.";

/* connect / paste, wherever it's needed (the nav panel, the studio, the parade) */
export function connectForm(host, { compact = false } = {}) {
  host.innerHTML = `<div class="me-connect"><button class="btn" type="button" data-c>Connect wallet · read-only</button>
    <form class="lookup" data-p><input placeholder="or paste an address · name.tez" spellcheck="false" autocomplete="off" aria-label="Your Tezos address or .tez name"><button class="btn ghost" type="submit">Find my cats</button></form>
    <p class="me-note" aria-live="polite">${compact ? "" : NOTE}</p></div>`;
  const note = host.querySelector(".me-note"), say = (t) => { note.textContent = t; };
  host.querySelector("[data-c]").onclick = async () => { say("Opening your wallet… it will only be asked for your address."); try { await connect(); } catch (e) { say(why(e)); } };
  host.querySelector("[data-p]").onsubmit = async (e) => { e.preventDefault(); say("Looking up…");
    try { await useAddress(host.querySelector("input").value); } catch (err) { say(err.message || "Couldn't find that address."); } };
}

/* the nav button and its panel */
export function mountChip(host, { home = "" } = {}) {
  host.className = "me"; host.innerHTML = `<button class="me-btn" type="button" aria-expanded="false" aria-haspopup="dialog"></button><div class="me-pop" role="dialog" aria-label="Your Prancers" hidden></div>`;
  const btn = host.querySelector(".me-btn"), pop = host.querySelector(".me-pop");
  const open = (on) => { pop.hidden = !on; btn.setAttribute("aria-expanded", on); if (on) render(); };
  btn.onclick = () => open(pop.hidden);
  addEventListener("keydown", (e) => { if (e.key === "Escape") open(false); });
  addEventListener("pointerdown", (e) => { if (!host.contains(e.target)) open(false); });
  const thumbs = (n) => S.cats.slice(0, n).map((c) => c.thumb ? `<img src="${esc(c.thumb)}" alt="">` : "<i></i>").join("");
  function render() {
    btn.innerHTML = S.status === "none" ? "<span>Your Prancers</span>"
      : S.status === "loading" ? `<span>${esc(who())}</span><small>…</small>`
      : `<span class="th">${thumbs(3)}</span><span>${esc(who())}</span><small>${S.cats.length}</small>`;
    if (pop.hidden) return;
    if (S.status === "none") { pop.innerHTML = `<h4>Your Prancers</h4><p>Connect once and your cats show up everywhere here: traits, GIFs, Desk Prancers and the Parade.</p><div data-f></div>`; connectForm(pop.querySelector("[data-f]")); return; }
    pop.innerHTML = `<h4>${esc(who())}</h4><p class="me-addr">${esc(S.address)}</p>` +
      (S.status === "loading" ? "<p>Finding your cats…</p>" : S.status === "error" ? `<p>${esc(S.note)}</p>`
        : S.cats.length ? `<div class="me-cats">${S.cats.map((c) => `<span title="#${c.n} · ${esc(c.name)}">${c.thumb ? `<img src="${esc(c.thumb)}" alt="">` : "<i></i>"}</span>`).join("")}</div><p>${S.cats.length} Prancer${S.cats.length > 1 ? "s" : ""}${home ? ` · <a href="${home}">open your studio</a>` : ""}</p>`
        : `<p>No Prancers at this address yet. <a href="index.html#mint">Adopt one</a>.</p>`) +
      `<div class="me-row"><button class="btn ghost" type="button" data-o>Use another address</button><button class="btn ghost" type="button" data-x>Forget</button></div>`;
    pop.querySelector("[data-x]").onclick = () => { forget(); };
    pop.querySelector("[data-o]").onclick = () => { forget(); open(true); };
  }
  addEventListener("me:change", render); render();
  return { open };
}
