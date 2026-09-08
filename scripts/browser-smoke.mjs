import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve('.');
const extensionDir = resolve('extension');
const fixtureDir = resolve('tests/browser');
const port = 41731;
const timeoutMs = 30_000;

const server = createServer(async (req, res) => {
  const name = req.url === '/frame.html' ? 'frame.html' : 'fixture.html';
  try {
    const body = await readFile(resolve(fixtureDir, name));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

const chromium = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const args = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${resolve('.tmp/browser-smoke-profile')}`,
  `--load-extension=${extensionDir}`,
  '--dump-dom',
  `http://127.0.0.1:${port}/fixture.html`
];

await new Promise((resolvePromise, rejectPromise) => {
  server.listen(port, '127.0.0.1', resolvePromise);
  server.on('error', rejectPromise);
});

try {
  const output = await new Promise((resolvePromise, rejectPromise) => {
    console.log(`browser smoke: chromium=${chromium}`);
    console.log(`browser smoke: extension=${extensionDir}`);
    console.log(`browser smoke: url=http://127.0.0.1:${port}/fixture.html`);
    console.log(`browser smoke: timeout=${timeoutMs}ms`);
    console.log(`browser smoke: args=${args.join(' ')}`);

    const child = spawn(chromium, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(`[chromium stdout] ${text}`);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(`[chromium stderr] ${text}`);
    });
    child.on('error', (error) => finish(rejectPromise, error));
    child.on('close', (code, signal) => {
      console.log(`browser smoke: chromium exited code=${code} signal=${signal ?? 'none'}`);
      if (code === 0) finish(resolvePromise, stdout);
      else finish(rejectPromise, new Error(`Chromium exited with ${code}: ${stderr.slice(-4000)}`));
    });

    const timer = setTimeout(() => {
      console.error(`browser smoke: TIMEOUT after ${timeoutMs}ms; terminating Chromium`);
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
      finish(rejectPromise, new Error(`Chromium smoke timed out after ${timeoutMs}ms\n${stderr.slice(-4000)}`));
    }, timeoutMs);
  });

  console.log('browser smoke: checking extension markers');
  for (const marker of [
    'data-pb-e2e="pass"',
    'data-pb-e2e-main="true"',
    'data-pb-e2e-frame="true"',
    'data-pb-e2e-shadow="true"'
  ]) {
    console.log(`browser smoke: marker ${marker} => ${output.includes(marker) ? 'FOUND' : 'MISSING'}`);
    if (!output.includes(marker)) throw new Error(`browser smoke failed: missing ${marker}`);
  }
  console.log('browser smoke OK: MV3 injection works in top frame, same-origin iframe, and open Shadow DOM');
} finally {
  server.close();
}
