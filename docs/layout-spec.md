# Layout Specification (Nassi-Shneiderman rendering)

Derived from the `prepareDraw()` / `draw()` methods in `elements/*.java`.
Goal: diagrams that look like Structorizer Desktop. Pixel identity is **not** required;
the proportions and shapes are.

## 1. Constants

```ts
export const P = 20;            // E_PADDING in the original
export const HALF = P / 2;      // 10
export const FONT_SIZE = 14;    // original: Dialog 12pt; 14px reads better on iPad
export const LINE_H = Math.round(FONT_SIZE * 1.3); // fontHeight
export const ROOT_CORNER = 15;  // rounded corners for sub routines
```

Text width: measure with a cached offscreen `CanvasRenderingContext2D.measureText`
using the same font as the SVG. Wrap it in `measureText(s: string): number` so tests
can inject a fake (e.g. `s.length * 8`).

## 2. Two-pass algorithm

```
measure(el) -> Size {w, h}          // bottom-up, pure, memoised by element identity
place(el, x, y, w, h) -> Box tree   // top-down, parent decides final w/h
```

- A sequence gives every child the **sequence width** (children stretch horizontally).
- Inside a branch whose sibling branch is taller, the sequence gets the extra height and
  gives it to its **last** child (the last box stretches down). Empty sequence: the
  placeholder cell takes all of it.
- Output `Box { id, kind, x, y, w, h, parts }` where `parts` holds the sub-boxes the
  renderer needs (header, branches, labels). Renderer never measures text itself.

## 3. Per element

Notation: `tw(lines)` = max text width of lines, `n` = number of text lines.

### Instruction
- `w = tw + P` (HALF left and right), `h = n * LINE_H + P`
- Text left-aligned at `x + HALF`, first baseline at `y + HALF + ascent`.
- Empty text: still `h = LINE_H + P`.

### Call
- Same as Instruction plus `w += P`.
- Two extra vertical lines at `x + HALF` and `x + w - HALF`. Text starts at `x + P`.

### Jump
- Same as Instruction plus `w += HALF`.
- Chevron on the left: polyline `(x+HALF, y) -> (x, y+h/2) -> (x+HALF, y+h)`. Text starts at `x + P`.

### Sequence (Subqueue)
- Non-empty: `w = max(child.w)`, `h = sum(child.h)`.
- Empty: `w = 2P`, `h = LINE_H + P`, draws the empty-set sign `∅` centred.

### While, For (pre-test loops)
- Header = Instruction box of the text: `hw, hh`.
- Body offset: `bx = P`, `by = hh`.
- `w = max(hw, body.w + P)`, `h = hh + body.h`.
- Draw: outer rect, header text, vertical bar = the area left of the body (width P).

### Repeat (post-test loop)
- Footer = Instruction box of the text.
- Body at `(P, 0)`; footer at `y + body.h`.
- `w = max(fw, body.w + P)`, `h = body.h + fh`.

### Forever
- Header band `LINE_H + P` (empty text or localized label "forever" if configured; original shows the element text, which is usually empty), body at `(P, header)`, footer band of height `P`.
- `w = max(2P, body.w + P)`, `h = header + body.h + P`.

### Alternative (IF)
- `T` = qTrue size, `F` = qFalse size. Minimum branch widths: `labelW*1.5 + P` for labels "T"/"F" (localizable `preAltT`/`preAltF`).
- Header height `H = n * LINE_H + 2P - 1`.
- Header width: port this exact routine (from `Alternative.prepareDraw`):

```ts
function altHeaderWidth(lineWidths: number[], tW: number): number {
  const n = lineWidths.length;
  const cy = n * LINE_H + 2 * P;          // header height (y reversed)
  const ax = tW;                          // triangle tip x (= true branch width)
  const coeffLeft = cy / (0 - ax);        // slope of left traverse line
  let lowest = Infinity;
  for (let i = 0; i < n; i++) {
    const by = 2 * P - P / 3 + (n - i - 1) * LINE_H;  // bottom of text line i
    const leftSide = by / coeffLeft + ax;
    const bx = lineWidths[i] + P + leftSide;
    const coeff = by / (bx - ax);
    if (coeff > 0 && coeff < lowest) lowest = coeff;
  }
  if (lowest === Infinity) return 2 * P;
  return Math.round(cy / lowest + ax);
}
```

- `w = max(altHeaderWidth(...), T.w + F.w)`, `h = H + max(T.h, F.h)`.
- Extra width goes to the false branch (original default `altPadRight = true`).
- Draw: header rect, line from `(x, y)` to `(x + T.w, y + H)` to `(x + w, y)`,
  label "T" bottom-left of header, "F" bottom-right, condition text centred in the
  upper triangle area. Branches side by side below.

### Case
- `k` = number of branches in the model = text lines - 1. The last text line is the default label. If it is `%`, the default branch is hidden: draw only the first `k-1` columns.
- Branch width `bw[i] = max(branch[i].w, selectorWidth[i] + P)`.
- Header height `H = (discriminator lines + 1) * LINE_H + P`; selectors drawn in the bottom row of the header, one per column.
- Diagonal: from `(x, y)` to the bottom-left of the **last** column, then up to `(x + w, y)`.
- `w = max(sum(bw), discriminatorWidth + 2P)`; widen the last column for the remainder.
- `h = H + max(branch.h)`.
- Note `%`: the hidden default branch still exists in the model (keep it for round trip), it is just not measured or drawn.

### Parallel
- Top band and bottom band, each `P` high, with short diagonals in the four corners (from each corner `P` inward).
- Branches side by side between the bands; `w = max(3*HALF, sum(branch.w)) + 1`, `h = 2P + max(branch.h)`.

### Try
- Rows top to bottom:
  1. `try` label row (Instruction box of the keyword).
  2. try body, indented `P` on the left.
  3. `catch <text[0]>` label row (`P + LINE_H` high).
  4. catch body, indented `2P`.
  5. `finally` label row and finally body indented `P` (omit both when finally is empty, decision D-10).
  6. bottom band `P`.
- `w = max(all row widths + indents + P)`.

### Root (diagram frame)
- Boxed (`style="nice"`): padding `P` on all sides around the body; title (text lines, bold) on top: `titleH = n * LINE_H + 3P` (boxed) or `+ P` (not boxed).
- Body origin `(P, titleH - P)` when boxed.
- `w = max(titleWidth + 2P, body.w + 2P)`.
- Frame shape: program = plain rectangle; sub = rounded rectangle (radius `ROOT_CORNER`); includable = rectangle with the top-left corner cut (pick this; original differs in detail, decision D-11).
- includeList (if any) shown as an extra line "Included diagrams: a, b" under the title (keyword `preImport`).

## 4. Colours

| Use | Value |
|---|---|
| default element fill | element `color` (default `#ffffff`) |
| selection | `#ffff00` fill (original E_DRAWCOLOR yellow); web: fill `#fff3a0` plus 2px outline |
| running element | `#ffa500` (orange) |
| waiting (Parallel) | `#ffffd2` |
| breakpoint | red bar on top edge |
| disabled | hatched pattern overlay (SVG `<pattern>`) |
| strokes | `#000000`, 1px, `shape-rendering="crispEdges"` |

## 5. Hit testing

Keep the flat list of placed boxes. Hit test = smallest box containing the point
(deepest element). Selecting a branch area (empty sequence) returns the sequence
address, needed for "insert here".

## 6. Verification

- Snapshot tests: `layout(fixture)` serialised to JSON with the fake text measurer.
- Visual check: open `all-elements.nsd` in both the web app and Structorizer Desktop
  and compare shapes side by side (manual, once per phase).
