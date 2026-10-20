/* OSHOIC — player (audio engine + dock UI) */
import lib from "./library.js";
import { fileUrl, fmtTime, store, PREFS_KEY, LAST_KEY } from "./util.js";
import { coverUrlSync, resolveCover } from "./covers.js";

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

class Player {
  constructor() {
    this.a = new Audio();
    this.a.preload = "none";
    this.queue = [];
    this.qi = -1;
    this.d = null;            // current discourse
    this.autoplayNext = true;
    this._errStreak = 0;
    this._prefs = store.get(PREFS_KEY, { vol: 0.9, speed: 1 });
    this.a.volume = this._prefs.vol;
    this.a.playbackRate = this._prefs.speed;
    this.el = {};
    this.onToast = null;      // set by app
    this.onChange = null;     // set by app (re-render active rows)

    const A = this.a;
    A.addEventListener("play", () => this._emit());
    A.addEventListener("pause", () => this._emit());
    A.addEventListener("timeupdate", () => this._tick());
    A.addEventListener("progress", () => this._buf());
    A.addEventListener("loadedmetadata", () => {
      this.el.dur && (this.el.dur.textContent = fmtTime(A.duration));
      this._saveLast();
      this._mediaSession();
    });
    A.addEventListener("ended", () => this.next(true));
    A.addEventListener("error", () => this._onError());
  }

  _emit() {
    const playing = !this.a.paused && !this.a.ended;
    this.el.root && this.el.root.classList.toggle("playing", playing);
    this.el.play && (this.el.play.innerHTML = playing ? ICONS.pause : ICONS.play);
    if (this.onChange) this.onChange({ playing, qi: this.qi, key: this.d && this.d.key, n: this.cur() && this.cur().n });
    try { if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused"; } catch (e) {}
    this.syncTitle();
  }

  _tick() {
    const A = this.a;
    if (!this.el.seek) return;
    if (A.duration) {
      const pct = (A.currentTime / A.duration) * 1000;
      this.el.seek.value = pct;
      this.el.seek.style.setProperty("--fill", (pct / 10) + "%");
    }
    this.el.cur && (this.el.cur.textContent = fmtTime(A.currentTime));
  }
  _buf() {
    const A = this.a;
    if (!this.el.buf || !A.duration || !A.buffered.length) return;
    try { this.el.buf.style.width = (A.buffered.end(A.buffered.length - 1) / A.duration * 100) + "%"; } catch (e) {}
  }

  /* ---------------- queue control ---------------- */
  cur() { return this.queue[this.qi] || null; }

  loadDiscourse(d, qi = 0, { play = true } = {}) {
    if (!d || !d.tracks.length) return;
    this.d = d;
    this.queue = d.tracks;
    this.qi = Math.max(0, Math.min(qi, d.tracks.length - 1));
    this._errStreak = 0;
    this._loadCurrent();
    if (play) this._play();
    this._emit();
    this._saveLast();
  }

  _setArt(url) {
    if (!this.el.art) return;
    if (url) {
      this.el.art.style.backgroundImage = "url(" + JSON.stringify(url) + ")";
      this.el.art.classList.remove("noimg");
      const pre = new Image();
      pre.referrerPolicy = "no-referrer";
      pre.onerror = () => {
        if (this.el.art) this.el.art.classList.add("noimg");
      };
      pre.src = url;
    } else {
      this.el.art.style.backgroundImage = "none";
      this.el.art.classList.add("noimg");
    }
  }

  _loadCurrent() {
    const t = this.cur();
    if (!t) return;
    const url = fileUrl(t.file);
    if (this.a.src !== url) {
      this.a.src = url;
      this.a.load();
    }
    this._setArt(this.d ? coverUrlSync(this.d) : null);
    if (this.d) {
      const disc = this.d;
      resolveCover(disc).then(url => {
        if (this.d === disc && url) this._setArt(url);
      });
    }
    if (this.el.title) this.el.title.textContent = t.t || ("Lecture " + pad2(t.n));
    if (this.el.sub) this.el.sub.textContent = this.d.t + (this.d.l === "hi" ? "  ·  हिन्दी" : "");
    this._mediaSession();
    this._saveLast();
    this._emit();
  }

  _play() {
    const p = this.a.play();
    if (p && p.catch) p.catch(e => { if (e && e.name !== "AbortError") this.onToast && this.onToast("Tap play to begin — your browser asked for a first click.", 4000); });
  }

  toggle() {
    if (!this.queue.length) return;
    if (this.a.paused) { if (this.a.ended) this.a.currentTime = 0; this._play(); }
    else this.a.pause();
  }

  next(auto = false) {
    if (!this.queue.length) return;
    if (this.qi < this.queue.length - 1) { this.qi++; this._loadCurrent(); this._play(); this._errStreak = 0; }
    else {
      this.a.pause();
      if (auto) { this.a.currentTime = 0; this._emit(); }
      this.onToast && this.onToast(auto ? "This discourse is complete. 🙏" : "That was the last lecture of this discourse.");
    }
  }
  prev() {
    if (!this.queue.length) return;
    if (this.a.currentTime > 4 || this.qi === 0) { this.a.currentTime = 0; }
    else { this.qi--; this._loadCurrent(); this._play(); }
  }
  jumpTo(qi) {
    if (qi < 0 || qi >= this.queue.length) return;
    if (this.d && lib.find(this.d.key) === this.d) { this.qi = qi; this._loadCurrent(); this._play(); }
  }

  _onError() {
    if (!this.queue.length) return;
    const t = this.cur();
    if (!t || !t.file) return;
    this._errStreak++;
    if (this._errStreak >= 4) {
      this.a.pause();
      this.onToast && this.onToast("Several lectures failed to load. Try again in a moment.", 6000);
      this._emit();
      return;
    }
    this.onToast && this.onToast("“" + (t.t || "Lecture " + pad2(t.n)) + "” could not be loaded — skipping…", 3500);
    const self = this;
    setTimeout(() => { if (self.a.error) self.next(true); }, 1400);
  }

  seek(frac) {
    const A = this.a;
    if (A.duration) A.currentTime = frac * A.duration;
  }

  /* Download the current lecture (blob when allowed, new tab otherwise). */
  async download() {
    const t = this.cur();
    if (!t || !t.file) { this.onToast && this.onToast("Play a lecture first — then you can save it."); return; }
    const url = fileUrl(t.file);
    const name = decodeURIComponent(t.file.split("/").pop() || "lecture.mp3");
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("http");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      this.onToast && this.onToast("Download started — “" + name + "”. 🙏");
    } catch (e) {
      window.open(url, "_blank", "noopener");
      this.onToast && this.onToast("Opening the lecture in a new tab — save it from there.");
    }
  }
  setVol(v) {
    this.a.volume = v;
    this._prefs.vol = v;
    store.set(PREFS_KEY, this._prefs);
  }
  cycleSpeed() {
    const i = SPEEDS.indexOf(this._prefs.speed);
    this._prefs.speed = SPEEDS[(i + 1) % SPEEDS.length];
    this.a.playbackRate = this._prefs.speed;
    if (this.el.speed) this.el.speed.textContent = this._prefs.speed + "×";
    store.set(PREFS_KEY, this._prefs);
    this._emit();
  }

  _mediaSession() {
    if (!("mediaSession" in navigator)) return;
    const t = this.cur();
    try {
      const meta = {
        title: t ? (t.t || "Lecture " + pad2(t.n)) : "Osho",
        artist: "Osho",
        album: this.d ? this.d.t : "OSHOIC",
      };
      const art = this.d && coverUrlSync(this.d);
      if (art) meta.artwork = [{ src: art, sizes: "400x400", type: "image/jpeg" }];
      navigator.mediaSession.metadata = new MediaMetadata(meta);
      navigator.mediaSession.setActionHandler("play", () => this._play());
      navigator.mediaSession.setActionHandler("pause", () => this.a.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => this.prev());
      navigator.mediaSession.setActionHandler("nexttrack", () => this.next());
      navigator.mediaSession.setActionHandler("seekbackward", () => { if (this.a.duration) this.a.currentTime = Math.max(0, this.a.currentTime - 15); });
      navigator.mediaSession.setActionHandler("seekforward", () => { if (this.a.duration) this.a.currentTime = Math.min(this.a.duration, this.a.currentTime + 15); });
      navigator.mediaSession.playbackState = (!this.a.paused && !this.a.ended) ? "playing" : "paused";
    } catch (e) {}
  }

  /* Keep the tab title honest while audio runs in the background. */
  setBaseTitle(t) { this._baseTitle = t; this.syncTitle(); }
  syncTitle() {
    if (this._baseTitle == null) return;
    const t = this.cur();
    const playing = this.queue.length && t && !this.a.paused && !this.a.ended;
    document.title = playing ? "▶ " + (t.t || "Lecture " + pad2(t.n)) + " · OSHOIC" : this._baseTitle;
  }

  _saveLast() {
    const t = this.cur();
    if (!t || !this.d) return;
    store.set(LAST_KEY, { key: this.d.key, n: t.n, t: Math.floor(this.a.currentTime || 0), ts: Date.now() });
  }

  wire(root) {
    const $ = id => root.querySelector(id);
    this.el.root = root;
    this.el.art = $("[data-p=art]");
    this.el.title = $("[data-p=title]");
    this.el.sub = $("[data-p=sub]");
    this.el.play = $("[data-p=play]");
    this.el.prev = $("[data-p=prev]");
    this.el.next = $("[data-p=next]");
    this.el.seek = $("[data-p=seek]");
    this.el.buf = $("[data-p=buf]");
    this.el.cur = $("[data-p=cur]");
    this.el.dur = $("[data-p=dur]");
    this.el.speed = $("[data-p=speed]");
    this.el.vol = $("[data-p=vol]");
    this.el.dl = $("[data-p=download]");
    if (this.el.speed) this.el.speed.textContent = this._prefs.speed + "×";
    if (this.el.vol) { this.el.vol.value = this._prefs.vol; }

    this.el.dl && this.el.dl.addEventListener("click", () => this.download());
    this.el.play && this.el.play.addEventListener("click", () => this.toggle());
    this.el.prev && this.el.prev.addEventListener("click", () => this.prev());
    this.el.next && this.el.next.addEventListener("click", () => this.next(false));
    this.el.seek && this.el.seek.addEventListener("input", e => this.seek(e.target.value / 1000));
    this.el.speed && this.el.speed.addEventListener("click", () => this.cycleSpeed());
    this.el.vol && this.el.vol.addEventListener("input", e => this.setVol(parseFloat(e.target.value)));

    document.addEventListener("keydown", e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.code === "Space" && this.queue.length) { e.preventDefault(); this.toggle(); }
    });

    // persist "where I left off" periodically
    setInterval(() => this.queue.length && this._saveLast(), 15000);
  }
}

function pad2(n) { return String(n).padStart(2, "0"); }

const ICONS = {
  play: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7 5h3.4v14H7zM13.6 5H17v14h-3.6z"/></svg>',
};
export { ICONS, pad2 };

const player = new Player();
export default player;
