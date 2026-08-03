/**
 * Vercel serverless function: serves the SPA shell for /public/photos-link/:token
 * with the correct <title> / Open Graph tags so iMessage / SMS / Slack previews
 * show the project name instead of the static "Skyer by Swallow Robotics" from
 * index.html. Browsers still boot the React app from the same HTML.
 *
 * Requires REACT_APP_API_BASE_URL (same as the CRA build) so this function can
 * fetch /api/v1/public/photos-link/:token from the Render backend.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_TITLE = 'Photos - Swallow';
const DEFAULT_DESCRIPTION = 'Shared project photos on Swallow';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchProjectTitle(token, apiBase) {
  if (!token || !apiBase) return null;
  try {
    const url = `${apiBase.replace(/\/+$/, '')}/api/v1/public/photos-link/${encodeURIComponent(token)}`;
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const name = data?.link?.project_name;
    return name ? `${name} - Swallow` : null;
  } catch {
    return null;
  }
}

function injectMeta(html, { title, description, url }) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeUrl = escapeHtml(url);

  let next = html.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${safeTitle}</title>`,
  );

  const ogBlock = [
    `<meta name="description" content="${safeDesc}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${safeTitle}" />`,
    `<meta property="og:description" content="${safeDesc}" />`,
    `<meta property="og:url" content="${safeUrl}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
  ].join('\n    ');

  if (/property="og:title"/i.test(next)) {
    return next;
  }
  return next.replace(/<\/head>/i, `    ${ogBlock}\n  </head>`);
}

module.exports = async function handler(req, res) {
  const token =
    (req.query && req.query.token) ||
    (req.query && req.query.t) ||
    '';

  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'swallow-ctr.com')
    .split(',')[0]
    .trim();
  const pageUrl = `${proto}://${host}/public/photos-link/${token}`;

  const apiBase =
    process.env.REACT_APP_API_BASE_URL ||
    process.env.API_BASE_URL ||
    '';

  const title =
    (await fetchProjectTitle(token, apiBase)) || DEFAULT_TITLE;
  const description = DEFAULT_DESCRIPTION;

  let html;
  try {
    const candidates = [
      path.join(process.cwd(), 'build', 'index.html'),
      path.join(process.cwd(), 'client', 'build', 'index.html'),
      path.join(__dirname, '..', 'build', 'index.html'),
      path.join(__dirname, '..', 'client', 'build', 'index.html'),
    ];
    const indexPath = candidates.find(p => fs.existsSync(p));
    if (!indexPath) throw new Error('index.html not found');
    html = fs.readFileSync(indexPath, 'utf8');
  } catch {
    html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head><body><div id="root"></div><script>location.replace(${JSON.stringify(pageUrl)})</script></body></html>`;
  }

  html = injectMeta(html, { title, description, url: pageUrl });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.status(200).send(html);
};
