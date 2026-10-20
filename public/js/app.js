/* OSHOIC — application (routing, views, filters) */
import lib from "./library.js";
import player, { pad2 } from "./player.js";
import { BAKED, FEATURED } from "./data.js";
import { QUOTES, HERO_LINES } from "./quotes.js";
import {
  escapeHtml, fmtNum, fmtTime, fmtTotal, isDevanagari,
  themeOf, THEME_LIST, THEME_LABEL, artUrl, folderArchiveUrl,
  store, CAT_KEY, LAST_KEY, IA_DETAILS,
} from "./util.js";

/* ---------------- toasts ---------------- */
let toastTimer;
function toast(msg, ms = 4200) {
  const box = document.getElementById("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = escapeHtml(msg);
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 400); }, ms);
}
player.onToast = toast;

/* ---------------- state ---------------- */
const state = {
  page: "home",
  lang: "all",
  theme: null,
  genre: null,
  q: "",
  sort: "az",
  dKey: null,
};

function parseHash() {
  const h = location.hash || "#/";
  const [path, query] = h.slice(1).split("?");
  const seg = path.split("/").filter(Boolean);
  const qs = new URLSearchParams(query || "");
  state.page = seg[0] || "home";
  state.lang = qs.get("lang") || "all";
  state.theme = qs.get("theme") || null;
  state.genre = qs.get("genre") || null;
  state.q = qs.get("q") || "";
  state.sort = qs.get("sort") || "az";
  state.dKey = seg[0] === "d" && seg[1] ? decodeURIComponent(seg[1]) : null;
}

function browseHash() {
  const p = new URLSearchParams();
  if (state.lang !== "all") p.set("lang", state.lang);
  if (state.theme) p.set("theme", state.theme);
  if (state.genre) p.set("genre", state.genre);
  if (state.q) p.set("q", state.q);
  if (state.sort !== "az") p.set("sort", state.sort);
  const s = p.toString();
  return "#/browse" + (s ? "?" + s : "");
}

/* ---------------- helpers ---------------- */
function hueOf(key) {
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 359;
  return h;
}
function cardCover(d, cls = "") {
  const first = d.tracks[0];
  const hue = hueOf(d.key);
  const art = first ? artUrl(first.file) : null;
  const badge = '<span class="cover-badge ' + (d.l === "hi" ? "hi" : "en") + '">' + (d.l === "hi" ? "हिन्दी" : "EN") + '</span>';
  const play = '<span class="cover-play" data-play="' + escapeHtml(d.key) + '" title="Play first lecture">' + SVG.play + '</span>';
  const lotus = '<span class="cover-lotus">' + SVG.lotusSm + '</span>';
  const img = art ? '<img loading="lazy" alt="" src="' + escapeHtml(art) + '" onerror="this.remove()">' : "";
  return '<div class="cover ' + cls + '" style="--h:' + hue + '">' + lotus + img + '<span class="cover-veil"></span>' + play + badge + '</div>';
}
function cardMeta(d) {
  const parts = [];
  parts.push(d.tracks.length ? d.tracks.length + " lectures" : (d.n ? "≈" + d.n + " lectures" : "lectures syncing…"));
  if (d.totalSecs) parts.push(fmtTotal(d.totalSecs));
  const genre = d.genre || (THEME_LABEL[themeOf(d.t)] || "");
  return parts.join(" · ") + (genre ? " · " + escapeHtml(genre.slice(0, 34)) : "");
}
function discourseCard(d, big = false) {
  const dev = isDevanagari(d.t) ? " dev" : "";
  return '<a class="card' + (big ? " big" : "") + '" href="#/d/' + encodeURIComponent(d.key) + '">' +
    cardCover(d, big ? "big" : "") +
    '<div class="card-body"><h3 class="card-title' + dev + '">' + escapeHtml(d.t) + '</h3>' +
    '<p class="card-meta">' + cardMeta(d) + '</p></div></a>';
}

const SVG = {
  lotusSm: '<svg viewBox="0 0 64 64" width="54" height="54" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" opacity=".85"><path d="M32 46c-4-6-4-14 0-22 4 8 4 16 0 22z"/><path d="M32 46c-8-2-14-8-16-16 8 0 14 5 16 16z"/><path d="M32 46c8-2 14-8 16-16-8 0-14 5-16 16z"/><path d="M32 46c-12 0-20-5-24-13 10-1 19 3 24 13z"/><path d="M32 46c12 0 20-5 24-13-10-1-19 3-24 13z"/><path d="M20 50c8 4 16 4 24 0" /></g></svg>',
  play: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg>',
  ext: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M14 5h5v5M19 5l-8 8M19 13v6H5V5h6"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2" d="M20 20l-4-4"/></svg>',
  ref: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"/></svg>',
  mandala: (() => {
    let petals = "", inner = "";
    for (let i = 0; i < 12; i++) petals += `<path d="M200 52 C 212 96, 212 132, 200 158 C 188 132, 188 96, 200 52 Z" transform="rotate(${i * 30} 200 200)"/>`;
    for (let i = 0; i < 12; i++) inner += `<path d="M200 118 C 208 142, 208 166, 200 182 C 192 166, 192 142, 200 118 Z" transform="rotate(${i * 30 + 15} 200 200)"/>`;
    return `<svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g stroke="rgba(232,176,75,.20)" stroke-width="1">
        <circle cx="200" cy="200" r="198" stroke-dasharray="1 7"/>
        <circle cx="200" cy="200" r="168"/>
        <circle cx="200" cy="200" r="106" stroke-dasharray="2 9"/>
        <circle cx="200" cy="200" r="58"/>
      </g>
      <g stroke="rgba(232,176,75,.30)" stroke-width="1.1">${petals}${inner}</g>
      <circle cx="200" cy="200" r="5" fill="rgba(232,176,75,.55)"/>
    </svg>`;
  })(),
};

/* ---------------- views ---------------- */
function viewHome() {
  const s = lib.stats();
  const cont = lastPlayed();
  const featured = FEATURED.map(t => lib.discourses.find(d => d.t.toLowerCase().includes(t.toLowerCase()))).filter(Boolean).slice(0, 8);
  const themes = THEME_LIST.map(tm => ({ ...tm, c: lib.discourses.filter(d => themeOf(d.t) === tm.id).length })).filter(t => t.c >= 3);
  const en = lib.discourses.filter(d => d.l === "en").length;
  const hi = lib.discourses.filter(d => d.l === "hi").length;

  return `
  <section class="hero">
    <div class="hero-mandala" aria-hidden="true">${SVG.mandala || ""}</div>
    <div class="hero-inner">
      <p class="hero-eyebrow">The Collected Discourses · ${fmtNum(s.discourses)} discourses · हिन्दी + English</p>
      <h1 class="hero-title">OSHO<span class="dot">IC</span></h1>
      <p class="hero-sub">Every teaching, one quiet place. Stream the complete Osho World archive — ${fmtNum(s.lectures)}+ lectures in Hindi and English, played straight from the Internet Archive.</p>
      <div class="hero-cta">
        <a class="btn gold" href="#/browse">Browse all discourses</a>
        <a class="btn ghost" href="${featured[0] ? "#/d/" + encodeURIComponent(featured[0].key) : "#/browse"}">${featured[0] ? "Start with " + escapeHtml(featured[0].t) : "Begin"}</a>
      </div>
      <div class="hero-quote" id="hero-quote">${quoteLine(0)}</div>
    </div>
    <div class="hero-stats">
      <div class="stat"><b>${fmtNum(s.discourses)}</b><span>discourses</span></div>
      <div class="stat"><b>${fmtNum(s.lectures)}+</b><span>lectures</span></div>
      <div class="stat"><b>${s.hours ? fmtNum(s.hours) : "≈6,500"}${s.hours ? "" : "+"}</b><span>hours of teaching</span></div>
      <div class="stat"><b>2</b><span>languages</span></div>
    </div>
  </section>

  ${cont ? `
  <section class="section">
    <div class="section-head"><h2>Pick up where you left off</h2></div>
    <a class="continue" href="#/d/${encodeURIComponent(cont.d.key)}">
      ${cardCover(cont.d)}
      <div class="continue-body">
        <p class="continue-kicker">Continue · Lecture ${pad2(cont.n)} of ${cont.d.tracks.length || cont.d.n || "…"}</p>
        <h3 class="card-title${isDevanagari(cont.d.t) ? " dev" : ""}">${escapeHtml(cont.d.t)}</h3>
        <p class="card-meta">${cardMeta(cont.d)}</p>
      </div>
      <button class="btn gold cont-play" data-continue>${SVG.play} Resume</button>
    </a>
  </section>` : ""}

  <section class="section">
    <div class="section-head"><h2>Begin somewhere sacred</h2><a class="linkmore" href="#/browse">All discourses →</a></div>
    <div class="grid">${featured.map(d => discourseCard(d, true)).join("")}</div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Enter through a theme</h2><p class="section-sub">Twelve doors into the same teaching.</p></div>
    <div class="theme-grid">
      ${themes.map(t => `
      <a class="theme" href="#/browse?theme=${t.id}">
        <b>${escapeHtml(t.label)}</b><span>${t.c} discourses</span>
      </a>`).join("")}
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Two languages, one voice</h2></div>
    <div class="lang-duo">
      <a class="lang-card en" href="#/browse?lang=en">
        <span class="lang-glyph">EN</span>
        <b>English</b>
        <span class="lang-count">${fmtNum(en)} discourses · Zen, Tao, Upanishads, Sufis, poetry…</span>
      </a>
      <a class="lang-card hi" href="#/browse?lang=hi">
        <span class="lang-glyph">हि</span>
        <b>हिन्दी</b>
        <span class="lang-count">${fmtNum(hi)} discourses · महागीता, कबीर, महावीर, भजन-काव्य…</span>
      </a>
    </div>
  </section>

  <section class="section about-strip">
    <div class="about-medallion" aria-hidden="true">ॐ</div>
    <div class="about-copy">
      <h2>The man behind the voice</h2>
      <p>Osho (born Chandra Mohan Jain, 1889–1990) was an Indian mystic and former professor of philosophy. For decades he spoke — about Zen and Tao, Upanishads and the Gita, Sufis and saints, love and death — in hundreds of discourses that this archive gathers, lecture by lecture. Sit with a teaching the way you would with a fire: close, and slowly.</p>
      <p class="about-links"><a href="#/about">More about the collection ${SVG.ext}</a></p>
    </div>
  </section>

  <section class="section source-strip">
    <div>
      <h3>Where the sound lives</h3>
      <p>All audio is streamed (never downloaded or re-hosted) from the public Internet Archive collection <a href="${IA_DETAILS}" target="_blank" rel="noopener">“OSHO Discourses Collection” ${SVG.ext}</a>, uploaded by Osho World — thanks to the keepers of that archive.</p>
    </div>
    <div class="source-actions">
      <button class="btn ghost" id="btn-refresh">${SVG.ref} Refresh library</button>
    </div>
  </section>`;
}

function quoteLine(i) {
  return `<span class="q-en">“${escapeHtml(QUOTES[i % QUOTES.length])}”</span><span class="q-attr">— Osho</span>`;
}

function lastPlayed() {
  const last = store.get(LAST_KEY, null);
  if (!last || !last.key) return null;
  const d = lib.find(last.key);
  if (!d) return null;
  return { d, n: last.n, t: last.t };
}

function viewBrowse() {
  const all = lib.discourses;
  let list = all.slice();
  if (state.lang !== "all") list = list.filter(d => d.l === state.lang);
  if (state.theme) list = list.filter(d => themeOf(d.t) === state.theme || (d.genre && d.genre.toLowerCase().includes(state.theme)));
  if (state.genre) list = list.filter(d => d.genre && d.genre.toLowerCase() === state.genre.toLowerCase());
  if (state.q) {
    const q = state.q.toLowerCase();
    list = list.filter(d =>
      d.t.toLowerCase().includes(q) ||
      (d.genre || "").toLowerCase().includes(q) ||
      d.tracks.some(t => (t.t || "").toLowerCase().includes(q))
    );
  }
  const sorters = {
    az: (a, b) => a.t.localeCompare(b.t),
    za: (a, b) => b.t.localeCompare(a.t),
    most: (a, b) => (b.tracks.length || b.n || 0) - (a.tracks.length || a.n || 0),
    fewest: (a, b) => (a.tracks.length || a.n || 0) - (b.tracks.length || b.n || 0),
  };
  list.sort(sorters[state.sort] || sorters.az);

  const genres = {};
  for (const d of all) if (d.genre) genres[d.genre] = (genres[d.genre] || 0) + 1;
  const topGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([g, c]) => [g, c]);

  const themeActive = state.theme ? THEME_LABEL[state.theme] : null;
  return `
  <div class="page-head">
    <h1 class="page-title">Discourses</h1>
    <p class="page-sub">${fmtNum(list.length)} of ${fmtNum(all.length)} discourses ${state.q ? "matching “" + escapeHtml(state.q) + "”" : ""}</p>
  </div>

  <div class="toolbar">
    <div class="search">
      ${SVG.search}
      <input id="q" type="search" placeholder="Search titles, themes, lectures…" value="${escapeHtml(state.q)}" autocomplete="off">
    </div>
    <div class="lang-tabs" role="tablist">
      ${[["all", "All"], ["en", "English"], ["hi", "हिन्दी"]].map(([v, l]) =>
        `<button class="lang-tab ${state.lang === v ? "on" : ""}" data-lang="${v}">${l}</button>`).join("")}
    </div>
    <select id="sort" class="sort" title="Sort">
      <option value="az" ${state.sort === "az" ? "selected" : ""}>A → Z</option>
      <option value="za" ${state.sort === "za" ? "selected" : ""}>Z → A</option>
      <option value="most" ${state.sort === "most" ? "selected" : ""}>Most lectures</option>
      <option value="fewest" ${state.sort === "fewest" ? "selected" : ""}>Fewest lectures</option>
    </select>
  </div>

  <div class="chips">
    <button class="chip ${!state.theme ? "on" : ""}" data-theme="">All themes</button>
    ${THEME_LIST.map(t => `<button class="chip ${state.theme === t.id ? "on" : ""}" data-theme="${t.id}">${escapeHtml(t.label)}</button>`).join("")}
  </div>
  ${topGenres.length ? `<div class="chips"><span class="chips-label">Genres</span>${topGenres.map(([g]) => `<button class="chip sm ${state.genre === g ? "on" : ""}" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join("")}</div>` : ""}

  <div class="grid" id="results">
    ${list.map(d => discourseCard(d)).join("")}
    ${list.length === 0 ? `<div class="empty"><p>Nothing found. Clear a filter or try another word.</p><button class="btn ghost" data-clear>Clear filters</button></div>` : ""}
  </div>`;
}

function viewDiscourse(key) {
  const d = lib.find(key);
  if (!d) return `<div class="page-head"><h1 class="page-title">Not found</h1><p class="page-sub"><a class="btn ghost" href="#/browse">Back to discourses</a></p></div>`;
  const dev = isDevanagari(d.t) ? " dev" : "";
  const loading = !d.tracks.length;

  const rowsHtml = loading
    ? `<div class="tracks loading">${Array.from({ length: 8 }, (_, i) => `<div class="row skel"><span class="rn">${pad2(i + 1)}</span><span class="rt"><span class="shimmer"></span></span><span class="rd">–</span></div>`).join("")}
       <p class="load-note" id="load-note">Reaching into the Internet Archive…</p></div>`
    : trackRows(d);

  const first = d.tracks[0];
  const coverArt = first ? artUrl(first.file) : null;
  const srcBadge = d.source === "guess" ? `<span class="src-badge warn">offline estimate — some lectures may be missing</span>`
    : (d.source === "s3" ? `<span class="src-badge">live · titles arriving soon</span>` : (d.source === "meta" || d.source === "cache") ? `<span class="src-badge ok">complete · from Internet Archive metadata</span>` : "");

  return `
  <div class="page-head dhead">
    <a class="back" href="#/browse">← All discourses</a>
    <div class="dhead-grid">
      <div class="dcover ${coverArt ? "" : "gen"}" ${coverArt ? 'style="--art:url(' + coverArt.replace(/'/g, "%27") + ')"' : 'style="--h:' + hueOf(d.key) + '"'}>
        ${coverArt ? "" : '<span class="cover-lotus">' + SVG.lotusSm + '</span>'}
      </div>
      <div class="dhead-body">
        <div class="dhead-tags">
          <span class="tag ${d.l === "hi" ? "hi" : "en"}">${d.l === "hi" ? "हिन्दी" : "English"}</span>
          ${d.genre ? `<span class="tag">${escapeHtml(d.genre)}</span>` : ""}
          ${srcBadge}
        </div>
        <h1 class="page-title${dev}">${escapeHtml(d.t)}</h1>
        <p class="page-sub">${d.tracks.length || d.n || "…"} lectures ${d.totalSecs ? "· " + fmtTotal(d.totalSecs) : ""} · Osho</p>
        ${d.desc ? `<p class="ddesc" id="ddesc">${escapeHtml(d.desc)}</p>` : ""}
        <div class="dhead-actions">
          <button class="btn gold" data-playall ${loading ? "disabled" : ""}>${SVG.play} Play all</button>
          <a class="btn ghost" href="${folderArchiveUrl(d.p)}" target="_blank" rel="noopener">On archive.org ${SVG.ext}</a>
        </div>
      </div>
    </div>
  </div>

  <div class="dlayout">
    <div class="tracks-panel">
      <div class="tracks-head"><span>Lecture</span><span>Duration</span></div>
      <div id="track-list">${rowsHtml}</div>
    </div>
    <aside class="queue-panel">
      <h4>In this discourse</h4>
      <p class="queue-hint">Click any lecture to begin. The player below keeps going, lecture after lecture, until you pause.</p>
      <p class="queue-src">Streamed live from<br><a href="${IA_DETAILS}" target="_blank" rel="noopener">archive.org ${SVG.ext}</a></p>
    </aside>
  </div>`;
}

function trackRows(d) {
  const isCurrent = player.d && player.d.key === d.key;
  return d.tracks.map((t, i) => {
    const active = isCurrent && player.qi === i;
    const playing = active && !player.a.paused;
    return `<div class="row ${active ? "active" : ""}" data-qi="${i}" data-key="${escapeHtml(d.key)}">
      <span class="rn">${playing ? eqBars() : pad2(t.n)}</span>
      <span class="rt">${t.t ? escapeHtml(t.t) : "Lecture " + pad2(t.n)}</span>
      <span class="rd">${fmtTime(t.secs)}</span>
    </div>`;
  }).join("");
}
function eqBars() {
  return '<span class="eq"><i></i><i></i><i></i></span>';
}

function viewAbout() {
  const s = lib.stats();
  return `
  <div class="page-head">
    <h1 class="page-title">About OSHOIC</h1>
    <p class="page-sub">A listening room for the complete Osho World audio archive.</p>
  </div>
  <div class="about-body">
    <div class="about-medallion" aria-hidden="true">ॐ</div>
    <div>
      <h3>What this is</h3>
      <p>OSHOIC is a fan-made listening space built around the public Internet Archive collection <a href="${IA_DETAILS}" target="_blank" rel="noopener">“OSHO Discourses Collection”</a> — the OSHO WORLD library of discourses in Hindi and English. It does not host any audio: every lecture streams directly from archive.org, so nothing is copied, stored, or altered here. Only the titles, themes and a quiet interface are ours.</p>
      <h3>How it works</h3>
      <p>On first visit the site quietly talks to the Internet Archive’s metadata API and learns the full catalogue — ${fmtNum(s.discourses)} discourses, their lectures, titles, genres and durations — then remembers it on your device. When you open a discourse, its lecture list appears and playback begins straight from the Archive’s CDN. If the connection hiccups, the site falls back to its built-in catalogue so the shelves are never empty.</p>
      <h3>The teacher</h3>
      <p>Osho (11 December 1889 – 19 January 1990), born Chandra Mohan Jain, taught from Varanasi and later Poona (Pune). His discourses move through Zen and Tao, the Upanishads and the Gita, Sufi and Jain poets, love, revolution and meditation. He left the body in 1990; the talks continue to be sought after, and this archive keeps them free and public.</p>
      <h3>Gratitude</h3>
      <p>Thank you to Osho World for assembling the collection, to the uploader and the curators at the Internet Archive for keeping it public, and to you — for listening slowly.</p>
      <blockquote class="big-quote">“The miracle of consciousness is that you are no longer the doer; the doer has died. That which is is happening.” <span>— Osho</span></blockquote>
    </div>
  </div>`;
}

/* ---------------- sync badge ---------------- */
function syncBadgeHtml() {
  const s = lib.sync;
  if (s.state === "syncing") return `<span class="syncb sync" title="Learning the full catalogue from the Internet Archive">${SVG.ref}<i class="spin"></i> Library · ${s.done ? fmtNum(s.done) + " tracks" : "connecting"}</span>`;
  if (s.state === "done") return `<span class="syncb ok" title="Full catalogue synced from archive.org">✓ Library synced</span>`;
  if (s.state === "error") return `<span class="syncb err" title="${escapeHtml(s.error || "sync failed")} — built-in catalogue is in use">! Library offline</span>`;
  return `<span class="syncb" title="Catalogue loaded from the built-in list">Library ready</span>`;
}

/* ---------------- render & route ---------------- */
const view = document.getElementById("view");

let restoreSearchFocus = false;

function render(scroll = true) {
  const restoreQ = restoreSearchFocus;
  restoreSearchFocus = false;
  parseHash();
  let html;
  if (state.page === "browse") html = viewBrowse();
  else if (state.page === "about") html = viewAbout();
  else if (state.page === "d" && state.dKey) html = viewDiscourse(state.dKey);
  else html = viewHome();

  document.getElementById("syncb-slot").innerHTML = syncBadgeHtml();
  view.innerHTML = html;
  const navPage = state.page === "d" ? "browse" : state.page;
  document.querySelectorAll("nav.main a").forEach(a => a.classList.toggle("on", a.dataset.nav === navPage));
  document.title = state.page === "d" && lib.find(state.dKey) ? lib.find(state.dKey).t + " — OSHOIC" : "OSHOIC — The Osho Discourses Collection";
  if (scroll) window.scrollTo(0, 0);

  bindView();
  if (restoreQ) {
    const qi = view.querySelector("#q");
    if (qi) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
  }
  if (state.page === "d" && state.dKey) maybeLoadTracks(state.dKey);
  if (state.page === "home") startHeroCycle();
  reveal();
}

async function maybeLoadTracks(key) {
  const d = lib.find(key);
  if (!d || d.tracks.length) return;
  const res = await lib.tracksFor(d);
  if (state.dKey !== key || state.page !== "d") return;
  d.tracks = res.tracks;
  if (d.source !== "meta" && d.source !== "cache") d.source = res.source;
  const wrap = document.getElementById("track-list");
  const note = document.getElementById("load-note");
  if (wrap) {
    wrap.classList.remove("loading");
    wrap.innerHTML = trackRows(d);
    bindRows();
  }
  if (note) note.remove();
  const btn = document.querySelector("[data-playall]");
  if (btn) btn.disabled = false;
}

function bindView() {
  // language tabs / sort / search / chips / clear
  view.querySelectorAll(".lang-tab").forEach(b => b.addEventListener("click", () => { state.lang = b.dataset.lang; state.theme = null; state.genre = null; location.hash = browseHash(); }));
  const q = view.querySelector("#q");
  if (q) {
    let t;
    q.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => { state.q = q.value.trim(); restoreSearchFocus = true; location.hash = browseHash(); }, 350);
    });
  }
  const sort = view.querySelector("#sort");
  if (sort) sort.addEventListener("change", () => { state.sort = sort.value; location.hash = browseHash(); });
  view.querySelectorAll(".chip[data-theme]").forEach(b => b.addEventListener("click", () => { state.theme = b.dataset.theme || null; state.genre = null; location.hash = browseHash(); }));
  view.querySelectorAll(".chip[data-genre]").forEach(b => b.addEventListener("click", () => { state.genre = b.dataset.genre || null; state.theme = null; location.hash = browseHash(); }));
  view.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", () => { state.q = ""; state.theme = null; state.genre = null; state.lang = "all"; location.hash = "#/browse"; }));
  view.querySelectorAll("[data-play]").forEach(b => b.addEventListener("click", e => {
    e.preventDefault(); e.stopPropagation();
    playFirst(b.dataset.play);
  }));
  view.querySelectorAll("[data-playall]").forEach(b => b.addEventListener("click", () => {
    const d = lib.find(state.dKey);
    if (d) player.loadDiscourse(d, 0);
  }));
  const cont = view.querySelector("[data-continue]");
  if (cont) cont.addEventListener("click", e => {
    e.preventDefault();
    const last = lastPlayed();
    if (!last) return;
    const d = lib.find(last.key);
    const idx = d.tracks.findIndex(t => t.n === last.n);
    player.loadDiscourse(d, idx >= 0 ? idx : 0);
  });
  const br = document.getElementById("btn-refresh");
  if (br) br.addEventListener("click", () => { toast("Re-syncing with the Internet Archive…"); lib.startSync(true); render(); });
  const ddesc = document.getElementById("ddesc");
  if (ddesc) ddesc.addEventListener("click", () => ddesc.classList.toggle("open"));
  bindRows();
}

function bindRows() {
  view.querySelectorAll(".row[data-qi]").forEach(r => r.addEventListener("click", () => {
    const key = r.dataset.key;
    const d = lib.find(key);
    if (!d) return;
    if (player.d && player.d.key === key) player.jumpTo(parseInt(r.dataset.qi, 10));
    else player.loadDiscourse(d, parseInt(r.dataset.qi, 10));
  }));
}

async function playFirst(key) {
  const d = lib.find(key);
  if (!d) return;
  if (!d.tracks.length) {
    const res = await lib.tracksFor(d);
    d.tracks = res.tracks;
    if (d.source !== "meta" && d.source !== "cache") d.source = res.source;
  }
  player.loadDiscourse(d, 0);
}

/* ---------------- hero quote cycle ---------------- */
let heroTimer = null;
function startHeroCycle() {
  if (heroTimer) clearInterval(heroTimer);
  let i = 0;
  const el = () => document.getElementById("hero-quote");
  heroTimer = setInterval(() => {
    i = (i + 1) % QUOTES.length;
    const e = el();
    if (!e) return clearInterval(heroTimer);
    e.classList.add("fade");
    setTimeout(() => { e.innerHTML = quoteLine(i); e.classList.remove("fade"); }, 450);
  }, 9000);
}

/* ---------------- reveal-on-scroll ---------------- */
let io = null;
function reveal() {
  if (!io) io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); } }), { threshold: 0.08 });
  view.querySelectorAll(".section, .page-head, .card, .theme, .lang-card").forEach((el, i) => {
    el.classList.remove("seen");
    el.style.transitionDelay = Math.min(i % 8, 6) * 40 + "ms";
    io.observe(el);
  });
}

/* ---------------- player ↔ view ---------------- */
player.onChange = () => {
  // update active row
  view.querySelectorAll(".row.active").forEach(r => r.classList.remove("active"));
  const r = view.querySelector('.row[data-key="' + cssEsc(player.d ? player.d.key : "") + '"][data-qi="' + player.qi + '"]');
  if (r) { r.classList.add("active"); const rn = r.querySelector(".rn"); if (rn) rn.innerHTML = !player.a.paused ? eqBars() : pad2(parseInt(r.dataset.qi, 10) + 1); r.scrollIntoView({ block: "nearest" }); }
  // keep dock title fresh when same track re-selected
  document.body.classList.toggle("has-player", !!player.queue.length);
};

function cssEsc(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\[\]]/g, "\\$&");
}

/* ---------------- library events ---------------- */
lib.on("progress", () => {
  const slot = document.getElementById("syncb-slot");
  if (slot) slot.innerHTML = syncBadgeHtml();
  const note = document.getElementById("load-note");
  const d = state.dKey && lib.find(state.dKey);
  if (note && d && !d.tracks.length) note.textContent = "Reaching into the Internet Archive… " + fmtNum(lib.sync.done) + " tracks learned so far";
});
lib.on("updated", d => {
  if (state.dKey === d.key && state.page === "d") {
    const wrap = document.getElementById("track-list");
    if (wrap && !wrap.classList.contains("loading")) { wrap.innerHTML = trackRows(d); bindRows(); }
  }
});
lib.on("done", () => {
  render(false);
  toast("Full catalogue synced from the Internet Archive. 🙏", 5000);
});

/* ---------------- boot ---------------- */
lib.init();
lib.pingS3();
const cache = store.get(CAT_KEY, null);
const fresh = cache && cache.ts && (Date.now() - cache.ts) < 7 * 864e5;
if (!fresh) setTimeout(() => lib.startSync(), 800);
else lib.sync = { state: "done", done: 0, pages: 0, error: null };

player.wire(document.getElementById("dock"));
window.addEventListener("hashchange", () => render());
render();
