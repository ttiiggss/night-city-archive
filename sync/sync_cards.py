#!/usr/bin/env python3
"""
sync_cards.py — Pull the official Cyberpunk TCG card database into data/cards.json,
download card renders to images/, and maintain data/changelog.json.

Source: public JSON API used by the official site (https://cyberpunktcg.com/cards).
Backend: https://api.netdeck.gg/api/cards/cyberpunk

Outputs:
  data/cards.json      stable card data (no expiring signed URLs)
  data/changelog.json  append-only log of added/changed cards per sync
  images/<slug>.webp   card renders downloaded with fresh signed URLs at sync time
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

API = "https://api.netdeck.gg/api/cards/cyberpunk"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json",
    "Origin": "https://cyberpunktcg.com",
    "Referer": "https://cyberpunktcg.com/cards",
}
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
DATA = os.path.join(ROOT, "data")
IMG_DIR = os.path.join(ROOT, "images")

KEEP = [
    "id", "external_id", "name", "subname", "display_name", "slug",
    "rules_text", "flavor_text", "printing_id", "set", "rarity",
    "color", "card_type", "is_eddiable", "classifications", "keywords",
    "cost", "power", "ram", "artist", "print_number", "printings", "legality",
]


def get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def fetch_all():
    page = get_json(f"{API}?limit=100&offset=0")
    total = page.get("total", 0)
    items = list(page.get("items", []))
    offset = len(items)
    while offset < total:
        chunk = get_json(f"{API}?limit=100&offset={offset}")
        got = chunk.get("items", [])
        if not got:
            break
        items.extend(got)
        offset += len(got)
    # second pass not needed: image_url from the same items
    return total, items


def download_images(items):
    """Download card renders using the signed URLs in this response."""
    os.makedirs(IMG_DIR, exist_ok=True)
    ok, fail = 0, 0
    for c in items:
        slug = c.get("slug")
        url = c.get("image_url")
        if not slug or not url:
            continue
        dest = os.path.join(IMG_DIR, f"{slug}.webp")
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            ok += 1  # already cached from a previous sync
            continue
        try:
            req = urllib.request.Request(url, headers={"User-Agent": HEADERS["User-Agent"]})
            data = urllib.request.urlopen(req, timeout=30).read()
            with open(dest, "wb") as f:
                f.write(data)
            ok += 1
        except Exception:
            fail += 1
    return ok, fail


def diff_changelog(old_cards, new_cards):
    """Return {added:[...], changed:[...]} by card id."""
    old = {c["id"]: c for c in old_cards}
    new = {c["id"]: c for c in new_cards}
    added = [new[i]["display_name"] for i in new if i not in old]
    changed = []
    for i, c in new.items():
        if i in old and old[i] != c:
            changed.append(c["display_name"])
    return sorted(added), sorted(changed)


def main():
    try:
        total, items = fetch_all()
        filters = get_json(f"{API}/filters")
    except Exception as e:
        print(f"SYNC FAILED: {e}", file=sys.stderr)
        sys.exit(1)

    clean = [{k: c.get(k) for k in KEEP} for c in items]
    img_ok, img_fail = download_images(items)

    cards_path = os.path.join(DATA, "cards.json")
    changelog_path = os.path.join(DATA, "changelog.json")
    old = []
    if os.path.exists(cards_path):
        try:
            old = json.load(open(cards_path, encoding="utf-8")).get("cards", [])
        except Exception:
            old = []
    added, changed = diff_changelog(old, clean)

    sets = sorted({c["set"]["code"] for c in clean if c.get("set")})
    payload = {
        "meta": {
            "source": "Official Cyberpunk TCG card database (api.netdeck.gg backend behind cyberpunktcg.com)",
            "source_site": "https://cyberpunktcg.com/cards",
            "synced_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "api_total": total,
            "card_count": len(clean),
            "sets": sets,
            "filters": filters,
            "images_local": True,
        },
        "cards": clean,
    }
    os.makedirs(DATA, exist_ok=True)
    with open(cards_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    # append-only changelog (keep last 60 entries)
    log = []
    if os.path.exists(changelog_path):
        try:
            log = json.load(open(changelog_path, encoding="utf-8"))
        except Exception:
            log = []
    log.insert(0, {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "synced_at": payload["meta"]["synced_at"],
        "card_count": len(clean),
        "added": added,
        "changed": changed,
        "images_ok": img_ok,
        "images_failed": img_fail,
    })
    with open(changelog_path, "w", encoding="utf-8") as f:
        json.dump(log[:60], f, ensure_ascii=False, indent=1)

    print(f"OK: {len(clean)} cards | images ok={img_ok} fail={img_fail} | +{len(added)} new, {len(changed)} changed")


if __name__ == "__main__":
    main()
