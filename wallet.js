/* One wallet connection for the whole site, kept as small and as narrow as possible.

   - The wallet libraries (Taquito + Beacon) are a pinned bundle served from this
     site (vendor/wallet-libs.js, built by tools/wallet-libs), loaded only when
     someone clicks Connect. No third-party server can change them.
   - Connecting asks the wallet for the one permission Beacon requires,
     operation requests, and never for message signing. This file builds no
     operations at all, so the site never sends the wallet a request; and a
     connection by itself cannot move anything: every operation is shown in
     the wallet and needs the holder's approval there.
   - Read-only mode: a holder can type an address or a .tez name instead of
     connecting. Nothing is asked of any wallet; we only read public data.

   Sections listen for "wallet:change" on window ({ detail: address or null })
   and read the mode with mode(): "wallet", "watch" or null. */
const B58 = /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/;
let libs = null, Tezos = null, wallet = null, address = null, how = null;

async function load() {
  if (wallet) return;
  libs = libs || await import("./vendor/wallet-libs.js");
  Tezos = new libs.TezosToolkit("https://rpc.tzkt.io/mainnet");
  wallet = new libs.BeaconWallet({ name: "Prancers", network: { type: "mainnet" } });
  Tezos.setWalletProvider(wallet);
}
const announce = (a, m) => { address = a; how = a ? m : null; dispatchEvent(new CustomEvent("wallet:change", { detail: a })); };
export const current = () => address;
export const mode = () => how;

/* connect a wallet: operation requests only (no message signing) */
export async function connect() {
  await load();
  await wallet.requestPermissions({ scopes: ["operation_request"] });
  const a = await wallet.getPKH();
  if (!B58.test(a)) throw new Error("unexpected address");
  announce(a, "wallet"); return a;
}
export async function disconnect() { if (wallet && how === "wallet") await wallet.clearActiveAccount(); announce(null); }

/* read-only: a tz address, or a .tez name resolved through Tezos Domains */
export async function watch(input) {
  const s = String(input || "").trim();
  if (B58.test(s)) { announce(s, "watch"); return s; }
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.tez$/i.test(s)) {
    const r = await fetch("https://api.tezos.domains/graphql", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "query($n:String!){domain(name:$n){address}}", variables: { n: s.toLowerCase() } }) }).then((x) => x.json());
    const a = r && r.data && r.data.domain && r.data.domain.address;
    if (a && B58.test(a)) { announce(a, "watch"); return a; }
    throw new Error("That .tez name doesn't point to a wallet.");
  }
  throw new Error("Enter a Tezos address (tz1…) or a .tez name.");
}
