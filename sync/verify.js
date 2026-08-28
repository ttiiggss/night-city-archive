#!/usr/bin/env node
/*
 * verify.js — headless smoke test for the Night City Archive site.
 * Boots app.js in a stub DOM (via vm), then drives the app's own event
 * listeners: search, type filter, sorting, and the card modal.
 * Exit 0 = all assertions pass.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let failures = 0;
const ok = (cond, msg) => {
  console.log((cond ? "  PASS " : "  FAIL ") + msg);
  if (!cond) failures++;
};

// ---- minimal DOM stub ----
function makeEl() {
  const listeners = {};
  const el = {
    _listeners: listeners,
    value: "", textContent: "", innerHTML: "", hidden: false,
    className: "", href: "", src: "", alt: "", style: {}, dataset: {},
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    dispatch: (t) => (listeners[t] || []).forEach((fn) => fn({ target: { closest: () => null, value: el.value } })),
    setInner(v) { el.innerHTML = v; },
  };
  return el;
}
const els = {};
const document = {
  querySelector: (s) => (els[s] = els[s] || makeEl()),
  querySelectorAll: () => [],
  addEventListener: () => {},
  body: { style: {} },
};
const window = {};
const ctx = { window, document, console, setTimeout, Date };
ctx.globalThis = ctx;
vm.createContext(ctx);

// load data.js then app.js in the context
vm.runInContext(fs.readFileSync(path.join(ROOT, "data", "data.js"), "utf8"), ctx, { filename: "data.js" });
vm.runInContext(fs.readFileSync(path.join(ROOT, "app.js"), "utf8"), ctx, { filename: "app.js" });

// init() ran on load; give the fallback fetch path no chance (ARCHIVE_DATA present)
const count = () => els["#count"].textContent;
const gridCards = () => (els["#grid"].innerHTML.match(/class="card"/g) || []).length;

console.log("== boot ==");
ok(window.ARCHIVE_DATA.cards.length === 145, `archive loaded with 145 cards (got ${window.ARCHIVE_DATA.cards.length})`);
ok(Number(count()) === 145, `grid shows 145 cards (got ${count()})`);
ok(els["#sync-stamp"].textContent.includes("SYNCED"), "sync stamp rendered: " + JSON.stringify(els["#sync-stamp"].textContent));
ok((els["#hero-stats"].innerHTML.match(/chip/g) || []).length >= 5, "hero stat chips rendered");
ok(els["#hero-cards"].innerHTML.includes("<img"), "hero card images rendered");
ok((els["#changelog-list"].innerHTML.match(/cl-entry/g) || []).length >= 1, "changelog rendered");
for (const sel of ["#f-type", "#f-color", "#f-rarity", "#f-set", "#f-tag"]) {
  ok(els[sel].innerHTML.includes("<option"), `${sel} options populated`);
}

console.log("== search ==");
els["#q"].value = "smasher";
els["#q"].dispatch("input");
const smasherN = Number(count());
ok(smasherN >= 1 && smasherN < 145, `search 'smasher' narrows results (got ${smasherN})`);
els["#q"].value = "braindance";
els["#q"].dispatch("input");
ok(Number(count()) >= 1, "search 'braindance' finds cards (got " + count() + ")");

console.log("== filters ==");
els["#q"].value = "";
els["#q"].dispatch("input");
els["#f-type"].value = "Legend";
els["#f-type"].dispatch("change");
ok(Number(count()) === 27, `type=Legend filter -> 27 cards (got ${count()})`);
els["#f-color"].value = "Red";
els["#f-color"].dispatch("change");
ok(Number(count()) < 27 && Number(count()) >= 1, `legend+red narrows further (got ${count()})`);
els["#f-type"].value = ""; els["#f-color"].value = "";
els["#f-type"].dispatch("change"); els["#f-color"].dispatch("change");

console.log("== sort ==");
els["#sort"].value = "power";
els["#sort"].dispatch("change");
ok(Number(count()) === 145, "sort keeps all 145 cards");

console.log("== modal ==");
vm.runInContext("openModal('v-streetkid')", ctx);
ok(els["#m-name"].textContent.includes("V"), "modal opens with card name: " + JSON.stringify(els["#m-name"].textContent));
ok(els["#m-stats"].innerHTML.includes("COST"), "modal shows COST stat");
ok(els["#m-link"].href.endsWith("/cards/v-streetkid"), "modal links to official site");
vm.runInContext("closeModal()", ctx);
ok(els["#modal"].hidden === true, "modal closes");

console.log("== data integrity ==");
const cards = window.ARCHIVE_DATA.cards;
ok(cards.every((c) => c.slug && c.display_name), "every card has slug + display_name");
ok(cards.every((c) => c.set && c.set.name), "every card has set info");
ok(new Set(cards.map((c) => c.slug)).size === cards.length, "slugs unique");
const imgsOk = cards.every((c) => fs.existsSync(path.join(ROOT, "images", c.slug + ".webp")));
ok(imgsOk, "every card has a local render in images/");

process.exit(failures ? 1 : 0);
