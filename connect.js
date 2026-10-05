/* Connect a wallet to read its address — and nothing else.

   - The permission request asks for no scopes at all: no operation requests,
     no message signing, no encryption, no notifications. The wallet is only
     asked to share which address it is.
   - Everything in the Beacon client that could ask a wallet to do something
     (operations, signatures, broadcasts, encryption, proofs) is switched off
     on this page's client, so not even a bug here can send such a request.
   - The library is Beacon's connection client alone (vendor/beacon-readonly.js,
     built pinned by tools/wallet-libs), served from this site. Taquito, the
     library that builds transactions, is not on the page.
   - A connection left over from an older version of this page (which asked for
     more) is cleared before connecting, so only an address-only permission
     ever exists.
   - If a wallet refuses an address-only request, we stop there and ask for the
     address to be pasted instead. We never fall back to asking for more. */
let client = null;
const SCOPES = [];                                   // read the address; nothing else
const OFF = ["requestOperation", "requestSignPayload", "requestEncryptPayload", "requestBroadcast",
  "requestProofOfEventChallenge", "requestSimulatedProofOfEventChallenge"];

async function load() {
  if (client) return client;
  const { DAppClient, NetworkType } = await import("./vendor/beacon-readonly.js");
  client = new DAppClient({ name: "Prancers", network: { type: NetworkType.MAINNET } });
  for (const m of OFF) client[m] = () => Promise.reject(new Error("This site only reads your address."));
  return client;
}

/* returns the connected address; throws if the wallet declines or wants more than read access */
export async function connectReadOnly() {
  const c = await load();
  const old = await c.getActiveAccount();
  if (old && (old.scopes || []).length) await c.clearActiveAccount();   // an older, broader permission: drop it
  const res = await c.requestPermissions({ scopes: SCOPES });
  const granted = (res && res.scopes) || [];
  const a = res && res.address;
  if (!/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(a || "")) throw new Error("No address came back from the wallet.");
  if (granted.length) await c.clearActiveAccount().catch(() => {});      // a wallet that granted more than asked: we don't keep it
  return a;
}
export async function disconnectWallet() { if (client) await client.clearActiveAccount().catch(() => {}); }
