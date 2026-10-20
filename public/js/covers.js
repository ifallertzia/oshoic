/* OSHOIC — discourse cover art
 * Looks up the published Osho book cover for each discourse
 * (Sannyas Wiki originals, Open Library, Internet Archive),
 * caches the result, and falls back to a named OSHO plate.
 */

import { store } from "./util.js";

const CACHE_KEY = "oshoic.covers.v1";
const WIKI_API = "https://www.sannyas.wiki/api.php";
const OL_SEARCH = "https://openlibrary.org/search.json";
const IA_SEARCH = "https://archive.org/advancedsearch.php";

function wikiUrl(params) {
  const origin = (typeof location !== "undefined" && location.origin) ? location.origin : "*";
  return WIKI_API + "?origin=" + encodeURIComponent(origin) + "&format=json&" + params;
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[—–−]/g, " ")
    .replace(/&/g, " and ")
    .replace(/['’"!?.,:;()[\]{}#/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wikiFileUrl(name) {
  return "https://www.sannyas.wiki/index.php?title=Special:FilePath/" + encodeURIComponent(name);
}
function olCoverUrl(id) {
  return "https://covers.openlibrary.org/b/id/" + id + "-L.jpg?default=false";
}

/* Hand-matched published covers (wiki originals preferred, then Open Library). */
const BAKED = {
  "a bird on the wing": wikiFileUrl("1360 lrg.jpg"),
  "ah this": wikiFileUrl("Ah This 2017.jpg"),
  "be still and know": wikiFileUrl("19 lrg.jpg"),
  "beyond enlightenment": wikiFileUrl("405 lrg.jpg"),
  "the art of dying": wikiFileUrl("17 lrg.jpg"),
  "the diamond sutra the buddha also said": wikiFileUrl("76 lrg.jpg"),
  "the diamond sutra": wikiFileUrl("76 lrg.jpg"),
  "the empty boat": wikiFileUrl("The Empty Boat (2011) - Cover.jpg"),
  "the heart sutra": wikiFileUrl("133 lrg.jpg"),
  "and the flowers showered": wikiFileUrl("16 lrg.JPG"),
  "the book of wisdom": wikiFileUrl("1283 lrg.jpg"),
  "vigyan bhairav tantra": wikiFileUrl("The Book of the Secrets, Vol 1 (1976 HR) - cover.jpg"),
  "adhyatam upanishad": wikiFileUrl("2486.jpg"),
  "adhyatma upanishad": wikiFileUrl("2486.jpg"),
  "until you die": olCoverUrl(5385369),
  "the secret of secrets": olCoverUrl(10652611),
  "no water no moon": olCoverUrl(1635788),
  "the path of love": olCoverUrl(13827770),
  "the tantra vision": olCoverUrl(12771038),
  "tantra supreme understanding": olCoverUrl(13907613),
  "communism and zen fire": olCoverUrl(13015177),
  "geeta darshan": olCoverUrl(13175030),
  "sambhog se samadhi ki aur": olCoverUrl(14840438),
  "main mrityu sikhata hun": olCoverUrl(5468142),
  "philosophia perennis": olCoverUrl(2925803),
  "nirvana the last nightmare": olCoverUrl(9054195),
  "returning to the source": olCoverUrl(12777942),
  "my way the way of white clouds": olCoverUrl(4393425),
  "the discipline of transcendence": olCoverUrl(13495698),
  "turning in": olCoverUrl(5251595),
  "walking in zen sitting in zen": olCoverUrl(9654924),
  "the zen manifesto": olCoverUrl(2253924),
  "the messiah": olCoverUrl(13282654),
  "zarathustra laughing prophet": olCoverUrl(13493906),
  "dang dang doko dang": olCoverUrl(9502663),
  "sat chit anand": olCoverUrl(13951359),
  "sadhana path": olCoverUrl(12790571),
  "the dhammapada the way of the buddha": olCoverUrl(5108849),
  "yoga the alpha and omega": olCoverUrl(179142),
  "yoga the alpha omega": olCoverUrl(179142),
  "the tantra experience": olCoverUrl(9054018),
  "absolute tao": olCoverUrl(13851630),
};

const ALIASES = {
  "vigyan bhairav tantra": ["the book of the secrets", "book of secrets"],
  "yoga the alpha and omega": ["yoga the alpha and the omega", "yoga the science of the soul"],
  "come follow yourself": ["come follow me"],
  "bodhidharma": ["bodhidharma the greatest zen master"],
  "buddha emptiness of heart": ["the buddha the emptiness of the heart"],
  "christianity the deadliest poison and zen": ["christianity the deadliest poison and zen the antidote to all poisons"],
  "adhyatam upanishad": ["adhyatma upanishad"],
  "agyat ki aur": ["agyat ki or"],
  "birhani mandir diyana baar": ["birahini mandir diyana baar"],
  "dariya kahe sabad nirvana": ["dariya kahai sabda nirbana"],
  "dharam sadhana ke sutra": ["dharm sadhana ke sutra"],
  "dharam aur anand": ["dharm aur anand"],
  "dharam ki yatra": ["dharm ki yatra"],
  "sarvaswar upanishad": ["sarvasar upanishad", "saravsar upanishad"],
  "the razors edge": ["the razor's edge", "the razors edge"],
  "joshu the lions roar": ["joshu the lion's roar"],
  "from unconciousness to conscious": ["from unconsciousness to consciousness"],
  "this a thousand times": ["this this a thousand times this"],
  "my way the way of white clouds": ["my way the way of the white clouds", "way of the white clouds"],
  "yaa hoo the mystic rose": ["yahoo the mystic rose", "the mystic rose"],
  "the dhammapada the way of the buddha": ["the dhammapada", "the book of the books"],
  "ecstasy the forgotten language songs of kabir": ["ecstasy the forgotten language"],
  "god is dead now zen is the only living truth": ["god is dead now zen is the only living truth"],
  "i celebrate myself": ["i celebrate myself god is no where life is now here"],
  "jesus crucified again": ["jesus crucified again this time in ronald reagan's america"],
  "the great pilgrimage": ["the great pilgrimage from here to here"],
  "rinzai master of the irrational": ["rinzai the master of the irrational"],
  "tao upanishad": ["tao upanishad"],
  "maha geeta": ["maha geeta", "ashtavakra mahageeta"],
};

const mem = new Map();

function cacheAll() {
  return store.get(CACHE_KEY, {}) || {};
}
function cacheGet(key) {
  if (mem.has(key)) return mem.get(key);
  const all = cacheAll();
  if (Object.prototype.hasOwnProperty.call(all, key)) {
    mem.set(key, all[key]);
    return all[key];
  }
  return undefined;
}
function cacheSet(key, url) {
  mem.set(key, url);
  const all = cacheAll();
  all[key] = url;
  store.set(CACHE_KEY, all);
}

function lookupBaked(title) {
  const k = norm(title);
  if (BAKED[k]) return BAKED[k];
  const aliases = ALIASES[k] || [];
  for (const a of aliases) if (BAKED[norm(a)]) return BAKED[norm(a)];
  for (const [nk, url] of Object.entries(BAKED)) {
    if (nk.length < 14) continue;
    if (k.startsWith(nk) || nk.startsWith(k)) return url;
  }
  return null;
}

function queriesFor(title) {
  const t = String(title || "").trim();
  const head = t.split(/\s+[—–-]\s+/)[0].replace(/:\s.*$/, "").trim();
  const out = [t, head];
  const k = norm(t);
  if (ALIASES[k]) out.push(...ALIASES[k]);
  return [...new Set(out.filter(Boolean))];
}

function scoreTitle(found, want) {
  const a = norm(found), b = norm(want);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.startsWith(b) || b.startsWith(a)) return 86;
  const ta = a.split(" ").filter(w => w.length > 2);
  const tb = new Set(b.split(" ").filter(w => w.length > 2));
  if (!ta.length || !tb.size) return 0;
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit++;
  const overlap = hit / Math.max(ta.length, tb.size);
  if (overlap >= 0.72) return Math.round(70 * overlap);
  if (a.includes(b) || b.includes(a)) return 60;
  return Math.round(55 * overlap);
}

function isOshoAuthor(doc) {
  const names = (doc.author_name || []).join(" ").toLowerCase();
  return /osho|rajneesh|chandra mohan/.test(names);
}

let inflight = 0;
const waiters = [];
function gate(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      inflight++;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          inflight--;
          if (waiters.length) waiters.shift()();
        });
    };
    if (inflight < 3) run();
    else waiters.push(run);
  });
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error("http " + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function pickWikiFile(files) {
  const names = (files || [])
    .map(f => (typeof f === "string" ? f : (f && f.title) || ""))
    .map(s => String(s).replace(/^File:/i, "").trim())
    .filter(Boolean);
  const score = n => {
    const l = n.toLowerCase();
    if (!/\.(jpe?g|png|webp|gif)$/i.test(l)) return -1;
    if (/blank|icon|logo|wiki\.png|contents|inside|p\.\d|page \d|back & front/.test(l)) return -1;
    if (/\bback\b/.test(l) && !/front/.test(l)) return 1;
    if (/cover/.test(l)) return 12;
    if (/\blrg\b/.test(l)) return 9;
    if (/\bsml\b/.test(l)) return 3;
    return 6;
  };
  return names
    .map(n => ({ n, s: score(n) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)[0]?.n || null;
}

async function fromWiki(title) {
  for (const q of queriesFor(title).slice(0, 3)) {
    const searchUrl = wikiUrl("action=query&list=search&srnamespace=0&srlimit=6&srsearch=" + encodeURIComponent(q));
    const data = await fetchJson(searchUrl);
    const hits = (data.query && data.query.search) || [];
    const ranked = hits
      .map(h => ({ h, s: scoreTitle(h.title.replace(/\s*\([^)]*\)\s*$/, ""), title) }))
      .filter(x => x.s >= 55)
      .sort((a, b) => b.s - a.s);
    for (const { h } of ranked.slice(0, 2)) {
      const imgUrl = wikiUrl("action=query&prop=images&imlimit=20&pageids=" + h.pageid);
      const imgData = await fetchJson(imgUrl);
      const page = imgData.query && imgData.query.pages && imgData.query.pages[h.pageid];
      const file = pickWikiFile(page && page.images);
      if (file) return wikiFileUrl(file);
    }
  }
  return null;
}

async function fromOpenLibrary(title) {
  for (const q of queriesFor(title).slice(0, 2)) {
    const url = OL_SEARCH + "?limit=8&fields=title,cover_i,author_name&q=" + encodeURIComponent(q + " Osho");
    const data = await fetchJson(url);
    const docs = (data.docs || []).filter(d => d.cover_i && isOshoAuthor(d));
    const ranked = docs
      .map(d => ({ d, s: scoreTitle(d.title, title) }))
      .filter(x => x.s >= 58)
      .sort((a, b) => b.s - a.s);
    if (ranked[0]) return olCoverUrl(ranked[0].d.cover_i);
  }
  return null;
}

async function fromArchive(title) {
  const q = `title:("${queriesFor(title)[0]}") AND (creator:Osho OR creator:Rajneesh OR creator:"Bhagwan Shree Rajneesh") AND mediatype:texts`;
  const url = IA_SEARCH + "?q=" + encodeURIComponent(q) + "&fl[]=identifier&fl[]=title&fl[]=creator&rows=5&page=1&output=json";
  const data = await fetchJson(url);
  const docs = (((data.response) || {}).docs) || [];
  const ranked = docs
    .map(d => ({ d, s: scoreTitle(d.title, title) }))
    .filter(x => x.s >= 60)
    .sort((a, b) => b.s - a.s);
  if (ranked[0] && ranked[0].d.identifier) {
    return "https://archive.org/services/img/" + ranked[0].d.identifier;
  }
  return null;
}

export function coverUrlSync(d) {
  if (!d) return null;
  const key = d.key || norm(d.t);
  const cached = cacheGet(key);
  if (cached) return cached;
  return lookupBaked(d.t);
}

export async function resolveCover(d) {
  if (!d || !d.t) return null;
  const key = d.key || norm(d.t);
  const cached = cacheGet(key);
  if (cached !== undefined) return cached || null;
  const baked = lookupBaked(d.t);
  if (baked) {
    cacheSet(key, baked);
    return baked;
  }
  return gate(async () => {
    const again = cacheGet(key);
    if (again !== undefined) return again || null;
    let url = null;
    try { url = await fromWiki(d.t); } catch (e) {}
    if (!url) { try { url = await fromOpenLibrary(d.t); } catch (e) {} }
    if (!url) { try { url = await fromArchive(d.t); } catch (e) {} }
    cacheSet(key, url || "");
    if (url) d.coverUrl = url;
    return url || null;
  });
}

export function hydrateCovers(root) {
  if (!root) return;
  const nodes = [...root.querySelectorAll("[data-cover-title]")];
  if (!nodes.length) return;

  const fill = (el) => {
    if (el.dataset.coverDone) return;
    el.dataset.coverDone = "1";
    const img = el.querySelector("img.cover-photo");
    const title = el.getAttribute("data-cover-title") || "";
    const key = el.getAttribute("data-cover-key") || norm(title);
    const d = { t: title, key, l: el.getAttribute("data-cover-lang") || "en" };

    const apply = (url) => {
      if (!url || !el.isConnected) return;
      let photo = el.querySelector("img.cover-photo");
      if (!photo) {
        photo = document.createElement("img");
        photo.className = "cover-photo";
        photo.alt = "";
        photo.loading = "lazy";
        photo.referrerPolicy = "no-referrer";
        el.appendChild(photo);
      }
      photo.referrerPolicy = "no-referrer";
      photo.onload = () => el.classList.add("has-art");
      photo.onerror = () => { photo.remove(); el.classList.remove("has-art"); };
      if (photo.src !== url) photo.src = url;
      else if (photo.complete && photo.naturalWidth) el.classList.add("has-art");
    };

    if (img && img.getAttribute("src")) {
      if (img.complete && img.naturalWidth) el.classList.add("has-art");
      else {
        img.onload = () => el.classList.add("has-art");
        img.onerror = () => { img.removeAttribute("src"); resolveCover(d).then(apply); };
      }
      return;
    }
    resolveCover(d).then(apply);
  };

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      fill(e.target);
    }
  }, { rootMargin: "240px", threshold: 0.01 });

  nodes.forEach(n => io.observe(n));
}
