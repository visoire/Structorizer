import { describe, expect, it } from 'vitest';
import { createElement, DEFAULT_KEYWORDS } from '../src/core/model';
import { joinContinuedLines, tokenizeWithKeywords } from '../src/core/lang/lexer';
import { getElementAst, parseExpr, parseStmt } from '../src/core/lang/parser';

describe('P2-01..P2-03: keyword-aware lexer, Pratt expression parser, statement parser', () => {
  it('recognizes configured multi-word keywords (P2-01)', () => {
    const kw = { ...DEFAULT_KEYWORDS, preForIn: 'for each', postForIn: 'in' };
    const toks = tokenizeWithKeywords('for each item in list', kw).filter((t) => t.k !== 'ws');
    expect(toks[0]).toEqual({ k: 'kw', v: 'for each', kw: 'preForIn' });
    expect(toks[1]).toEqual({ k: 'id', v: 'item' });
    expect(toks[2]).toEqual({ k: 'kw', v: 'in', kw: 'postForIn' });
    expect(joinContinuedLines(['x <- 1 + \\', '2', 'y <- 3'])).toEqual(['x <- 1 +  2', 'y <- 3']);
  });

  it('parses operator precedence, calls, array indexing, record literals (P2-02)', () => {
    const e1 = parseExpr('1 + 2 * 3 = 7 and not false');
    expect(e1.t).toBe('binary');
    if (e1.t === 'binary') {
      expect(e1.op).toBe('and');
      expect(e1.left.t === 'binary' && e1.left.op).toBe('=');
      expect(e1.right.t === 'unary' && e1.right.op).toBe('not');
    }

    const e2 = parseExpr('arr[i + 1].x');
    expect(e2.t).toBe('member');
    if (e2.t === 'member') {
      expect(e2.field).toBe('x');
      expect(e2.target.t).toBe('index');
    }

    const rec = parseExpr('Point{x: 10, y: 20}');
    expect(rec.t).toBe('record');
    if (rec.t === 'record') {
      expect(rec.typeName).toBe('Point');
      expect(rec.fields.map((f) => f.name)).toEqual(['x', 'y']);
    }
  });

  it('parses assignments, declarations, INPUT, OUTPUT, calls, jumps, and caches element AST (P2-03, #800, #980)', () => {
    const s1 = parseStmt('var count: int <- 42', DEFAULT_KEYWORDS);
    expect(s1.t).toBe('assign');
    if (s1.t === 'assign') {
      expect(s1.target).toEqual({ t: 'var', name: 'count' });
      expect(s1.decl?.base).toBe('int');
    }

    const s2 = parseStmt('INPUT "Enter x: ", a[0], b', DEFAULT_KEYWORDS);
    expect(s2.t).toBe('input');
    if (s2.t === 'input') {
      expect(s2.prompt).toBe('Enter x: ');
      expect(s2.targets.length).toBe(2);
      expect(s2.targets[0].t).toBe('index');
    }

    const s3 = parseStmt('type Point = record{x: double; y: double}', DEFAULT_KEYWORDS);
    expect(s3.t).toBe('typedef');
    if (s3.t === 'typedef') {
      expect(s3.name).toBe('Point');
      expect(s3.fields.length).toBe(2);
    }

    const el = createElement('instruction', ['x <- 10', 'x++']);
    const ast1 = getElementAst(el, DEFAULT_KEYWORDS);
    const ast2 = getElementAst(el, DEFAULT_KEYWORDS);
    expect(ast1).toBe(ast2);
    expect(ast1.stmts.length).toBe(2);
  });
});
