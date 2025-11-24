import type { gmail_v1 } from 'googleapis';

// Safe base64url decoder with fallback to base64
function decodeBase64Url(s: string): string {
  try {
    // Gmail parts are base64url-encoded
    const b = Buffer.from(s, 'base64url');
    return b.toString('utf8');
  } catch {
    try {
      return Buffer.from(s, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
}

// HTML to text converter with basic entity decoding and whitespace collapse
export function htmlToText(html: string): string {
  const dec = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return dec;
}

// Try to find body content; prefer HTML, fall back to text/plain, then snippet.
export function extractPlaintext(msg: gmail_v1.Schema$Message): string {
  if (!msg || !msg.payload) return '';

  const parts: gmail_v1.Schema$MessagePart[] = [];

  // Flatten all parts (payload or payload.parts recursively)
  function walk(part?: gmail_v1.Schema$MessagePart) {
    if (!part) return;
    parts.push(part);
    if (part.parts) part.parts.forEach(walk);
  }

  walk(msg.payload);

  // Helper to get body text for a part
  const getBody = (p: gmail_v1.Schema$MessagePart) => {
    const data = p.body?.data;
    if (!data) return '';
    return decodeBase64Url(data);
  };

  // Prefer HTML (more complete content)
  for (const p of parts) {
    if ((p.mimeType || '').toLowerCase().startsWith('text/html')) {
      const html = getBody(p);
      const text = htmlToText(html);
      if (text.length < 10) {
        console.warn(`parse: body too short for gmail_id=${msg.id}`);
      }
      return text;
    }
  }

  // Fallback to text/plain
  for (const p of parts) {
    if ((p.mimeType || '').toLowerCase().startsWith('text/plain')) {
      const text = getBody(p).trim();
      if (text.length < 10) {
        console.warn(`parse: body too short for gmail_id=${msg.id}`);
      }
      return text;
    }
  }

  // Last resort: Gmail snippet
  const snippet = (msg.snippet || '').trim();
  if (snippet.length < 10 && snippet.length > 0) {
    console.warn(`parse: body too short for gmail_id=${msg.id}`);
  }
  return snippet;
}

// Grab a header value by name (e.g., 'From', 'Subject', 'Date')
export function getHeader(msg: gmail_v1.Schema$Message, name: string): string {
  const headers = msg.payload?.headers || [];
  const h = headers.find(h => (h.name || '').toLowerCase() === name.toLowerCase());
  return (h?.value || '').trim();
}
