// quicknet metadata pinned to the provided chain, not downloaded from a relay.
export const QUICKNET = Object.freeze({
  public_key: '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a',
  period: 3, genesis_time: 1692803367, hash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971',
  groupHash: 'f477d5c89f21a17c863a7f937c6a6d15859414d2be09cd448d4279af331c5d3e',
  schemeID: 'bls-unchained-g1-rfc9380', metadata: { beaconID: 'quicknet' }
});
export const ROUND_42 = Object.freeze({ round: 42, randomness: '8ada64bae5c6c0f5540a6a13af56e663240edfbd2c76ac6a8f27671eb7259ce3', signature: '95a9f9f5b231b7714de1553105d8ffdf3dcda24cfdb1e689319bccf79a9c8ce430a91b811fbfaf763900bc998b5d686a' });
export const OFFLINE_SEED = '4b71a7e59b3127d9b179d9d08e19e70554c1472b4d956813f23b87274aa13166';
export function validSeed(seed) { return typeof seed === 'string' && /^[a-f0-9]{16,64}$/i.test(seed); }
export async function verifyBeaconSeed(beacon) {
  if (!Number.isSafeInteger(beacon?.round) || beacon.round < 1 || !/^[a-f0-9]{96}$/i.test(beacon.signature ?? '')) throw new Error('Invalid quicknet beacon shape');
  const normalized = { ...beacon };
  if (!normalized.randomness) {
    const bytes = Uint8Array.from(normalized.signature.match(/../g), x => parseInt(x,16));
    const hash = await crypto.subtle.digest('SHA-256',bytes);
    normalized.randomness = [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2,'0')).join('');
  }
  const { fetchBeacon } = await import('../assets/visualizer/descent/drand-verifier-1.4.2.js');
  // The official prebuilt client supplies verification; this transport serves
  // the already-fetched bytes and the pinned chain without another request.
  await fetchBeacon({ options: { disableBeaconVerification: false, noCache: true, chainVerificationParams: { chainHash: QUICKNET.hash, publicKey: QUICKNET.public_key } }, get: async () => normalized, chain: () => ({ info: async () => QUICKNET }) }, normalized.round);
  return { seed: normalized.randomness, source: 'Verified quicknet BLS beacon', chainHash: QUICKNET.hash, round: normalized.round, derivation: 'SHA-256(signature bytes); first 64 bits of SHA-256(descent:v1:seed:room:cycle) per visit', beacon: normalized };
}
export async function fetchBeaconSeed({ signal, round = 'latest', fetcher = fetch } = {}) {
  const response = await fetcher(`https://api.drand.sh/v2/beacons/quicknet/rounds/${round}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`Beacon relay HTTP ${response.status}`);
  return verifyBeaconSeed(await response.json());
}
export function offlineSeed(seed = OFFLINE_SEED) {
  if (!validSeed(seed)) throw new Error('Use 16 to 64 hexadecimal characters');
  return { seed: seed.toLowerCase(), source: seed === OFFLINE_SEED ? 'Offline reproducible preset' : 'Owner-entered offline seed', chainHash: null, round: null, derivation: 'First 64 bits of SHA-256(descent:v1:seed:room:cycle) per visit' };
}
