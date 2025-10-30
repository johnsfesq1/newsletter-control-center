import type { gmail_v1 } from 'googleapis';

// Base64 URL decoding used by Gmail message parts
function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const buff = Buffer.from(normalized, 'base64');
  return buff.toString('utf-8');
}

// Try to find a text/plain part; if not, fall back to text/html and strip tags.
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

  // Prefer text/plain
  for (const p of parts) {
    if ((p.mimeType || '').toLowerCase().startsWith('text/plain')) {
      return getBody(p).trim();
    }
  }

  // Fallback to text/html → naive strip
  for (const p of parts) {
    if ((p.mimeType || '').toLowerCase().startsWith('text/html')) {
      const html = getBody(p);
      const text = html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ');
      return text.trim();
    }
  }

  // Last resort: Gmail snippet
  return (msg.snippet || '').trim();
}

// Grab a header value by name (e.g., 'From', 'Subject', 'Date')
export function getHeader(msg: gmail_v1.Schema$Message, name: string): string {
  const headers = msg.payload?.headers || [];
  const h = headers.find(h => (h.name || '').toLowerCase() === name.toLowerCase());
  return (h?.value || '').trim();
}
