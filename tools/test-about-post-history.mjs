import assert from 'node:assert/strict';
import { reconcilePost, postSlug } from './about-post-history.mjs';

const original = { key: 'forty', label: 'Forty, Not a Hundred', kind: 'post', href: 'forty-not-a-hundred.html',
  edits: 37, tokens: 1200, first: '2026-05-20', models: { test: { edits: 37, tokens: 1200 } } };
const post = structuredClone(original);
const exists = (...paths) => path => paths.includes(path);

reconcilePost(post, [], exists());
assert.equal(post.kind, 'removed');
assert.equal(post.href, null);
assert.equal(post.historicalHref, original.href);
assert.deepEqual(post.models, original.models);
assert.equal(post.edits, original.edits);
assert.equal(post.tokens, original.tokens);
assert.equal(post.first, original.first);
reconcilePost(post, [], exists());
assert.equal(post.historicalHref, original.href, 'a second refresh must keep the original path');

const archived = { key: 'forty-not-a-hundred', title: original.label, kind: 'archived', href: 'archive/forty-not-a-hundred/forty-not-a-hundred.html' };
reconcilePost(post, [archived], exists(archived.href));
assert.equal(post.key, 'forty', 'moving to the archive must keep the original identity');
assert.equal(post.href, archived.href);
assert.equal(post.kind, 'archived');
assert.equal(postSlug(post), postSlug(archived));
reconcilePost(post, [], exists(archived.href));
assert.equal(post.kind, 'archived', 'unlisting must retain a page that still exists');
reconcilePost(post, [], exists());
assert.equal(post.historicalHref, archived.href);
reconcilePost(post, [original], exists(original.href));
assert.equal(post.href, original.href);
assert.equal(post.kind, 'post', 'a restored page must regain its link');
assert.deepEqual(post.models, original.models);

const legacy = { key: 'old-post', label: 'Old Post', kind: 'removed', href: null };
reconcilePost(legacy, [], exists());
assert.equal(legacy.historicalHref, 'old-post.html');
assert.equal(legacy.kind, 'removed');
console.log('Post history checks passed: deletion, repeat refresh, move, unlisting, restoration and retained credit.');
