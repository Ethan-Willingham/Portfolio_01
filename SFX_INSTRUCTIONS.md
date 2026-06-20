# SFX_INSTRUCTIONS.md: drop in, audition, publish Sluice sound effects

The game's sound engine (`js/audio.js`) is wired end to end. It is silent only
because `assets/sfx/` is empty. To give the game a sound, you make an audio file,
name it for the right key, audition it, then publish it to the live site. No code
change is needed for any of this.

## Naming (the one rule that matters)

Each sound has a logical key in the `SFX_MANIFEST` near the top of `js/audio.js`
(things like `drill-break-stone`, `ui-confirm`, `bomb-throw`, `rig-hum`). The
filename depends on how many variants the key allows (its `n` field):

- `n: 1` (one variant): the file is **`key.m4a`** (no number). Example: `ui-confirm.m4a`.
- `n > 1` (several variants, picked at random): files are **`key_1.m4a`,
  `key_2.m4a`, ... `key_N.m4a`**. Example: `drill-break-stone_1.m4a`,
  `drill-break-stone_2.m4a`, `drill-break-stone_3.m4a`. You can supply fewer than
  N; the loader just pools whatever exists.

A file whose name does not match a manifest key is loaded but never played, so
match the key exactly. The full key list, with bus, gain, and pitch-jitter, is the
`SFX_MANIFEST` object in `js/audio.js`. The design intent per sound is in
`docs/game/SFX_BIBLE.md`; ready-to-paste generation prompts are in
`docs/game/SFX_PROMPT_SYSTEM.md` and the `sfx-prompts.html` bench.

## Make the audio

1. Generate or record the sound (ElevenLabs / Stable Audio / your own recording;
   see the prompt system). Keep it short and dry; the engine adds the space.
2. Convert to AAC `.m4a` (the format the manifest expects). On a Mac:
   `afconvert -f m4af -d aac input.wav key.m4a`
3. Name it per the rule above.

## Audition (before publishing)

- Open **`sfx-test.html`** (the SFX Test Bench, also linked from `labs.html`). Load
  your file and play it through the real game audio bus so you hear it the way the
  game will (bus routing, gain, pitch jitter).
- To tune how a sound sits (its base gain `g`, pitch jitter `j`, or bus `b`), edit
  that key's entry in `SFX_MANIFEST` in `js/audio.js`, rebuild nothing (audio.js is
  a plain script), and reload. That is a code change, so commit it the normal way.

## Publish to prod (the live site)

1. Open **`sfx-publish.html`** (linked from the SFX bench and `labs.html`).
2. Unlock with your editor password (the same one the post editor uses). The page
   decrypts the GitHub key held in `blog-edit-auth.json` entirely in your browser.
3. Drop your `.m4a` files onto the page. Each row shows its target path
   (`assets/sfx/<name>`) and a Play button to confirm the file.
4. Press **Send to prod**. It writes all the files into `assets/sfx/` in one commit
   via the GitHub Contents API (the exact mechanism the post editor uses).
5. The live site redeploys in a few seconds. Hard-refresh the game
   (`grand-motherload.html`), trigger the action, and you should hear it.

If two of you publish at once you may see "someone else pushed; try again." Just
press Send again.

## One-time setup (only if the editor is not set up yet)

The publish tool reuses the **same encrypted GitHub key as the post editor**, so if
`blog-edit.html` already works for you, there is nothing to set up here. If it does
not:

1. Create a GitHub fine-grained Personal Access Token scoped to the `Portfolio_01`
   repo with **Contents: Read and write** (that single permission is all it needs).
2. Open `blog-edit.html`, paste the token, and choose a password. That encrypts the
   token (AES-256-GCM, PBKDF2 600k iterations) into `blog-edit-auth.json`, which is
   public but useless without your password.
3. From then on, both the editor and `sfx-publish.html` unlock with that password.

## Safety note

`sfx-publish.html` has a **Self-test crypto** button that proves the
encrypt/decrypt path works with a dummy password and never touches GitHub. The real
publish needs your real password and writes a real commit, so only you can do it.
