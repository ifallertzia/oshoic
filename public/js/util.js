/* OSHOIC — utilities */

export const ITEM_ID = "osho-audio-discourses-collection";
export const IA_DETAILS = "https://archive.org/details/" + ITEM_ID;
export const IA_BASE = "https://archive.org/download/" + ITEM_ID + "/";
export const META_API = "https://archive.org/metadata/" + ITEM_ID + "/files?start=0&count=1000";
export const S3_BASE = "https://s3.us.archive.org/" + ITEM_ID + "?list-type=2&max-keys=1000&prefix=";

/* ---------- name parsing ---------- */

/* Strip the trailing " – Osho World" and a lecture range ("01-11", "#1-10", "1-12", " 01"). */
export function cleanFolder(name, lang) {
  let s = String(name).trim();
  s = s.replace(/\s*–\s*Osho\s*World\s*$/i, "");
  s = s.replace(/\s*-\s*Osho\s*World\s*$/i, "");
  const two = s.match(/[\s#]*\d{1,3}\s*-\s*\d{1,3}\s*$/);
  const one = s.match(/[\s#]*\d{1,3}\s*$/);
  if (two) s = s.slice(0, two.index);
  else if (one && lang === "en") s = s.slice(0, one.index);
  if (lang === "hi") s = s.replace(/^\d{3}-\s?/, "");
  return s.replace(/[\s\-–—]+$/g, "").replace(/\s+/g, " ").trim();
}

export function rangeOf(name, lang) {
  let s = String(name).trim();
  s = s.replace(/\s*–\s*Osho\s*World\s*$/i, "");
  s = s.replace(/\s*-\s*Osho\s*World\s*$/i, "");
  const two = s.match(/[\s#]*\d{1,3}\s*-\s*(\d{1,3})\s*$/);
  if (two) return parseInt(two[1], 10);
  const one = s.match(/[\s#]*(\d{1,3})\s*$/);
  if (one && lang === "en") return parseInt(one[1], 10);
  return null;
}

/* Normalised key used to match runtime entries with baked discourses. */
export function normKey(lang, folder) {
  let s = cleanFolder(folder, lang);
  s = s
    .toLowerCase()
    .replace(/[\u0900-\u097F]/g, "") // ignore Devanagari for matching
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return lang + "::" + s;
}

/* ---------- deterministic offline filename guess (last-resort only) ---------- */
export function slugGuess(folder, lang) {
  let s = cleanFolder(folder, lang);
  if (lang === "en") s = s.split(" - ")[0]; // "X - subtitle -" → "X"
  s = s.replace(/\(.*?\)/g, "");
  s = s.replace(/&/g, ""); // observed: "&" drops out, its two spaces become "__"
  s = s.trim().replace(/\s/g, "_");
  return s;
}
export function guessTracks(d, maxGuess = 15) {
  const n = d.n || maxGuess;
  const slug = slugGuess(d.p.split("/").pop(), d.l);
  const tracks = [];
  for (let i = 1; i <= n; i++) {
    const file = "OSHO-" + slug + "_" + String(i).padStart(2, "0") + ".mp3";
    tracks.push({ n: i, t: null, file: d.p + "/" + file, guessed: true });
  }
  return tracks;
}

/* ---------- URLs ---------- */
export function fileUrl(path) {
  return IA_BASE + path.split("/").map(encodeURIComponent).join("/");
}
export function artUrl(path) {
  if (!path || !/\.mp3$/i.test(path)) return null;
  return fileUrl(path.replace(/\.mp3$/i, ".png"));
}
export function folderArchiveUrl(path) {
  return IA_DETAILS + "/download/" + path.split("/").map(encodeURIComponent).join("/");
}

/* ---------- formatting ---------- */
export function fmtTime(sec) {
  if (sec == null || !isFinite(sec)) return "–";
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  return m + ":" + String(s).padStart(2, "0");
}
export function fmtTotal(sec) {
  if (!sec) return "";
  const h = sec / 3600;
  if (h >= 10) return Math.round(h) + " hrs";
  if (h >= 1) return h.toFixed(1).replace(/\.0$/, "") + " hrs";
  return Math.round(sec / 60) + " min";
}
export function fmtNum(n) {
  return n == null ? "" : n.toLocaleString("en-IN");
}
export function isDevanagari(str) {
  return /[\u0900-\u097F]/.test(str || "");
}

/* ---------- storage ---------- */
const store = {
  get(k, dflt) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : dflt; } catch (e) { return dflt; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
export const CAT_KEY = "oshoic.cat.v1";
export const PREFS_KEY = "oshoic.prefs.v1";
export const LAST_KEY = "oshoic.last.v1";
export { store };

/* ---------- misc ---------- */
export function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Oshoic theme tags derived from titles (used until/without live genres). */
const THEMES = [
  ["zen", "Zen & Zen Masters", /zen|bodhidharma|dogen|rinzai|hyakujo|nansen|kyozan|joshu|isan|yakusan|ma tzu|ta hui|hsin hsin ming|no water no moon|live zen|just like that|koan/i],
  ["tao", "Tao", /\btao\b|tao the/i],
  ["upanishads", "Upanishads & Vedanta", /upanishad|vedanta|i am that|sat chit anand|satyam shivam|that art thou|nirvan upanishad|saravsar|ishavashya|kathopanishad|kaivalya/i],
  ["gita", "The Gita", /geeta|gita|maha geeta/i],
  ["tantra", "Tantra & Sahaj", /tantra|sahaj|vigyan bhairav|sambhog/i],
  ["buddhism", "Buddhism & Sutras", /buddha|dhammapada|sutra|om mani padme|heart sutra|dhammo/i],
  ["jain", "Jain & Mahaveer", /mahaveer|jin sutra|nanak dukhya/i],
  ["love", "Love & The Beloved", /beloved|path of love|prem|piya|preetam|rom rom|piv piv|khumari|man hi pooja|nari aur/i],
  ["kabir", "Kabir", /kabir|kabira/i],
  ["sufi-poetry", "Sufis & Poets", /sufis|come come yet again|i celebrate myself|ancient music in the pines|dang dang|ami jharat|ajhun chet|ari, main|apui gai|apne mahin|bahuri|cheti sake|chit chakmak|dariya kahe|diye tale|deepak bara|dharam aur anand|dharam ki yatra|ek ek kadam|ek naya dwar|es dhammo|jyon ki tyon|jharat dashahun|jagat taraiya|jas panihar|jyoti se jyoti|jo bole|jyun macchali|jyun tha|jeevan sangeet|jo ghar bare|jeevan hi hain|jin khoja|suno bhai|sabai sayane|sapna yeh|santo magan|saheb mil|sumiran|swarn pakhi|trisha gai|udio pankh|utsav amar|lagaan?/i],
  ["christianity", "Christianity & Jesus", /christianity|jesus|messiah|theologia/i],
  ["philosophy", "Philosophy & Sages", /socrates|philosophia|zarathustra|the first principle|supreme doctrine|book of wisdom|language of existence|original man|great pilgrimage|golden future|secret\b|search|invitation|guest|miracle|art of dying|true sage|walking in zen|walk without feet|sun rises in evening|goose is out|grass grows|hidden harmony|empty boat|divine melody|turning in|unio mystica|until you die|new alchemy|ultimate alchemy|razors edge|rebel\b|rebellious|revolution|new dawn|seeds of|sermons in stones|whitman|come follow|beyond psychology|the secret/i],
  ["hindi-mantra", "Mantras & Shruti", /hari om|om shantih|omkar|om mani|bhakti|bhaj govindam|tamso ma|mrityoma|es dhammo|ek omkar|katha upanishad|krishna smriti|bhavishya|geeta darshan|dhyan|dharam sadhana|shiksha|sadhana|sambodhi|upasana|vigyan dharam|yog naye|swar?/i],
  ["society", "Society & Revolution", /bharat|naye samaj|kranti|education|shiksha main/i],
];
export const THEME_LIST = THEMES.map(([id, label]) => ({ id, label }));
export function themeOf(t) {
  for (const [id, , re] of THEMES) if (re.test(t || "")) return id;
  return null;
}
export const THEME_LABEL = Object.fromEntries(THEMES.map(([id, label]) => [id, label]));
