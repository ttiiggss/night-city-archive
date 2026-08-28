# Night City Archive — Cyberpunk TCG Fan Wiki

Auto-updating unofficial wiki for the official **Cyberpunk Trading Card Game**
(WeirdCo × CD PROJEKT RED).

- **Card database** synced from the official card database backend
  (`api.netdeck.gg/api/cards/cyberpunk` — the same API that powers
  `cyberpunktcg.com/cards`), with card renders downloaded locally.
- **Rules compendium** sourced from the official *Alpha Gameplay Guide* PDF.
- **FAQ** from the official Kickstarter FAQ page.
- **Sync changelog** showing every new/changed card per sync.

## Run locally

```bash
cd ~/cyberpunk-tcg-wiki
python3 -m http.server 8412
# open http://localhost:8412
```

(Opening `index.html` directly from disk also works — data is bundled as
`data/data.js`.)

## Sync fresh data

```bash
python3 sync/sync_cards.py      # fetch cards + download renders + changelog
python3 sync/build_data_js.py   # regenerate data/data.js
node sync/verify.js             # 26-assertion smoke test (exit 0 = healthy)
```

## Deploy (any static host)

Upload `index.html`, `style.css`, `app.js`, `data/`, `images/`.
No build step, no server-side code. Examples:

- **GitHub Pages**: push to a repo, enable Pages on the root.
- **Netlify / Cloudflare Pages**: drag-and-drop the folder.

## Auto-update

A daily Hermes cron runs the sync scripts and logs new cards. The site is
plain static files, so a redeploy (git push or static-host sync) publishes
the fresh data.

## Files

| Path | Purpose |
|---|---|
| `index.html` / `style.css` / `app.js` | The site |
| `sync/sync_cards.py` | Pull official API → `data/cards.json`, `images/`, changelog |
| `sync/build_data_js.py` | `data.json` → `data/data.js` (file:// support) |
| `sync/verify.js` | Headless smoke test |
| `data/` | Cards, changelog, Alpha guide PDF |
| `images/` | 145 card renders (~17 MB) |

## Disclaimer

Unofficial fan project. Cyberpunk TCG and all card names, text, and art are
© CD PROJEKT S.A. / WeirdCo. Data follows the official card database.
