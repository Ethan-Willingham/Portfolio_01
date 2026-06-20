/* ============================================================================
   blog-edit-core.js  -  the shared engine for the site's private editor.

   This is the no-server core that both editor surfaces import:
     - blog-edit.html  (edit an existing page)
     - post-builder.html (build + publish a brand-new post)

   What lives here, in one breath: the crypto that locks a GitHub key behind a
   password, the GitHub helpers that read and write files (one at a time, or many
   in a single atomic commit), the small "is this my device" flag, and the
   unlock/setup logic. Nothing here runs on a server; the decrypted key lives only
   in this tab's memory and is gone when the tab closes.

   It is a plain ES module (no build step, no deps). Import what you need:
     import { unlock, setupKey, ghGet, ghCommit, isOwnerDevice } from './blog-edit-core.js';
   ============================================================================ */

/* ================================================================
   CONFIG
   ================================================================ */
export const REPO = { owner: 'Ethan-Willingham', name: 'Portfolio_01', branch: 'main' };
export const API  = `https://api.github.com/repos/${REPO.owner}/${REPO.name}`;
export const AUTH_PATH = 'blog-edit-auth.json';   // encrypted key (public, useless without the password)
export const PBKDF2_ITERS = 600000;               // makes guessing the password slow
export const SITE_ORIGIN = 'https://ethanwillingham.com';

// Pages that are interactive toys/labs/editor surfaces rather than text you'd
// edit. Shown in the picker, but tucked under "Other" so the everyday list stays
// clean. Keep every editor surface in here so it never shows up as a "post".
export const DEMOS = new Set(['particle-life.html','particles.html','daylight-globe.html','random-galaxy.html',
  'grand-motherload.html','git-history.html','gallery.html','lucky.html','ocean.html','space-age.html',
  'warehouse.html','all-in.html','style-family.html','style-linear.html','style-press.html',
  'blog-edit.html','post-builder.html','edit.html',
  // Sluice game labs index + the SFX bench/publish tools (the *-lab.html game labs
  // auto-categorize by their -lab.html suffix, so only the non-lab ones are listed here).
  'labs.html','sfx-publish.html','sfx-prompts.html','sfx-test.html']);

// Which elements count as editable text blocks in the page-editor (blog-edit.html).
export const BLOCK_SEL = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,figcaption,dt,dd,summary,caption,th,td,.dek,.lede,.kicker,.byline';

// The localStorage flag that says "show the owner's edit affordances on this
// device." It is NOT the key and reveals nothing; it only flips the UI.
export const OWNER_FLAG = 'be_owner';

/* ================================================================
   SESSION STATE  (token lives only here, in memory)
   ================================================================ */
let TOKEN = null;
export function getToken(){ return TOKEN; }
export function setToken(t){ TOKEN = t; }
export function hasToken(){ return !!TOKEN; }
export function clearToken(){ TOKEN = null; }

/* ================================================================
   tiny helpers (base64 <-> bytes <-> text)
   ================================================================ */
export const enc = new TextEncoder(), dec = new TextDecoder('utf-8');
export function bytesToB64(bytes){ let s=''; const c=0x8000; for(let i=0;i<bytes.length;i+=c) s+=String.fromCharCode.apply(null, bytes.subarray(i,i+c)); return btoa(s); }
export function b64ToBytes(b64){ const bin=atob(b64); const out=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out; }
export const textToB64 = t => bytesToB64(enc.encode(t));
export const b64ToText = b => dec.decode(b64ToBytes(b));

/* ================================================================
   CRYPTO - lock/unlock the GitHub key with a password
   ================================================================ */
export async function deriveKey(passphrase, salt, iters){
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:iters, hash:'SHA-256' }, base,
    { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
export async function encryptToken(token, passphrase){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(passphrase, salt, PBKDF2_ITERS);
  const ct   = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(token)));
  return { v:1, iters:PBKDF2_ITERS, salt:bytesToB64(salt), iv:bytesToB64(iv), ct:bytesToB64(ct) };
}
export async function decryptToken(blob, passphrase){
  const key = await deriveKey(passphrase, b64ToBytes(blob.salt), blob.iters || PBKDF2_ITERS);
  const pt  = await crypto.subtle.decrypt({ name:'AES-GCM', iv:b64ToBytes(blob.iv) }, key, b64ToBytes(blob.ct));
  return dec.decode(pt);   // throws if the password is wrong (GCM auth failure)
}

/* ================================================================
   GITHUB - read/write the repo through the Contents + Git Data APIs
   ================================================================ */
function ghHeaders(extra){
  return Object.assign({ Authorization:`Bearer ${TOKEN}`, Accept:'application/vnd.github+json' }, extra || {});
}

// Read the (public) encrypted-key file without a token. null if not set up yet.
export async function fetchAuthBlob(){
  const r = await fetch(`${API}/contents/${AUTH_PATH}?ref=${REPO.branch}`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Couldn't reach GitHub (${r.status}). Check your connection.`);
  const j = await r.json();
  return JSON.parse(b64ToText(j.content.replace(/\s/g,'')));
}

// Read a text file. Returns { text, sha }.
export async function ghGet(path){
  const r = await fetch(`${API}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}?ref=${REPO.branch}`, {
    headers: ghHeaders(), cache:'no-store' });
  if (!r.ok) throw new Error(`Read failed (${r.status}) for ${path}`);
  const j = await r.json();
  return { text: b64ToText(j.content.replace(/\s/g,'')), sha: j.sha };
}

// Just the current sha of a path (null if it does not exist). Use this right
// before a write so a parallel session's push does not cause a 409 conflict.
export async function ghGetSha(path){
  const r = await fetch(`${API}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}?ref=${REPO.branch}`, {
    headers: ghHeaders(), cache:'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Couldn't check ${path} (${r.status})`);
  return (await r.json()).sha;
}

// Write one text file (Contents API). Returns the new sha.
export async function ghPut(path, text, sha, message){
  const body = { message, content: textToB64(text), branch: REPO.branch };
  if (sha) body.sha = sha;
  const r = await fetch(`${API}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}`, {
    method:'PUT', headers: ghHeaders({ 'Content-Type':'application/json' }), body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.message || `Save failed (${r.status})`); }
  return (await r.json()).content.sha;
}

// Write one binary file from base64 (Contents API). Returns the new sha.
export async function ghPutBinaryB64(path, b64, sha, message){
  const body = { message, content: b64, branch: REPO.branch };
  if (sha) body.sha = sha;
  const r = await fetch(`${API}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}`, {
    method:'PUT', headers: ghHeaders({ 'Content-Type':'application/json' }), body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.message || `Image save failed (${r.status})`); }
  return (await r.json()).content.sha;
}

// Read a binary file as base64 (for moving a post's images during archive).
// Falls back to the Git blobs API when a file is too big for the Contents API.
export async function ghGetB64(path){
  const r = await fetch(`${API}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}?ref=${REPO.branch}`, { headers: ghHeaders(), cache:'no-store' });
  if (!r.ok) throw new Error(`Read failed (${r.status}) for ${path}`);
  const j = await r.json();
  if (j.content && j.content.trim()) return { b64: j.content.replace(/\s/g,''), sha: j.sha };
  const br = await fetch(`${API}/git/blobs/${j.sha}`, { headers: ghHeaders(), cache:'no-store' });
  if (!br.ok) throw new Error(`Blob read failed (${br.status}) for ${path}`);
  return { b64: (await br.json()).content.replace(/\s/g,''), sha: j.sha };
}

// List every .html path in the repo (for the page picker).
export async function ghTree(){
  const r = await fetch(`${API}/git/trees/${REPO.branch}?recursive=1`, { headers: ghHeaders(), cache:'no-store' });
  if (!r.ok) throw new Error(`Couldn't list your pages (${r.status})`);
  return (await r.json()).tree.filter(n => n.type==='blob' && n.path.endsWith('.html')).map(n => n.path);
}

/* ---- one atomic commit across many files (Git Data API) -----------------
   files: [{ path, text }]                 -> write/replace a text file
          [{ path, b64 }]                  -> write/replace a binary file
          [{ path, delete:true }]          -> remove a file (a git mv = new + delete)
   Building one tree + one commit means a Publish is a single clean commit instead
   of five sequential PUTs, and there is no half-published in-between state. */
export async function ghCommit(files, message){
  // 1) current main tip + its tree
  const refR = await fetch(`${API}/git/ref/heads/${REPO.branch}`, { headers: ghHeaders(), cache:'no-store' });
  if (!refR.ok) throw new Error(`Couldn't read main (${refR.status})`);
  const baseCommitSha = (await refR.json()).object.sha;
  const baseCommitR = await fetch(`${API}/git/commits/${baseCommitSha}`, { headers: ghHeaders(), cache:'no-store' });
  if (!baseCommitR.ok) throw new Error(`Couldn't read the base commit (${baseCommitR.status})`);
  const baseTreeSha = (await baseCommitR.json()).tree.sha;

  // 2) a blob per written file
  const tree = [];
  for (const f of files){
    if (f.delete){ tree.push({ path: f.path, mode:'100644', type:'blob', sha: null }); continue; }
    const payload = ('b64' in f) ? { content: f.b64, encoding:'base64' }
                                 : { content: f.text, encoding:'utf-8' };
    const bR = await fetch(`${API}/git/blobs`, { method:'POST', headers: ghHeaders({ 'Content-Type':'application/json' }), body: JSON.stringify(payload) });
    if (!bR.ok){ const e = await bR.json().catch(()=>({})); throw new Error(e.message || `Blob failed for ${f.path} (${bR.status})`); }
    tree.push({ path: f.path, mode:'100644', type:'blob', sha: (await bR.json()).sha });
  }

  // 3) new tree, new commit, move the ref
  const treeR = await fetch(`${API}/git/trees`, { method:'POST', headers: ghHeaders({ 'Content-Type':'application/json' }),
    body: JSON.stringify({ base_tree: baseTreeSha, tree }) });
  if (!treeR.ok){ const e = await treeR.json().catch(()=>({})); throw new Error(e.message || `Tree failed (${treeR.status})`); }
  const newTreeSha = (await treeR.json()).sha;

  const commitR = await fetch(`${API}/git/commits`, { method:'POST', headers: ghHeaders({ 'Content-Type':'application/json' }),
    body: JSON.stringify({ message, tree: newTreeSha, parents: [baseCommitSha] }) });
  if (!commitR.ok){ const e = await commitR.json().catch(()=>({})); throw new Error(e.message || `Commit failed (${commitR.status})`); }
  const newCommitSha = (await commitR.json()).sha;

  const patchR = await fetch(`${API}/git/refs/heads/${REPO.branch}`, { method:'PATCH', headers: ghHeaders({ 'Content-Type':'application/json' }),
    body: JSON.stringify({ sha: newCommitSha, force: false }) });
  if (!patchR.ok){
    const e = await patchR.json().catch(()=>({}));
    // A parallel session moved main between our read and our patch: caller should retry.
    throw new Error(e.message ? `${e.message} (someone else pushed; try again)` : `Couldn't update main (${patchR.status})`);
  }
  return newCommitSha;
}

/* ================================================================
   OWNER DEVICE FLAG  (just "show my edit affordances here")
   ================================================================ */
export function markOwnerDevice(){ try { localStorage.setItem(OWNER_FLAG, '1'); } catch(_){} }
export function isOwnerDevice(){ try { return localStorage.getItem(OWNER_FLAG) === '1'; } catch(_){ return false; } }
export function forgetOwnerDevice(){ try { localStorage.removeItem(OWNER_FLAG); } catch(_){} }

/* ================================================================
   UNLOCK + SETUP  (logic only; each page wires its own DOM)
   ================================================================ */
// Decrypt the stored key with the password. Throws on a wrong password. On
// success the token lives in memory and this device is flagged as the owner's.
export async function unlock(authBlob, password){
  const token = await decryptToken(authBlob, password);   // throws if wrong
  setToken(token);
  markOwnerDevice();
  return true;
}

// First-time setup: verify the pasted key reaches this repo, encrypt it with the
// chosen password, and store the locked blob. On success the token is in memory
// and the device is flagged.
export async function setupKey(token, password){
  const test = await fetch(API, { headers:{ Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json' } });
  if (!test.ok) throw new Error(`That key didn't work (${test.status}). Re-copy it and make sure it has Contents: Read and write on ${REPO.name}.`);
  setToken(token);
  const blob = await encryptToken(token, password);
  let sha; try { sha = await ghGetSha(AUTH_PATH); } catch(_){}
  await ghPut(AUTH_PATH, JSON.stringify(blob, null, 2), sha, 'blog-edit: store editor key (encrypted)');
  markOwnerDevice();
  return true;
}

/* ================================================================
   PASSWORD HELPERS (strength meter + a memorable suggestion)
   ================================================================ */
const WORDS = ('amber anchor apple arbor autumn basin beacon birch bishop bramble breeze cabin cedar cinder clover comet copper cottage cricket crimson dapple ember fennel ferry fjord garnet ginger granite harbor hazel heron hollow indigo ivory jasper juniper kettle lantern ledger linen lichen marble meadow mellow minnow moss nectar oaken olive opal orchard otter pebble pewter pinecone plum quartz quill raven ridge russet saffron sage sandbar sienna silo sparrow spruce sumac thistle thrush timber tundra umber valley velvet walnut willow wren').split(' ');
export function suggestPass(){
  const pick = () => WORDS[crypto.getRandomValues(new Uint32Array(1))[0] % WORDS.length];
  return [pick(),pick(),pick(),pick(),pick(),pick()].join('-');
}
export function passStrengthBits(p){
  const pool = (/[a-z]/.test(p)?26:0)+(/[A-Z]/.test(p)?26:0)+(/[0-9]/.test(p)?10:0)+(/[^a-zA-Z0-9]/.test(p)?20:0) || 26;
  return Math.min(p.length * Math.log2(pool), 96);
}
