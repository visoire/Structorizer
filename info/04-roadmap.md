# Roadmap – Open & Future Items (Structorizer Web)

This document lists only the features and enhancements that are **not yet implemented** or remain open for future releases.

---

## 1. Source Code Import (Code → Structogram)
- [ ] **Python parser (`importPython`)**: Parse Python 3 functions, control flow (`if`/`elif`/`else`, `match`/`case`, `for`, `while`, `try`/`except`/`finally`), and assignments into `.nsd` diagrams.
- [ ] **C / Java / JavaScript parser**: Parse C-family source files into `.nsd` diagrams without relying on the legacy Java GOLDParser `.egt` grammar tables.
- [ ] **Pascal / Delphi parser**: Parse `program` / `procedure` / `function` blocks into `.nsd` diagrams.
- [ ] **PapDesigner (`.pap`) & legacy `.str` import**: Import XML project files from PapDesigner.

## 2. Additional Academic & LaTeX Export Formats
- [ ] **StrukTeX / LaTeX export (`.tex`)**: Generate `\begin{struktogramm}` (`struktex` / `pict2e`) macros for academic papers and worksheets.
- [ ] **Additional language generators**: Oberon, Perl, and KSH export parity.

## 3. Advanced Arranger & Workspace Features
- [ ] **Dependency graph arrows on the 2D Arranger Board**: Draw visual call/include arrows between caller cards and subroutine/includable cards on the Arranger surface.
- [ ] **Multi-diagram batch code export**: Export an entire `.arrz` arrangement into a multi-file source archive (`.zip`).

## 4. Native App Store & Desktop Bundles
- [ ] **Signed iPadOS / iOS App Store build (`.ipa`)**: Package the Capacitor project (`main/web/capacitor.config.json`) via Xcode with native Files app document-in-place editing.
- [ ] **Optional Tauri Desktop binary**: Lightweight native Windows / macOS / Linux wrapper around `main/web/dist`.
