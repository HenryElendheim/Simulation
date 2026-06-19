import type { Animal } from "./animal";
import type { Creature } from "./creature";
import { CONCEPTS, type ConceptId } from "./language";
import type { Simulation } from "./sim";
import { Layer } from "./world";

type Selected = Creature | Animal;
/** Animals have a `species`; people have a `tribe`. */
function isCreature(s: Selected): s is Creature {
  return "tribe" in s;
}

export type ToolId =
  | "inspect" | "food" | "spawn" | "tribe"
  | "grazer" | "hunter" | "cow" | "chicken" | "fish" | "dig"
  | "smite" | "raise" | "lower";

interface ToolDef {
  id: ToolId;
  icon: string;
  label: string;
  hint: string;
}

export const TOOLS: ToolDef[] = [
  { id: "inspect", icon: "🔍", label: "Inspect", hint: "Click a creature to inspect and EDIT every detail of it." },
  { id: "food", icon: "🍒", label: "Bless Food", hint: "Click land to make food bushes grow there." },
  { id: "spawn", icon: "✨", label: "Create", hint: "Click to shape a new creature into the world." },
  { id: "tribe", icon: "👥", label: "New People", hint: "Click to found a new tribe with its own language." },
  { id: "grazer", icon: "🦌", label: "Grazer", hint: "Place a wild grazer — fast prey for the food chain." },
  { id: "hunter", icon: "🐺", label: "Predator", hint: "Place a hunter-beast that stalks and eats herbivores." },
  { id: "cow", icon: "🐄", label: "Cow", hint: "Place a cow — a slow grazer that wanders, eats and drinks." },
  { id: "chicken", icon: "🐔", label: "Chicken", hint: "Place a chicken — a small bird that pecks around." },
  { id: "fish", icon: "🐟", label: "Fish", hint: "Click water to add fish that swim and feed." },
  { id: "dig", icon: "⛏️", label: "Dig", hint: "Click to carve rock on the layer you're viewing (Surface opens a cave shaft)." },
  { id: "smite", icon: "⚡", label: "Smite", hint: "Click to call down fire. Chaos. Creatures may die." },
  { id: "raise", icon: "⛰️", label: "Raise Land", hint: "Click to push the earth upward." },
  { id: "lower", icon: "🌊", label: "Lower Land", hint: "Click to sink the earth toward the sea." },
];

/** Builds and refreshes all DOM panels. Pure view layer over the Simulation. */
export class UI {
  activeTool: ToolId = "inspect";
  selected: Selected | null = null;
  private activeTab = "inspect";
  private onTool: (t: ToolId) => void;
  private onSpeed: (s: number) => void;
  private onLayer: (layer: number) => void;

  constructor(onTool: (t: ToolId) => void, onSpeed: (s: number) => void, onLayer: (layer: number) => void) {
    this.onTool = onTool;
    this.onSpeed = onSpeed;
    this.onLayer = onLayer;
    this.buildToolButtons();
    this.wireSpeed();
    this.wireLayer();
    this.wireTabs();
    this.setHint();
  }

  private wireLayer(): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>(".layer-toggle button")) {
      b.onclick = () => {
        for (const o of document.querySelectorAll(".layer-toggle button")) o.classList.remove("active");
        b.classList.add("active");
        this.onLayer(Number(b.dataset.layer));
      };
    }
  }

  private buildToolButtons(): void {
    const host = document.getElementById("tool-buttons")!;
    for (const t of TOOLS) {
      const b = document.createElement("button");
      b.innerHTML = `<span class="ico">${t.icon}</span><span>${t.label}</span>`;
      b.classList.toggle("active", t.id === this.activeTool);
      b.dataset.tool = t.id;
      b.onclick = () => this.selectTool(t.id);
      host.appendChild(b);
    }
  }

  selectTool(id: ToolId): void {
    this.activeTool = id;
    for (const b of document.querySelectorAll<HTMLButtonElement>("#tool-buttons button")) {
      b.classList.toggle("active", b.dataset.tool === id);
    }
    if (id === "inspect") this.setActiveTab("inspect");
    this.setHint();
    this.onTool(id);
  }

  private setHint(): void {
    const def = TOOLS.find((t) => t.id === this.activeTool)!;
    document.getElementById("tool-hint")!.textContent = def.hint;
  }

  private wireSpeed(): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>("#topbar .speed button")) {
      b.onclick = () => {
        for (const o of document.querySelectorAll("#topbar .speed button")) o.classList.remove("active");
        b.classList.add("active");
        this.onSpeed(Number(b.dataset.speed));
      };
    }
  }

  private wireTabs(): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>("#sidebar .tabs button")) {
      b.onclick = () => this.setActiveTab(b.dataset.tab!);
    }
  }

  private setActiveTab(tab: string): void {
    this.activeTab = tab;
    for (const b of document.querySelectorAll<HTMLButtonElement>("#sidebar .tabs button")) {
      b.classList.toggle("active", b.dataset.tab === tab);
    }
    for (const id of ["inspect", "dict", "log"]) {
      document.getElementById(`tab-${id}`)!.classList.toggle("hidden", id !== tab);
    }
  }

  private builtFor: Selected | null = null;
  private inspectorSync: (() => void) | null = null;

  /** Called every frame with the live sim to refresh panel contents. */
  render(sim: Simulation): void {
    document.getElementById("clock")!.textContent = `Day ${sim.day}`;
    const pop = sim.creatures.length;
    document.getElementById("census")!.textContent =
      `${pop} people · ${sim.tribes.length} tribes · ${sim.animals.length} beasts`;

    if (this.activeTab === "inspect") this.updateInspector(sim);
    else if (this.activeTab === "dict") this.renderDictionary(sim);
    else this.renderLog(sim);
  }

  /** Rebuild the editor only when the selection changes; otherwise just sync values. */
  private updateInspector(sim: Simulation): void {
    const sel = this.selected && this.selected.alive ? this.selected : null;
    if (sel !== this.builtFor) {
      this.builtFor = sel;
      this.buildInspector(sim);
    } else {
      this.inspectorSync?.();
    }
  }

  /** Build the right editor for whatever is selected (person or animal). */
  private buildInspector(sim: Simulation): void {
    const host = document.getElementById("tab-inspect")!;
    const sel = this.selected;
    if (!sel || !sel.alive) {
      host.innerHTML = `<div class="empty">Pick the Inspect power and click any creature to select, drag and edit it.</div>`;
      this.inspectorSync = null;
      return;
    }
    if (isCreature(sel)) this.buildPersonInspector(sim, sel);
    else this.buildAnimalInspector(sel);
  }

  /** Editor for an animal (cow, chicken, fish, grazer, predator). */
  private buildAnimalInspector(a: Animal): void {
    const host = document.getElementById("tab-inspect")!;
    const slider = (key: string, label: string, color: string) =>
      `<div class="ed-slider"><div class="kv"><span>${label}</span><span data-pct="${key}"></span></div>
       <input id="ed-${key}" type="range" min="0" max="100" style="accent-color:${color}"></div>`;
    host.innerHTML = `
      <div class="kv"><span>Species</span><span><span class="swatch" style="background:${a.species.color}"></span>${a.species.name}</span></div>
      <div class="kv"><span>Diet</span><span>${a.species.diet} · ${a.species.habitat}</span></div>
      <div class="kv"><span>Doing</span><span data-ro="doing"></span></div>
      <hr style="border-color:#1a2029">
      ${slider("health", "Health", "#6fe09c")}
      ${slider("full", "Fullness", "#e0a86f")}
      ${a.species.habitat === "land" ? slider("hydra", "Hydration", "#6fa8e0") : ""}
      <label class="ed-row"><span>Age (days)</span><input id="ed-age" type="number" min="0" step="0.5"></label>
      <label class="ed-row"><span>Max age</span><input id="ed-maxage" type="number" min="1" step="1"></label>
      <div class="ed-actions"><button id="ed-kill" class="danger">Smite this one</button></div>
      <div class="hint">Drag it around the world with the Inspect tool.</div>
    `;
    const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    const sliders = [
      { key: "health", get: () => a.health, set: (v: number) => (a.health = v) },
      { key: "full", get: () => 1 - a.hunger, set: (v: number) => (a.hunger = 1 - v) },
      ...(a.species.habitat === "land"
        ? [{ key: "hydra", get: () => 1 - a.thirst, set: (v: number) => (a.thirst = 1 - v) }]
        : []),
    ];
    for (const s of sliders) {
      const el = byId<HTMLInputElement>(`ed-${s.key}`);
      el.oninput = () => s.set(clamp01(Number(el.value) / 100));
    }
    const age = byId<HTMLInputElement>("ed-age");
    age.oninput = () => { const v = Number(age.value); if (!Number.isNaN(v)) a.age = Math.max(0, v); };
    const maxage = byId<HTMLInputElement>("ed-maxage");
    maxage.oninput = () => { const v = Number(maxage.value); if (!Number.isNaN(v) && v > 0) a.maxAge = v; };
    byId("ed-kill").onclick = () => { a.alive = false; };

    this.inspectorSync = () => {
      const active = document.activeElement;
      const set = (q: string, text: string) => { const e = document.querySelector(q); if (e) e.textContent = text; };
      set('[data-ro="doing"]', a.state);
      for (const s of sliders) {
        const el = byId<HTMLInputElement>(`ed-${s.key}`);
        const v = Math.round(s.get() * 100);
        if (el !== active) el.value = String(v);
        set(`[data-pct="${s.key}"]`, `${v}%`);
      }
      if (age !== active) age.value = a.age.toFixed(1);
      if (maxage !== active) maxage.value = String(Math.round(a.maxAge));
    };
    this.inspectorSync();
  }

  /** Editor for a person (full detail incl. intellect, emotion, words). */
  private buildPersonInspector(sim: Simulation, c: Creature): void {
    const host = document.getElementById("tab-inspect")!;
    const tribeOpts = sim.tribes
      .map((t, i) => `<option value="${i}" ${t === c.tribe ? "selected" : ""}>${t.name}</option>`)
      .join("");
    const slider = (key: string, label: string, color: string) =>
      `<div class="ed-slider"><div class="kv"><span>${label}</span><span data-pct="${key}"></span></div>
       <input id="ed-${key}" type="range" min="0" max="100" style="accent-color:${color}"></div>`;

    host.innerHTML = `
      <label class="ed-row"><span>Name</span><input id="ed-name" type="text" placeholder="(unnamed)" value="${escapeAttr(c.name)}"></label>
      <label class="ed-row"><span>Tribe</span><select id="ed-tribe">${tribeOpts}</select></label>
      <div class="ed-row"><span>Where</span><span class="mini-toggle"><button id="ed-surface">Surface</button><button id="ed-under">Cave</button></span></div>
      <div class="kv"><span>Feeling</span><span data-ro="emotion"></span></div>
      <div class="kv"><span>Doing</span><span data-ro="doing"></span></div>
      <div class="kv"><span>Home</span><span data-ro="home"></span></div>
      <div class="kv"><span>Says</span><span class="word" data-ro="says"></span></div>
      <hr style="border-color:#1a2029">
      ${slider("health", "Health", "#6fe09c")}
      ${slider("full", "Fullness", "#e0a86f")}
      ${slider("hydra", "Hydration", "#6fa8e0")}
      ${slider("energy", "Energy", "#c9a8e0")}
      ${slider("intellect", "Intellect", "#e0d06f")}
      <label class="ed-row"><span>Age (days)</span><input id="ed-age" type="number" min="0" step="0.5"></label>
      <label class="ed-row"><span>Max age</span><input id="ed-maxage" type="number" min="1" step="1"></label>
      <div class="ed-actions">
        <button id="ed-teach">Teach all words</button>
        <button id="ed-forget">Forget words</button>
        <button id="ed-kill" class="danger">Smite this one</button>
      </div>
      <div class="panel-title" style="margin-top:8px">Words it knows (<span data-ro="vocount"></span>)</div>
      <div id="ed-words"></div>
    `;

    const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    const name = byId<HTMLInputElement>("ed-name");
    name.oninput = () => { c.name = name.value; };
    const tribe = byId<HTMLSelectElement>("ed-tribe");
    tribe.onchange = () => { c.tribe = sim.tribes[Number(tribe.value)] ?? c.tribe; this.renderWords(c); };
    byId("ed-surface").onclick = () => { c.layer = Layer.Surface; };
    byId("ed-under").onclick = () => { c.layer = Layer.Underground; };

    const sliders = [
      { key: "health", get: () => c.health, set: (v: number) => (c.health = v) },
      { key: "full", get: () => 1 - c.hunger, set: (v: number) => (c.hunger = 1 - v) },
      { key: "hydra", get: () => 1 - c.thirst, set: (v: number) => (c.thirst = 1 - v) },
      { key: "energy", get: () => c.energy, set: (v: number) => (c.energy = v) },
      { key: "intellect", get: () => c.intellect, set: (v: number) => (c.intellect = v) },
    ];
    for (const s of sliders) {
      const el = byId<HTMLInputElement>(`ed-${s.key}`);
      el.oninput = () => s.set(clamp01(Number(el.value) / 100));
    }
    const age = byId<HTMLInputElement>("ed-age");
    age.oninput = () => { const v = Number(age.value); if (!Number.isNaN(v)) c.age = Math.max(0, v); };
    const maxage = byId<HTMLInputElement>("ed-maxage");
    maxage.oninput = () => { const v = Number(maxage.value); if (!Number.isNaN(v) && v > 0) c.maxAge = v; };

    byId("ed-teach").onclick = () => { sim.teachAllWords(c); this.renderWords(c); };
    byId("ed-forget").onclick = () => { sim.forgetAllWords(c); this.renderWords(c); };
    byId("ed-kill").onclick = () => { sim.kill(c); };

    this.inspectorSync = () => {
      const active = document.activeElement;
      const set = (sel: string, text: string) => { const e = document.querySelector(sel); if (e) e.textContent = text; };
      set('[data-ro="emotion"]', `${EMOJI[c.emotion] ?? ""} ${c.emotion}`);
      set('[data-ro="doing"]', c.action);
      set('[data-ro="home"]', c.home ? "has a home" : (c.intellect >= 0.78 ? "none (can build)" : "none"));
      set('[data-ro="says"]', c.speech ? `"${c.speech}" — ${c.speechGloss}` : "—");
      set('[data-ro="vocount"]', String(c.vocabulary.size));
      for (const s of sliders) {
        const el = byId<HTMLInputElement>(`ed-${s.key}`);
        const v = Math.round(s.get() * 100);
        if (el !== active) el.value = String(v);
        set(`[data-pct="${s.key}"]`, `${v}%`);
      }
      if (age !== active) age.value = c.age.toFixed(1);
      if (maxage !== active) maxage.value = String(Math.round(c.maxAge));
    };
    this.renderWords(c);
    this.inspectorSync();
  }

  private renderWords(c: Creature): void {
    const host = document.getElementById("ed-words");
    if (!host) return;
    const words = [...c.vocabulary]
      .map((id) => `<div class="lex-row"><span class="word">${c.tribe.lexicon.get(id) ?? "…"}</span><span class="gloss">${CONCEPTS[id].gloss}</span></div>`)
      .join("");
    host.innerHTML = words || `<div class="empty">No words yet — it will name things as it lives.</div>`;
  }

  private renderDictionary(sim: Simulation): void {
    const host = document.getElementById("tab-dict")!;
    if (!sim.tribes.length) {
      host.innerHTML = `<div class="empty">No peoples yet.</div>`;
      return;
    }
    host.innerHTML = sim.tribes
      .map((tribe) => {
        const rows = [...tribe.lexicon.entries()]
          .map(([id, word]) => `<div class="lex-row"><span class="word">${word}</span><span class="gloss">${CONCEPTS[id as ConceptId].gloss}</span></div>`)
          .join("");
        return `<div class="tribe-block">
          <div class="tribe-name"><span class="swatch" style="background:${tribe.color}"></span>${tribe.name} <span class="gloss">(${tribe.lexicon.size} words)</span></div>
          ${rows || `<div class="empty">Has invented no words yet.</div>`}
        </div>`;
      })
      .join("");
  }

  private renderLog(sim: Simulation): void {
    const host = document.getElementById("tab-log")!;
    if (!sim.log.length) {
      host.innerHTML = `<div class="empty">Nothing has happened yet.</div>`;
      return;
    }
    host.innerHTML = sim.log
      .slice(-60)
      .reverse()
      .map((e) => {
        const cls = e.kind === "lang" ? "lang" : e.kind === "doom" ? "doom" : "";
        return `<div class="entry ${cls}"><b>Day ${e.day}</b> · ${e.text}</div>`;
      })
      .join("");
  }
}

const EMOJI: Record<string, string> = {
  happy: "😊", content: "🙂", afraid: "😱", hungry: "😟",
  lonely: "😔", miserable: "😣", curious: "🤔",
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
