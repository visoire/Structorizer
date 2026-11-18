import { describe, expect, it } from 'vitest';
import { decodeLines, encodeLines } from '../src/core/io/commaText';

describe('commaText', () => {
  it('decodes the documented edge cases', () => {
    expect(decodeLines('')).toEqual([]);
    expect(decodeLines('""')).toEqual([]);
    expect(decodeLines('"a"')).toEqual(['a']);
    expect(decodeLines('"a","b"')).toEqual(['a', 'b']);
    expect(decodeLines('"say ""hi"""')).toEqual(['say "hi"']);
    expect(decodeLines('"a, b"')).toEqual(['a, b']);
    expect(decodeLines('abc')).toEqual(['abc']);
    expect(decodeLines('"a","","b"')).toEqual(['a', '', 'b']);
  });

  it('round-trips arbitrary lines', () => {
    const samples = [['x <- 1'], ['OUTPUT "a", b', 'c'], ['a', '', 'b'], ['""', ',', '"q"']];
    for (const s of samples) expect(decodeLines(encodeLines(s))).toEqual(s);
  });
});
