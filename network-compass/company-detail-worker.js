/* Optional on-demand Top Aziende fetch endpoint. Deploy only with account owner's approval.
   It accepts a public company URL and never receives Network Compass contacts or notes. */
const appOrigin = 'https://marcoa108.github.io';
const sourceHost = 'topaziende.quotidiano.net';
const maxBytes = 2 * 1024 * 1024;

function sourceURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== sourceHost || url.username || url.password || url.search || url.hash ||
      !/^\/[a-z0-9-]+\/[a-z0-9-]+\/fatturato-[a-z0-9_-]+\/?$/i.test(url.pathname)) return null;
    return url;
  } catch { return null; }
}

const cors = { 'Access-Control-Allow-Origin': appOrigin, 'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const response = (body, status) => new Response(body, { status, headers: cors });

export default {
  async fetch(request) {
    if (request.headers.get('Origin') !== appOrigin) return response('Forbidden origin', 403);
    if (request.method === 'OPTIONS') return response('', 204);
    if (request.method !== 'GET') return response('Method not allowed', 405);
    const source = sourceURL(new URL(request.url).searchParams.get('url'));
    if (!source) return response('Invalid company URL', 400);
    try {
      let upstream;
      for (let redirects = 0; redirects < 2; redirects++) {
        upstream = await fetch(source.href, { method: 'GET', redirect: 'manual', headers: { Accept: 'text/html' } });
        if (![301, 302, 307, 308].includes(upstream.status)) break;
        const next = sourceURL(new URL(upstream.headers.get('Location') || '', source).href);
        if (!next) return response('Unsafe source redirect', 502);
        source.href = next.href;
      }
      if (!upstream?.ok) return response('Source unavailable', 502);
      if (!/^text\/html\b/i.test(upstream.headers.get('Content-Type') || '')) return response('Unexpected source content', 502);
      const reader = upstream.body.getReader(), chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); return response('Source page too large', 502); }
        chunks.push(value);
      }
      const buffer = new Uint8Array(size); let at = 0;
      for (const chunk of chunks) { buffer.set(chunk, at); at += chunk.byteLength; }
      return new Response(buffer, { status: 200, headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' } });
    } catch { return response('Source unavailable', 502); }
  }
};
