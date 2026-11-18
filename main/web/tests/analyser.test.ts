// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createDiagram, createElement } from '../src/core/model/factory';
import { analyseDiagram } from '../src/core/lang/analyser';
import { formatArr, parseArr, readArrz, writeArrz } from '../src/core/io/arranger';
import { generateCode } from '../src/core/gen/generators';

describe('Phase 3: Static Analyser, Arranger (.arr/.arrz) & Turtleizer Code Export', () => {
  it('detects A01..A09 static analysis findings and respects i++ loop modification (#1081)', () => {
    const d = createDiagram('sub');
    d.text = ['compute(n): int'];
    d.includeList = ['MissingDefs'];
    const emptyInst = createElement('instruction', ['']);
    const uninitInst = createElement('instruction', ['y <- x + 1']);
    const constInst = createElement('instruction', ['const K <- 10', 'K <- 20']);
    const forEl = createElement('for', ['for i <- 1 to 5']);
    if (forEl.kind === 'for') {
      forEl.body.push(createElement('instruction', ['i <- 3']));
    }
    const endlessWhile = createElement('while', ['while (n > 0)']);
    if (endlessWhile.kind === 'while') {
      endlessWhile.body.push(createElement('instruction', ['write n']));
    }
    const safeWhile = createElement('while', ['while (n > 0)']);
    if (safeWhile.kind === 'while') {
      safeWhile.body.push(createElement('instruction', ['n--']));
    }
    d.children.push(emptyInst, uninitInst, constInst, forEl, endlessWhile, safeWhile);

    const findings = analyseDiagram(d, []);
    const codes = new Set(findings.map((f) => f.code));
    expect(codes.has('A01')).toBe(true); // empty instruction
    expect(codes.has('A02')).toBe(true); // x used before init
    expect(codes.has('A03')).toBe(true); // loop counter i modified
    expect(codes.has('A04')).toBe(true); // endlessWhile has A04
    expect(codes.has('A05')).toBe(true); // constant K reassigned
    expect(codes.has('A08')).toBe(true); // function does not assign return value
    expect(codes.has('A09')).toBe(true); // MissingDefs not in pool

    // Verify safeWhile (which uses n--) is NOT flagged with A04 (#1081)
    const a04Ids = findings.filter((f) => f.code === 'A04').map((f) => f.elementId);
    expect(a04Ids).toContain(endlessWhile.id);
    expect(a04Ids).not.toContain(safeWhile.id);
  });

  it('round-trips .arr text and .arrz zip archives', () => {
    const d1 = createDiagram('program');
    d1.text = ['MainProg'];
    d1.children.push(createElement('instruction', ['a <- helper(5)']));
    const d2 = createDiagram('sub');
    d2.text = ['helper(x)'];
    d2.children.push(createElement('instruction', ['helper <- x * 2']));

    const arrText = formatArr([
      { x: 40, y: 60, fileName: 'MainProg.nsd', name: 'MainProg', minArgs: -1, maxArgs: -1 },
      { x: 380, y: 60, fileName: 'helper.nsd', name: 'helper', minArgs: 1, maxArgs: 1 },
    ]);
    const parsedArr = parseArr(arrText);
    expect(parsedArr).toHaveLength(2);
    expect(parsedArr[0]).toMatchObject({ x: 40, y: 60, fileName: 'MainProg.nsd', name: 'MainProg' });
    expect(parsedArr[1]).toMatchObject({ x: 380, y: 60, fileName: 'helper.nsd', name: 'helper', minArgs: 1, maxArgs: 1 });

    const zipBytes = writeArrz([
      { diagram: d1, x: 40, y: 60, fileName: 'MainProg.nsd' },
      { diagram: d2, x: 380, y: 60, fileName: 'helper.nsd' },
    ], 'demo');
    const bundle = readArrz(zipBytes);
    expect(bundle.arrName).toBe('demo.arr');
    expect(bundle.entries).toHaveLength(2);
    expect(bundle.entries[0].x).toBe(40);
    expect(bundle.entries[0].diagram.text[0]).toBe('MainProg');
    expect(bundle.entries[1].x).toBe(380);
    expect(bundle.entries[1].diagram.text[0]).toBe('helper(x)');
  });

  it('exports Turtleizer calls cleanly to Python and Java (#1237)', () => {
    const d = createDiagram('program');
    d.text = ['Spiral'];
    d.children.push(
      createElement('instruction', ['penDown()', 'forward(100)', 'right(90)', 'setPenColor(255, 0, 0)']),
    );
    const py = generateCode(d, 'python').code;
    expect(py).toContain('import turtle');
    expect(py).toContain('turtle.pendown()');
    expect(py).toContain('turtle.forward(100)');
    expect(py).toContain('turtle.right(90)');
    expect(py).toContain('turtle.pencolor(255, 0, 0)');

    const java = generateCode(d, 'java').code;
    expect(java).toContain('Turtleizer.penDown();');
    expect(java).toContain('Turtleizer.forward(100);');
    expect(java).toContain('Turtleizer.right(90);');
    expect(java).toContain('Turtleizer.setPenColor(255, 0, 0);');
  });
});
