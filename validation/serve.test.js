// @ts-check
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
/** @typedef {import('node:net').AddressInfo} AddressInfo */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staticServer } from './serve.js';
/** @typedef {import('node:http').Server} Server */

const SECRET = 'outside-the-build';
let tmp;
let server;
let origin;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'serve-test-'));
  mkdirSync(join(tmp, 'dist/sub'), { recursive: true });
  mkdirSync(join(tmp, 'dist-neighbor'));
  writeFileSync(join(tmp, 'dist/index.html'), '<p>inside</p>');
  writeFileSync(join(tmp, 'dist/sub/data.json'), '{}');
  writeFileSync(join(tmp, 'dist-neighbor/example.txt'), SECRET);
  symlinkSync(join(tmp, 'dist-neighbor/example.txt'), join(tmp, 'dist/link.txt'));
  server = staticServer(join(tmp, 'dist'), '/cod-demo/');
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address()).port}`;
});

afterAll(() => {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * @param {string} path
 */
const get = (path) => fetch(`${origin}${path}`, { redirect: 'manual' });

describe('sub-path server', () => {
  it('serves files under the prefix', async () => {
    const res = await get('/cod-demo/sub/data.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/json/);
    expect(await (await get('/cod-demo/')).text()).toBe('<p>inside</p>');
  });

  it('redirects the bare prefix', async () => {
    const res = await get('/cod-demo');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/cod-demo/');
  });

  it('refuses paths outside the prefix', async () => {
    expect((await get('/sub/data.json')).status).toBe(404);
  });

  for (const path of ['/cod-demo/..%2fdist-neighbor/example.txt', '/cod-demo/%2e%2e%2fdist-neighbor/example.txt', '/cod-demo/sub/..%2f..%2fdist-neighbor/example.txt']) {
    it(`refuses a traversal into a sibling directory: ${path}`, async () => {
      const res = await get(path);
      expect(res.status).toBe(403);
      expect(await res.text()).not.toContain(SECRET);
    });
  }

  it('refuses a symlink that points outside the build', async () => {
    const res = await get('/cod-demo/link.txt');
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain(SECRET);
  });

  it('answers 400 to a path that cannot be decoded', async () => {
    expect((await get('/cod-demo/%E0%A4%A')).status).toBe(400);
  });
});
