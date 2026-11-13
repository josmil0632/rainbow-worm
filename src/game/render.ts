import type { Floater, Obstacle, Particle, Pickup, StarSpec, WormSeg } from "./types";

export type DrawState = {
  width: number;
  height: number;
  camera: number;
  time: number;
  groundY: number;
  headX: number;
  radius: number;
  scale: number;
  jumpH: number;
  mode: string;
  wormY: number;
  wormVy: number;
  stretch: number;
  blink: number;
  spin: number;
  dead: boolean;
  segs: WormSeg[];
  segCount: number;
  stars: StarSpec[];
  obstacles: Obstacle[];
  pickups: Pickup[];
  particles: Particle[];
  floaters: Floater[];
  flash: number;
  speed: number;
  maxSpeed: number;
};

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function drawWorld(ctx: CanvasRenderingContext2D, g: DrawState) {
  const { width: w, height: h } = g;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#120a22");
  sky.addColorStop(0.45, "#0b0716");
  sky.addColorStop(1, "#07060e");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  drawNebula(ctx, g);
  drawWormhole(ctx, g);
  drawStars(ctx, g);
  if (g.speed > g.maxSpeed * 0.72 && g.mode === "play") drawStreaks(ctx, g);
  drawGround(ctx, g);
  for (const o of g.obstacles) if (o.active) drawObstacle(ctx, g, o);
  for (const p of g.pickups) if (p.active) drawStarPickup(ctx, g, p);
  drawParticles(ctx, g);
  drawShadow(ctx, g);
  drawWorm(ctx, g);
  drawFloaters(ctx, g);
  drawVignette(ctx, w, h);
  if (g.flash > 0.01) {
    ctx.fillStyle = `rgba(255, 236, 214, ${Math.min(0.7, g.flash)})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawNebula(ctx: CanvasRenderingContext2D, g: DrawState) {
  const blobs = [
    { x: 0.18, y: 0.22, r: 0.42, c: "rgba(90, 40, 140, 0.28)", d: 0.08 },
    { x: 0.78, y: 0.18, r: 0.36, c: "rgba(20, 70, 110, 0.26)", d: 0.12 },
    { x: 0.55, y: 0.62, r: 0.4, c: "rgba(120, 30, 70, 0.12)", d: 0.05 },
  ];
  for (const b of blobs) {
    const scroll = (g.camera * b.d) % (g.width + 200);
    const x = ((b.x * g.width - scroll) % (g.width + 180) + g.width + 180) % (g.width + 180) - 40;
    const y = b.y * g.height;
    const r = b.r * Math.max(g.width, g.height);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, b.c);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, g.width, g.height);
  }
}

function drawWormhole(ctx: CanvasRenderingContext2D, g: DrawState) {
  const x = g.width * 0.74 - (g.camera * 0.04) % 80;
  const y = g.height * 0.26;
  const rx = Math.min(g.width, g.height) * 0.16;
  const ry = rx * 0.42;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(g.time * 0.15);
  for (let i = 3; i >= 0; i--) {
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * (0.55 + i * 0.18), ry * (0.55 + i * 0.18), 0, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${(g.time * 40 + i * 40) % 360}, 90%, 68%, ${0.18 - i * 0.03})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

function drawStars(ctx: CanvasRenderingContext2D, g: DrawState) {
  for (const s of g.stars) {
    const scroll = g.camera * s.depth + g.time * 8 * s.depth;
    const x = ((s.x * g.width - scroll) % g.width + g.width) % g.width;
    const y = s.y * (g.groundY - 8);
    const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(g.time * 2.2 + s.tw));
    ctx.globalAlpha = tw;
    ctx.fillStyle = s.depth > 0.7 ? "#fff6e4" : "#c9c2dc";
    ctx.fillRect(x, y, s.size, s.size);
  }
  ctx.globalAlpha = 1;
}

function drawStreaks(ctx: CanvasRenderingContext2D, g: DrawState) {
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = "#efe8ff";
  ctx.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    const y = hash(i + 4) * g.groundY;
    const x = ((hash(i + 9) * g.width - g.time * (180 + i * 30) - g.camera * 0.2) % g.width + g.width) % g.width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 18 + (i % 4) * 8, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawGround(ctx: CanvasRenderingContext2D, g: DrawState) {
  const y = g.groundY;
  const band = ctx.createLinearGradient(0, y - 40, 0, g.height);
  band.addColorStop(0, "rgba(122, 92, 255, 0)");
  band.addColorStop(0.12, "rgba(88, 54, 170, 0.22)");
  band.addColorStop(0.45, "rgba(28, 16, 58, 0.35)");
  band.addColorStop(1, "rgba(7, 6, 14, 0)");
  ctx.fillStyle = band;
  ctx.fillRect(0, y - 36, g.width, g.height - y + 36);

  const heat = Math.min(1, g.speed / Math.max(1, g.maxSpeed));
  traceRibbon(ctx, g, y, 0);
  ctx.strokeStyle = `rgba(255, 211, 106, ${0.55 + heat * 0.4})`;
  ctx.lineWidth = 2.25;
  ctx.stroke();

  traceRibbon(ctx, g, y + 5, 1.4);
  ctx.strokeStyle = `rgba(126, 240, 255, ${0.28 + heat * 0.35})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 14; i++) {
    const span = 90;
    const x = ((i * span - g.camera * (1.15 + (i % 3) * 0.05)) % (g.width + span) + g.width + span) % (g.width + span) - 20;
    const yy = y + 10 + Math.sin(g.time * 2 + i) * 4;
    ctx.fillStyle = i % 2 === 0 ? "#ffd36a" : "#7ef0ff";
    ctx.beginPath();
    ctx.arc(x, yy, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function traceRibbon(ctx: CanvasRenderingContext2D, g: DrawState, y: number, phase: number) {
  ctx.beginPath();
  for (let x = 0; x <= g.width; x += 8) {
    const yy = y + Math.sin(x * 0.018 + g.time * 1.8 + g.camera * 0.012 + phase) * 4.5;
    if (x === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, g: DrawState, o: Obstacle) {
  const x = o.x - g.camera;
  if (x > g.width + 40 || x + o.w < -40) return;
  if (o.kind === "crystal") drawCrystal(ctx, x, g.groundY, o);
  else if (o.kind === "satellite") drawSatellite(ctx, x, g.groundY, o, g.time);
  else drawRock(ctx, x, g.groundY, o);
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, ground: number, o: Obstacle) {
  const cx = x + o.w / 2;
  const tint = o.kind === "boulder" ? 28 : 18;
  ctx.beginPath();
  const pts = o.pts;
  for (let i = 0; i < pts.length; i++) {
    const px = cx + pts[i].x;
    const py = ground + pts[i].y;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const grad = ctx.createLinearGradient(cx, ground - o.h, cx, ground);
  grad.addColorStop(0, `rgb(${118 + tint}, ${108 + tint}, ${138 + tint})`);
  grad.addColorStop(0.45, `rgb(${64 + tint}, ${56 + tint}, ${84})`);
  grad.addColorStop(1, "#1a1626");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 230, 190, 0.28)";
  ctx.lineWidth = 1.25;
  ctx.stroke();

  const rnd = mulberry(o.seed + 9);
  for (let i = 0; i < 3; i++) {
    const px = cx + (rnd() - 0.5) * o.w * 0.5;
    const py = ground - o.h * (0.25 + rnd() * 0.45);
    ctx.fillStyle = "rgba(10, 8, 16, 0.35)";
    ctx.beginPath();
    ctx.ellipse(px, py, o.w * 0.08, o.h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCrystal(ctx: CanvasRenderingContext2D, x: number, ground: number, o: Obstacle) {
  const cx = x + o.w / 2;
  ctx.beginPath();
  for (let i = 0; i < o.pts.length; i++) {
    const px = cx + o.pts[i].x;
    const py = ground + o.pts[i].y;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const grad = ctx.createLinearGradient(cx, ground - o.h, cx + o.w, ground);
  grad.addColorStop(0, "#e8fbff");
  grad.addColorStop(0.35, "#7ef0ff");
  grad.addColorStop(0.7, "#c9b6ff");
  grad.addColorStop(1, "#ff5d9a");
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.92;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, ground - o.h * 0.92);
  ctx.lineTo(cx + o.w * 0.12, ground - o.h * 0.2);
  ctx.lineTo(cx - o.w * 0.06, ground - o.h * 0.15);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.fill();
}

function drawSatellite(
  ctx: CanvasRenderingContext2D,
  x: number,
  ground: number,
  o: Obstacle,
  time: number,
) {
  const base = ground - o.h * 0.15;
  const bodyW = o.w * 0.34;
  const bodyH = o.h * 0.55;
  const bx = x + o.w / 2 - bodyW / 2;
  const by = base - bodyH;
  ctx.fillStyle = "#8fd0ff";
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x, by + bodyH * 0.25, o.w * 0.28, bodyH * 0.28);
  ctx.fillRect(x + o.w * 0.72, by + bodyH * 0.25, o.w * 0.28, bodyH * 0.28);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(180, 220, 255, 0.7)";
  ctx.strokeRect(x, by + bodyH * 0.25, o.w * 0.28, bodyH * 0.28);
  ctx.strokeRect(x + o.w * 0.72, by + bodyH * 0.25, o.w * 0.28, bodyH * 0.28);

  roundRect(ctx, bx, by, bodyW, bodyH, 6);
  const grad = ctx.createLinearGradient(bx, by, bx, by + bodyH);
  grad.addColorStop(0, "#d7dde8");
  grad.addColorStop(1, "#5c6478");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = "#ffd36a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(bx + bodyW / 2, by - o.h * 0.08, o.h * 0.22, Math.PI, 0);
  ctx.stroke();

  const blink = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 6 + o.seed));
  ctx.fillStyle = `rgba(255, 93, 122, ${blink})`;
  ctx.beginPath();
  ctx.arc(bx + bodyW - 6, by + 7, 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#3a4154";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + o.w / 2, base);
  ctx.lineTo(x + o.w / 2, ground);
  ctx.stroke();
}

function drawStarPickup(ctx: CanvasRenderingContext2D, g: DrawState, p: Pickup) {
  const x = p.x - g.camera;
  if (x < -30 || x > g.width + 30) return;
  const y = p.y + Math.sin(g.time * 4 + p.phase) * 5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(g.time * 1.6 + p.phase);
  ctx.shadowColor = "rgba(255, 211, 106, 0.85)";
  ctx.shadowBlur = 12;
  starPath(ctx, 0, 0, p.r, 0);
  ctx.fillStyle = "#ffd36a";
  ctx.fill();
  ctx.shadowBlur = 0;
  starPath(ctx, 0, 0, p.r * 0.45, 0.4);
  ctx.fillStyle = "#fff6dd";
  ctx.fill();
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, g: DrawState) {
  for (const p of g.particles) {
    if (!p.alive) continue;
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a;
    ctx.fillStyle = `hsl(${p.hue}, 95%, 64%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawShadow(ctx: CanvasRenderingContext2D, g: DrawState) {
  const alt = Math.max(0, g.groundY - g.radius - g.wormY) / Math.max(1, g.jumpH);
  const a = Math.max(0.05, 0.38 - alt * 0.32);
  const sx = g.radius * (1.15 - alt * 0.45);
  ctx.fillStyle = `rgba(0, 0, 0, ${a})`;
  ctx.beginPath();
  ctx.ellipse(g.headX, g.groundY + 2, sx, g.radius * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawWorm(ctx: CanvasRenderingContext2D, g: DrawState) {
  const segs = g.segs;
  const n = g.segCount;
  if (n < 2) return;
  const headR = g.radius;
  const hueBase = g.time * 80;

  ctx.beginPath();
  ctx.moveTo(segs[n - 1].x, segs[n - 1].y);
  for (let i = n - 2; i >= 0; i--) ctx.lineTo(segs[i].x, segs[i].y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(8, 4, 16, 0.45)";
  ctx.lineWidth = headR * 1.45;
  ctx.stroke();

  for (let i = n - 1; i >= 1; i--) {
    const t = i / (n - 1);
    const r = headR * (1.05 - t * 0.62);
    const hue = (hueBase + (1 - t) * 300) % 360;
    const wob = g.dead ? 0 : Math.sin(g.time * 7 - i * 0.55) * r * 0.06;
    const x = segs[i].x;
    const y = segs[i].y + wob;
    ctx.fillStyle = `hsla(${hue}, 95%, 62%, 0.28)`;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `hsl(${hue}, 92%, ${60 - t * 12}%)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `hsla(${hue}, 100%, 90%, 0.7)`;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.28, y - r * 0.32, r * 0.26, r * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const head = segs[0];
  const hue = hueBase % 360;
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(g.dead ? g.spin : Math.atan2(g.wormVy, 900) * 0.35);
  ctx.scale(1 / g.stretch, g.stretch);

  const flap = 0.4 + Math.abs(Math.sin(g.time * (g.mode === "play" ? 16 : 8))) * 0.75;
  ctx.fillStyle = `hsla(${(hue + 40) % 360}, 100%, 70%, 0.32)`;
  ctx.beginPath();
  ctx.ellipse(-headR * 0.15, -headR * 0.05, headR * 1.15, headR * 0.38 * flap, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-headR * 0.05, headR * 0.28, headR * 0.9, headR * 0.28 * flap, 0.55, 0, Math.PI * 2);
  ctx.fill();

  const grd = ctx.createRadialGradient(-headR * 0.35, -headR * 0.4, headR * 0.15, 0, 0, headR);
  grd.addColorStop(0, `hsl(${hue}, 100%, 82%)`);
  grd.addColorStop(0.55, `hsl(${hue}, 95%, 60%)`);
  grd.addColorStop(1, `hsl(${(hue + 24) % 360}, 90%, 40%)`);
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(0, 0, headR, 0, Math.PI * 2);
  ctx.fill();

  drawAntenna(ctx, headR, hue, -0.7, g.time);
  drawAntenna(ctx, headR, (hue + 50) % 360, 0.15, g.time + 0.4);

  const blink = g.blink > 0 ? Math.max(0.08, 1 - g.blink * 8) : 1;
  const look = Math.max(-1, Math.min(1, -g.wormVy / 700));
  drawEye(ctx, headR * 0.12, -headR * 0.12, headR * 0.34, blink, g.dead, look);
  drawEye(ctx, headR * 0.48, -headR * 0.02, headR * 0.28, blink, g.dead, look);

  ctx.fillStyle = "rgba(255, 140, 170, 0.45)";
  ctx.beginPath();
  ctx.ellipse(-headR * 0.05, headR * 0.22, headR * 0.16, headR * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(50, 16, 28, 0.75)";
  ctx.lineWidth = Math.max(1.25, headR * 0.07);
  ctx.lineCap = "round";
  ctx.beginPath();
  if (g.dead) {
    ctx.moveTo(headR * 0.05, headR * 0.32);
    ctx.lineTo(headR * 0.4, headR * 0.32);
  } else {
    ctx.arc(headR * 0.18, headR * 0.18, headR * 0.26, 0.2, Math.PI - 0.35);
  }
  ctx.stroke();
  ctx.restore();
}

function drawAntenna(
  ctx: CanvasRenderingContext2D,
  r: number,
  hue: number,
  ang: number,
  time: number,
) {
  const sway = Math.sin(time * 5) * 0.18;
  ctx.strokeStyle = `hsl(${hue}, 90%, 70%)`;
  ctx.lineWidth = Math.max(1.4, r * 0.07);
  ctx.beginPath();
  ctx.moveTo(r * 0.1, -r * 0.7);
  ctx.quadraticCurveTo(r * (0.2 + ang), -r * 1.15, r * (0.15 + ang + sway), -r * 1.45);
  ctx.stroke();
  ctx.fillStyle = `hsl(${(hue + 30) % 360}, 100%, 72%)`;
  ctx.beginPath();
  ctx.arc(r * (0.15 + ang + sway), -r * 1.45, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  blink: number,
  dead: boolean,
  look: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, blink);
  if (dead) {
    ctx.strokeStyle = "#241018";
    ctx.lineWidth = Math.max(1.5, r * 0.28);
    ctx.beginPath();
    ctx.moveTo(-r, -r);
    ctx.lineTo(r, r);
    ctx.moveTo(r, -r);
    ctx.lineTo(-r, r);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#fffaf4";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1020";
    ctx.beginPath();
    ctx.arc(r * 0.2, r * 0.15 + look * r * 0.35, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-r * 0.15, -r * 0.25, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFloaters(ctx: CanvasRenderingContext2D, g: DrawState) {
  ctx.font = `700 ${Math.round(16 * g.scale)}px Outfit, ui-sans-serif, sans-serif`;
  ctx.textAlign = "center";
  for (const f of g.floaters) {
    if (!f.alive) continue;
    const a = Math.max(0, f.life / f.max);
    const t = 1 - a;
    ctx.globalAlpha = a;
    ctx.fillStyle = "#ffd36a";
    ctx.fillText(f.text, f.x, f.y - t * 28);
  }
  ctx.globalAlpha = 1;
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const v = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.25, w / 2, h * 0.5, h * 0.78);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = rot + (i * Math.PI * 2) / 5 - Math.PI / 2;
    const b = a + Math.PI / 5;
    const ox = x + Math.cos(a) * r;
    const oy = y + Math.sin(a) * r;
    const ix = x + Math.cos(b) * r * 0.42;
    const iy = y + Math.sin(b) * r * 0.42;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
