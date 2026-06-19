import type { Creature } from "./creature";
import { CONCEPTS, type ConceptId } from "./language";
import type { Simulation } from "./sim";

export type ToolId = "inspect" | "food" | "spawn" | "tribe" | "smite" | "raise" | "lower";

interface ToolDef {
  id: ToolId;
  icon: string;
  label: string;
  hint: string;
}

export const TOOLS: ToolDef[] = [
  { id: "inspect", icon: "🔍", label: "Inspect", hint: "Click a creature to study its needs, mind and words." },
  { id: "food", icon: "🍒", label: "Bless Food", hint: "Click land to make food bushes grow there." },
  { id: "spawn", icon: "✨", label: "Create", hint: "Click to shape a new creature into the world." },
  { id: "tribe", icon: "👥", label: "New People", hint: "Click to found a new tribe with its own language." },
  { id: "smite", icon: "⚡", label: "Smite", hint: "Click to call down fire. Chaos. Creatures may die." },
  { id: "raise", icon: "⛰️", label: "Raise Land", hint: "Click to push the earth upward." },
  { id: "lower", icon: "🌊", label: "Lower Land", hint: "Click to sink the earth toward the sea." },
];

/** Builds and refreshes all DOM panels. Pure view layer over the Simulation. */
export class UI {
  activeTool: ToolId = "inspect";
  selected: Creature | null = null;
  private activeTab = "inspect";
  private onTool: (t: ToolId) => void;
  private onSpeed: (s: number) => void;

  constructor(onTool: (t: ToolId) => void, onSpeed: (s: number) => void) {
    this.onTool = onTool;
    this.onSpeed = onSpeed;
    this.buildToolButtons();
    this.wireSpeed();
    this.wireTabs();
    this.setHint();
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

  /** Called every frame with the live sim to refresh panel contents. */
  render(sim: Simulation): void {
    document.getElementById("clock")!.textContent = `Day ${sim.day}`;
    const pop = sim.creatures.length;
    document.getElementById("census")!.textContent = `${pop} alive · ${sim.tribes.length} peoples`;

    if (this.activeTab === "inspect") this.renderInspector();
    else if (this.activeTab === "dict") this.renderDictionary(sim);
    else this.renderLog(sim);
  }

  private renderInspector(): void {
    const host = document.getElementById("tab-inspect")!;
    const c = this.selected;
    if (!c || !c.alive) {
      host.innerHTML = `<div class="empty">Pick the Inspect power and click a creature.</div>`;
      return;
    }
    const bar = (label: string, v: number, color: string) =>
      `<div class="kv"><span>${label}</span><span>${Math.round(v * 100)}%</span></div>
       <div class="bar"><i style="width:${Math.round(v * 100)}%;background:${color}"></i></div>`;

    const words = [...c.vocabulary]
      .map((id) => `<div class="lex-row"><span class="word">${c.tribe.lexicon.get(id) ?? "…"}</span><span class="gloss">${CONCEPTS[id].gloss}</span></div>`)
      .join("");

    host.innerHTML = `
      <div class="kv"><span>Tribe</span><span><span class="swatch" style="background:${c.tribe.color}"></span>${c.tribe.name}</span></div>
      <div class="kv"><span>Age</span><span>${c.age.toFixed(1)} d ${c.isAdult ? "(adult)" : "(young)"}</span></div>
      <div class="kv"><span>Doing</span><span>${c.action}</span></div>
      ${c.speech ? `<div class="kv"><span>Says</span><span class="word">"${c.speech}"</span></div>` : ""}
      <hr style="border-color:#1a2029">
      ${bar("Health", c.health, "#6fe09c")}
      ${bar("Fullness", 1 - c.hunger, "#e0a86f")}
      ${bar("Hydration", 1 - c.thirst, "#6fa8e0")}
      ${bar("Energy", c.energy, "#c9a8e0")}
      <div class="panel-title" style="margin-top:8px">Words it knows (${c.vocabulary.size})</div>
      ${words || `<div class="empty">No words yet.</div>`}
    `;
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
