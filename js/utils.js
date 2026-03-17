// === DOM HELPERS & UTILITIES ===
export const $ = id => document.getElementById(id);
export const money = n => '$' + (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0 });
export const uid = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });

const escDiv = document.createElement('div');
export function esc(text) {
  escDiv.textContent = text;
  return escDiv.innerHTML;
}

// Returns a Date object adjusted to represent GMT-8 (PST)
export function toGMT8(date) {
  const d = new Date(date);
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  return new Date(utc - 8 * 3600000);
}

export function timeAgo(ts) {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  const months = Math.floor(days / 30);
  return months + 'mo ago';
}

// Legacy djb2-based hash — kept for backward compatibility with existing passcodes
export function hashPasscodeLegacy(code) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < code.length; i++) {
    const ch = code.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Pure JS SHA-256 (fallback for non-secure contexts where crypto.subtle is unavailable)
function sha256js(message) {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  function rr(n,x){return(x>>>n)|(x<<(32-n));}
  function ch(x,y,z){return(x&y)^(~x&z);}
  function maj(x,y,z){return(x&y)^(x&z)^(y&z);}
  function sig0(x){return rr(2,x)^rr(13,x)^rr(22,x);}
  function sig1(x){return rr(6,x)^rr(11,x)^rr(25,x);}
  function g0(x){return rr(7,x)^rr(18,x)^(x>>>3);}
  function g1(x){return rr(17,x)^rr(19,x)^(x>>>10);}

  const bytes = new TextEncoder().encode(message);
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen, false);

  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,
      h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;

  for (let off = 0; off < padded.length; off += 64) {
    const w = new Int32Array(64);
    for (let i=0;i<16;i++) w[i]=dv.getInt32(off+i*4,false);
    for (let i=16;i<64;i++) w[i]=(g1(w[i-2])+w[i-7]+g0(w[i-15])+w[i-16])|0;
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let i=0;i<64;i++){
      const t1=(h+sig1(e)+ch(e,f,g)+K[i]+w[i])|0;
      const t2=(sig0(a)+maj(a,b,c))|0;
      h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
    }
    h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;
    h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}

// SHA-256 with random salt — uses Web Crypto when available, JS fallback otherwise
export async function hashPasscode(code, salt) {
  if (!salt) salt = uid();
  const input = salt + ':' + code;
  let hash;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest('SHA-256', data);
    hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    hash = sha256js(input);
  }
  return { hash, salt };
}

// Verify a passcode against stored value (supports both old and new format)
export async function verifyPasscode(code, stored) {
  if (typeof stored === 'string') return hashPasscodeLegacy(code) === stored;
  if (stored && stored.hash && stored.salt) {
    const { hash } = await hashPasscode(code, stored.salt);
    return hash === stored.hash;
  }
  return false;
}

// Sanitize a color value for safe use in HTML attributes
export function safeColor(c) {
  return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#666';
}

// Escape a value for safe use in HTML attributes (for IDs in data- attrs)
export function safeAttr(v) {
  return String(v).replace(/["'<>&]/g, '');
}

// Generate a random invite code (8 uppercase alphanumeric chars)
export function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  const arr = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(arr, b => chars[b % chars.length]).join('');
}
