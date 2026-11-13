import { Sfx } from "./audio";
import { drawWorld } from "./render";
import type { Floater, Kind, Mode, Obstacle, Particle, Pickup, RunStats, StarSpec, WormSeg } from "./types";

const SAVE_KEY = "rainbow-worm-v1";
const STEP = 1 / 60;
const HIST = 640;
const AIR = 0.62;
const COYOTE = 0.1;
const BUFFER = 0.13;

type Hud = {
  score: HTMLElement;
  best: HTMLElement;
  stars: HTMLElement;
  stage: HTMLElement;
};

type Listener = (
  event:
    | { type: "over"; stats: RunStats }
    | { type: "mode"; mode: Mode }
    | { type: "mute"; muted: boolean }
    | { type: "start" }
) => void;

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function randMulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { best: 0, mute: false };
    const parsed = JSON.parse(raw) as { best?: number; mute?: boolean };
    return { best: Number(parsed.best) || 0, mute: !!parsed.mute };
  } catch {
    return { best: 0, mute: false };
  }
}

export class RainbowEngine {
  mode: Mode = "menu";
  camera = 0;
  time = 0;
  speed = 280;
  maxSpeed = 640;
  baseSpeed = 280;
  width = 360;
  height = 640;
  groundY = 480;
  headX = 90;
  radius = 22;
  scale = 1;
  jumpH = 140;
  jumpV = 700;
  grav = 2200;
  hitR = 12;
  spacing = 16;
  segCount = 16;
  best = 0;
  bestAtStart = 0;
  stars = 0;
  near = 0;
  spawned = 0;
  nextSpawn = 800;
  flash = 0;
  trauma = 0;
  hitstop = 0;
  deathAge = 0;
  stretch = 1;
  blink = 0;
  blinkIn = 2.4;
  spin = 0;
  scrollLeft = 0;
  reduce: boolean;
  worm = { y: 400, vy: 0, grounded: true, coyote: COYOTE, buffer: 0 };

  readonly segs: WormSeg[] = [];
  readonly obstacles: Obstacle[] = [];
  readonly pickups: Pickup[] = [];
  readonly particles: Particle[] = [];
  readonly floaters: Floater[] = [];
  readonly starfield: StarSpec[] = [];

  private histX = new Float32Array(HIST);
  private histY = new Float32Array(HIST);
  private histHead = 0;
  private histCount = 0;
  private acc = 0;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private running = true;
  private spawnSeed = 1;
  private recordLive = false;
  private ctx2d: CanvasRenderingContext2D | null = null;

  private keyJump = false;
  private padJump = false;
  private padWas = false;
  private pointers = new Set<number>();
  private pressEdge = false;
  private releaseEdge = false;

  private sfx = new Sfx();
  private onEvent: Listener;
  private hud: Hud;
  private canvas: HTMLCanvasElement;
  private ro: ResizeObserver;

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onPointerDown: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;
  private onBlur: () => void;
  private onVis: () => void;

  constructor(canvas: HTMLCanvasElement, hud: Hud, onEvent: Listener) {
    this.canvas = canvas;
    this.hud = hud;
    this.onEvent = onEvent;
    const save = loadSave();
    this.best = save.best;
    this.bestAtStart = save.best;
    this.sfx.muted = save.mute;
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.ctx2d = canvas.getContext("2d", { alpha: false });

    for (let i = 0; i < 18; i++) this.segs.push({ x: 0, y: 0 });
    for (let i = 0; i < 14; i++) {
      this.obstacles.push({
        active: false,
        x: 0,
        y: 0,
        w: 40,
        h: 40,
        kind: "pebble",
        seed: 1,
        passed: false,
        pts: [],
      });
    }
    for (let i = 0; i < 16; i++) this.pickups.push({ active: false, x: 0, y: 0, phase: 0, r: 12 });
    for (let i = 0; i < 180; i++) {
      this.particles.push({
        alive: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        max: 1,
        size: 2,
        hue: 0,
        grav: 0,
      });
    }
    for (let i = 0; i < 10; i++) this.floaters.push({ alive: false, x: 0, y: 0, text: "", life: 0, max: 1 });
    for (let i = 0; i < 96; i++) {
      this.starfield.push({
        x: hash(i * 3 + 1),
        y: hash(i * 3 + 2),
        depth: 0.15 + hash(i * 3 + 3) * 0.85,
        size: 0.8 + hash(i * 7) * 1.8,
        tw: hash(i * 9) * Math.PI * 2,
      });
    }

    this.onKeyDown = (e) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        this.setKeyJump(true);
      } else if (e.code === "Escape" || e.code === "KeyP") {
        this.togglePause();
      } else if (e.code === "KeyM") {
        this.toggleMute();
      } else if (e.code === "KeyR" && this.mode === "dead") {
        this.restart();
      }
    };
    this.onKeyUp = (e) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        this.setKeyJump(false);
      }
    };
    this.onPointerDown = (e) => {
      if (fromUi(e)) return;
      this.pointers.add(e.pointerId);
      if (this.pointers.size === 1 && !this.keyJump && !this.padJump) this.notePress();
      else if (!this.held()) this.notePress();
      e.preventDefault();
    };
    this.onPointerUp = (e) => {
      this.pointers.delete(e.pointerId);
      if (!this.held()) this.noteRelease();
    };
    this.onBlur = () => {
      this.keyJump = false;
      this.pointers.clear();
      this.padJump = false;
    };
    this.onVis = () => {
      if (document.visibilityState === "visible") this.sfx.resume();
      else this.persist();
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("pointerdown", this.onPointerDown, { passive: false });
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVis);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.placeBody(true);
    this.syncHud();
    this.onEvent({ type: "mute", muted: this.sfx.muted });

    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);

    const w = window as unknown as { __rainbow?: Record<string, () => unknown> };
    w.__rainbow = {
      mode: () => this.mode,
      camera: () => this.camera,
      y: () => this.worm.y,
      grounded: () => this.worm.grounded,
      score: () => this.score,
      stars: () => this.stars,
      best: () => this.best,
    };
  }

  get score() {
    return Math.floor(this.camera / 42) + this.stars * 15 + this.near * 25;
  }

  get muted() {
    return this.sfx.muted;
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVis);
    this.sfx.close();
    const w = window as unknown as { __rainbow?: unknown };
    delete w.__rainbow;
  }

  start(withJump: boolean) {
    this.sfx.unlock();
    this.sfx.musicOn = true;
    this.mode = "play";
    this.camera = 0;
    this.stars = 0;
    this.near = 0;
    this.spawned = 0;
    this.flash = 0;
    this.trauma = 0;
    this.hitstop = 0;
    this.deathAge = 0;
    this.spin = 0;
    this.scrollLeft = 0;
    this.recordLive = false;
    this.bestAtStart = this.best;
    this.worm.vy = 0;
    this.worm.grounded = true;
    this.worm.coyote = COYOTE;
    this.worm.buffer = 0;
    this.worm.y = this.groundY - this.radius;
    this.speed = this.baseSpeed;
    this.nextSpawn = this.width + this.baseSpeed * 1.15;
    for (const o of this.obstacles) o.active = false;
    for (const p of this.pickups) p.active = false;
    for (const f of this.floaters) f.alive = false;
    this.seedHistory();
    this.placeBody(false);
    this.hud.stage.dataset.record = "0";
    this.onEvent({ type: "mode", mode: "play" });
    this.onEvent({ type: "start" });
    if (withJump) {
      this.pressEdge = true;
    }
    this.syncHud();
  }

  restart() {
    if (this.mode !== "dead" && this.mode !== "menu") return;
    this.start(false);
  }

  toMenu() {
    this.mode = "menu";
    this.worm.vy = 0;
    this.worm.grounded = true;
    this.flash = 0;
    this.sfx.musicOn = true;
    this.onEvent({ type: "mode", mode: "menu" });
  }

  togglePause() {
    if (this.mode === "play") {
      this.mode = "pause";
      this.persist();
      this.onEvent({ type: "mode", mode: "pause" });
    } else if (this.mode === "pause") {
      this.mode = "play";
      this.onEvent({ type: "mode", mode: "play" });
    }
  }

  toggleMute() {
    this.sfx.unlock();
    const muted = this.sfx.toggleMuted();
    this.persist();
    this.onEvent({ type: "mute", muted });
    return muted;
  }

  private held() {
    return this.keyJump || this.padJump || this.pointers.size > 0;
  }

  private notePress() {
    this.sfx.unlock();
    this.sfx.musicOn = true;
    if (this.mode === "menu") {
      this.start(true);
      return;
    }
    if (this.mode === "dead") {
      this.start(true);
      return;
    }
    if (this.mode === "pause") {
      this.mode = "play";
      this.onEvent({ type: "mode", mode: "play" });
    }
    this.pressEdge = true;
  }

  private noteRelease() {
    this.releaseEdge = true;
  }

  private setKeyJump(down: boolean) {
    if (down) {
      const was = this.held();
      this.keyJump = true;
      if (!was) this.notePress();
    } else {
      this.keyJump = false;
      if (!this.held()) this.noteRelease();
    }
  }

  private frame(dt: number) {
    this.pollPad();
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.draw();
      return;
    }
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.flash = Math.max(0, this.flash - dt * 1.8);
    this.sfx.pump();
    this.syncHud();
    this.draw();
  }

  private step(dt: number) {
    this.time += dt;
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.14;
      this.blinkIn = 2.6 + Math.random() * 2.2;
    }
    if (this.blink > 0) this.blink -= dt;

    if (this.mode === "play") this.stepPlay(dt);
    else if (this.mode === "dead") this.stepDead(dt);
    else if (this.mode === "menu") this.stepMenu(dt);

    if (this.mode === "play" || this.mode === "dead") {
      const targetStretch = Math.max(0.78, Math.min(1.32, 1 + -this.worm.vy / (this.jumpV * 1.6)));
      this.stretch += (targetStretch - this.stretch) * (1 - Math.exp(-12 * dt));
    }
    this.updateParticles(dt);
    this.updateFloaters(dt);
    this.placeBody(this.mode === "menu");
  }

  private stepMenu(dt: number) {
    const base = this.groundY - this.radius;
    this.worm.y = base + Math.sin(this.time * 2.2) * (8 * this.scale);
    this.worm.vy = Math.cos(this.time * 2.2) * 40;
    this.camera += this.baseSpeed * 0.18 * dt;
    if (Math.random() < 0.25) this.emit(this.headX - this.radius, this.worm.y, 1, (this.time * 80) % 360, 30);
  }

  private stepPlay(dt: number) {
    const dist = this.camera;
    this.speed = Math.min(this.maxSpeed, this.baseSpeed + dist * 0.035);
    this.camera += this.speed * dt;
    this.integrateWorm(dt, true);
    this.pushHist(this.camera + this.headX, this.worm.y);

    let guard = 0;
    while (this.nextSpawn < this.camera + this.width + 50 && guard++ < 4) this.spawnObstacle();

    const hx = this.camera + this.headX;
    const prevHx = hx - this.speed * dt;
    for (const o of this.obstacles) {
      if (!o.active) continue;
      if (o.x + o.w < this.camera - 80) {
        o.active = false;
        continue;
      }
      if (this.hits(prevHx, this.worm.y - this.worm.vy * dt, hx, this.worm.y, o)) {
        this.die();
        return;
      }
      if (!o.passed && o.x + o.w < hx) {
        o.passed = true;
        const clearance = o.y - (this.worm.y + this.hitR);
        if (clearance > -4 && clearance < 30 * this.scale && !this.worm.grounded) {
          this.near++;
          this.floater(this.headX, this.worm.y - this.radius - 8, "+25");
          this.sfx.near();
          this.bump(0.22);
        }
      }
    }

    for (const p of this.pickups) {
      if (!p.active) continue;
      if (p.x < this.camera - 40) {
        p.active = false;
        continue;
      }
      const dx = hx - p.x;
      const dy = this.worm.y - p.y;
      if (dx * dx + dy * dy < (this.hitR + p.r) * (this.hitR + p.r)) {
        p.active = false;
        this.stars++;
        this.floater(this.headX + 10, this.worm.y - this.radius, "+15");
        this.sfx.star();
        this.emit(this.headX, this.worm.y, 10, 48, 160);
      }
    }

    if (this.score > this.bestAtStart && !this.recordLive) {
      this.recordLive = true;
      this.hud.stage.dataset.record = "1";
    }

    if ((this.time * 60) % 2 < 1) {
      const tail = this.segs[Math.min(this.segs.length - 1, this.segCount - 1)];
      if (tail) this.emit(tail.x, tail.y, 1, (this.time * 90) % 360, 20);
    }
  }

  private stepDead(dt: number) {
    this.deathAge += dt;
    this.scrollLeft = Math.max(0, this.speed * Math.exp(-this.deathAge * 2.4));
    this.camera += this.scrollLeft * dt;
    this.spin += dt * 6;
    this.integrateWorm(dt, false);
    this.pushHist(this.camera + this.headX, this.worm.y);
  }

  private integrateWorm(dt: number, canJump: boolean) {
    if (canJump) {
      if (this.pressEdge) {
        this.worm.buffer = BUFFER;
        this.pressEdge = false;
      }
      if (this.worm.grounded) this.worm.coyote = COYOTE;
      else this.worm.coyote = Math.max(0, this.worm.coyote - dt);
      this.worm.buffer = Math.max(0, this.worm.buffer - dt);
      if (this.worm.buffer > 0 && (this.worm.grounded || this.worm.coyote > 0)) this.doJump();
      if (this.releaseEdge) {
        const minV = this.jumpV * 0.56;
        if (this.worm.vy < -minV) this.worm.vy = -minV;
        this.releaseEdge = false;
      }
    } else {
      this.pressEdge = false;
      this.releaseEdge = false;
    }

    this.worm.vy += this.grav * dt;
    if (this.worm.vy > this.jumpV * 1.35) this.worm.vy = this.jumpV * 1.35;
    this.worm.y += this.worm.vy * dt;
    const floor = this.groundY - this.radius;
    if (this.worm.y >= floor) {
      const impact = this.worm.vy;
      this.worm.y = floor;
      this.worm.vy = 0;
      if (!this.worm.grounded) {
        this.worm.grounded = true;
        this.stretch = 0.74;
        if (impact > 240) {
          this.sfx.land();
          this.emit(this.headX, floor + this.radius * 0.2, 6, 40, 90);
          this.bump(0.12);
        }
      } else this.worm.grounded = true;
    } else if (this.worm.vy < -40 || this.worm.y < floor - 2) {
      this.worm.grounded = false;
    }
    const ceil = this.radius + 8;
    if (this.worm.y < ceil) {
      this.worm.y = ceil;
      if (this.worm.vy < 0) this.worm.vy = 0;
    }
  }

  private doJump() {
    this.worm.vy = -this.jumpV;
    this.worm.grounded = false;
    this.worm.coyote = 0;
    this.worm.buffer = 0;
    this.stretch = 1.28;
    this.sfx.jump();
    this.emit(this.headX, this.groundY, 8, (this.time * 80) % 360, 120);
  }

  private die() {
    this.mode = "dead";
    this.deathAge = 0;
    this.hitstop = this.reduce ? 0 : 0.07;
    this.flash = 0.65;
    this.bump(0.8);
    this.worm.vy = -this.jumpV * 0.45;
    this.worm.grounded = false;
    this.sfx.crash();
    this.emit(this.headX, this.worm.y, 36, (this.time * 40) % 360, 280);
    const stats = this.finishStats();
    this.onEvent({ type: "over", stats });
    this.onEvent({ type: "mode", mode: "dead" });
  }

  private finishStats(): RunStats {
    const score = this.score;
    const isNewBest = score > this.best;
    if (isNewBest) this.best = score;
    this.persist();
    return {
      score,
      best: this.best,
      stars: this.stars,
      near: this.near,
      distance: Math.floor(this.camera / 42),
      isNewBest,
    };
  }

  private spawnObstacle() {
    const o = this.obstacles.find((item) => !item.active);
    if (!o) {
      this.nextSpawn += 200;
      return;
    }
    const rnd = randMulberry((this.spawnSeed = (this.spawnSeed * 1664525 + 1013904223) >>> 0));
    const kind = this.pickKind(rnd);
    const jumpDist = this.speed * AIR;
    const maxH = this.jumpH * (kind === "pebble" ? 0.34 : kind === "crystal" ? 0.74 : 0.55);
    const maxW = Math.max(34 * this.scale, jumpDist * (kind === "satellite" ? 0.34 : 0.28));
    let w = 40;
    let h = 36;
    if (kind === "pebble") {
      w = (30 + rnd() * 16) * this.scale;
      h = (28 + rnd() * 16) * this.scale;
    } else if (kind === "boulder") {
      w = (46 + rnd() * 26) * this.scale;
      h = (46 + rnd() * 22) * this.scale;
    } else if (kind === "crystal") {
      w = (28 + rnd() * 14) * this.scale;
      h = (72 + rnd() * 28) * this.scale;
    } else {
      w = (68 + rnd() * 26) * this.scale;
      h = (36 + rnd() * 16) * this.scale;
    }
    w = Math.min(w, maxW);
    h = Math.min(h, Math.max(26 * this.scale, maxH));
    o.active = true;
    o.kind = kind;
    o.seed = (rnd() * 1e9) >>> 0;
    o.w = w;
    o.h = h;
    o.x = Math.max(this.nextSpawn, this.camera + this.headX + 120);
    o.y = this.groundY - h;
    o.passed = false;
    o.pts = makePts(kind, o.seed, w, h);
    this.spawned++;

    if (rnd() < 0.62) this.tryStarAbove(o, rnd);
    const gapTime = 0.98 + rnd() * 0.55;
    const gap = this.speed * gapTime;
    if (rnd() < 0.55) {
      const sx = o.x + o.w + gap * (0.35 + rnd() * 0.3);
      const sy = this.groundY - this.radius - this.jumpH * (0.28 + rnd() * 0.4);
      this.activateStar(sx, sy);
    }
    this.nextSpawn = o.x + o.w + gap;
  }

  private pickKind(rnd: () => number): Kind {
    if (this.spawned < 3) return "pebble";
    if (this.camera < 1600) return rnd() < 0.72 ? "pebble" : "boulder";
    const r = rnd();
    if (r < 0.34) return "pebble";
    if (r < 0.62) return "boulder";
    if (r < 0.82) return "crystal";
    return "satellite";
  }

  private tryStarAbove(o: Obstacle, rnd: () => number) {
    const minY = this.groundY - this.radius - this.jumpH + 16;
    const maxY = this.groundY - this.radius - 48 * this.scale;
    let sy = o.y - 18 * this.scale;
    if (sy < minY) sy = minY + rnd() * 8;
    if (sy > maxY || sy + 14 > o.y) return;
    this.activateStar(o.x + o.w * 0.5, sy);
  }

  private activateStar(x: number, y: number) {
    const p = this.pickups.find((item) => !item.active);
    if (!p) return;
    p.active = true;
    p.x = x;
    p.y = y;
    p.phase = Math.random() * Math.PI * 2;
    p.r = 11 * this.scale;
  }

  private hits(x0: number, y0: number, x1: number, y1: number, o: Obstacle) {
    const inset = Math.min(5 * this.scale, o.w * 0.1, o.h * 0.1);
    const rx = o.x + inset;
    const ry = o.y + inset;
    const rw = Math.max(4, o.w - inset * 2);
    const rh = Math.max(4, o.h - inset * 2);
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (circleRect(x, y, this.hitR, rx, ry, rw, rh)) return true;
    }
    return false;
  }

  private seedHistory() {
    this.histCount = 0;
    this.histHead = 0;
    const y = this.groundY - this.radius;
    for (let i = 280; i >= 0; i--) this.pushHist(this.headX - i * 3, y);
  }

  private pushHist(x: number, y: number) {
    this.histX[this.histHead] = x;
    this.histY[this.histHead] = y;
    this.histHead = (this.histHead + 1) % HIST;
    if (this.histCount < HIST) this.histCount++;
  }

  private placeBody(scripted: boolean) {
    const n = this.segCount;
    if (scripted) {
      for (let i = 0; i < n; i++) {
        this.segs[i].x = this.headX - i * this.spacing;
        this.segs[i].y = this.worm.y + Math.sin(this.time * 3 - i * 0.45) * (6 * this.scale);
      }
      return;
    }
    this.segs[0].x = this.headX;
    this.segs[0].y = this.worm.y;
    let prevX = this.camera + this.headX;
    let prevY = this.worm.y;
    let hi = 0;
    const latest = (this.histHead - 1 + HIST) % HIST;
    for (let s = 1; s < n; s++) {
      let need = this.spacing;
      let guard = 0;
      while (need > 0.4 && hi < this.histCount && guard++ < 80) {
        const idx = (latest - hi + HIST) % HIST;
        const wx = this.histX[idx];
        const wy = this.histY[idx];
        const dx = wx - prevX;
        const dy = wy - prevY;
        const d = Math.hypot(dx, dy);
        if (d < 0.001) {
          hi++;
          continue;
        }
        if (d >= need) {
          const t = need / d;
          prevX += dx * t;
          prevY += dy * t;
          need = 0;
        } else {
          prevX = wx;
          prevY = wy;
          need -= d;
          hi++;
        }
      }
      this.segs[s].x = prevX - this.camera;
      this.segs[s].y = prevY;
    }
  }

  private emit(x: number, y: number, count: number, hue: number, kick: number) {
    let left = this.reduce ? Math.min(4, count) : count;
    for (const p of this.particles) {
      if (left <= 0) break;
      if (p.alive) continue;
      const a = Math.random() * Math.PI * 2;
      const s = kick * (0.25 + Math.random() * 0.75);
      p.alive = true;
      p.x = x + (Math.random() - 0.5) * 8;
      p.y = y + (Math.random() - 0.5) * 6;
      p.vx = Math.cos(a) * s * 0.4 - this.speed * 0.15;
      p.vy = Math.sin(a) * s * 0.35;
      p.life = 0.35 + Math.random() * 0.35;
      p.max = p.life;
      p.size = 2 + Math.random() * 3.2 * this.scale;
      p.hue = (hue + Math.random() * 50) % 360;
      p.grav = 40 + Math.random() * 80;
      left--;
    }
  }

  private floater(x: number, y: number, text: string) {
    const f = this.floaters.find((item) => !item.alive) ?? this.floaters[0];
    f.alive = true;
    f.x = x;
    f.y = y;
    f.text = text;
    f.life = 0.7;
    f.max = 0.7;
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  private updateFloaters(dt: number) {
    for (const f of this.floaters) {
      if (!f.alive) continue;
      f.life -= dt;
      if (f.life <= 0) f.alive = false;
    }
  }

  private bump(amount: number) {
    if (this.reduce) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  private pollPad() {
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    let down = false;
    for (const pad of pads) {
      if (!pad) continue;
      const b = pad.buttons;
      if (b[0]?.pressed || b[1]?.pressed || b[12]?.pressed) down = true;
    }
    if (down && !this.padWas) {
      this.padJump = true;
      this.notePress();
    } else if (!down && this.padWas) {
      this.padJump = false;
      if (!this.held()) this.noteRelease();
    }
    this.padWas = down;
    this.padJump = down;
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(280, rect.width || window.innerWidth);
    const h = Math.max(280, rect.height || window.innerHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.layout(w, h);
  }

  private layout(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.scale = Math.max(0.8, Math.min(1.4, Math.min(w, h) / 520));
    this.groundY = h * 0.78;
    this.headX = Math.max(72, Math.min(220, w * 0.2));
    this.radius = 22 * this.scale;
    this.hitR = this.radius * 0.52;
    this.spacing = this.radius * 0.78;
    this.segCount = Math.max(12, Math.min(18, Math.round(15 * this.scale)));
    const lead = Math.max(120, w - this.headX - 30);
    this.maxSpeed = Math.max(340, Math.min(760, lead / 0.78));
    this.baseSpeed = this.maxSpeed * 0.48;
    this.jumpH = Math.max(96, Math.min(210, Math.min(this.groundY * 0.42, h * 0.32)));
    this.jumpV = (4 * this.jumpH) / AIR;
    this.grav = (8 * this.jumpH) / (AIR * AIR);
    if (this.mode !== "play") {
      this.worm.y = this.groundY - this.radius;
      this.speed = this.baseSpeed;
    }
    if (this.histCount < 10) this.seedHistory();
  }

  private syncHud() {
    const score = this.mode === "menu" ? this.best : this.score;
    this.hud.score.textContent = String(this.mode === "menu" ? 0 : score);
    this.hud.best.textContent = String(this.mode === "play" || this.mode === "pause" ? this.bestAtStart : this.best);
    this.hud.stars.textContent = String(this.mode === "play" || this.mode === "pause" || this.mode === "dead" ? this.stars : 0);
  }

  private persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ best: this.best, mute: this.sfx.muted, version: 1 }));
    } catch {
      /* ignore quota */
    }
  }

  private draw() {
    const ctx = this.ctx2d;
    if (!ctx) return;
    const sh = this.reduce ? 0 : this.trauma * this.trauma;
    const ox = (hash(Math.floor(this.time * 50)) - 0.5) * 18 * sh;
    const oy = (hash(Math.floor(this.time * 46) + 3) - 0.5) * 12 * sh;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, ox * this.dpr, oy * this.dpr);
    drawWorld(ctx, {
      width: this.width,
      height: this.height,
      camera: this.camera,
      time: this.time,
      groundY: this.groundY,
      headX: this.headX,
      radius: this.radius,
      scale: this.scale,
      jumpH: this.jumpH,
      mode: this.mode,
      wormY: this.worm.y,
      wormVy: this.worm.vy,
      stretch: this.stretch,
      blink: this.blink,
      spin: this.spin,
      dead: this.mode === "dead",
      segs: this.segs,
      segCount: this.segCount,
      stars: this.starfield,
      obstacles: this.obstacles,
      pickups: this.pickups,
      particles: this.particles,
      floaters: this.floaters,
      flash: this.flash,
      speed: this.speed,
      maxSpeed: this.maxSpeed,
    });
  }
}

function fromUi(e: Event) {
  const t = e.target;
  return t instanceof Element && !!t.closest("[data-ui]");
}

function circleRect(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function makePts(kind: Kind, seed: number, w: number, h: number) {
  if (kind === "satellite") return [];
  const rnd = randMulberry(seed);
  if (kind === "crystal") {
    return [
      { x: 0, y: -h },
      { x: w * 0.42, y: -h * 0.18 },
      { x: w * 0.22, y: 0 },
      { x: -w * 0.28, y: 0 },
      { x: -w * 0.36, y: -h * (0.28 + rnd() * 0.15) },
    ];
  }
  const n = 6 + Math.floor(rnd() * 3);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const ang = Math.PI - t * Math.PI;
    const rad = 0.82 + rnd() * 0.28;
    pts.push({
      x: Math.cos(ang) * (w / 2) * rad,
      y: -Math.sin(ang) * h * (0.86 + rnd() * 0.18),
    });
  }
  return pts;
}
