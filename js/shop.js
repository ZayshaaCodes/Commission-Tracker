// === SHOP ID ===
// Reads shop slug from ?shop= URL parameter.
// Validates it as a safe alphanumeric/dash/underscore string.

const params = new URLSearchParams(window.location.search);
const raw = params.get('shop') || '';
const SHOP_RE = /^[a-z0-9_-]{1,48}$/;

export const shopId = SHOP_RE.test(raw.toLowerCase()) ? raw.toLowerCase() : null;

export function getShopUrl(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('shop', id);
  return url.toString();
}
