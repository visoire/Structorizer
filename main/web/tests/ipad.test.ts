import { describe, expect, it, beforeEach } from 'vitest';
import {
  DishGeometry,
  getCoalescedPoints,
  HardwareFeatureDetector,
  TiltMathConverter,
  TouchArbitrator,
} from '../src/ui/ipad';

describe('iPadOS & Apple Pencil integration', () => {
  beforeEach(() => {
    HardwareFeatureDetector.resetForTests();
  });

  it('converts W3C spherical altitude/azimuth and cartesian tiltX/tiltY', () => {
    const upright = TiltMathConverter.toTilt({ altitudeAngle: Math.PI / 2, azimuthAngle: 0 });
    expect(upright).toEqual({ tiltX: 0, tiltY: 0 });

    const tilted = { tiltX: 30, tiltY: -20 };
    const sph = TiltMathConverter.toSpherical(tilted);
    const back = TiltMathConverter.toTilt(sph);
    expect(back.tiltX).toBeCloseTo(30, 0);
    expect(back.tiltY).toBeCloseTo(-20, 0);
  });

  it('detects Apple Pencil hardware pressure vs constant 0.5 USB-C Pencil fallback, twist and squeeze', () => {
    // 10 identical 0.5 readings -> USB-C Pencil without pressure sensor
    for (let i = 0; i < 10; i++) {
      HardwareFeatureDetector.inspectPointerEvent({ pointerType: 'pen', pressure: 0.5 });
    }
    const usbC = HardwareFeatureDetector.inspectPointerEvent({ pointerType: 'pen', pressure: 0.5 });
    expect(usbC.useSimulatedPressure).toBe(true);

    // Varying pressure readings + Apple Pencil Pro barrel roll + squeeze
    const pro = HardwareFeatureDetector.inspectPointerEvent({
      pointerType: 'pen',
      pressure: 0.78,
      twist: 90,
      tangentialPressure: 0.8,
    });
    expect(pro.useSimulatedPressure).toBe(false);
    expect(pro.effectivePressure).toBeCloseTo(0.78, 2);
    expect(pro.effectiveAngleRad).toBeCloseTo(Math.PI / 2, 3);
    expect(pro.isSqueeze).toBe(true);
  });

  it('extracts 240 Hz coalesced events when available', () => {
    const pts = getCoalescedPoints({
      clientX: 30,
      clientY: 40,
      pressure: 0.6,
      getCoalescedEvents: () => [
        { clientX: 10, clientY: 20, pressure: 0.4 },
        { clientX: 20, clientY: 30, pressure: 0.5 },
        { clientX: 30, clientY: 40, pressure: 0.6 },
      ],
    });
    expect(pts.length).toBe(3);
    expect(pts[0]).toEqual({ x: 10, y: 20, pressure: 0.4 });
    expect(pts[2]).toEqual({ x: 30, y: 40, pressure: 0.6 });
  });

  it('rejects palm touches and finger touches while Apple Pencil is active or recently lifted', () => {
    const arb = new TouchArbitrator();
    // Wide palm contact is rejected immediately
    expect(
      arb.onPointerDown({ pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, width: 60, height: 60 }, 1000).reject,
    ).toBe(true);

    // Apple Pencil touches down at t=1000
    expect(
      arb.onPointerDown({ pointerId: 2, pointerType: 'pen', clientX: 200, clientY: 200 }, 1000).reject,
    ).toBe(false);

    // Finger touch while Pencil is down is rejected
    expect(
      arb.onPointerDown({ pointerId: 3, pointerType: 'touch', clientX: 210, clientY: 210, width: 12, height: 12 }, 1100).reject,
    ).toBe(true);

    // Pencil lifts at t=1200; finger touch at t=1500 (< 500ms window) is still rejected
    arb.onPointerUp({ pointerId: 2, pointerType: 'pen' }, 1200);
    expect(
      arb.onPointerDown({ pointerId: 4, pointerType: 'touch', clientX: 210, clientY: 210, width: 12, height: 12 }, 1500).reject,
    ).toBe(true);

    // Finger touch at t=1800 (> 500ms after Pencil lift) is accepted
    expect(
      arb.onPointerDown({ pointerId: 5, pointerType: 'touch', clientX: 210, clientY: 210, width: 12, height: 12 }, 1800).reject,
    ).toBe(false);
    arb.onPointerUp({ pointerId: 5, pointerType: 'touch' }, 1850);
  });

  it('recognizes 2-finger tap for Undo and 3-finger tap for Redo (OwlLuna FingerTap)', () => {
    const arb = new TouchArbitrator();
    // 2-finger tap
    arb.onPointerDown({ pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }, 2000);
    arb.onPointerDown({ pointerId: 2, pointerType: 'touch', clientX: 140, clientY: 100 }, 2010);
    expect(arb.onPointerUp({ pointerId: 1, pointerType: 'touch' }, 2100)).toBeNull();
    expect(arb.onPointerUp({ pointerId: 2, pointerType: 'touch' }, 2110)).toBe('undo');

    // 3-finger tap
    arb.onPointerDown({ pointerId: 10, pointerType: 'touch', clientX: 100, clientY: 100 }, 3000);
    arb.onPointerDown({ pointerId: 11, pointerType: 'touch', clientX: 140, clientY: 100 }, 3005);
    arb.onPointerDown({ pointerId: 12, pointerType: 'touch', clientX: 180, clientY: 100 }, 3010);
    arb.onPointerUp({ pointerId: 10, pointerType: 'touch' }, 3100);
    arb.onPointerUp({ pointerId: 11, pointerType: 'touch' }, 3105);
    expect(arb.onPointerUp({ pointerId: 12, pointerType: 'touch' }, 3110)).toBe('redo');
  });

  it('computes OwlLuna InkDish well positions and clamps centre inside viewport', () => {
    const wells = DishGeometry.wells(11);
    expect(wells.length).toBe(11);
    // First well is at the top (0, -ring)
    expect(wells[0].x).toBeCloseTo(0, 1);
    expect(wells[0].y).toBeCloseTo(-DishGeometry.ring, 1);

    const clamped = DishGeometry.centre({ x: 5, y: 5 }, { width: 800, height: 600 });
    expect(clamped.x).toBeGreaterThanOrEqual(DishGeometry.diameter / 2);
    expect(clamped.y).toBeGreaterThanOrEqual(DishGeometry.diameter / 2);
  });
});
