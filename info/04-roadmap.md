# 04 – Roadmap (Structorizer Web)

## Guiding Principles
- Fully client-side first
- GDPR / school friendly
- Progressive enhancement
- Modern clean codebase (not a 1:1 Java port)

---

Detailed, executable steps live in `plan.md`. This file is the coarse overview.

## Phase 0 – Analysis & Foundations ✅ (2026-11-18)
- [x] Agent prompt created
- [x] Deep source code analysis of original Structorizer (`../docs/source-analysis.md`)
- [x] Data model + TypeScript interfaces specified (`01-data-model.md`, revised)
- [x] File format spec + fixture, layout spec, decisions, desktop issue review (`../docs/`)
- [x] Project scaffold (Vite + TS + React) in `main/web/`
- [x] SVG diagram renderer

---

## Phase 1 – Basic Editor (MVP) ✅ version 0.1.0 (2026-11-18)
Open: manual check with Structorizer Desktop (P1-05) and a real iPad test (review gate).
Follow-ups P1-26 .. P1-31 (PWA, context menu, multi-selection, branch colours, transmute, print).

- .nsd open / save with round trip to Structorizer Desktop (native format, D-09; no own JSON format)
- Create / delete / reorder elements (toolbar, drag and drop, touch)
- Edit text, comment, color, disabled
- Undo / Redo, copy / paste
- Autosave in localStorage
- Export as PNG / SVG
- German + English UI

**Target**: Usable for simple teaching diagrams on iPad and desktop browsers.
Code export moved to Phase 2 (needs the expression parser, D-15).

---

## Phase 2 – Core Execution
- Own expression language: tokenizer, parser, evaluator (no eval, D-14)
- Interpreter / Executor (step mode + continuous)
- Simple code export (JavaScript + Python)
- Several open diagrams, subroutine calls
- Variable watch
- Breakpoints
- Highlight currently executing element
- Basic runtime analysis (execution counts)

---

## Phase 3 – Advanced Features
- Arranger (multiple diagrams on one canvas, .arr/.arrz)
- More code generators (Pascal, Java, C, …)
- Turtleizer (Canvas-based)
- Content assist / syntax hints
- Analyser warnings

---

## Phase 4 – Polish & Distribution
- PWA (offline, installable)
- iPad / touch optimization
- Internationalization (de + en first)
- Self-hosting documentation
- Optional light sharing backend (GDPR-compliant)

---

## Phase 5 – Native Wrappers (later)
- Capacitor or Tauri for better iOS/iPadOS integration if PWA is not enough

---

## Success Metrics (first public version)
- Can create, edit, save and execute typical school algorithms
- Runs completely offline
- Looks modern and feels fast
- Easy to self-host (static files)

---

## Notes for the Agent
Always prefer working software over perfect architecture.
Keep the original visual language of Nassi-Shneiderman diagrams recognizable.
Document every major design decision.