/* NIGHT CITY ARCHIVE — app logic */
"use strict";

const state = { q: "", type: "", color: "", rarity: "", set: "", tag: "", sort: "name" };
let CARDS = [];
let META = {};
let CHANGELOG = [];
let NEW_CARDS = new Set(); // slugs added in the most recent sync(s) — flagged NEW in grid

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

init();

async function init() {
  // data.js defines window.ARCHIVE_DATA (fallback: fetch data/cards.json)
  if (window.ARCHIVE_DATA) {
    load(window.ARCHIVE_DATA);
  } else {
    try {
      const r = await fetch("data/cards.json");
      load(await r.json());
    } catch (e) {
      $("#grid").innerHTML = '<div class="empty">Failed to load card data.</div>';
    }
  }
}

function load(archive) {
  CARDS = archive.cards || [];
  META = archive.meta || {};
  CHANGELOG = window.ARCHIVE_CHANGELOG || [];
  // cards added in the last 14 days of syncs get the NEW badge
  const cutoff = new Date(META.synced_at_iso || Date.now());
  cutoff.setDate(cutoff.getDate() - 14);
  for (const entry of CHANGELOG) {
    if (new Date(entry.synced_at) >= cutoff) {
      for (const n of entry.added || []) NEW_CARDS.add(n);
    }
  }
  buildFilters();
  renderHero();
  renderChangelog();
  wire();
  render();
  $("#sync-stamp").textContent = "DATA SYNCED: " + (META.synced_at || "unknown");
}

function wire() {
  $("#q").addEventListener("input", (e) => { state.q = e.target.value.trim().toLowerCase(); render(); });
  for (const [id, key] of [["#f-type","type"],["#f-color","color"],["#f-rarity","rarity"],["#f-set","set"],["#f-tag","tag"],["#sort","sort"]]) {
    $(id).addEventListener("change", (e) => { state[key] = e.target.value; render(); });
  }
  // modal close
  $(".modal-backdrop").addEventListener("click", closeModal);
  $(".modal-close").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

function buildFilters() {
  const opts = (vals, fmt) => vals.filter(Boolean).sort().map((v) => `<option value="${esc(v)}">${fmt(esc(v))}</option>`).join("");
  $("#f-type").innerHTML += opts([...new Set(CARDS.map((c) => c.card_type))], (v) => "TYPE: " + v.toUpperCase());
  $("#f-color").innerHTML += opts([...new Set(CARDS.map((c) => c.color))], (v) => "COLOR: " + v.toUpperCase());
  $("#f-rarity").innerHTML += opts([...new Set(CARDS.map((c) => c.rarity))], (v) => "RARITY: " + v.toUpperCase());
  $("#f-set").innerHTML += opts([...new Set(CARDS.map((c) => c.set?.name))], (v) => "SET: " + v.toUpperCase());
  const tags = [...new Set(CARDS.flatMap((c) => c.classifications || []))];
  $("#f-tag").innerHTML += opts(tags, (v) => "TAG: " + v.toUpperCase());
}

function renderHero() {
  const counts = {
    total: CARDS.length,
    legends: CARDS.filter((c) => c.card_type === "Legend").length,
    units: CARDS.filter((c) => c.card_type === "Unit").length,
    gear: CARDS.filter((c) => c.card_type === "Gear").length,
    programs: CARDS.filter((c) => c.card_type === "Program").length,
  };
  $("#hero-stats").innerHTML =
    `<span class="chip hl">${counts.total} CARDS</span>` +
    `<span class="chip">${counts.legends} LEGENDS</span>` +
    `<span class="chip">${counts.units} UNITS</span>` +
    `<span class="chip">${counts.gear} GEAR</span>` +
    `<span class="chip">${counts.programs} PROGRAMS</span>`;
  // hero images: first Legend of each color if possible
  const picks = [];
  for (const color of ["Red", "Blue", "Green", "Yellow"]) {
    const c = CARDS.find((x) => x.color === color && x.card_type === "Legend");
    if (c && picks.length < 3) picks.push(c);
  }
  $("#hero-cards").innerHTML = picks.map((c) => `<img src="images/${esc(c.slug)}.webp" alt="${esc(c.display_name)}">`).join("");
}

function matchCard(c) {
  if (state.type && c.card_type !== state.type) return false;
  if (state.color && c.color !== state.color) return false;
  if (state.rarity && c.rarity !== state.rarity) return false;
  if (state.set && c.set?.name !== state.set) return false;
  if (state.tag && !(c.classifications || []).includes(state.tag)) return false;
  if (state.q) {
    const hay = [c.display_name, c.rules_text, c.flavor_text, ...(c.classifications || []), ...(c.keywords || []), c.artist]
      .filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  return true;
}

function render() {
  let list = CARDS.filter(matchCard);
  const dir = { name: (a, b) => a.display_name.localeCompare(b.display_name),
                cost: (a, b) => (b.cost ?? -1) - (a.cost ?? -1),
                power: (a, b) => (b.power ?? -1) - (a.power ?? -1),
                new: (a, b) => Number(b._new) - Number(a._new) || a.display_name.localeCompare(b.display_name) };
  for (const c of list) c._new = NEW_CARDS.has(c.display_name);
  list.sort(dir[state.sort] || dir.name);
  $("#count").textContent = list.length;
  $("#grid").innerHTML = list.map(cardTile).join("");
  $("#empty").hidden = list.length !== 0;
  const af = [];
  if (state.q) af.push(`"${state.q}"`);
  for (const k of ["type", "color", "rarity", "set", "tag"]) if (state[k]) af.push(state[k].toUpperCase());
  $("#active-filters").textContent = af.length ? " // " + af.join(" / ") : "";
  // lazy image fade-in
  document.querySelectorAll("#grid img").forEach((img) => {
    img.loading = "lazy";
    img.onload = () => img.style.opacity = "1";
    img.style.opacity = "0";
    img.style.transition = "opacity .25s";
  });
}

function cardTile(c) {
  const isNew = NEW_CARDS.has(c.display_name);
  return `<div class="card" data-slug="${esc(c.slug)}">
    ${isNew ? '<span class="badge-new">NEW</span>' : ""}
    <img src="images/${esc(c.slug)}.webp" alt="${esc(c.display_name)}" loading="lazy">
    <div class="cname"><span>${esc(c.display_name)}</span><span class="t">${esc(c.card_type)}</span></div>
    <div class="cbar">
      <span class="mini c-${esc(c.color)}">${esc(c.color).toUpperCase()}</span>
      ${c.cost != null ? `<span class="mini">€$${esc(c.cost)}</span>` : ""}
      ${c.power != null ? `<span class="mini">PWR ${esc(c.power)}</span>` : ""}
      ${c.rarity ? `<span class="mini">${esc(c.rarity)}</span>` : ""}
    </div>
  </div>`;
}

function openModal(slug) {
  const c = CARDS.find((x) => x.slug === slug);
  if (!c) return;
  $("#m-img").src = `images/${c.slug}.webp`;
  $("#m-img").alt = c.display_name;
  $("#m-type").textContent = c.card_type;
  $("#m-color").textContent = c.color;
  $("#m-color").className = `chip c-${c.color}`;
  $("#m-rarity").textContent = c.rarity;
  $("#m-name").textContent = c.display_name;
  $("#m-sub").textContent = c.set?.name ? `${c.set.name}` : "";
  $("#m-stats").innerHTML =
    `${c.cost != null ? `<div class="stat-box"><span class="v">€$${esc(c.cost)}</span><span class="l">COST</span></div>` : ""}` +
    `${c.power != null ? `<div class="stat-box"><span class="v">${esc(c.power)}</span><span class="l">POWER</span></div>` : ""}` +
    `${c.ram != null ? `<div class="stat-box"><span class="v">${esc(c.ram)}</span><span class="l">RAM</span></div>` : ""}`;
  $("#m-rules").textContent = c.rules_text || "—";
  $("#m-flavor").textContent = c.flavor_text || "";
  $("#m-flavor").hidden = !c.flavor_text;
  $("#m-meta").innerHTML =
    `<span>SET: ${esc(c.set?.name ?? "—")}</span>` +
    `<span>PRINT #${esc(c.print_number ?? "—")}</span>` +
    `<span>ART: ${esc(c.artist ?? "—")}</span>` +
    `<span>${esc(c.classifications?.join(", ") || "")}</span>` +
    `<span>LEGALITY: ${esc(c.legality ?? "—").toUpperCase()}</span>`;
  $("#m-link").href = `https://cyberpunktcg.com/cards/${c.slug}`;
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal() {
  $("#modal").hidden = true;
  document.body.style.overflow = "";
}

function renderChangelog() {
  if (!CHANGELOG.length) {
    $("#changelog-list").innerHTML = '<div class="empty">No syncs recorded yet.</div>';
    return;
  }
  $("#changelog-list").innerHTML = CHANGELOG.map((e) => {
    const added = (e.added || []).length
      ? `<div class="cl-label">+ NEW CARDS (${e.added.length})</div><ul class="cl-added">${e.added.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "";
    const changed = (e.changed || []).length
      ? `<details class="cl-det"><summary class="cl-label" style="cursor:pointer">~ CHANGED (${e.changed.length})</summary><ul class="cl-changed">${e.changed.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></details>` : "";
    return `<div class="cl-entry">
      <div class="cl-head"><span class="cl-date">${esc(e.date)}</span><span class="cl-count">${e.card_count} cards in database</span></div>
      ${added}
      ${changed}
    </div>`;
  }).join("");
}

// grid click -> modal (event delegation)
$("#grid").addEventListener("click", (e) => {
  const tile = e.target.closest(".card");
  if (tile) openModal(tile.dataset.slug);
});
