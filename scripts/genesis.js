/**
 * Genesis — Cinematic Character Creator
 * Foundry VTT v12 · dnd5e 3.x+
 *
 * Step-by-step, art-forward character creation:
 *   Identity → Class & Level → Subclass → Species → Background → Equipment → Abilities → Review
 *
 * Design principles:
 *  - Compendium-driven: classes/subclasses/species/backgrounds (and equipment) are read
 *    from your packs and world items — homebrew included.
 *  - Native advancement: creation drops real items on the actor so the dnd5e Advancement
 *    Manager grants HP, features, proficiencies, and choices exactly as the system intends,
 *    now and on future level-ups.
 *  - Structured starting equipment: reads dnd5e 3.1+ `system.startingEquipment` choice trees
 *    (OR / AND / linked items / category picks) plus the `system.wealth` gold alternative,
 *    with graceful fallback for items that only describe gear in prose.
 */

const MODULE_ID = "genesis-character-creator";

/* -------------------------------------------------------------------------- */
/*  Settings                                                                   */
/* -------------------------------------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "classArt", {
    scope: "world", config: false, type: Object, default: {}
  });
  game.settings.register(MODULE_ID, "showPlayersButton", {
    name: "Show creator button to players",
    hint: "Adds the 'Forge a Hero' button to the Actors sidebar for players as well as the GM. Players still need the 'Create New Actors' permission to finish creation.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "maxStartLevel", {
    name: "Maximum starting level",
    hint: "The highest level players may choose in the wizard.",
    scope: "world", config: true, type: Number, default: 20,
    range: { min: 1, max: 20, step: 1 }
  });
  game.settings.registerMenu(MODULE_ID, "artMenu", {
    name: "Class Art",
    label: "Configure Class Art",
    hint: "Assign a custom image to each class card in the creation wizard.",
    icon: "fas fa-image",
    type: GenesisArtConfig,
    restricted: true
  });
});

/* -------------------------------------------------------------------------- */
/*  Compendium data loading                                                    */
/* -------------------------------------------------------------------------- */

const INDEX_FIELDS = [
  "img", "type",
  "system.identifier", "system.classIdentifier",
  "system.description.value", "system.source"
];

async function loadSourceData() {
  const data = { classes: [], subclasses: [], races: [], backgrounds: [] };

  const push = (entry, packLabel) => {
    const rec = {
      uuid: entry.uuid,
      name: entry.name,
      img: entry.img || "icons/svg/item-bag.svg",
      identifier: entry.system?.identifier ?? entry.name?.slugify?.() ?? "",
      classIdentifier: entry.system?.classIdentifier ?? "",
      description: entry.system?.description?.value ?? "",
      source: packLabel
    };
    switch (entry.type) {
      case "class": data.classes.push(rec); break;
      case "subclass": data.subclasses.push(rec); break;
      case "race": data.races.push(rec); break;
      case "background": data.backgrounds.push(rec); break;
    }
  };

  for (const pack of game.packs) {
    if (pack.documentName !== "Item") continue;
    let index;
    try { index = await pack.getIndex({ fields: INDEX_FIELDS }); }
    catch (err) { console.warn(`${MODULE_ID} | Failed to index ${pack.collection}`, err); continue; }
    for (const entry of index) push(entry, pack.title);
  }

  for (const item of game.items) {
    push({
      uuid: item.uuid, name: item.name, img: item.img, type: item.type,
      system: {
        identifier: item.system?.identifier,
        classIdentifier: item.system?.classIdentifier,
        description: { value: item.system?.description?.value }
      }
    }, "World");
  }

  const byName = (a, b) => a.name.localeCompare(b.name);
  data.classes.sort(byName); data.subclasses.sort(byName);
  data.races.sort(byName); data.backgrounds.sort(byName);
  return data;
}

/** Lightweight index of gear items, for category picks ("any martial weapon"). */
let _equipIndex = null;
async function loadEquipmentIndex() {
  if (_equipIndex) return _equipIndex;
  const out = [];
  for (const pack of game.packs) {
    if (pack.documentName !== "Item") continue;
    let index;
    try {
      index = await pack.getIndex({ fields: ["type", "img", "system.type.value"] });
    } catch (err) { continue; }
    for (const e of index) {
      if (!["weapon", "equipment", "tool", "consumable", "loot"].includes(e.type)) continue;
      out.push({ uuid: e.uuid, name: e.name, img: e.img, type: e.type, sub: e.system?.type?.value ?? "" });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  _equipIndex = out;
  return out;
}

function classArtFor(rec) {
  const map = game.settings.get(MODULE_ID, "classArt") || {};
  return map[rec.identifier] || map[rec.name?.slugify?.() ?? ""] || rec.img;
}

function stripHTML(html, max = 260) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  const text = (div.textContent || "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/* -------------------------------------------------------------------------- */
/*  GM art configuration menu                                                  */
/* -------------------------------------------------------------------------- */

class GenesisArtConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "genesis-art-config",
      title: "Genesis — Class Art",
      classes: ["genesis-art-config"],
      width: 560, height: "auto", closeOnSubmit: true, submitOnChange: false
    });
  }

  async _renderInner() {
    const data = await loadSourceData();
    const map = game.settings.get(MODULE_ID, "classArt") || {};
    const seen = new Set();
    const rows = data.classes
      .filter((c) => { if (seen.has(c.identifier)) return false; seen.add(c.identifier); return true; })
      .map((c) => {
        const current = map[c.identifier] || "";
        return `<div class="form-group genesis-art-row" data-identifier="${c.identifier}">
          <label>${c.name} <span class="hint">(${c.identifier})</span></label>
          <div class="form-fields">
            <img class="genesis-art-thumb" src="${current || c.img}" alt="">
            <input type="text" name="${c.identifier}" value="${current}" placeholder="Leave blank for default item art">
            <button type="button" class="genesis-pick" data-target="${c.identifier}" title="Browse"><i class="fas fa-file-import"></i></button>
          </div>
        </div>`;
      })
      .join("");
    const html = `<form>
      <p class="notes">Assign an image to each class card in the creation wizard. Blank entries fall back to the class item's own icon. Wide or portrait art both work — cards crop to fit.</p>
      ${rows || "<p>No classes found. Make sure your class compendiums are available in this world.</p>"}
      <footer class="sheet-footer"><button type="submit"><i class="fas fa-save"></i> Save Art</button></footer>
    </form>`;
    return $(html);
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(".genesis-pick").on("click", (ev) => {
      const target = ev.currentTarget.dataset.target;
      const input = html.find(`input[name="${target}"]`);
      new FilePicker({
        type: "image",
        current: input.val(),
        callback: (path) => {
          input.val(path);
          input.closest(".genesis-art-row").find(".genesis-art-thumb").attr("src", path);
        }
      }).render(true);
    });
  }

  async _updateObject(_event, formData) {
    const clean = {};
    for (const [k, v] of Object.entries(formData)) if (v?.trim?.()) clean[k] = v.trim();
    await game.settings.set(MODULE_ID, "classArt", clean);
    ui.notifications.info("Genesis: class art saved.");
  }
}

/* -------------------------------------------------------------------------- */
/*  Starting equipment helpers                                                 */
/* -------------------------------------------------------------------------- */

/** Build a tree from the flat dnd5e startingEquipment array (entries reference parents via `group`). */
function buildEquipTree(list) {
  const nodes = (list ?? []).map((e) => ({
    _id: e._id, type: e.type, key: e.key, count: e.count ?? 1,
    group: e.group ?? null, sort: e.sort ?? 0, children: []
  }));
  const byId = Object.fromEntries(nodes.map((n) => [n._id, n]));
  const roots = [];
  for (const n of nodes) {
    if (n.group && byId[n.group]) byId[n.group].children.push(n);
    else roots.push(n);
  }
  const bySort = (a, b) => a.sort - b.sort;
  nodes.forEach((n) => n.children.sort(bySort));
  roots.sort(bySort);
  return roots;
}

const CATEGORY_LABELS = {
  weapon: { sim: "any simple weapon", mar: "any martial weapon", simpleM: "a simple melee weapon", simpleR: "a simple ranged weapon", martialM: "a martial melee weapon", martialR: "a martial ranged weapon" },
  armor: { light: "light armor", medium: "medium armor", heavy: "heavy armor", shield: "a shield" },
  tool: {}, focus: {}
};

/** Candidate gear items for a category entry, matched generously against the equipment index. */
function categoryCandidates(entry, index) {
  const key = entry.key ?? "";
  const endsWithId = (uuid, id) => typeof id === "string" && uuid.endsWith(id);
  switch (entry.type) {
    case "weapon":
      return index.filter((i) => i.type === "weapon" && (
        i.sub === key ||
        (key === "sim" && i.sub.startsWith("simple")) ||
        (key === "mar" && i.sub.startsWith("martial"))
      ));
    case "armor":
      return index.filter((i) => i.type === "equipment" && i.sub === key);
    case "tool": {
      const direct = CONFIG.DND5E?.toolIds?.[key];
      return index.filter((i) => i.type === "tool" && (i.sub === key || endsWithId(i.uuid, direct)));
    }
    case "focus": {
      const ids = Object.values(CONFIG.DND5E?.focusTypes?.[key]?.itemIds ?? {});
      return index.filter((i) => ids.some((id) => endsWithId(i.uuid, id)));
    }
  }
  return [];
}

function categoryLabel(entry) {
  const known = CATEGORY_LABELS[entry.type]?.[entry.key];
  if (known) return known;
  const cfgLabel =
    CONFIG.DND5E?.weaponTypes?.[entry.key] ??
    CONFIG.DND5E?.armorTypes?.[entry.key] ??
    CONFIG.DND5E?.toolTypes?.[entry.key] ??
    CONFIG.DND5E?.focusTypes?.[entry.key]?.label ??
    entry.key;
  return typeof cfgLabel === "string" ? cfgLabel : entry.key;
}

/** Walk a configured tree, collecting {uuid, count} grants from the user's choices. */
function collectGrants(node, choices, out) {
  switch (node.type) {
    case "OR": {
      const sel = choices[node._id] ?? node.children[0]?._id;
      const child = node.children.find((c) => c._id === sel);
      if (child) collectGrants(child, choices, out);
      break;
    }
    case "AND":
      node.children.forEach((c) => collectGrants(c, choices, out));
      break;
    case "linked":
      if (node.key) out.push({ uuid: node.key, count: node.count });
      break;
    default: { // category pick — the choice stores the picked uuid
      const uuid = choices[node._id];
      if (uuid) out.push({ uuid, count: node.count });
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Ability score helpers                                                      */
/* -------------------------------------------------------------------------- */

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_LABELS = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const POINT_COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const POINT_BUDGET = 27;

function mod(score) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}
function pointsSpent(abilities) {
  return ABILITIES.reduce((sum, a) => sum + (POINT_COSTS[abilities[a]] ?? 0), 0);
}

/* -------------------------------------------------------------------------- */
/*  The Wizard                                                                 */
/* -------------------------------------------------------------------------- */

const STEPS = [
  { id: "identity", label: "Identity" },
  { id: "class", label: "Class" },
  { id: "subclass", label: "Subclass" },
  { id: "species", label: "Species" },
  { id: "background", label: "Background" },
  { id: "equipment", label: "Equipment" },
  { id: "abilities", label: "Abilities" },
  { id: "review", label: "Review" }
];

class GenesisWizard extends Application {
  constructor(options = {}) {
    super(options);
    this.source = null;
    this.state = {
      step: 0,
      name: "",
      portrait: "icons/svg/mystery-man.svg",
      cls: null,
      level: 1,
      subclass: null,
      race: null,
      background: null,
      method: "standard",
      abilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      creating: false,
      equip: null // { classTree, bgTree, names:{uuid:{name,img}}, candidates:{entryId:[...]}, choices:{}, wealth, useGold, loadedFor }
    };
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "genesis-wizard",
      title: "Forge a Hero",
      classes: ["genesis-app"],
      width: Math.min(1160, window.innerWidth - 40),
      height: Math.min(780, window.innerHeight - 40),
      resizable: true,
      popOut: true
    });
  }

  /* ---------------------------- equipment loading ------------------------- */

  async _ensureEquipment() {
    const s = this.state;
    const stamp = `${s.cls?.uuid ?? ""}|${s.background?.uuid ?? ""}`;
    if (s.equip?.loadedFor === stamp) return;

    const equip = { loadedFor: stamp, classTree: [], bgTree: [], names: {}, candidates: {}, choices: {}, wealth: null, useGold: false, fallbackNote: [] };
    const index = await loadEquipmentIndex();

    const loadFor = async (rec, treeKey) => {
      if (!rec) return;
      const doc = await fromUuid(rec.uuid);
      if (!doc) return;
      const list = doc.system?.startingEquipment ?? [];
      if (treeKey === "classTree") equip.wealth = doc.system?.wealth || null;
      if (!list.length) {
        equip.fallbackNote.push(rec.name);
        return;
      }
      const tree = buildEquipTree(list.map((e) => (e.toObject ? e.toObject() : e)));
      equip[treeKey] = tree;

      // Resolve linked names + category candidates; seed default choices.
      const walk = async (node) => {
        if (node.type === "linked" && node.key && !equip.names[node.key]) {
          const item = await fromUuid(node.key).catch(() => null);
          equip.names[node.key] = item ? { name: item.name, img: item.img } : { name: "Unknown item", img: "icons/svg/item-bag.svg" };
        }
        if (!["OR", "AND", "linked"].includes(node.type)) {
          const cands = categoryCandidates(node, index);
          equip.candidates[node._id] = cands;
          if (cands.length) equip.choices[node._id] = cands[0].uuid;
        }
        if (node.type === "OR" && node.children.length) equip.choices[node._id] = node.children[0]._id;
        for (const c of node.children) await walk(c);
      };
      for (const root of tree) await walk(root);
    };

    await loadFor(s.cls, "classTree");
    await loadFor(s.background, "bgTree");
    s.equip = equip;
  }

  /* ---------------------------- rendering -------------------------------- */

  async _renderInner() {
    if (!this.source) this.source = await loadSourceData();
    if (STEPS[this.state.step].id === "equipment") await this._ensureEquipment();
    return $(this._buildHTML());
  }

  _buildHTML() {
    const s = this.state;
    const rail = STEPS.map((st, i) => {
      const cls = i === s.step ? "active" : i < s.step ? "done" : "";
      return `<div class="gx-step ${cls}" data-step="${i}"><span class="gx-dot">${i < s.step ? "✓" : i + 1}</span><span class="gx-lbl">${st.label}</span></div>`;
    }).join("");

    return `<div class="gx-root">
      <aside class="gx-rail">
        <div class="gx-title">GENESIS</div>
        <div class="gx-sub">Character Forge</div>
        ${rail}
        <div class="gx-rail-foot">${s.cls ? `<img src="${classArtFor(s.cls)}" alt="">` : ""}</div>
      </aside>
      <main class="gx-main">${this._stepHTML()}</main>
    </div>`;
  }

  _cardGrid(records, selected, kind, artFn) {
    if (!records.length) {
      return `<p class="gx-empty">Nothing found in your compendiums for this step. You can skip it and add one later.</p>`;
    }
    return `<div class="gx-grid">` + records.map((r) => {
      const art = artFn ? artFn(r) : r.img;
      const sel = selected?.uuid === r.uuid ? "selected" : "";
      return `<div class="gx-card ${sel}" data-kind="${kind}" data-uuid="${r.uuid}">
        <div class="gx-card-art" style="background-image:url('${art}')"></div>
        <div class="gx-card-body">
          <div class="gx-card-name">${r.name}</div>
          <div class="gx-card-src">${r.source}</div>
          <div class="gx-card-desc">${stripHTML(r.description)}</div>
        </div>
      </div>`;
    }).join("") + `</div>`;
  }

  _navHTML({ backOk = true, nextOk = true, nextLabel = "Next", skippable = false } = {}) {
    return `<footer class="gx-nav">
      ${backOk ? `<button type="button" class="gx-btn gx-back"><i class="fas fa-chevron-left"></i> Back</button>` : `<span></span>`}
      <span class="gx-spacer"></span>
      ${skippable ? `<button type="button" class="gx-btn gx-skip">Skip</button>` : ""}
      <button type="button" class="gx-btn gx-primary gx-next" ${nextOk ? "" : "disabled"}>${nextLabel} <i class="fas fa-chevron-right"></i></button>
    </footer>`;
  }

  /* --- equipment node rendering (recursive) --- */
  _equipNodeHTML(node, equip, insideOr = false) {
    const inner = () => {
      switch (node.type) {
        case "AND":
          return `<span class="gx-eq-and">${node.children.map((c) => this._equipNodeHTML(c, equip, false)).join('<span class="gx-eq-join">+</span>')}</span>`;
        case "linked": {
          const info = equip.names[node.key] ?? { name: "Unknown", img: "icons/svg/item-bag.svg" };
          return `<span class="gx-eq-item"><img src="${info.img}" alt="">${node.count > 1 ? `${node.count}× ` : ""}${info.name}</span>`;
        }
        case "OR":
          return ""; // handled below
        default: { // category
          const cands = equip.candidates[node._id] ?? [];
          if (!cands.length) return `<span class="gx-eq-item gx-eq-missing">${categoryLabel(node)} <em>(pick from compendiums later)</em></span>`;
          const opts = cands.map((c) => `<option value="${c.uuid}" ${equip.choices[node._id] === c.uuid ? "selected" : ""}>${c.name}</option>`).join("");
          return `<span class="gx-eq-item">${node.count > 1 ? `${node.count}× ` : ""}<select class="gx-eq-cat" data-entry="${node._id}">${opts}</select> <span class="gx-eq-catlbl">(${categoryLabel(node)})</span></span>`;
        }
      }
    };

    if (node.type === "OR") {
      const rows = node.children.map((c) => {
        const on = (equip.choices[node._id] ?? node.children[0]?._id) === c._id;
        return `<label class="gx-eq-opt ${on ? "on" : ""}">
          <input type="radio" name="or-${node._id}" value="${c._id}" data-or="${node._id}" ${on ? "checked" : ""}>
          <span class="gx-eq-optbody">${this._equipNodeHTML(c, equip, true)}</span>
        </label>`;
      }).join("");
      return `<div class="gx-eq-or">${rows}</div>`;
    }
    return inner();
  }

  _equipTreeHTML(tree, equip, title) {
    if (!tree.length) return "";
    const rows = tree.map((root) => `<div class="gx-eq-root">${this._equipNodeHTML(root, equip)}</div>`).join("");
    return `<div class="gx-eq-block"><h3>${title}</h3>${rows}</div>`;
  }

  _stepHTML() {
    const s = this.state;
    switch (STEPS[s.step].id) {

      case "identity":
        return `<section class="gx-panel">
          <h1>Who are you?</h1>
          <p class="gx-lede">Every legend starts with a name and a face. You can change both later.</p>
          <div class="gx-identity">
            <div class="gx-portrait" style="background-image:url('${s.portrait}')" title="Click to choose a portrait"></div>
            <div class="gx-idfields">
              <label>Character name</label>
              <input type="text" class="gx-name" value="${s.name.replace(/"/g, "&quot;")}" placeholder="e.g. Kaimana of the Ninth Reef" autofocus>
              <p class="gx-hint">Tap the portrait to pick art for your hero.</p>
            </div>
          </div>
          ${this._navHTML({ backOk: false, nextOk: !!s.name.trim() })}
        </section>`;

      case "class": {
        const maxLvl = game.settings.get(MODULE_ID, "maxStartLevel");
        return `<section class="gx-panel">
          <h1>Choose your class</h1>
          <p class="gx-lede">The heart of what your hero can do. Then set your starting level.</p>
          ${this._cardGrid(this.source.classes, s.cls, "cls", classArtFor)}
          <div class="gx-levelrow ${s.cls ? "" : "gx-dim"}">
            <label>Starting level</label>
            <input type="range" class="gx-level" min="1" max="${maxLvl}" value="${Math.min(s.level, maxLvl)}">
            <span class="gx-levelval">${Math.min(s.level, maxLvl)}</span>
          </div>
          ${this._navHTML({ nextOk: !!s.cls })}
        </section>`;
      }

      case "subclass": {
        const subs = this.source.subclasses.filter((x) => s.cls && x.classIdentifier === s.cls.identifier);
        return `<section class="gx-panel">
          <h1>Choose your subclass</h1>
          <p class="gx-lede">${subs.length ? `The path within the ${s.cls?.name ?? "class"}. If your level is below the subclass threshold, it will simply wait on your sheet until you qualify.` : ""}</p>
          ${this._cardGrid(subs, s.subclass, "subclass")}
          ${this._navHTML({ nextOk: true, skippable: true })}
        </section>`;
      }

      case "species":
        return `<section class="gx-panel">
          <h1>Choose your species</h1>
          <p class="gx-lede">Lineage and heritage — traits granted automatically on creation.</p>
          ${this._cardGrid(this.source.races, s.race, "race")}
          ${this._navHTML({ nextOk: true, skippable: true })}
        </section>`;

      case "background":
        return `<section class="gx-panel">
          <h1>Choose your background</h1>
          <p class="gx-lede">Who you were before the adventure — proficiencies and features included.</p>
          ${this._cardGrid(this.source.backgrounds, s.background, "background")}
          ${this._navHTML({ nextOk: true, skippable: true })}
        </section>`;

      case "equipment": {
        const eq = s.equip;
        if (!eq) return `<section class="gx-panel"><h1>Starting equipment</h1><p class="gx-lede">Loading…</p></section>`;
        const nothing = !eq.classTree.length && !eq.bgTree.length;
        const goldRow = eq.wealth ? `
          <label class="gx-goldrow ${eq.useGold ? "on" : ""}">
            <input type="checkbox" class="gx-usegold" ${eq.useGold ? "checked" : ""}>
            <span>Take <strong>starting gold</strong> instead of class equipment <em>(${eq.wealth} gp — rolled when you forge)</em></span>
          </label>` : "";
        const fallback = eq.fallbackNote.length
          ? `<p class="gx-hint"><i class="fas fa-circle-info"></i> ${eq.fallbackNote.join(" and ")} ${eq.fallbackNote.length > 1 ? "don't" : "doesn't"} define structured starting equipment — check its description and add gear from compendiums after creation.</p>`
          : "";
        return `<section class="gx-panel">
          <h1>Starting equipment</h1>
          <p class="gx-lede">Choose your kit. Picks marked with a dropdown are category choices — "any simple weapon" and the like.</p>
          ${goldRow}
          <div class="gx-eq-wrap ${eq.useGold ? "gx-dim" : ""}">
            ${this._equipTreeHTML(eq.classTree, eq, s.cls ? `${s.cls.name} equipment` : "Class equipment")}
          </div>
          ${this._equipTreeHTML(eq.bgTree, eq, s.background ? `${s.background.name} equipment` : "Background equipment")}
          ${nothing && !eq.wealth ? `<p class="gx-empty">No structured equipment found for your choices. Add gear from compendiums after creation.</p>` : ""}
          ${fallback}
          ${this._navHTML({ nextOk: true, skippable: true })}
        </section>`;
      }

      case "abilities": {
        const spent = pointsSpent(s.abilities);
        const overBudget = s.method === "pointbuy" && spent > POINT_BUDGET;
        const rows = ABILITIES.map((a) => {
          const v = s.abilities[a];
          let control;
          if (s.method === "standard") {
            const opts = STANDARD_ARRAY.map((n) => `<option value="${n}" ${n === v ? "selected" : ""}>${n}</option>`).join("");
            control = `<select class="gx-ab" data-ab="${a}">${opts}</select>`;
          } else if (s.method === "pointbuy") {
            control = `<button type="button" class="gx-mini gx-dec" data-ab="${a}">−</button>
                       <span class="gx-abval">${v}</span>
                       <button type="button" class="gx-mini gx-inc" data-ab="${a}">+</button>`;
          } else {
            control = `<input type="number" class="gx-ab gx-abnum" data-ab="${a}" min="1" max="30" value="${v}">`;
          }
          return `<div class="gx-abrow">
            <span class="gx-abname">${ABILITY_LABELS[a]}</span>
            <span class="gx-abctl">${control}</span>
            <span class="gx-abmod">${mod(v)}</span>
          </div>`;
        }).join("");

        const dupWarn = s.method === "standard" && new Set(ABILITIES.map((a) => s.abilities[a])).size !== 6
          ? `<p class="gx-warn"><i class="fas fa-triangle-exclamation"></i> The standard array uses each value once — you have duplicates.</p>` : "";

        return `<section class="gx-panel">
          <h1>Set your abilities</h1>
          <p class="gx-lede">Racial or background bonuses from the system are applied on top of these when their items land.</p>
          <div class="gx-methods">
            ${["standard", "pointbuy", "manual"].map((m) =>
              `<button type="button" class="gx-method ${s.method === m ? "on" : ""}" data-method="${m}">${{ standard: "Standard Array", pointbuy: "Point Buy", manual: "Manual / Rolled" }[m]}</button>`).join("")}
          </div>
          ${s.method === "pointbuy" ? `<p class="gx-points ${overBudget ? "gx-over" : ""}">Points spent: <strong>${spent} / ${POINT_BUDGET}</strong></p>` : ""}
          ${dupWarn}
          <div class="gx-abgrid">${rows}</div>
          ${this._navHTML({ nextOk: !overBudget })}
        </section>`;
      }

      case "review": {
        const canCreate = game.user.can("ACTOR_CREATE") || game.user.isGM;
        const line = (label, val) => `<div class="gx-revrow"><span>${label}</span><strong>${val}</strong></div>`;
        const gearSummary = this._gearSummary();
        return `<section class="gx-panel">
          <h1>Ready to forge</h1>
          <div class="gx-review">
            <div class="gx-revportrait" style="background-image:url('${s.portrait}')"></div>
            <div class="gx-revbody">
              <h2>${s.name || "Unnamed"}</h2>
              ${line("Class", s.cls ? `${s.cls.name} (level ${s.level})` : "—")}
              ${line("Subclass", s.subclass?.name ?? "—")}
              ${line("Species", s.race?.name ?? "—")}
              ${line("Background", s.background?.name ?? "—")}
              ${line("Equipment", gearSummary)}
              ${line("Abilities", ABILITIES.map((a) => `${a.toUpperCase()} ${s.abilities[a]}`).join(" · "))}
            </div>
          </div>
          <p class="gx-hint">Creation drops your real class, subclass, species, and background items onto the new sheet. The system's <strong>Advancement</strong> dialogs will then walk you through every level's hit points, features, and choices — answer them as they appear. Your chosen gear lands afterward. Future level-ups use the same native flow.</p>
          ${canCreate ? "" : `<p class="gx-warn"><i class="fas fa-lock"></i> Your user cannot create actors. Ask the GM to grant the <em>Create New Actors</em> permission, or have the GM run this wizard for you.</p>`}
          <footer class="gx-nav">
            <button type="button" class="gx-btn gx-back"><i class="fas fa-chevron-left"></i> Back</button>
            <span class="gx-spacer"></span>
            <button type="button" class="gx-btn gx-primary gx-create" ${canCreate && !s.creating ? "" : "disabled"}>
              ${s.creating ? '<i class="fas fa-spinner fa-spin"></i> Forging…' : '<i class="fas fa-hammer"></i> Forge Character'}
            </button>
          </footer>
        </section>`;
      }
    }
    return "";
  }

  _gearSummary() {
    const eq = this.state.equip;
    if (!eq) return "—";
    const parts = [];
    if (eq.useGold && eq.wealth) parts.push(`starting gold (${eq.wealth} gp)`);
    const grants = this._collectAllGrants();
    if (grants.length) {
      const names = grants.slice(0, 6).map((g) => (g.count > 1 ? `${g.count}× ` : "") + (eq.names[g.uuid]?.name ?? this._equipNameFromIndex(g.uuid) ?? "item"));
      parts.push(names.join(", ") + (grants.length > 6 ? `, +${grants.length - 6} more` : ""));
    }
    return parts.length ? parts.join(" · ") : "—";
  }

  _equipNameFromIndex(uuid) {
    return _equipIndex?.find((i) => i.uuid === uuid)?.name;
  }

  _collectAllGrants() {
    const eq = this.state.equip;
    if (!eq) return [];
    const out = [];
    if (!eq.useGold) for (const root of eq.classTree) collectGrants(root, eq.choices, out);
    for (const root of eq.bgTree) collectGrants(root, eq.choices, out);
    // merge duplicates
    const merged = new Map();
    for (const g of out) merged.set(g.uuid, (merged.get(g.uuid) ?? 0) + g.count);
    return [...merged.entries()].map(([uuid, count]) => ({ uuid, count }));
  }

  /* ---------------------------- listeners -------------------------------- */

  activateListeners(html) {
    super.activateListeners(html);
    const s = this.state;

    html.find(".gx-step.done").on("click", (ev) => {
      s.step = Number(ev.currentTarget.dataset.step);
      this.render();
    });

    html.find(".gx-back").on("click", () => { s.step = Math.max(0, s.step - 1); this.render(); });
    html.find(".gx-next").on("click", () => { s.step = Math.min(STEPS.length - 1, s.step + 1); this.render(); });
    html.find(".gx-skip").on("click", () => {
      const id = STEPS[s.step].id;
      if (id === "subclass") s.subclass = null;
      if (id === "species") s.race = null;
      if (id === "background") { s.background = null; s.equip = null; }
      if (id === "equipment" && s.equip) { s.equip.useGold = false; s.equip.skipped = true; }
      s.step += 1; this.render();
    });

    // Identity
    html.find(".gx-name").on("input", (ev) => {
      s.name = ev.currentTarget.value;
      html.find(".gx-next").prop("disabled", !s.name.trim());
    });
    html.find(".gx-portrait").on("click", () => {
      new FilePicker({
        type: "image", current: s.portrait,
        callback: (path) => { s.portrait = path; this.render(); }
      }).render(true);
    });

    // Card selection
    html.find(".gx-card").on("click", (ev) => {
      const { kind, uuid } = ev.currentTarget.dataset;
      const pools = { cls: this.source.classes, subclass: this.source.subclasses, race: this.source.races, background: this.source.backgrounds };
      const rec = pools[kind]?.find((r) => r.uuid === uuid) ?? null;
      if (kind === "cls") { s.cls = rec; s.subclass = null; s.equip = null; }
      else if (kind === "subclass") s.subclass = rec;
      else if (kind === "race") s.race = rec;
      else if (kind === "background") { s.background = rec; s.equip = null; }
      this.render();
    });

    // Level slider
    html.find(".gx-level").on("input", (ev) => {
      s.level = Number(ev.currentTarget.value);
      html.find(".gx-levelval").text(s.level);
    });

    // Equipment
    html.find('input[data-or]').on("change", (ev) => {
      s.equip.choices[ev.currentTarget.dataset.or] = ev.currentTarget.value;
      this.render();
    });
    html.find(".gx-eq-cat").on("change", (ev) => {
      s.equip.choices[ev.currentTarget.dataset.entry] = ev.currentTarget.value;
    });
    html.find(".gx-usegold").on("change", (ev) => {
      s.equip.useGold = ev.currentTarget.checked;
      this.render();
    });

    // Ability methods
    html.find(".gx-method").on("click", (ev) => {
      s.method = ev.currentTarget.dataset.method;
      if (s.method === "standard") s.abilities = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
      if (s.method === "pointbuy") s.abilities = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
      this.render();
    });
    html.find("select.gx-ab").on("change", (ev) => {
      s.abilities[ev.currentTarget.dataset.ab] = Number(ev.currentTarget.value); this.render();
    });
    html.find(".gx-abnum").on("change", (ev) => {
      const raw = Number(ev.currentTarget.value) || 10;
      const v = Math.min(30, Math.max(1, raw));
      s.abilities[ev.currentTarget.dataset.ab] = v; this.render();
    });
    html.find(".gx-inc").on("click", (ev) => {
      const a = ev.currentTarget.dataset.ab;
      if (s.abilities[a] < 15 && pointsSpent({ ...s.abilities, [a]: s.abilities[a] + 1 }) <= POINT_BUDGET) {
        s.abilities[a] += 1; this.render();
      }
    });
    html.find(".gx-dec").on("click", (ev) => {
      const a = ev.currentTarget.dataset.ab;
      if (s.abilities[a] > 8) { s.abilities[a] -= 1; this.render(); }
    });

    // Create
    html.find(".gx-create").on("click", () => this._createCharacter());
  }

  /* ---------------------------- creation --------------------------------- */

  async _createCharacter() {
    const s = this.state;
    if (s.creating) return;
    s.creating = true; this.render();

    try {
      // 1. Actor shell with base abilities (so HP advancement sees CON).
      const abilities = {};
      for (const a of ABILITIES) abilities[a] = { value: s.abilities[a] };
      const actor = await Actor.create({
        name: s.name.trim(),
        type: "character",
        img: s.portrait,
        prototypeToken: { name: s.name.trim(), texture: { src: s.portrait } },
        system: { abilities }
      });
      if (!actor) throw new Error("Actor creation failed (permissions?)");

      // 2. Drop items in PHB order, letting the system's Advancement Manager run per item.
      const dropOrder = [
        [s.race, null],
        [s.background, null],
        [s.cls, (obj) => { obj.system.levels = s.level; }],
        [s.subclass, null]
      ];
      for (const [rec, mutate] of dropOrder) {
        if (!rec) continue;
        const doc = await fromUuid(rec.uuid);
        if (!doc) { ui.notifications.warn(`Genesis: could not load ${rec.name}.`); continue; }
        const obj = doc.toObject();
        delete obj._id;
        if (mutate) mutate(obj);
        await actor.createEmbeddedDocuments("Item", [obj]);
        await this._waitForAdvancements();
      }

      // 3. Starting equipment (chosen gear and/or rolled gold).
      await this._grantEquipment(actor);

      ui.notifications.info(`Genesis: ${actor.name} forged. Welcome to the world.`);
      this.close();
      actor.sheet.render(true);
    } catch (err) {
      console.error(`${MODULE_ID} | creation failed`, err);
      ui.notifications.error(`Genesis: creation failed — ${err.message}`);
      s.creating = false; this.render();
    }
  }

  async _grantEquipment(actor) {
    const eq = this.state.equip;
    if (!eq || eq.skipped) return;

    // Rolled starting gold instead of class kit
    if (eq.useGold && eq.wealth) {
      try {
        const roll = new Roll(String(eq.wealth));
        await roll.evaluate();
        const gp = Math.max(0, Math.floor(roll.total));
        const current = foundry.utils.getProperty(actor, "system.currency.gp") ?? 0;
        await actor.update({ "system.currency.gp": current + gp });
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: `${actor.name} takes starting gold (${eq.wealth})`
        });
      } catch (err) {
        console.warn(`${MODULE_ID} | wealth roll failed`, err);
      }
    }

    // Chosen items
    const grants = this._collectAllGrants();
    if (!grants.length) return;
    const toCreate = [];
    for (const g of grants) {
      const doc = await fromUuid(g.uuid).catch(() => null);
      if (!doc) continue;
      const obj = doc.toObject();
      delete obj._id;
      if (obj.system?.quantity !== undefined) obj.system.quantity = Math.max(1, g.count);
      toCreate.push(obj);
    }
    if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate);
  }

  /** Poll until no dnd5e AdvancementManager window remains open. */
  async _waitForAdvancements() {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    await delay(450);
    for (let i = 0; i < 2400; i++) { // up to ~20 minutes of player deliberation
      const active = Object.values(ui.windows).some((w) => w.constructor?.name === "AdvancementManager");
      if (!active) return;
      await delay(500);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Entry points                                                               */
/* -------------------------------------------------------------------------- */

function openGenesis() {
  new GenesisWizard().render(true);
}

Hooks.on("renderActorDirectory", (app, html) => {
  if (!game.user.isGM && !game.settings.get(MODULE_ID, "showPlayersButton")) return;
  const root = html instanceof jQuery ? html : $(html);
  if (root.find(".genesis-open").length) return;
  const btn = $(`<button type="button" class="genesis-open"><i class="fas fa-hammer"></i> Forge a Hero</button>`);
  btn.on("click", openGenesis);
  const header = root.find(".directory-header .header-actions").first();
  if (header.length) header.append(btn);
  else root.find(".directory-header").first().append(btn);
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { open: openGenesis };
  console.log(`${MODULE_ID} | Genesis ready.`);
});
