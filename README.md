# OSHOIC ✦

**The collected discourses of Osho — one quiet place to listen.**

OSHOIC is a fan-made listening space for the complete **OSHO WORLD** audio
archive: **295 discourses** in **Hindi and English**, with **thousands of
lectures**, streamed live (never re-hosted) from the public Internet Archive
collection:

→ <https://archive.org/details/osho-audio-discourses-collection>

## What you get

- **Beautiful, Osho-toned design** — night-temple palette (deep indigo,
  saffron gold, lotus & mandala), elegant serifs, Devanagari typesetting.
- **Every discourse, in categories** — filter by language (हिन्दी / English),
  by theme (Zen, Tao, Upanishads, Gita, Tantra, Kabir, Sufis, Mahaveer,
  Love & …) and by genre tags learned from the archive metadata; search
  across titles and individual lecture titles.
- **All audio playable** — a persistent player with lecture queues,
  seek/buffer, volume, playback speed (0.75×–2×), auto-advance,
  media-session (lock-screen) controls, and “continue where you left off”.
- **Live catalogue** — on first visit the site syncs the full catalogue from
  the Internet Archive metadata API (lecture titles, genres, durations,
  descriptions), remembers it on your device, and falls back to its
  built-in catalogue if the connection fails.

## Run it

No build step, no dependencies:

```bash
node server.js        # → http://localhost:8080
```

(Any static file server works too — `public/` is plain HTML/CSS/JS.)

## How the audio is connected

Every lecture is an `<audio>` stream from the Internet Archive CDN, e.g.

```
https://archive.org/download/osho-audio-discourses-collection/OSHO_WORLD/English/A%20Bird%20on%20the%20Wing%2001-11%20%E2%80%93%20Osho%20World/OSHO-A_Bird_on_the_Wing_01.mp3
```

Track lists are resolved at runtime from, in order:

1. **localStorage cache** (built from the metadata sync),
2. **S3 prefix listing** of the item (fast path, when CORS-friendly),
3. **`archive.org/metadata/<id>/files?start=N&count=M`** progressive sync,
4. a **deterministic filename guess** (last resort, clearly labelled).

Nothing is downloaded, copied, or stored on any server — OSHOIC only holds
the catalogue (titles/paths) and the interface.

## Structure

```
server.js            zero-dependency static server
public/
  index.html         app shell (header, dock, footer)
  css/styles.css     design system
  js/data.js         baked-in catalogue (295 discourses, exact folder names)
  js/util.js         parsing, slugs, formatters, storage
  js/library.js      runtime sync engine (S3 + metadata API + cache)
  js/player.js       audio engine + dock
  js/quotes.js       Osho lines for hero/about
  js/app.js          routing, views, filters, rendering
```

## A note

Made with reverence, for personal spiritual study. Osho (1889–1990) —
*Deathless Osho*. Gratitude to Osho World, the uploader, and the curators at
the Internet Archive.
