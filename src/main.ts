import { Camera } from "./camera";
import { DEFAULT_WORLD_H, DEFAULT_WORLD_W } from "./config";
import type { Creature } from "./creature";
import { Renderer } from "./render";
import type { Animal } from "./animal";
import { Simulation } from "./sim";
import { UI, type ToolId } from "./ui";
import { Layer, World } from "./world";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const SEED = Math.floor(Math.random() * 1e9);
const world = new World(DEFAULT_WORLD_W, DEFAULT_WORLD_H, SEED);
const sim = new Simulation(world, SEED);
sim.seedLife(3, 6);

const cam = new Camera(window.innerWidth, window.innerHeight);
cam.centerOn(world.pixelW / 2, world.pixelH / 2);
cam.zoom = 1.4;

const renderer = new Renderer(ctx, cam);

let speed = 1;
const ui = new UI(
  (tool: ToolId) => applyToolCursor(tool),
  (s: number) => {
    speed = s;
  },
  (layer: number) => {
    renderer.layer = layer as Layer;
  },
);

// ---- Canvas sizing (devicePixelRatio aware) --------------------------------

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cam.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", resize);
resize();

// ---- Input -----------------------------------------------------------------

function applyToolCursor(tool: ToolId): void {
  canvas.classList.toggle("targeting", tool !== "inspect");
}
applyToolCursor(ui.activeTool);

let isDown = false;
let dragged = 0;
let lastX = 0;
let lastY = 0;

const isPaint = (t: ToolId) => t === "raise" || t === "lower";

/** Entity currently being dragged with the Inspect tool. */
let dragTarget: Creature | Animal | null = null;

canvas.addEventListener("pointerdown", (e) => {
  isDown = true;
  dragged = 0;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  if (isPaint(ui.activeTool)) {
    paint(e.clientX, e.clientY);
  } else if (ui.activeTool === "inspect") {
    // Grab whatever is under the cursor so it can be selected and dragged.
    const [wx, wy] = cam.screenToWorld(e.clientX, e.clientY);
    dragTarget = pickEntity(wx, wy);
    if (dragTarget) ui.selected = dragTarget;
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!isDown) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  dragged += Math.abs(dx) + Math.abs(dy);
  lastX = e.clientX;
  lastY = e.clientY;
  if (dragTarget) {
    // Move the grabbed entity to the cursor.
    const [wx, wy] = cam.screenToWorld(e.clientX, e.clientY);
    dragTarget.x = wx;
    dragTarget.y = wy;
  } else if (isPaint(ui.activeTool)) {
    paint(e.clientX, e.clientY);
  } else {
    canvas.classList.add("panning");
    cam.panByScreen(dx, dy);
  }
});

canvas.addEventListener("pointerup", (e) => {
  isDown = false;
  canvas.classList.remove("panning");
  if (dragTarget) {
    dragTarget = null;
    return;
  }
  // A click (negligible drag) triggers the tool action.
  if (dragged < 5 && !isPaint(ui.activeTool)) act(e.clientX, e.clientY);
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  cam.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
}, { passive: false });

function paint(sx: number, sy: number): void {
  const [wx, wy] = cam.screenToWorld(sx, sy);
  sim.shapeLand(wx, wy, ui.activeTool === "raise" ? 1 : -1);
}

function act(sx: number, sy: number): void {
  const [wx, wy] = cam.screenToWorld(sx, sy);
  switch (ui.activeTool) {
    case "inspect":
      ui.selected = pickEntity(wx, wy); // clicking empty space deselects
      break;
    case "food":
      sim.blessFood(wx, wy);
      break;
    case "spawn":
      sim.divineSpawn(wx, wy);
      break;
    case "tribe":
      sim.foundTribe(wx, wy);
      break;
    case "grazer":
      sim.divineBeast(wx, wy, "grazer");
      break;
    case "hunter":
      sim.divineBeast(wx, wy, "hunter");
      break;
    case "cow":
      sim.divineBeast(wx, wy, "cow");
      break;
    case "chicken":
      sim.divineBeast(wx, wy, "chicken");
      break;
    case "fish":
      sim.divineBeast(wx, wy, "fish");
      break;
    case "dig":
      sim.divineDig(wx, wy, renderer.layer);
      break;
    case "smite":
      sim.smite(wx, wy);
      break;
  }
}

/** Pick a person or animal near (wx,wy) on the layer being viewed. */
function pickEntity(wx: number, wy: number): Creature | Animal | null {
  let best: Creature | Animal | null = null;
  let bestD = (14 / cam.zoom) ** 2; // generous pick radius in world units
  for (const c of sim.creatures) {
    if (c.layer !== renderer.layer) continue;
    const d = (c.x - wx) ** 2 + (c.y - wy) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  if (renderer.layer === Layer.Surface) {
    for (const a of sim.animals) {
      const d = (a.x - wx) ** 2 + (a.y - wy) ** 2;
      if (d < bestD) { bestD = d; best = a; }
    }
  }
  return best;
}

// ---- Main loop (fixed sub-steps so high speeds stay stable) -----------------

let last = performance.now();
function frame(now: number): void {
  let real = (now - last) / 1000;
  last = now;
  real = Math.min(real, 0.1); // ignore huge gaps (tab was hidden)

  let simSeconds = real * speed;
  const STEP = 0.05;
  while (simSeconds > 0) {
    const s = Math.min(STEP, simSeconds);
    sim.update(s);
    simSeconds -= s;
  }

  renderer.draw(sim, ui.selected);
  ui.render(sim);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
