/* OSHOIC — application (routing, views, filters) */
import lib from "./library.js";
import player, { pad2 } from "./player.js";
import { BAKED, FEATURED } from "./data.js";
import { QUOTES, HERO_LINES } from "./quotes.js";
import {
  escapeHtml, fmtNum, fmtTime, fmtTotal, isDevanagari,
  themeOf, THEME_LIST, THEME_LABEL,
  store, CAT_KEY, LAST_KEY,
} from "./util.js";
import { coverUrlSync, hydrateCovers } from "./covers.js";

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
  openPanel: null,
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
  const hue = hueOf(d.key);
  const art = coverUrlSync(d);
  const badge = '<span class="cover-badge ' + (d.l === "hi" ? "hi" : "en") + '">' + (d.l === "hi" ? "हिन्दी" : "EN") + '</span>';
  const play = '<span class="cover-play" data-play="' + escapeHtml(d.key) + '" title="Play first lecture">' + SVG.play + '</span>';
  const book = '<div class="cover-book" aria-hidden="true"><span class="cover-osho">OSHO</span><span class="cover-lotus">' + SVG.lotusSm + '</span><span class="cover-ctitle' + (isDevanagari(d.t) ? " dev" : "") + '">' + escapeHtml(d.t) + '</span></div>';
  const img = '<img class="cover-photo" loading="lazy" alt="" referrerpolicy="no-referrer"' + (art ? ' src="' + escapeHtml(art) + '"' : "") + ' onerror="this.remove()">';
  return '<div class="cover ' + cls + '" style="--h:' + hue + '" data-cover-key="' + escapeHtml(d.key) + '" data-cover-title="' + escapeHtml(d.t) + '" data-cover-lang="' + d.l + '">' + book + img + '<span class="cover-veil"></span>' + play + badge + '</div>';
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

  return `
  <section class="hero">
    <div class="hero-mandala" aria-hidden="true">${SVG.mandala || ""}</div>
    <div class="hero-inner">
      <h1 class="hero-title">OSHO<span class="dot">IC</span></h1>
      <p class="hero-sub">Every teaching, one quiet place. ${fmtNum(s.lectures)}+ lectures in Hindi and English, gathered and kept by <b class="goldtext">ifallertzia</b>, ready to play.</p>
      <div class="hero-cta">
        <a class="btn gold" href="#/browse">Browse all discourses</a>
        <a class="btn ghost" href="${featured[0] ? "#/d/" + encodeURIComponent(featured[0].key) : "#/browse"}">${featured[0] ? "Start with " + escapeHtml(featured[0].t) : "Begin"}</a>
      </div>
      <div class="hero-quote" id="hero-quote">${quoteLine(0)}</div>
    </div>
    <div class="hero-stats">
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
    <div class="section-head"><h2>Enter through a theme</h2><p class="section-sub">Doors into the same teaching.</p></div>
    <div class="filters">
      <button class="filter-btn ${state.openPanel === "home-themes" ? "open" : ""}" data-fbtn="home-themes"><span class="lbl">Show themes</span><span class="caret">▾</span></button>
    </div>
    <div class="fpanel panel-wide ${state.openPanel === "home-themes" ? "open" : ""}" data-panel="home-themes">
      <div class="theme-grid">
        ${themes.map(t => `
        <a class="theme" href="#/browse?theme=${t.id}">
          <b>${escapeHtml(t.label)}</b>
        </a>`).join("")}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>Two languages, one voice</h2></div>
    <div class="lang-duo">
      <a class="lang-card en" href="#/browse?lang=en">
        <span class="lang-glyph">EN</span>
        <b>English</b>
        <span class="lang-count">Zen, Tao, Upanishads, Sufis, poetry…</span>
      </a>
      <a class="lang-card hi" href="#/browse?lang=hi">
        <span class="lang-glyph">हि</span>
        <b>हिन्दी</b>
        <span class="lang-count">महागीता, कबीर, महावीर, भजन-काव्य…</span>
      </a>
    </div>
  </section>

  <section class="section about-strip">
    <div class="about-medallion" aria-hidden="true">ॐ</div>
    <div class="about-copy">
      <h2>The man behind the voice</h2>
      <p>Osho (born Chandra Mohan Jain, 1889–1990) was an Indian mystic and former professor of philosophy. For decades he spoke — about Zen and Tao, Upanishads and the Gita, Sufis and saints, love and death — in hundreds of discourses gathered here, lecture by lecture. Sit with a teaching the way you would with a fire: close, and slowly.</p>
      <p class="about-links"><a href="#/about">More about the collection ${SVG.ext}</a></p>
    </div>
  </section>

  <section class="section source-strip">
    <div>
      <h3>One quiet place</h3>
      <p>Every teaching lives here — in Hindi and English — gathered lecture by lecture. Open one, and let it do its work.</p>
    </div>
    <div class="source-actions">
      <span class="madeby">made with reverence · <b>ifallertzia</b></span>
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
    <p class="page-sub">${state.q || state.theme || state.genre || state.lang !== "all" ? `${fmtNum(list.length)} discourses${state.q ? " matching “" + escapeHtml(state.q) + "”" : ""}` : "Every teaching, gathered quietly"}</p>
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

  <div class="filters">
    <button class="filter-btn ${state.openPanel === "theme" ? "open" : ""} ${state.theme ? "active" : ""}" data-fbtn="theme">
      <span class="lbl">${state.theme ? escapeHtml(THEME_LABEL[state.theme] || state.theme) : "Show themes"}</span><span class="caret">▾</span>
    </button>
    <button class="filter-btn ${state.openPanel === "genre" ? "open" : ""} ${state.genre ? "active" : ""}" data-fbtn="genre">
      <span class="lbl">${state.genre ? escapeHtml(state.genre) : "Show genres"}</span><span class="caret">▾</span>
    </button>
  </div>
  <div class="fpanel ${state.openPanel === "theme" ? "open" : ""}" data-panel="theme">
    <button class="chip ${!state.theme ? "on" : ""}" data-theme="">All themes</button>
    ${THEME_LIST.map(t => `<button class="chip ${state.theme === t.id ? "on" : ""}" data-theme="${t.id}">${escapeHtml(t.label)}</button>`).join("")}
  </div>
  <div class="fpanel ${state.openPanel === "genre" ? "open" : ""}" data-panel="genre">
    ${topGenres.length
      ? topGenres.map(([g]) => `<button class="chip sm ${state.genre === g ? "on" : ""}" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join("")
      : '<span class="fpanel-hint">Genres will appear here once the library has finished syncing.</span>'}
  </div>

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
       <p class="load-note" id="load-note">Reaching into the library…</p></div>`
    : trackRows(d);

  const coverArt = coverUrlSync(d);
  const srcBadge = d.source === "guess" ? `<span class="src-badge warn">offline estimate — some lectures may be missing</span>`
    : (d.source === "s3" ? `<span class="src-badge">live · titles arriving soon</span>` : (d.source === "meta" || d.source === "cache") ? `<span class="src-badge ok">complete · from the full library</span>` : "");

  return `
  <div class="page-head dhead">
    <a class="back" href="#/browse">← All discourses</a>
    <div class="dhead-grid">
      <div class="dcover ${coverArt ? "has-art" : "gen"}" style="--h:${hueOf(d.key)}" data-cover-key="${escapeHtml(d.key)}" data-cover-title="${escapeHtml(d.t)}" data-cover-lang="${d.l}">
        <div class="cover-book" aria-hidden="true"><span class="cover-osho">OSHO</span><span class="cover-lotus">${SVG.lotusSm}</span><span class="cover-ctitle${dev}">${escapeHtml(d.t)}</span></div>
        <img class="cover-photo" alt="" referrerpolicy="no-referrer"${coverArt ? ' src="' + escapeHtml(coverArt) + '"' : ""} onerror="this.remove()">
        <span class="cover-veil"></span>
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
      <p class="queue-hint">Click any lecture to begin. The player keeps going, lecture after lecture, until you pause.</p>
      <p class="queue-src">Curated by<br><b class="goldtext">ifallertzia</b></p>
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
  return `
  <div class="page-head">
    <h1 class="page-title">About OSHOIC</h1>
    <p class="page-sub">A listening room for the complete Osho discourses — from <b class="goldtext">ifallertzia</b>.</p>
  </div>
  <div class="about-body">
    <div class="about-medallion" aria-hidden="true">ॐ</div>
    <div>
      <h3>What this is</h3>
      <p>OSHOIC is a fan-made listening space — the <b class="goldtext">ifallertzia</b> library — for the complete Osho discourses in Hindi and English. Nothing is copied, stored or altered here: every lecture streams directly from the ifallertzia server the moment you press play. Only the titles, the themes and the interface are ours.</p>
      <h3>The teacher</h3>
      <p>Osho (11 December 1889 – 19 January 1990), born Chandra Mohan Jain, taught from Varanasi and later Poona (Pune). His discourses move through Zen and Tao, the Upanishads and the Gita, Sufi and Jain poets, love, revolution and meditation. He left the body in 1990; the talks continue to be sought after, and OSHOIC keeps them one click away.</p>
      <h3>With love</h3>
      <p>For the teachers, for the keepers of these words, and for you — for listening slowly. <b class="goldtext">ifallertzia</b></p>
      <blockquote class="big-quote">“The miracle of consciousness is that you are no longer the doer; the doer has died. That which is is happening.” <span>— Osho</span></blockquote>
    </div>
  </div>`;
}

function viewSadhana() {
  const cards = [
    {
      t: "Dynamic Meditation",
      meta: "For the restless mind · about 35 minutes",
      intro: "Osho's first door — for those whose minds will not sit still. It uses effort to exhaust effort itself; the fifth stage arrives in silence by itself.",
      steps: [
        ["1", "Breathing — 7 min 20 sec", "Eyes open, no specific gaze. Breathing becomes circular and violent: through the nose, as if inhaling the whole universe; the exhale is an explosion through the mouth, as if pushing the whole universe out. No rhythm, no pattern."],
        ["2", "Catharsis — 7 min 10 sec", "Stop breathing. Now let it all out: shake, dance, cry, laugh, shout — whatever the body wants. You are not responsible for it. This is the revolution of the inauthentic mind falling apart."],
        ["3", "“Om” — 7 min 10 sec", "Suddenly stop. Sit down, close the eyes. At a chosen moment inhale and say “Om” — not forced, just allowed. The “Om” may come in waves. If it stops, let it stop. No compulsion."],
        ["4", "Watching — 7 min 20 sec", "Be utterly still and watch. Body, breath, thoughts, feelings — watch everything happening inside and around, without choosing, without judging. The witness is meditating."],
        ["5", "Celebration — 7 min 10 sec", "Be with the group: look into eyes, dance if it comes, be grateful. Then close the eyes for five minutes and be alone with the silence you have just found."],
      ],
    },
    {
      t: "Sahaj Meditation",
      meta: "For the experienced · one hour",
      intro: "“Sahaj” means natural, effortless. This is not done — it happens. Osho recommended it for those who already have some silence within.",
      steps: [
        ["1", "Watch the breath — 10–20 min", "Lie on the ground, spine straight. Simply watch the breath as it enters and leaves. Do not control it. The watching quiets the mind."],
        ["2", "Movement — 15–30 min", "Rise and move: walk, dance, shake, stretch — however the body wants. Move with full awareness, as if every movement were a prayer."],
        ["3", "Watching — 15–30 min", "Sit or lie down and watch: breath, body, thoughts. No effort, no method. When attention slips back into the stream, let it go."],
        ["4", "Celebration & closing", "A moment of gratitude and silence, alone or with the group. Carry the sahaj — the naturalness — into the day."],
      ],
    },
    {
      t: "Meditation of Watchfulness",
      meta: "The simplest door · one hour, any time",
      intro: "Osho calls watchfulness the most powerful technique: the meditator becomes the watcher, and the watcher's silence is meditation itself.",
      steps: [
        ["1", "The body — 20 min", "Sit comfortably. Watch the body as if you have never seen it: hands, feet, heart, face. When the mind wanders, watch the wandering too."],
        ["2", "The breath — 20 min", "Watch the breath without changing it — in and out, long or short. The breath is the bridge between body and mind."],
        ["3", "The thoughts — 20 min", "Watch the thoughts come and go, like clouds in a sky. You are not the thought; you are the sky in which it passes."],
      ],
    },
    {
      t: "Meditation of Gratitude",
      meta: "One hour, three rounds of twenty minutes",
      intro: "Gratitude opens the heart the way breath opens the lungs. Osho taught it in three movements — for the universe, for all beings, and for oneself.",
      steps: [
        ["1", "For the earth & universe — 20 min", "Be grateful for the body, the breath, the earth, the sun, the food, the water, the air. Feel the gratitude as warmth spreading from the heart."],
        ["2", "For all beings — 20 min", "Begin near — family, friends — and widen the circle: strangers, enemies, the whole of creation. Even to what has harmed you: gratitude dissolves the wound."],
        ["3", "For yourself — 20 min", "Finally, be grateful to yourself — for the body that carries you, for the courage, for the searching. A person who is grateful for themselves has arrived home."],
      ],
    },
  ];
  const morning = [
    "I greet the sun.", "I greet the birds.", "I greet the flowers.", "I greet the trees.",
    "I greet the hills.", "I greet the mountains.", "I greet the rivers.", "I greet the lakes.",
    "I greet the ponds.", "I greet the springs.", "I greet the clouds.", "I greet the rain.",
    "I greet the snow.", "I greet the ice.", "I greet the stars.", "I greet the moon.",
    "I greet the planets.", "I greet the universe.", "I greet every being.",
    "I greet you. And I greet me.",
    "I greet the universe. I greet the infinite. I greet the eternity.",
  ];
  const evening = [
    "I greet the night. I greet the darkness.", "I greet the stars. I greet the moon.",
    "I greet the planets. I greet the universe.", "I greet every being.",
    "I greet you. And I greet me.",
    "I greet the universe. I greet the infinite. I greet the eternity.",
    "I rest. I sleep. I dream. And I let go.",
  ];
  return `
  <div class="page-head">
    <p class="hero-eyebrow" style="margin-bottom:6px">Sādhanā · daily practice</p>
    <h1 class="page-title">Sadhana</h1>
    <p class="page-sub">The seat comes first. The words come second — sit, and let the teaching enter.</p>
  </div>

  <div class="sadh-intro">
    <blockquote class="big-quote" style="margin-top:0">“Meditation is the shortest way to the innermost core of your being. The mind is a barrier; meditation dissolves it. You cannot reach the innermost core of yourself with the mind — only in silence, in emptiness, in total stillness.” <span>— Osho</span></blockquote>
  </div>

  <div class="sadh-grid">
    ${cards.map(c => `
    <div class="sadh-card">
      <p class="sadh-meta">${escapeHtml(c.meta)}</p>
      <h3>${escapeHtml(c.t)}</h3>
      <p class="sadh-intro-p">${escapeHtml(c.intro)}</p>
      <ol class="sadh-steps">
        ${c.steps.map(([n, h, b]) => `<li><b class="num">${n}</b><span><b class="sadh-step-h">${escapeHtml(h)}</b><br>${escapeHtml(b)}</span></li>`).join("")}
      </ol>
    </div>`).join("")}
  </div>

  <div class="sadh-prayers">
    <div class="prayer-card">
      <p class="sadh-meta">Every morning</p>
      <h3>Morning Prayer</h3>
      <p class="prayer">${morning.map(l => escapeHtml(l)).join("<br>")}</p>
    </div>
    <div class="prayer-card">
      <p class="sadh-meta">Every night</p>
      <h3>Evening Prayer</h3>
      <p class="prayer">${evening.map(l => escapeHtml(l)).join("<br>")}</p>
    </div>
  </div>

  <div class="sadh-cta">
    <p>When the seat is ready, the teaching can speak.</p>
    <a class="btn gold" href="#/browse">Sit with a discourse →</a>
  </div>`;
}

/* ---------------- sync badge ---------------- */
function syncBadgeHtml() {
  const s = lib.sync;
  if (s.state === "syncing") return `<span class="syncb sync" title="Learning the full catalogue">${SVG.ref}<i class="spin"></i> Library · syncing</span>`;
  if (s.state === "done") return `<span class="syncb ok" title="Full catalogue synced">✓ Library synced</span>`;
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
  else if (state.page === "sadhana") html = viewSadhana();
  else if (state.page === "d" && state.dKey) html = viewDiscourse(state.dKey);
  else html = viewHome();

  document.getElementById("syncb-slot").innerHTML = syncBadgeHtml();
  view.innerHTML = html;
  const navPage = state.page === "d" ? "browse" : state.page;
  document.querySelectorAll("nav.main a").forEach(a => a.classList.toggle("on", a.dataset.nav === navPage));
  document.title =
    state.page === "d" && lib.find(state.dKey) ? lib.find(state.dKey).t + " — OSHOIC"
    : state.page === "sadhana" ? "Sadhana — OSHOIC"
    : state.page === "about" ? "About — OSHOIC"
    : "OSHOIC — The Osho Discourses Collection";
  player.setBaseTitle(document.title);
  if (scroll) window.scrollTo(0, 0);

  bindView();
  hydrateCovers(view);
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
  view.querySelectorAll("[data-fbtn]").forEach(b => b.addEventListener("click", () => {
    const which = b.dataset.fbtn;
    state.openPanel = state.openPanel === which ? null : which;
    view.querySelectorAll(".fpanel").forEach(p => p.classList.toggle("open", p.dataset.panel === state.openPanel));
    view.querySelectorAll("[data-fbtn]").forEach(x => x.classList.toggle("open", x.dataset.fbtn === state.openPanel));
  }));
  view.querySelectorAll(".chip[data-theme]").forEach(b => b.addEventListener("click", () => { state.theme = b.dataset.theme || null; state.genre = null; state.openPanel = null; location.hash = browseHash(); }));
  view.querySelectorAll(".chip[data-genre]").forEach(b => b.addEventListener("click", () => { state.genre = b.dataset.genre || null; state.theme = null; state.openPanel = null; location.hash = browseHash(); }));
  view.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", () => { state.q = ""; state.theme = null; state.genre = null; state.lang = "all"; state.openPanel = null; location.hash = "#/browse"; }));
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
  if (br) br.addEventListener("click", () => { toast("Re-syncing the library…"); lib.startSync(true); render(); });
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
  if (note && d && !d.tracks.length) note.textContent = "Reaching into the library…";
});
lib.on("updated", d => {
  if (state.dKey === d.key && state.page === "d") {
    const wrap = document.getElementById("track-list");
    if (wrap && !wrap.classList.contains("loading")) { wrap.innerHTML = trackRows(d); bindRows(); }
  }
});
lib.on("done", () => {
  render(false);
  toast("Library synced. 🙏", 5000);
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
