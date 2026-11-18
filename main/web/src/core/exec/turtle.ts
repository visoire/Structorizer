// SPDX-License-Identifier: GPL-3.0-or-later
// Turtleizer graphics controller state and built-in routines (ported from lu.fisch.turtle.TurtleBox).

export interface TurtleSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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
  bgColor: string;
  segments: TurtleSegment[];
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
    bgColor: '#ffffff',
    segments: [],
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
  'penup', 'pendown', 'up', 'down', 'gotoxy', 'gotox', 'gotoy',
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
    case 'hideturtle':
      state.visible = false;
      return { handled: true, result: null };
    case 'showturtle':
      state.visible = true;
      return { handled: true, result: null };
    case 'clear':
      state.segments = [];
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

/** Export the current Turtleizer drawing as standalone SVG markup. */
export function turtleToSvg(state: TurtleState): string {
  const xs = [state.homeX, state.x, ...state.segments.flatMap((s) => [s.x1, s.x2])];
  const ys = [state.homeY, state.y, ...state.segments.flatMap((s) => [s.y1, s.y2])];
  const minX = Math.floor(Math.min(0, ...xs) - 24);
  const minY = Math.floor(Math.min(0, ...ys) - 24);
  const maxX = Math.ceil(Math.max(500, ...xs) + 24);
  const maxY = Math.ceil(Math.max(500, ...ys) + 24);
  const w = Math.max(100, maxX - minX);
  const h = Math.max(100, maxY - minY);
  const lines = state.segments.map(
    (s) => `<line x1="${s.x1.toFixed(1)}" y1="${s.y1.toFixed(1)}" x2="${s.x2.toFixed(1)}" y2="${s.y2.toFixed(1)}" stroke="${s.color}" stroke-width="1.6" stroke-linecap="round"/>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">`,
    `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="${state.bgColor}"/>`,
    ...lines,
    '</svg>',
  ].join('\n');
}
