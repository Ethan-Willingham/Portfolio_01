// Stable post identities survive moves, unlisting and deletion.
import { existsSync } from 'node:fs';

export const postSlug = post => (post.href || post.historicalHref || post.key + '.html')
  .split('/').at(-1).replace(/\.html$/, '');
export const isPost = post => ['post', 'archived', 'removed'].includes(post.kind);

export function reconcilePost(post, current = [], pageExists = existsSync) {
  const match = current.find(p => p.key === post.key || postSlug(p) === postSlug(post));
  if (match && match.href && pageExists(match.href)) {
    post.href = match.href;
    post.kind = match.kind;
    post.label = match.title || match.label || post.label;
  } else {
    const href = post.href || post.historicalHref || post.key + '.html';
    if (pageExists(href)) {
      post.href = href;
      post.kind = href.startsWith('archive/') ? 'archived' : 'post';
    } else {
      post.historicalHref = href;
      post.href = null;
      post.kind = 'removed';
    }
  }
  return post;
}
