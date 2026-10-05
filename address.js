/* Which Prancers does an address hold? The site never connects to a wallet:
   holders paste a Tezos address or type a .tez name, and we read public data.
   Sections listen for "address:change" on window ({ detail: address or null }). */
const TZ = /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/;
let address = null;
const announce = (a) => { address = a; dispatchEvent(new CustomEvent("address:change", { detail: a })); };
export const current = () => address;
export const clear = () => announce(null);

/* a tz address, or a .tez name resolved through Tezos Domains */
export async function lookup(input) {
  const s = String(input || "").trim();
  if (TZ.test(s)) { announce(s); return s; }
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.tez$/i.test(s)) {
    const r = await fetch("https://api.tezos.domains/graphql", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "query($n:String!){domain(name:$n){address}}", variables: { n: s.toLowerCase() } }) }).then((x) => x.json());
    const a = r && r.data && r.data.domain && r.data.domain.address;
    if (a && TZ.test(a)) { announce(a); return a; }
    throw new Error("That .tez name doesn't point to a wallet.");
  }
  throw new Error("Paste a Tezos address (tz1…) or type a .tez name.");
}
