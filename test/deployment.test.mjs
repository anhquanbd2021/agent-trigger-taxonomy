import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../app/server.js';

async function withServer(fn) {
  const server = createStaticServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('health and version endpoints answer', async () => {
  await withServer(async base => {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), 'ok');
    const version = await fetch(`${base}/version`);
    assert.equal(version.status, 200);
    const body = await version.json();
    assert.equal(body.name, 'agent-trigger-taxonomy-demo');
  });
});

test('allowlisted assets serve; everything else 404s', async () => {
  await withServer(async base => {
    for (const path of ['/', '/guide.html', '/styles.css', '/app.js', '/engine.mjs', '/scenarios.mjs', '/matrix.mjs']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 200, path);
    }
    for (const path of ['/../package.json', '/package.json', '/nope.js', '/examples/scenarios.json']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 404, path);
    }
  });
});

test('security headers ride every response', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/`);
    assert.ok(res.headers.get('content-security-policy').includes("default-src 'self'"));
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    const head = await fetch(`${base}/styles.css`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    const post = await fetch(`${base}/`, { method: 'POST' });
    assert.equal(post.status, 404);
  });
});
