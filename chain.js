/* Prancers on chain, read through TzKT's public API: one place for the whole site.
   Every value that ends up on a page comes back through toCat(), which keeps only what the
   site uses and checks its shape (seeds against the operation-hash pattern, images against a
   strict ipfs:// pattern). Text still goes through the page's esc() when it's shown. */
export const KT = "KT1RXwgJuhByMw1eK2JP6FekXF7ZeexdspHw", API = "https://api.tzkt.io/v1/";
export const SEED = /^o[1-9A-HJ-NP-Za-km-z]{50}$/;
const CID = /^ipfs:\/\/([A-Za-z0-9]{46,64})((\/[A-Za-z0-9._-]+)*)$/;
/* covers through Aleatory's own IPFS gateway */
export const ipfs = (u) => { const m = CID.exec(typeof u === "string" ? u : ""); return m ? "https://ipfs.fileship.xyz/" + m[1] + m[2] : ""; };
const get = (u) => fetch(u, { signal: AbortSignal.timeout(10000) }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

/* TzKT reads each token's metadata file from IPFS on its own schedule and can fall hours
   behind (objkt runs its own indexer, so it doesn't). For a token TzKT hasn't resolved yet, follow
   the contract's own token_metadata link and read the file. If IPFS is slow too, the seed is
   still on chain: it's the mint's operation hash, so the cat can be drawn anyway. */
export async function freshMeta(ids) {
  const out = {}; if (!ids.length) return out;
  try {
    const keys = await get(`${API}contracts/${KT}/bigmaps/token_metadata/keys?${ids.length > 1 ? "key.in=" + ids.join(",") : "key=" + ids[0]}&select=key,value`);   // TzKT refuses key.in with one value
    await Promise.all(keys.map(async (k) => { try {
      const hx = String((k.value && k.value.token_info && k.value.token_info[""]) || ""), uri = hx.replace(/[0-9a-f]{2}/g, (h) => String.fromCharCode(parseInt(h, 16)));
      const cid = /^ipfs:\/\/([A-Za-z0-9]{46,64})$/.exec(uri); if (!cid) return;
      const m = await get("https://ipfs.fileship.xyz/" + cid[1]);
      out[k.key] = { name: typeof m.name === "string" ? m.name : "", thumbnailUri: m.thumbnailUri, displayUri: m.displayUri,
        attributes: Array.isArray(m.attributes) ? m.attributes : [], aleaSeed: SEED.test(m.aleaSeed || "") ? m.aleaSeed : undefined };
    } catch (e) { /* this one falls back to its mint hash below */ } }));
  } catch (e) { /* likewise */ }
  const need = ids.filter((id) => !(out[id] && out[id].aleaSeed));
  if (need.length) try {
    const tr = await get(`${API}tokens/transfers?token.contract=${KT}&from.null=true&token.tokenId.in=${need.join(",")},${need[0]}&limit=1000&select=token.tokenId,transactionId`);
    const ops = tr.length ? await get(`${API}operations/transactions?id.in=${tr.map((t) => t.transactionId).join(",")},${tr[0].transactionId}&limit=1000&select=id,hash,target`) : [];
    for (const t of tr) { const op = ops.find((o) => o.id === t.transactionId);
      if (op && op.target && op.target.address === KT && SEED.test(op.hash)) out[t["token.tokenId"]] = { name: "", attributes: [], ...(out[t["token.tokenId"]] || {}), aleaSeed: op.hash }; }
  } catch (e) { /* the cat waits for TzKT */ }
  return out;
}

/* a token as the site uses it: { id, n, name, seed, thumb, temp } */
export function toCat(id, m = {}) {
  const n = Number(id) + 1, full = typeof m.name === "string" ? m.name : "", f = {};
  for (const a of Array.isArray(m.attributes) ? m.attributes : []) if (a && typeof a.name === "string") f[a.name] = String(a.value);
  return { id: Number(id), n, name: full.replace(/^Prancers #\d+ · /, "") || `Prancer #${n}`, seed: SEED.test(m.aleaSeed || "") ? m.aleaSeed : "",
    thumb: ipfs(m.thumbnailUri || m.displayUri), temp: f.Temperament || "" };
}
async function fill(rows) {   // rows: [{ id, m }] with TzKT's metadata; fills the ones TzKT hasn't read yet
  const late = rows.filter((r) => !(r.m && r.m.aleaSeed)), got = await freshMeta(late.map((r) => r.id));
  for (const r of late) r.m = got[r.id] || r.m || {};
  return rows.map((r) => toCat(r.id, r.m));
}
/* every Prancer an address holds, oldest first */
export async function holdings(address) {
  const bal = await get(`${API}tokens/balances?account=${address}&token.contract=${KT}&balance.gt=0&limit=500&select=token.tokenId,token.metadata`);
  return (await fill(bal.map((b) => ({ id: b["token.tokenId"], m: b["token.metadata"] })))).sort((a, b) => a.id - b.id);
}
/* one Prancer by token id (null if it hasn't been minted) */
export async function tokenCat(id) {
  const t = await get(`${API}tokens?contract=${KT}&tokenId=${Number(id)}&select=tokenId,metadata`);
  return t.length ? (await fill([{ id: t[0].tokenId, m: t[0].metadata }]))[0] : null;
}
/* a random minted Prancer, for the cat that visits before you connect */
export async function randomCat() {
  const all = await get(`${API}tokens?contract=${KT}&metadata.aleaSeed.null=false&limit=1000&select=tokenId,metadata`);
  const t = all[Math.floor(Math.random() * all.length)]; return t ? toCat(t.tokenId, t.metadata) : null;
}
