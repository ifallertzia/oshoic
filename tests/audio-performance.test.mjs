// Run: node --experimental-default-type=module --test tests/*.test.mjs
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { downloadAudio } from '../public/js/download.js';
import { guessTracks, fileUrl } from '../public/js/util.js';
import lib from '../public/js/library.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const url = 'https://archive.org/download/example/audio.mp3';
const bytes = Buffer.alloc(10 * 1024 * 1024 + 37);
for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
const response = (body, status = 200, headers = {}) => new Response(body, {
  status, headers: { 'content-type': 'audio/mpeg', ...headers },
});
const verify = async blob => assert.deepEqual(Buffer.from(await blob.arrayBuffer()), bytes);

test('parallel ranges preserve exact bytes and order, with bounded concurrency', async () => {
  let active = 0, peak = 0, calls = 0;
  const percentages = [];
  globalThis.fetch = async (_, options) => {
    calls++;
    const [start, end] = options.headers.Range.match(/\d+/g).map(Number);
    const stop = Math.min(end, bytes.length - 1);
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, start % 3));
    active--;
    return response(bytes.subarray(start, stop + 1), 206, {
      'content-range': `bytes ${start}-${stop}/${bytes.length}`,
    });
  };
  await verify(await downloadAudio(url, { onProgress: n => percentages.push(n) }));
  assert.equal(calls, 4);
  assert.ok(peak > 1 && peak <= 3);
  assert.equal(percentages.at(-1), 100);
  assert.ok(percentages.every(n => n >= 0 && n <= 100));
});

test('servers ignoring Range use the existing full response (no duplicate download)', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response(bytes); };
  await verify(await downloadAudio(url));
  assert.equal(calls, 1);
});

test('small file is complete in first range', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response('audio', 206, { 'content-range': 'bytes 0-4/5' });
  };
  assert.equal(await (await downloadAudio(url)).text(), 'audio');
  assert.equal(calls, 1);
});

for (const scenario of ['hidden CORS headers', 'rejected range', 'network failure', 'invalid later range', 'truncated range']) {
  test(`falls back safely for ${scenario}`, async () => {
    let calls = 0;
    globalThis.fetch = async (_, options) => {
      calls++;
      if (!options.headers?.Range) return response(bytes);
      if (scenario === 'network failure') throw new TypeError('CORS');
      if (scenario === 'hidden CORS headers') return response(bytes.subarray(0, 8), 206);
      if (scenario === 'rejected range') return response('', 416);
      const [start, end] = options.headers.Range.match(/\d+/g).map(Number);
      const stop = Math.min(end, bytes.length - 1);
      if (start && scenario === 'invalid later range') return response(bytes);
      const data = bytes.subarray(start, stop + 1 - (scenario === 'truncated range' ? 1 : 0));
      return response(data, 206, { 'content-range': `bytes ${start}-${stop}/${bytes.length}` });
    };
    await verify(await downloadAudio(url));
    assert.ok(calls >= 2);
  });
}

test('cancel aborts range requests without triggering fallback', async () => {
  const ctrl = new AbortController();
  let calls = 0;
  globalThis.fetch = async (_, options) => {
    calls++;
    ctrl.abort();
    options.signal.throwIfAborted();
  };
  await assert.rejects(downloadAudio(url, { signal: ctrl.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('cancel also aborts normal-stream fallback', async () => {
  const ctrl = new AbortController();
  let calls = 0;
  globalThis.fetch = async (_, options) => {
    calls++;
    if (calls === 1) return response('', 416);
    ctrl.abort();
    options.signal.throwIfAborted();
  };
  await assert.rejects(downloadAudio(url, { signal: ctrl.signal }), { name: 'AbortError' });
  assert.equal(calls, 2);
});

test('track resolution actually finishes at its timeout and cleans up listener', async () => {
  lib.s3ok = false;
  lib.sync = { state: 'syncing' };
  const d = { p: 'OSHO_WORLD/English/A Bird on the Wing 01-11 – Osho World', l: 'en', n: 11, tracks: [] };
  const result = await Promise.race([
    lib.tracksFor(d, { timeoutMs: 10 }),
    new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('resolution hung')), 200); t.unref(); }),
  ]);
  assert.equal(result.source, 'guess');
  assert.equal(lib.listeners.get(undefined).size, 0);
  assert.equal(result.tracks[0].file, d.p + '/OSHO-A_Bird_on_the_Wing_01.mp3');
});

test('S3 timeout aborts instead of blocking playback indefinitely', async () => {
  let aborted = false;
  globalThis.fetch = (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')); });
  });
  await assert.rejects(lib.listDiscourseS3({ p: 'missing' }, 10), { name: 'AbortError' });
  assert.equal(aborted, true);
});

test('guessed URLs retain the full folder and encode names', () => {
  const d = { p: 'OSHO_WORLD/English/A Bird on the Wing 01-11 – Osho World', l: 'en', n: 11 };
  assert.match(fileUrl(guessTracks(d)[0].file), /OSHO_WORLD\/English\/A%20Bird/);
});

test('detail-page preparation reuses the same audio and never interrupts a queue', async () => {
  class FakeAudio {
    src = ''; loads = 0;
    addEventListener() {}
    load() { this.loads++; }
  }
  globalThis.Audio = FakeAudio;
  const { default: player } = await import('../public/js/player.js');
  const track = { file: 'OSHO_WORLD/English/example.mp3' };
  player.prepare(track);
  assert.equal(player.a.preload, 'auto');
  assert.equal(player.a.src, fileUrl(track.file));
  assert.equal(player.a.loads, 1);
  player.prepare(track);
  assert.equal(player.a.loads, 1);
  player.queue = [track];
  player.prepare({ file: 'another.mp3' });
  assert.equal(player.a.src, fileUrl(track.file));
  player.queue = [];
});

test('metadata arriving during S3 resolution is not overwritten by guesses', async () => {
  const d = { p: 'late-metadata', tracks: [], source: 'baked' };
  lib.s3ok = true;
  lib.sync = { state: 'syncing' };
  const original = lib.listDiscourseS3;
  lib.listDiscourseS3 = async () => {
    d.tracks = [{ n: 1, file: 'exact-runtime-name.mp3' }];
    d.source = 'meta';
    throw new Error('S3 unavailable');
  };
  try {
    const result = await lib.tracksFor(d, { timeoutMs: 0 });
    assert.equal(result.source, 'meta');
    assert.equal(result.tracks[0].file, 'exact-runtime-name.mp3');
  } finally { lib.listDiscourseS3 = original; lib.s3ok = false; }
});
