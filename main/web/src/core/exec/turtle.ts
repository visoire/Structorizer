// SPDX-License-Identifier: GPL-3.0-or-later
// Turtleizer graphics controller state and built-in routines (ported from lu.fisch.turtle.TurtleBox).

export interface TurtleSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
}

export interface TurtleLabel {
  x: number;
  y: number;
  text: string;
  color: string;
}

export interface TurtleState {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  /** Orientation in degrees clockwise from North (0 = up, 90 = right). */
  orientation: number;
  penDown: boolean;
  visible: boolean;
  penColor: string;
  penWidth: number;
  bgColor: string;
  segments: TurtleSegment[];
  labels: TurtleLabel[];
  used: boolean;
}

export function createTurtleState(homeX = 250, homeY = 250): TurtleState {
  return {
    x: homeX,
    y: homeY,
    homeX,
    homeY,
    orientation: 0,
    penDown: true,
    visible: true,
    penColor: '#000000',
    penWidth: 1.8,
    bgColor: '#ffffff',
    segments: [],
    labels: [],
    used: false,
  };
}

const COLOR_MAP: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#dc2626',
  green: '#16a34a',
  blue: '#2563eb',
  yellow: '#eab308',
  cyan: '#06b6d4',
  magenta: '#d946ef',
  orange: '#f97316',
  pink: '#ec4899',
  purple: '#9333ea',
  brown: '#92400e',
  gray: '#6b7280',
  grey: '#6b7280',
};

function rgbHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.abs(Math.round(n))))
    .toString(16)
    .padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

function resolveColor(arg: unknown, fallback: string): string {
  if (typeof arg === 'string') {
    const s = arg.trim().toLowerCase();
    if (COLOR_MAP[s]) return COLOR_MAP[s];
    if (/^#?[0-9a-f]{6}$/i.test(s)) return s.startsWith('#') ? s : '#' + s;
  }
  return fallback;
}

const TURTLE_NAMES = new Set([
  'forward', 'backward', 'fd', 'bk', 'left', 'right', 'rl', 'rr',
  'penup', 'pendown', 'up', 'down', 'gotoxy', 'gotox', 'gotoy', 'home',
  'setheading', 'seth', 'setpenwidth', 'penwidth', 'circle', 'arc',
  'writeturtle', 'turtlewrite',
  'hideturtle', 'showturtle', 'clear', 'setpencolor', 'setbackgroundcolor', 'setbackground',
  'getorientation', 'getx', 'gety',
]);

export function isTurtleRoutine(name: string): boolean {
  const clean = name.trim().toLowerCase().replace(/^turtleizer\./, '');
  return TURTLE_NAMES.has(clean);
}

export function execTurtleRoutine(
  state: TurtleState,
  rawName: string,
  args: unknown[],
): { handled: boolean; result: number | null } {
  const name = rawName.trim().toLowerCase().replace(/^turtleizer\./, '');
  if (!TURTLE_NAMES.has(name)) return { handled: false, result: null };
  state.used = true;
  const num = (v: unknown, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };

  const move = (dist: number, snapInt: boolean, colorOverride?: unknown) => {
    const rad = (state.orientation * Math.PI) / 180;
    const x1 = state.x;
    const y1 = state.y;
    let x2 = x1 + Math.sin(rad) * dist;
    let y2 = y1 - Math.cos(rad) * dist;
    if (snapInt) {
      x2 = Math.round(x2);
      y2 = Math.round(y2);
    }
    state.x = x2;
    state.y = y2;
    if (state.penDown) {
      state.segments.push({
        x1,
        y1,
        x2,
        y2,
        color: colorOverride !== undefined ? resolveColor(colorOverride, state.penColor) : state.penColor,
        width: state.penWidth,
      });
    }
  };

  switch (name) {
    case 'forward':
      move(num(args[0]), false, args[1]);
      return { handled: true, result: null };
    case 'backward':
      move(-num(args[0]), false, args[1]);
      return { handled: true, result: null };
    case 'fd':
      move(Math.round(num(args[0])), true, args[1]);
      return { handled: true, result: null };
    case 'bk':
      move(-Math.round(num(args[0])), true, args[1]);
      return { handled: true, result: null };
    case 'right':
    case 'rr':
      state.orientation = ((state.orientation + num(args[0])) % 360 + 360) % 360;
      return { handled: true, result: null };
    case 'left':
    case 'rl':
      state.orientation = ((state.orientation - num(args[0])) % 360 + 360) % 360;
      return { handled: true, result: null };
    case 'setheading':
    case 'seth':
      state.orientation = ((num(args[0]) % 360) + 360) % 360;
      return { handled: true, result: null };
    case 'penup':
    case 'up':
      state.penDown = false;
      return { handled: true, result: null };
    case 'pendown':
    case 'down':
      state.penDown = true;
      return { handled: true, result: null };
    case 'gotoxy':
      state.x = Math.round(num(args[0], state.x));
      state.y = Math.round(num(args[1], state.y));
      return { handled: true, result: null };
    case 'gotox':
      state.x = Math.round(num(args[0], state.x));
      return { handled: true, result: null };
    case 'gotoy':
      state.y = Math.round(num(args[0], state.y));
      return { handled: true, result: null };
    case 'home':
      if (state.penDown && (state.x !== state.homeX || state.y !== state.homeY)) {
        state.segments.push({
          x1: state.x,
          y1: state.y,
          x2: state.homeX,
          y2: state.homeY,
          color: state.penColor,
          width: state.penWidth,
        });
      }
      state.x = state.homeX;
      state.y = state.homeY;
      state.orientation = 0;
      return { handled: true, result: null };
    case 'setpenwidth':
    case 'penwidth':
      state.penWidth = Math.max(0.5, Math.min(32, num(args[0], 1.8)));
      return { handled: true, result: null };
    case 'circle':
    case 'arc': {
      const r = num(args[0], 50);
      const extent = args[1] !== undefined ? num(args[1], 360) : 360;
      const steps = Math.max(12, Math.min(72, Math.round(Math.abs(extent) / 5)));
      const stepAngle = extent / steps;
      const stepLen = (2 * Math.PI * Math.abs(r) * (Math.abs(extent) / 360)) / steps;
      const sign = r >= 0 ? 1 : -1;
      for (let i = 0; i < steps; i++) {
        state.orientation = ((state.orientation + sign * (stepAngle / 2)) % 360 + 360) % 360;
        move(stepLen, false);
        state.orientation = ((state.orientation + sign * (stepAngle / 2)) % 360 + 360) % 360;
      }
      return { handled: true, result: null };
    }
    case 'writeturtle':
    case 'turtlewrite':
      state.labels.push({
        x: state.x,
        y: state.y,
        text: String(args[0] ?? ''),
        color: state.penColor,
      });
      return { handled: true, result: null };
    case 'hideturtle':
      state.visible = false;
      return { handled: true, result: null };
    case 'showturtle':
      state.visible = true;
      return { handled: true, result: null };
    case 'clear':
      state.segments = [];
      state.labels = [];
      return { handled: true, result: null };
    case 'setpencolor':
      if (args.length >= 3) state.penColor = rgbHex(num(args[0]), num(args[1]), num(args[2]));
      else if (args.length === 1) state.penColor = resolveColor(args[0], state.penColor);
      return { handled: true, result: null };
    case 'setbackgroundcolor':
    case 'setbackground':
      if (args.length >= 3) state.bgColor = rgbHex(num(args[0]), num(args[1]), num(args[2]));
      else if (args.length === 1) state.bgColor = resolveColor(args[0], state.bgColor);
      return { handled: true, result: null };
    case 'getx':
      return { handled: true, result: Math.round(state.x * 100) / 100 };
    case 'gety':
      return { handled: true, result: Math.round(state.y * 100) / 100 };
    case 'getorientation':
      return { handled: true, result: Math.round(state.orientation * 100) / 100 };
    default:
      return { handled: false, result: null };
  }
}

export function turtleBounds(state: TurtleState): { minX: number; minY: number; vw: number; vh: number } {
  const xs = [state.homeX, state.x, ...state.segments.flatMap((s) => [s.x1, s.x2]), ...state.labels.map((l) => l.x)];
  const ys = [state.homeY, state.y, ...state.segments.flatMap((s) => [s.y1, s.y2]), ...state.labels.map((l) => l.y)];
  const minX = Math.floor(Math.min(0, ...xs) - 24);
  const minY = Math.floor(Math.min(0, ...ys) - 24);
  const maxX = Math.ceil(Math.max(500, ...xs) + 24);
  const maxY = Math.ceil(Math.max(500, ...ys) + 24);
  return {
    minX,
    minY,
    vw: Math.max(200, maxX - minX),
    vh: Math.max(200, maxY - minY),
  };
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Export the current Turtleizer drawing as standalone SVG markup. */
export function turtleToSvg(state: TurtleState): string {
  const { minX, minY, vw: w, vh: h } = turtleBounds(state);
  const lines = state.segments.map(
    (s) => `<line x1="${s.x1.toFixed(1)}" y1="${s.y1.toFixed(1)}" x2="${s.x2.toFixed(1)}" y2="${s.y2.toFixed(1)}" stroke="${s.color}" stroke-width="${(s.width ?? 1.8).toFixed(1)}" stroke-linecap="round"/>`,
  );
  const texts = state.labels.map(
    (l) => `<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" fill="${l.color}" font-family="sans-serif" font-size="12">${escXml(l.text)}</text>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">`,
    `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="${state.bgColor}"/>`,
    ...lines,
    ...texts,
    '</svg>',
  ].join('\n');
}
