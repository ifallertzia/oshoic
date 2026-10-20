/* OSHOIC — library engine
 *
 * Data comes from the Internet Archive item "osho-audio-discourses-collection":
 *   1. baked catalogue   → instant UI (discourses, languages, estimated counts)
 *   2. localStorage cache→ instant tracks/titles/genres on revisits
 *   3. S3 prefix listing → fast per-discourse track list (if CORS-friendly)
 *   4. metadata API sync → full enrichment in background (titles, genres,
 *      lengths, descriptions), progressive + cached
 *   5. deterministic guess→ last-resort offline mode
 */
import { BAKED } from "./data.js";
import {
  normKey, cleanFolder, guessTracks, sleep, store,
  CAT_KEY, META_API, S3_BASE, IA_DETAILS,
} from "./util.js";

function asciiNorm(s) {
  return String(s).normalize("NFC").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

class Library {
  constructor() {
    this.byKey = new Map();      // normKey -> d
    this.byFolder = new Map();   // folder path -> d
    this.order = [];             // stable display order (baked first, then new)
    this.s3ok = false;
    this.sync = { state: "idle", done: 0, pages: 0, error: null };
    this.listeners = new Map(); // event -> Set<fn>; undefined key = generic listeners
    this._s3cache = new Map();
    this._started = false;
    this._token = 0;
  }

  on(fn) { this.listeners.add(fn); }
  on(ev, fn) {
    let set = this.listeners.get(ev);
    if (!set) { set = new Set(); this.listeners.set(ev, set); }
    set.add(fn);
  }
  emit(ev, data) {
    const set = this.listeners.get(ev);
    if (set) { for (const fn of set) { try { fn(data); } catch (e) { console.warn(e); } } }
    // generic listeners (used while a sync is in flight)
    const gen = this.listeners.get(undefined);
    if (gen) { for (const fn of gen) { try { fn(data); } catch (e) { console.warn(e); } } }
  }

  /* ---------------- bootstrap ---------------- */
  init() {
    this.asciiIndex = new Map();
    for (const b of BAKED) {
      const folder = b.p;
      const key = b.key = normKey(b.l, folder.split("/").pop());
      if (!this.byKey.has(key)) {
        const d = {
          key, l: b.l, p: folder, t: b.t, n: b.n,
          genre: null, desc: null, tracks: [], totalSecs: 0, source: "baked",
        };
        this.byKey.set(key, d);
        this.byFolder.set(folder, d);
        this.order.push(key);
      }
      // fuzzy index (ASCII-only) so runtime folders still match if a non-ASCII
      // character differs from our baked transcription
      const ak = asciiNorm(folder.split("/").pop());
      if (ak && !this.asciiIndex.has(ak)) this.asciiIndex.set(ak, this.byKey.get(key));
    }
    // upgrade from cache
    const cache = store.get(CAT_KEY, null);
    if (cache && cache.ts) {
      for (const [key, c] of Object.entries(cache.n || {})) {
        const d = this.byKey.get(key);
        if (!d) continue;
        d.genre = c.g || d.genre;
        d.desc = c.desc || d.desc;
        d.totalSecs = c.tot || 0;
        d.tracks = (c.tr || []).map(x => ({ n: x[0], t: x[1] || null, secs: x[2] || null, file: d.p + "/" + x[3] }));
        d.n = d.tracks.length || d.n;
        d.source = "cache";
      }
    }
    this.emit("ready");
    return this;
  }

  get discourses() { return this.order.map(k => this.byKey.get(k)); }
  get count() { return this.order.length; }
  find(key) { return this.byKey.get(key) || null; }

  stats() {
    let lectures = 0, secs = 0, knownLectures = 0, withMeta = 0;
    for (const k of this.order) {
      const d = this.byKey.get(k);
      if (d.tracks.length) { lectures += d.tracks.length; secs += d.totalSecs; knownLectures += 1; if (d.genre) withMeta += 1; }
      else if (d.n) lectures += d.n;
    }
    return { discourses: this.order.length, lectures, hours: Math.round(secs / 3600), knownLectures, withMeta };
  }

  /* ---------------- S3 fast path ---------------- */
  async pingS3() {
    try {
      /* one known object → tiny response; proves the S3 listing API works from here */
      const url = S3_BASE + encodeURIComponent("OSHO_WORLD/.sync.ffs_db");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      const txt = await res.text();
      this.s3ok = res.ok && /<Key>/.test(txt);
    } catch (e) { this.s3ok = false; }
    this.emit("s3", this.s3ok);
    return this.s3ok;
  }

  s3List(folder) {
    return this._s3cache.get(folder) || null;
  }

  async listDiscourseS3(d, timeoutMs = 4000) {
    if (this._s3cache.has(d.p)) return this._s3cache.get(d.p);
    const url = S3_BASE + encodeURIComponent(d.p + "/");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let txt;
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error("s3 " + res.status);
      txt = await res.text();
    } finally { clearTimeout(timer); }
    const doc = new DOMParser().parseFromString(txt, "text/xml");
    const keys = [...doc.getElementsByTagName("Key")].map(k => k.textContent).filter(Boolean);
    const mp3s = keys
      .filter(k => /OSHO_WORLD\/(English|Hindi)\//.test(k) && /\.mp3$/i.test(k))
      .map(k => {
        const base = k.split("/").pop();
        const m = base.match(/(\d+)\.mp3$/i);
        return { n: m ? parseInt(m[1], 10) : 0, t: null, secs: null, file: k };
      })
      .filter(x => x.n)
      .sort((a, b) => a.n - b.n);
    if (!mp3s.length) throw new Error("s3 empty");
    this._s3cache.set(d.p, mp3s);
    if (d.source === "baked" || d.source === "guess") {
      d.tracks = mp3s;
      d.n = mp3s.length;
      d.source = "s3";
      this.emit("updated", d);
      this._saveCache();
    }
    return mp3s;
  }

  /* ---------------- metadata sync (background, progressive) ---------------- */
  startSync(force = false) {
    if (this._started && !force) return;
    if (force) {
      store.del(CAT_KEY);
      for (const k of this.order) {
        const d = this.byKey.get(k);
        if (d.source === "cache" || d.source === "meta") { d.source = "baked"; d.tracks = []; d.genre = null; d.desc = null; d.totalSecs = 0; }
      }
      this._token++;
    }
    this._started = true;
    const token = this._token;
    this.sync = { state: "syncing", done: 0, pages: 0, error: null };
    this.emit("progress", this.sync);

    (async () => {
      let start = 0, count = 1000, failStreak = 0;
      try {
        for (let page = 0; page < 60; page++) {
          if (token !== this._token) return;
          let data;
          for (let attempt = 0; attempt < 4; attempt++) {
            try {
              const res = await fetch(META_API.replace("start=0", "start=" + start) , { cache: "no-store" });
              if (res.status === 429) {
                const ra = Math.min(parseInt(res.headers.get("Retry-After") || "10", 10) || 10, 30);
                this.emit("progress", { ...this.sync, wait: ra });
                await sleep(ra * 1000);
                continue;
              }
              if (!res.ok) throw new Error("http " + res.status);
              data = (await res.json()).result;
              break;
            } catch (e) {
              if (attempt === 3) throw e;
              await sleep(1500 * (attempt + 1));
            }
          }
          if (!Array.isArray(data)) throw new Error("bad page");
          const fresh = data.filter(f => f && typeof f.name === "string" && /\.mp3$/i.test(f.name) && f.source === "original");
          for (const f of fresh) this._applyMeta(f);
          this.sync.pages = page + 1;
          this.sync.done += fresh.length;
          this.emit("progress", this.sync);
          this._saveCache();
          if (data.length < count) break;
          start += count;
          failStreak = 0;
          await sleep(220);
        }
        if (token === this._token) {
          this.sync.state = "done";
          this.emit("progress", this.sync);
          this.emit("done");
        }
      } catch (e) {
        if (token !== this._token) return;
        this.sync.state = "error";
        this.sync.error = String(e && e.message || e);
        this.emit("progress", this.sync);
      }
    })();
  }

  _applyMeta(f) {
    const parts = f.name.split("/");
    if (parts.length < 4 || parts[0] !== "OSHO_WORLD") return;
    const folder = parts.slice(0, -1).join("/");
    const lang = parts[1].toLowerCase() === "hindi" ? "hi" : "en";
    const base = parts[parts.length - 1];
    const nm = base.match(/(\d+)\.mp3$/i);
    const n = nm ? parseInt(nm[1], 10) : 0;
    if (!n) return;
    const secs = f.length != null ? parseFloat(f.length) : null;

    let d = this.byFolder.get(folder);
    if (!d) {
      const tail = folder.split("/").pop();
      const cand = this.asciiIndex && this.asciiIndex.get(asciiNorm(tail));
      if (cand) {
        d = cand;
        this.byFolder.set(folder, d); // remember the exact runtime spelling
      }
    }
    if (!d) {
      const key = "new::" + lang + "::" + folder;
      d = { key, l: lang, p: folder, t: cleanFolder(folder.split("/").pop(), lang), n: 0, genre: null, desc: null, tracks: [], totalSecs: 0, source: "meta" };
      this.byKey.set(key, d);
      this.byFolder.set(folder, d);
      this.order.push(key);
      if (this.asciiIndex) this.asciiIndex.set(asciiNorm(folder.split("/").pop()), d);
    }
    if (f.genre && f.genre.trim()) d.genre = f.genre.trim().toUpperCase();
    if (f.comment && f.comment.length > (d.desc || "").length) d.desc = String(f.comment).slice(0, 600);

    const tr = d.tracks;
    const i = tr.findIndex(x => x.n === n);
    if (i >= 0) {
      tr[i] = { n, t: f.title || tr[i].t, secs: secs != null ? secs : tr[i].secs, file: f.name };
    } else {
      tr.push({ n, t: f.title || null, secs, file: f.name });
      tr.sort((a, b) => a.n - b.n);
    }
    d.source = "meta";
    d.n = tr.length;
    d.totalSecs = tr.reduce((s, x) => s + (x.secs || 0), 0);
  }

  _saveCache() {
    const n = {};
    for (const k of this.order) {
      const d = this.byKey.get(k);
      if (!d.tracks.length) continue;
      n[d.key] = {
        g: d.genre || "",
        desc: d.desc || "",
        tot: d.totalSecs,
        tr: d.tracks.map(x => [x.n, x.t || "", x.secs || 0, x.file.split("/").pop()]),
      };
    }
    store.set(CAT_KEY, { ts: Date.now(), n });
  }

  /* ---------------- track resolution for a discourse ---------------- */
  async tracksFor(d, { timeoutMs = 4000 } = {}) {
    if (d.tracks.length) return { tracks: d.tracks, source: d.source };
    const deadline = Date.now() + timeoutMs;
    if (this.s3ok) {
      try { return { tracks: await this.listDiscourseS3(d, timeoutMs), source: "s3" }; } catch (e) { /* fall through */ }
    }
    // Metadata may have arrived while the S3 request was in flight.
    if (d.tracks.length) return { tracks: d.tracks, source: d.source };
    // wait for the background sync to enrich this discourse
    if (this.sync.state === "syncing" && Date.now() < deadline) {
      await new Promise(resolve => {
        const finish = () => { clearTimeout(timer); this.listeners.get(undefined)?.delete(handler); resolve(); };
        const handler = () => {
          if (d.tracks.length || this.sync.state !== "syncing") finish();
        };
        const timer = setTimeout(finish, Math.max(0, deadline - Date.now()));
        const generic = this.listeners.get(undefined) || new Set();
        generic.add(handler);
        this.listeners.set(undefined, generic);
      });
      if (d.tracks.length) return { tracks: d.tracks, source: d.source };
    }
    // offline guess (best effort)
    d.tracks = guessTracks(d);
    d.source = "guess";
    this.emit("updated", d);
    return { tracks: d.tracks, source: "guess" };
  }
}

const lib = new Library();
export default lib;
