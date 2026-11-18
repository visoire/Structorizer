// SPDX-License-Identifier: GPL-3.0-or-later
// iPadOS, Apple Pencil, Magic Keyboard, and Touch integration.
// Adapted from C:\xampp\htdocs\projects\artcraft\artcraft\iPadOS and OwlLuna (MIT).

export interface SphericalCoordinates {
  altitudeAngle: number; // radians [0, π/2]
  azimuthAngle: number;  // radians [0, 2π]
}

export interface CartesianTilt {
  tiltX: number; // degrees [-90, +90]
  tiltY: number; // degrees [-90, +90]
}

/** W3C Pointer Events Level 3 Spherical <-> Cartesian tilt conversion. */
export class TiltMathConverter {
  private static readonly RAD_TO_DEG = 180 / Math.PI;
  private static readonly DEG_TO_RAD = Math.PI / 180;

  public static toTilt(spherical: SphericalCoordinates): CartesianTilt {
    const { altitudeAngle, azimuthAngle } = spherical;
    let tiltXrad = 0;
    let tiltYrad = 0;

    if (altitudeAngle === 0) {
      if (azimuthAngle === 0 || azimuthAngle === 2 * Math.PI) tiltXrad = Math.PI / 2;
      else if (azimuthAngle === Math.PI / 2) tiltYrad = Math.PI / 2;
      else if (azimuthAngle === Math.PI) tiltXrad = -Math.PI / 2;
      else if (azimuthAngle === (3 * Math.PI) / 2) tiltYrad = -Math.PI / 2;
      else if (azimuthAngle > 0 && azimuthAngle < Math.PI / 2) {
        tiltXrad = Math.PI / 2;
        tiltYrad = Math.PI / 2;
      } else if (azimuthAngle > Math.PI / 2 && azimuthAngle < Math.PI) {
        tiltXrad = -Math.PI / 2;
        tiltYrad = Math.PI / 2;
      } else if (azimuthAngle > Math.PI && azimuthAngle < (3 * Math.PI) / 2) {
        tiltXrad = -Math.PI / 2;
        tiltYrad = -Math.PI / 2;
      } else if (azimuthAngle > (3 * Math.PI) / 2 && azimuthAngle < 2 * Math.PI) {
        tiltXrad = Math.PI / 2;
        tiltYrad = -Math.PI / 2;
      }
    } else {
      const tanAlt = Math.tan(altitudeAngle);
      tiltXrad = Math.atan(Math.cos(azimuthAngle) / tanAlt);
      tiltYrad = Math.atan(Math.sin(azimuthAngle) / tanAlt);
    }

    return {
      tiltX: Math.round(tiltXrad * this.RAD_TO_DEG),
      tiltY: Math.round(tiltYrad * this.RAD_TO_DEG),
    };
  }

  public static toSpherical(tilt: CartesianTilt): SphericalCoordinates {
    const tiltXrad = tilt.tiltX * this.DEG_TO_RAD;
    const tiltYrad = tilt.tiltY * this.DEG_TO_RAD;

    let azimuthAngle = 0;
    if (tilt.tiltX === 0) {
      if (tilt.tiltY > 0) azimuthAngle = Math.PI / 2;
      else if (tilt.tiltY < 0) azimuthAngle = (3 * Math.PI) / 2;
    } else if (tilt.tiltY === 0) {
      if (tilt.tiltX < 0) azimuthAngle = Math.PI;
    } else if (Math.abs(tilt.tiltX) === 90 || Math.abs(tilt.tiltY) === 90) {
      azimuthAngle = 0;
    } else {
      const tanX = Math.tan(tiltXrad);
      const tanY = Math.tan(tiltYrad);
      azimuthAngle = Math.atan2(tanY, tanX);
      if (azimuthAngle < 0) azimuthAngle += 2 * Math.PI;
    }

    let altitudeAngle = 0;
    if (Math.abs(tilt.tiltX) === 90 || Math.abs(tilt.tiltY) === 90) {
      altitudeAngle = 0;
    } else if (tilt.tiltX === 0) {
      altitudeAngle = Math.PI / 2 - Math.abs(tiltYrad);
    } else if (tilt.tiltY === 0) {
      altitudeAngle = Math.PI / 2 - Math.abs(tiltXrad);
    } else {
      altitudeAngle = Math.atan(
        1.0 / Math.sqrt(Math.pow(Math.tan(tiltXrad), 2) + Math.pow(Math.tan(tiltYrad), 2)),
      );
    }

    return { altitudeAngle, azimuthAngle };
  }
}

export interface HardwareCapabilities {
  hasHoverSupport: boolean;
  hasHardwarePressure: boolean;
  hasBarrelRollSupport: boolean;
  hasSqueezeSupport: boolean;
  devicePixelRatio: number;
  maxTouchPoints: number;
}

/** Runtime hardware feature detector for Apple Pencil generations and iPadOS devices. */
export class HardwareFeatureDetector {
  private static cachedCaps: HardwareCapabilities | null = null;
  private static observedPressureValues: number[] = [];

  public static getCapabilities(): HardwareCapabilities {
    if (this.cachedCaps) return this.cachedCaps;
    const hasHoverMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: hover)').matches || window.matchMedia('(any-hover: hover)').matches
      : false;
    const maxTouchPoints = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0;
    const devicePixelRatio = typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1;

    this.cachedCaps = {
      hasHoverSupport: hasHoverMedia,
      hasHardwarePressure: true,
      hasBarrelRollSupport: false,
      hasSqueezeSupport: false,
      devicePixelRatio,
      maxTouchPoints,
    };
    return this.cachedCaps;
  }

  public static inspectPointerEvent(e: {
    pointerType: string;
    pressure: number;
    twist?: number;
    tangentialPressure?: number;
    azimuthAngle?: number;
  }): {
    useSimulatedPressure: boolean;
    effectivePressure: number;
    effectiveAngleRad: number;
    isSqueeze: boolean;
  } {
    const caps = this.getCapabilities();
    if (e.pointerType === 'pen') {
      this.observedPressureValues.push(e.pressure);
      if (this.observedPressureValues.length > 15) this.observedPressureValues.shift();
      const allIdentical = this.observedPressureValues.length >= 10 &&
        this.observedPressureValues.every((val) => Math.abs(val - this.observedPressureValues[0]) < 0.001);
      caps.hasHardwarePressure = !allIdentical;
    }

    let effectiveAngleRad = 0;
    if (typeof e.twist === 'number' && e.twist !== 0) {
      caps.hasBarrelRollSupport = true;
      effectiveAngleRad = (e.twist * Math.PI) / 180;
    } else if (typeof e.azimuthAngle === 'number' && e.azimuthAngle !== 0) {
      effectiveAngleRad = e.azimuthAngle;
    }

    const isSqueeze = e.pointerType === 'pen' && typeof e.tangentialPressure === 'number' && e.tangentialPressure > 0.5;
    if (isSqueeze) caps.hasSqueezeSupport = true;

    return {
      useSimulatedPressure: !caps.hasHardwarePressure,
      effectivePressure: caps.hasHardwarePressure ? e.pressure : 0.5,
      effectiveAngleRad,
      isSqueeze,
    };
  }

  public static resetForTests(): void {
    this.cachedCaps = null;
    this.observedPressureValues = [];
  }
}

/** Extract 240 Hz coalesced pointer points when available in a Secure Context. */
export function getCoalescedPoints(e: { clientX: number; clientY: number; pressure?: number; getCoalescedEvents?: () => { clientX: number; clientY: number; pressure?: number }[] }): { x: number; y: number; pressure: number }[] {
  const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  const raw = list.length > 0 ? list : [e];
  return raw.map((pt) => ({ x: pt.clientX, y: pt.clientY, pressure: pt.pressure ?? 0.5 }));
}

/**
 * Port of OwlLuna's TouchRests & LoneFingerHold (StrokeHold.swift):
 * - Separates Apple Pencil ('pen') from finger ('touch') input.
 * - Rejects palm touches when the Pencil is on or just left the glass (`pencilIsNear`),
 *   or when a touch contact radius is wider than a fingertip (`palmDiameter = 44`).
 * - Recognizes 2-finger tap (Undo) and 3-finger tap (Redo) on the diagram desk.
 */
export class TouchArbitrator {
  public static readonly PALM_SIZE = 44;
  public static readonly PENCIL_NEAR_MS = 500;
  public static readonly MULTI_TAP_MAX_MS = 320;
  public static readonly MULTI_TAP_SLOP = 18;

  private activePenIds = new Set<number>();
  private lastPencilLiftMs = -Infinity;
  private multiTouch: {
    maxFingers: number;
    startMs: number;
    moved: boolean;
    origins: Map<number, { x: number; y: number }>;
  } | null = null;

  public pencilIsNear(nowMs = Date.now()): boolean {
    return this.activePenIds.size > 0 || nowMs - this.lastPencilLiftMs < TouchArbitrator.PENCIL_NEAR_MS;
  }

  public isPalmOrBlockedTouch(
    e: { pointerId: number; pointerType: string; width?: number; height?: number },
    nowMs = Date.now(),
  ): boolean {
    if (e.pointerType !== 'touch') return false;
    if (this.pencilIsNear(nowMs)) return true;
    if ((e.width ?? 0) > TouchArbitrator.PALM_SIZE || (e.height ?? 0) > TouchArbitrator.PALM_SIZE) return true;
    return false;
  }

  public onPointerDown(
    e: { pointerId: number; pointerType: string; clientX: number; clientY: number; width?: number; height?: number },
    nowMs = Date.now(),
  ): { reject: boolean } {
    if (e.pointerType === 'pen') {
      this.activePenIds.add(e.pointerId);
      this.multiTouch = null;
      return { reject: false };
    }
    if (this.isPalmOrBlockedTouch(e, nowMs)) {
      return { reject: true };
    }
    if (e.pointerType === 'touch') {
      if (!this.multiTouch) {
        this.multiTouch = {
          maxFingers: 1,
          startMs: nowMs,
          moved: false,
          origins: new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]]),
        };
      } else {
        this.multiTouch.origins.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.multiTouch.maxFingers = Math.max(this.multiTouch.maxFingers, this.multiTouch.origins.size);
      }
    }
    return { reject: false };
  }

  public onPointerMove(e: { pointerId: number; pointerType: string; clientX: number; clientY: number }): void {
    if (e.pointerType === 'touch' && this.multiTouch?.origins.has(e.pointerId)) {
      const orig = this.multiTouch.origins.get(e.pointerId)!;
      if (Math.hypot(e.clientX - orig.x, e.clientY - orig.y) > TouchArbitrator.MULTI_TAP_SLOP) {
        this.multiTouch.moved = true;
      }
    }
  }

  /**
   * Returns 'undo' on a clean 2-finger tap, 'redo' on a clean 3-finger tap, or null.
   */
  public onPointerUp(
    e: { pointerId: number; pointerType: string },
    nowMs = Date.now(),
  ): 'undo' | 'redo' | null {
    if (e.pointerType === 'pen') {
      this.activePenIds.delete(e.pointerId);
      this.lastPencilLiftMs = nowMs;
      return null;
    }
    if (e.pointerType === 'touch' && this.multiTouch) {
      this.multiTouch.origins.delete(e.pointerId);
      if (this.multiTouch.origins.size === 0) {
        const mt = this.multiTouch;
        this.multiTouch = null;
        const elapsed = nowMs - mt.startMs;
        if (!mt.moved && elapsed <= TouchArbitrator.MULTI_TAP_MAX_MS && !this.pencilIsNear(nowMs)) {
          if (mt.maxFingers === 2) return 'undo';
          if (mt.maxFingers === 3) return 'redo';
        }
      }
    }
    return null;
  }

  public onPointerCancel(e: { pointerId: number; pointerType: string }, nowMs = Date.now()): void {
    if (e.pointerType === 'pen') {
      this.activePenIds.delete(e.pointerId);
      this.lastPencilLiftMs = nowMs;
    }
    this.multiTouch = null;
  }
}

/**
 * OwlLuna InkDish geometry (Editor/InkDish.swift):
 * Places `count` wells evenly around a circle of radius `ring`, starting at the top (-π/2),
 * and clamps the dish centre so the full diameter stays inside the viewport.
 */
export const DishGeometry = {
  diameter: 248,
  ring: 92,
  well: 36,

  centre(
    point: { x: number; y: number },
    size: { width: number; height: number },
    margin = 12,
  ): { x: number; y: number } {
    const reach = this.diameter / 2 + margin;
    const x = Math.min(Math.max(point.x, reach), Math.max(size.width - reach, reach));
    const y = Math.min(Math.max(point.y, reach), Math.max(size.height - reach, reach));
    return { x, y };
  },

  wells(count: number): { x: number; y: number }[] {
    const n = Math.max(0, count);
    return Array.from({ length: n }, (_, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / n;
      return {
        x: Math.round(this.ring * Math.cos(angle) * 100) / 100,
        y: Math.round(this.ring * Math.sin(angle) * 100) / 100,
      };
    });
  },
};

/**
 * Adapts the root layout to Safari's `window.visualViewport` on iPadOS when the
 * on-screen virtual keyboard slides up (without a Magic Keyboard attached).
 */
export function bindVisualViewport(): () => void {
  if (typeof window === 'undefined' || !window.visualViewport) return () => {};
  const vv = window.visualViewport;
  const update = () => {
    const root = document.documentElement;
    root.style.setProperty('--vv-height', `${Math.round(vv.height)}px`);
    root.style.setProperty('--vv-offset-top', `${Math.round(vv.offsetTop)}px`);
  };
  update();
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
  };
}
