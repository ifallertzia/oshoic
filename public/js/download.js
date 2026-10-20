/* Bounded range downloads; ordinary streaming when Range/CORS is unavailable. */
const FIRST = 1024 * 1024;
const PART = 4 * 1024 * 1024;
const CONNECTIONS = 3;

export async function downloadAudio(url, { signal, onProgress = () => {} } = {}) {
  let lastUpdate = 0;
  const report = pct => {
    const now = Date.now();
    if (pct === 0 || pct === 100 || now - lastUpdate >= 100) {
      lastUpdate = now;
      onProgress(pct);
    }
  };
  const read = async (res, progress) => {
    if (!res.ok) throw new Error("Download HTTP " + res.status);
    const chunks = [];
    const reader = res.body.getReader();
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
      progress(value.byteLength);
    }
    return { chunks, size };
  };
  const stream = async res => {
    const total = Number(res.headers.get("content-length"));
    let loaded = 0;
    const { chunks } = await read(res, n => {
      loaded += n;
      if (total) report(Math.min(100, loaded / total * 100));
    });
    report(100);
    return new Blob(chunks, { type: res.headers.get("content-type") || "audio/mpeg" });
  };

  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) ctrl.abort();
  try {
    const first = await fetch(url, { headers: { Range: `bytes=0-${FIRST - 1}` }, signal: ctrl.signal });
    // A server ignoring Range already sent the whole file: don't fetch it again.
    if (first.status === 200) return await stream(first);
    const parseRange = res => {
      const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get("content-range") || "");
      return m ? m.slice(1).map(Number) : null;
    };
    const range = parseRange(first);
    if (first.status !== 206 || !range || range[0] !== 0 ||
        range[2] <= 0 || range[1] !== Math.min(FIRST, range[2]) - 1) {
      await first.body?.cancel();
      throw new Error("Range not supported or not exposed by CORS");
    }
    const total = range[2];
    let loaded = 0;
    const progress = n => {
      if (ctrl.signal.aborted) return;
      loaded += n;
      report(loaded / total * 100);
    };
    const initial = await read(first, progress);
    if (initial.size !== range[1] + 1) throw new Error("Incomplete first range");
    const parts = [initial.chunks];
    let next = range[1] + 1;
    let index = 1;
    // Reuse the resolved CDN URL to avoid another redirect for every part.
    const source = first.url || url;
    const worker = async () => {
      while (next < total) {
        const start = next;
        const end = Math.min(start + PART, total) - 1;
        const slot = index++;
        next = end + 1;
        const res = await fetch(source, {
          headers: { Range: `bytes=${start}-${end}` }, signal: ctrl.signal,
        });
        const r = parseRange(res);
        if (res.status !== 206 || !r || r[0] !== start || r[1] !== end || r[2] !== total) {
          await res.body?.cancel();
          throw new Error("Invalid download range");
        }
        const part = await read(res, progress);
        if (part.size !== end - start + 1) throw new Error("Incomplete download range");
        parts[slot] = part.chunks;
      }
    };
    await Promise.all(Array.from({ length: CONNECTIONS }, worker));
    report(100);
    return new Blob(parts.flat(), { type: first.headers.get("content-type") || "audio/mpeg" });
  } catch (error) {
    ctrl.abort(); // Stop outstanding workers before falling back to one stream.
    if (signal?.aborted) throw error;
    report(0);
    return await stream(await fetch(url, { signal }));
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
