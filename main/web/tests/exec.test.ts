// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNsd } from '../src/core/io';
import { createDiagram, createElement, insertAt } from '../src/core/model';
import { executeDiagram, RuntimeError } from '../src/core/exec';

function runToEnd(diagram: ReturnType<typeof createDiagram>, opts: Parameters<typeof executeDiagram>[1] = {}) {
  const gen = executeDiagram(diagram, opts);
  let next = gen.next();
  while (!next.done) {
    next = gen.next();
  }
  return next.value;
}

describe('P2-04, P2-05, P2-08, P2-09: Executor, built-ins, multi-diagram pool, runtime analysis', () => {
  it('executes temperature.nsd end-to-end with queued inputs', () => {
    const xml = readFileSync(resolve(process.cwd(), 'src/examples/temperature.nsd'), 'utf8');
    const { diagram } = readNsd(xml);
    const res = runToEnd(diagram, { inputs: ['50', '32'] });
    expect(res.outputs).toEqual([
      '32 °F = 0 °C',
      '42 °F = 6 °C',
      '52 °F = 11 °C', // wait: 32 to 50 by 10 is 32, 42
    ].slice(0, 2));
    expect(res.execCounts.size).toBeGreaterThan(0);
    expect(res.covered.size).toBeGreaterThan(0);
  });

  it('executes all-elements.nsd covering IF, CASE, FOR, FOREACH, WHILE, REPEAT, PARALLEL, TRY/CATCH', () => {
    const xml = readFileSync(resolve(process.cwd(), 'src/examples/all-elements.nsd'), 'utf8');
    const { diagram } = readNsd(xml);
    const res = runToEnd(diagram, { inputs: ['2'] });
    expect(res.outputs).toEqual(['positive', '23', '1', '2', '3', 'oops']);
  });

  it('executes hilbert-3.nsd recursive subroutine and produces Turtleizer segments', () => {
    const xml = readFileSync(resolve(process.cwd(), 'src/examples/hilbert-3.nsd'), 'utf8');
    const { diagram } = readNsd(xml);
    const res = runToEnd(diagram, { pool: [diagram], args: [10, 2, 1] });
    expect(res.turtle.used).toBe(true);
    expect(res.turtle.segments.length).toBe(15); // 4^2 - 1 segments for level-2 Hilbert curve
  });

  it('supports extended Turtleizer routines (setPenWidth, circle, writeTurtle, home)', () => {
    let d = createDiagram('program');
    d = insertAt(
      d,
      { seq: { owner: 'root' }, index: 0 },
      createElement('instruction', [
        'setPenWidth(3.5)',
        'setPenColor("blue")',
        'forward(50)',
        'circle(20, 180)',
        'writeTurtle("Peak")',
        'home()',
      ]),
    );
    const res = runToEnd(d);
    expect(res.turtle.used).toBe(true);
    expect(res.turtle.penWidth).toBe(3.5);
    expect(res.turtle.segments[0].width).toBe(3.5);
    expect(res.turtle.labels).toEqual([{ x: res.turtle.labels[0].x, y: res.turtle.labels[0].y, text: 'Peak', color: '#2563eb' }]);
    expect(res.turtle.x).toBe(res.turtle.homeX);
    expect(res.turtle.y).toBe(res.turtle.homeY);
    expect(res.turtle.orientation).toBe(0);
  });

  it('evaluates built-ins, conversions (#530), typed declarations (#408), records, and subroutines (P2-08)', () => {
    let sub = createDiagram('sub');
    sub = { ...sub, text: ['square(x: int): int'] };
    sub = insertAt(sub, { seq: { owner: 'root' }, index: 0 }, createElement('jump', ['return x * x']));

    let main = createDiagram('program');
    main = insertAt(
      main,
      { seq: { owner: 'root' }, index: 0 },
      createElement('instruction', [
        'type Pt = record{x: int; y: int}',
        'var p <- Pt{x: strToInt("3"), y: strToInt("4")}',
        'var d: int <- round(sqrt(square(p.x) + square(p.y)))',
        'var s: string <- uppercase(copy("hello world", 1, 5))',
        'OUTPUT d, "-", pos("LO", s), "-", s',
      ]),
    );
    const res = runToEnd(main, { pool: [main, sub] });
    expect(res.outputs).toEqual(['5-4-HELLO']);
  });

  it('reports RuntimeError with offending elementId on division by zero or illegal leave', () => {
    let d = createDiagram('program');
    const bad = createElement('instruction', ['x <- 1 / 0']);
    d = insertAt(d, { seq: { owner: 'root' }, index: 0 }, bad);
    let caught: RuntimeError | null = null;
    try {
      runToEnd(d);
    } catch (err) {
      if (err instanceof RuntimeError) caught = err;
    }
    expect(caught).not.toBeNull();
    expect(caught?.elementId).toBe(bad.id);
  });
});
