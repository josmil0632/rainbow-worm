export type Mode = "menu" | "play" | "pause" | "dead";

export type Kind = "pebble" | "boulder" | "crystal" | "satellite";

export type Obstacle = {
  active: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: Kind;
  seed: number;
  passed: boolean;
  pts: { x: number; y: number }[];
};

export type Pickup = {
  active: boolean;
  x: number;
  y: number;
  phase: number;
  r: number;
};

export type Particle = {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hue: number;
  grav: number;
};

export type Floater = {
  alive: boolean;
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
};

export type RunStats = {
  score: number;
  best: number;
  stars: number;
  near: number;
  distance: number;
  isNewBest: boolean;
};

export type StarSpec = {
  x: number;
  y: number;
  depth: number;
  size: number;
  tw: number;
};

export type WormSeg = { x: number; y: number };
