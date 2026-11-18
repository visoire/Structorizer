# 03 – Diagram Renderer (First Version)

> Superseded in detail by `docs/layout-spec.md` (exact shapes and sizes from the
> original) and `plan.md` steps P1-06 ... P1-12. Where they differ, those win.

## Goal
Create a working SVG-based renderer that can display a RootElement and its children in classic Nassi-Shneiderman style.

## Requirements for v0.1
- Correct visual hierarchy (nested boxes)
- Instruction = simple rectangle with text
- Alternative (IF) = classic triangle / two branches side by side
- While / Repeat / For / Forever = loop shapes with body inside
- Case = multi-branch selector
- Basic text centering / wrapping
- Selection highlighting (click to select)
- Responsive scaling / zoom (optional but nice)

## Recommended Approach
1. **Layout pass first** (calculate width/height recursively)
2. **Render pass** (produce SVG elements from the layout tree)

Possible intermediate structure:

```ts
interface LayoutNode {
  element: Element;
  x: number;
  y: number;
  width: number;
  height: number;
  children?: LayoutNode[];   // or then/else/branches
}
```

## Visual Style (start simple)
- Clean modern look (slightly rounded corners, subtle shadows optional)
- Good contrast
- Clear distinction between element types (color coding later)
- Font: system-ui or Inter

## Interaction (minimal for first version)
- Click → select element
- Double-click → open simple text editor (prompt or modal)
- Hover → subtle highlight

## Deliverable
- `src/core/layout/computeLayout.ts`
- `src/components/DiagramCanvas.tsx` (or equivalent)
- A hard-coded demo diagram that shows:
  - Root
  - Instruction
  - Alternative with both branches
  - While loop containing instructions

Once this works reliably, add drag-and-drop insertion and real editing.