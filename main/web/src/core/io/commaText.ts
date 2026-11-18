// SPDX-License-Identifier: GPL-3.0-or-later
// Port of lu.fisch.utils.StringList.getCommaText / setCommaText (docs/nsd-format.md section 2).

export function encodeLines(lines: readonly string[]): string {
  return lines.map((l) => `"${l.replace(/"/g, '""')}"`).join(',');
}

export function decodeLines(input: string): string[] {
  if (input.length === 0) return [];
  let s = input;
  if (s[0] !== '"') s = '"' + s;
  if (s[s.length - 1] !== '"') s = s + '"';
  const out: string[] = [];
  let tmp = '';
  let open = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      if (i + 1 < s.length) {
        if (!open) {
          open = true;
        } else if (s[i + 1] === '"') {
          tmp += '"';
          i++;
        } else {
          out.push(tmp);
          tmp = '';
          open = false;
        }
      } else {
        // closing quote at the very end
        if (!(out.length === 0 && tmp.trim() === '')) out.push(tmp);
        tmp = '';
        open = false;
      }
    } else if (open) {
      tmp += ch;
    }
  }
  if (tmp.trim() !== '') out.push(tmp);
  return out;
}
