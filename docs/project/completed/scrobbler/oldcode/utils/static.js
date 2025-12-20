import { HTML_CONTENT } from '../static/index.html.js';
import { CSS_CONTENT } from '../static/styles.css.js';
import { JS_CONTENT } from '../static/script.js.js';
import { EMBED_HTML_CONTENT } from '../static/embed.html.js';
import { EMBED_JS_CONTENT } from '../static/embed-script.js.js';

export async function getStaticAsset(path, env) {
  // Default to index.html for root and unknown paths
  if (path === '/' || path === '/index.html' || path === '') {
    return new Response(HTML_CONTENT, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // Serve main HTML page for album URLs (client-side routing)
  if (path.match(/^\/albums\/\d+\/?$/)) {
    return new Response(HTML_CONTENT, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // Serve embed HTML page for embed URLs
  if (path.match(/^\/embed\/\d+\/?$/)) {
    return new Response(EMBED_HTML_CONTENT, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // Serve CSS
  if (path === '/styles.css') {
    return new Response(CSS_CONTENT, {
      headers: { 'Content-Type': 'text/css; charset=utf-8' }
    });
  }

  // Serve JavaScript
  if (path === '/script.js') {
    return new Response(JS_CONTENT, {
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
    });
  }

  // Serve embed JavaScript
  if (path === '/embed-script.js') {
    return new Response(EMBED_JS_CONTENT, {
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
    });
  }

  // 404 for unknown static files
  return new Response('Not Found', { status: 404 });
} 