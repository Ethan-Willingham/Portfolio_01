// Optional local provenance audit. No entropy is used by this analytic model.
// drand-client 1.4.2 contains quicknet's G1 RFC9380 verification, not legacy G2.
const CHAIN_HASH = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';
const PUBLIC_KEY = '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a';
export async function verifyFixture({ beacon, info, signal } = {}) {
  const base = new URL('../assets/visualizer/hydrogen-exactly/', import.meta.url);
  const read = async name => { const response = await fetch(new URL(name, base), { signal }); if (!response.ok) throw new Error('Bundled beacon audit data unavailable.'); return response.json(); };
  if (!info) info = await read('drand-quicknet-info.json');
  if (!beacon) beacon = await read('drand-quicknet-round-42.json');
  if (info.hash !== CHAIN_HASH || info.public_key !== PUBLIC_KEY || info.schemeID !== 'bls-unchained-g1-rfc9380') throw new Error('Beacon chain metadata differs from the pinned quicknet chain.');
  if (beacon.round !== 42) throw new Error('This local fixture audit requires round 42.');
  const { fetchBeacon } = await import('../assets/visualizer/hydrogen-exactly/drand-client-1.4.2.mjs');
  // Official client transport interface backed by local, pinned records.
  // fetchBeacon calls its complete SHA-256 and BLS verification path.
  const client = {
    options: { disableBeaconVerification: false, noCache: false, chainVerificationParams: { chainHash: CHAIN_HASH, publicKey: PUBLIC_KEY } },
    chain: () => ({ info: async () => info }), get: async () => beacon
  };
  const verified = await fetchBeacon(client, 42);
  return { verified: true, chainHash: CHAIN_HASH, scheme: info.schemeID, round: verified.round,
    seed: verified.randomness, seedDerivation: 'SHA-256 of the BLS signature, checked by drand-client 1.4.2',
    source: 'Bundled historical quicknet round-42 fixture; not a fresh draw', usedByModel: false };
}
