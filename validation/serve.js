// @ts-check
// Serves a build only under a path prefix, the way the reports are hosted. Everything outside the prefix is a 404.
// Usage: node validation/serve.js <dir> <port> [--prefix /cod-demo/]
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
/** @typedef {import('node:http').Server} Server */
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * @param {string} p
 * @returns {string}
 */
export const normalizePrefix = (p) => `/${p.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

/**
 * True only when `target` is `root` itself or inside it, by path segments rather than string prefix.
 * @param {string} root
 * @param {string} target
 * @returns {boolean}
 */
export function contains(root, target) {
  const rel = relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * @param {string} dir
 * @returns {Server}
 */
export function staticServer(dir, prefixArg = '/') {
  const root = realpathSync(resolve(dir));
  const prefix = normalizePrefix(prefixArg);

  return createServer((req, res) => {
    /**
     * @param {number} status
     * @param {string} text
     * @param {Record<string, string>} [headers]
     */
    const send = (status, text, headers = {}) => {
      res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers });
      res.end(text);
    };
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (`${url.pathname}/` === prefix) return send(301, '', { location: `${prefix}${url.search}` });
    if (!url.pathname.startsWith(prefix)) return send(404, `outside ${prefix}`);

    let rest;
    try {
      rest = decodeURIComponent(url.pathname.slice(prefix.length));
    } catch {
      return send(400, 'bad request');
    }
    let target = resolve(root, `.${sep}${rest}`);
    if (!contains(root, target)) return send(403, 'forbidden');
    if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
    if (!existsSync(target)) return send(404, 'not found');
    const real = realpathSync(target);
    if (!contains(root, real)) return send(403, 'forbidden');

    res.writeHead(200, { 'content-type': TYPES[extname(real)] ?? 'application/octet-stream' });
    createReadStream(real).pipe(res);
  });
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--prefix');
  const prefix = at >= 0 ? args[at + 1] : '/';
  const [dir, port] = args.filter((_, i) => i !== at && i !== at + 1);
  if (!dir || !port) {
    console.error('usage: node validation/serve.js <dir> <port> [--prefix /path/]');
    process.exit(2);
  }
  staticServer(dir, prefix).listen(Number(port), '127.0.0.1', () => {
    console.log(`serving ${dir} at http://localhost:${port}${normalizePrefix(prefix)}`);
  });
}
