# Desktop Issues Review for the Web Version

Source: open issues listed in `sourcecode/issues*.txt` (state of the GitHub issue list,
61 open), cross-checked against `sourcecode/changelog.txt` (desktop 3.32-35).
Date: 2026-11-18, web version 0.1.0.

Status values:
- **Done (web)**: solved or not reproducible in the web version as of 0.1.0.
- **N/A**: concerns Java/Swing/installers only; cannot occur in a browser app.
- **Planned**: will be handled when the feature exists (phase in brackets); the
  requirement is recorded so the web implementation does not repeat the bug.
- **Out of scope**: not planned for the web version for now.
- "Desktop" column: what the desktop changelog says (fixed = mentioned as fixed there,
  partly = related work mentioned, open = no entry).

## 1. UI, platform, distribution

| Issue | Topic | Desktop | Web status |
|---|---|---|---|
| #1244 | iPad app or browser version wanted | open | **Done (web)**: this project; runs in Safari on iPad, touch UI, long-press drag, pinch zoom |
| #1243 | Windows L&F glitch after DPI / GUI scaling | open | **N/A**: SVG rendering, browser zoom and in-app zoom |
| #1133 | Check-box menu items invisible on Windows 11 | fixed (3.32-35 workaround) | **N/A**: toggles use `aria-pressed` with visible state |
| #986 | Tree views broken with Nimbus L&F | open | **N/A** |
| #401 | Dialogs cannot be closed by keyboard | open | **Done (web)**: Esc closes every dialog, Shift/Ctrl+Enter confirms |
| #311 | Menu reorganisation | fixed (partly) | **Done (web)**: one File menu + one toolbar |
| #1016 | User-configurable menu | open | **Planned (P4)**: configurable toolbar for simplified school mode |
| #393 | Sample files in the source tree | open | **Done (web)**: 3 examples bundled (`main/web/src/examples/`) |
| #377 | Option to include a framing item | open | **Planned (P3)**: needs clarification with the desktop team; web already offers framed/unframed diagrams |
| #1240 | Packaging / distribution | open | **N/A**: static folder for any web server; PWA install planned (P4) |
| #871 | MSI installer | open | **N/A** |
| #676 | Package repositories | open | **N/A** |
| #1045 | GraalVM native image | open | **N/A** |
| #602 | Scripts should be executable | open | **N/A** |
| #1077 | Cannot compile because of javadoc | fixed | **N/A**: build is `npm run build`, tested |
| #462 | Access to command line parameters | open | **Out of scope** for the browser; could map to URL parameters later |

## 2. Language, executor, analysis (Phase 2)

| Issue | Topic | Desktop | Web status |
|---|---|---|---|
| #800 | Permanent syntax tree in the background | open | **Planned (P2)**: by design, the web parser keeps an AST per element (D-14) |
| #980 | Declaration semantics to be reassessed | partly (multi-variable declarations) | **Planned (P2)**: `docs/language-spec.md` will define declarations explicitly |
| #408 | Executor ignores variable types | open | **Planned (P2)**: typed values with optional checking |
| #259 | Variable registry and data type configurator | partly | **Planned (P2)** |
| #530 | Conversion from string to int | open | **Planned (P2)**: built-ins like `strToInt`, `strToDouble` in the language spec |
| #714 | TRY element improvements | partly (empty finally hidden) | **Done (web)** for display; executor semantics planned (P2) |
| #916 | C operator mode consistently in the editor | open | **Planned (P2)**: display option for operators (Unicode / C style) |
| #1000 | "Karel the Robot" controller | open | **Planned (P3)** together with Turtleizer as optional controller |

## 3. Code export (Phase 2/3, generators written fresh from the AST, D-15)

The web generators will be new code. Each issue below becomes a test case for the
corresponding generator so the known desktop bugs are not repeated.

| Issue | Topic | Desktop | Web status / requirement |
|---|---|---|---|
| #1242 | Export mistake in C++, C#, Java etc. | open | **Planned**: regression test once the issue details are known |
| #1239 | Comment association to declarations | fixed | **Planned**: comments attached to the element they belong to |
| #1238 | EXIT with "exit" semantics to Python | fixed | **Planned**: `exit n` maps to `sys.exit(n)` |
| #1237 | Turtle stuff to Java / Python | fixed | **Planned (P3)** with Turtleizer |
| #1236 | Group export duplicates subroutines | open | **Planned (P3)**: each routine emitted once (topological order, set of emitted names) |
| #1235 | Oberon module name qualification | fixed | **Out of scope** (no Oberon generator planned yet) |
| #1234 | File API code missing for nested diagrams | fixed | **Planned**: include runtime helpers when any reachable diagram uses them |
| #1233 | Types of C array parameters | fixed | **Planned**: parameter types parsed by the header parser |
| #1232 | Result type `void` = procedure | fixed | **Planned**: header parser treats `void` as "no result" |
| #1218 | JavaScript generator: W3C File API | open | **Planned (P2)**: JavaScript is the first generator |
| #1210 | "No conversion" option ignored | fixed | **Planned**: option honoured by every generator, tested |
| #1208 | bash export lacks Boolean expressions | open | **Planned (P3)** |
| #1170, #357 | COBOL export | partly | **Out of scope** for now |
| #1111, #1090 | C99 array / record initialisers | open | **Planned (P3)**: C99 designated initialisers |
| #967 | ARM code | partly (prototype) | **Out of scope** |
| #965, #981, #1023, #883, #781 | Julia, Octave, Haxe, PowerShell export | open | **Out of scope** for now; the AST-based design makes them cheap to add later |
| #850 | Template-based code export | open | **Planned (P3)**: evaluate templates on top of the AST |
| #725 | Python division operators | fixed | **Planned**: `div` maps to `//`, `/` stays `/` |
| #440 | PapDesigner export / import | partly (export) | **Out of scope** |
| #237 | BASH generator improvements | partly | **Planned (P3)** |
| #29 | C/C++ header files | open | **Out of scope** for now |

## 4. Code import

Source-code import is not planned for the web version yet (the desktop uses the
GOLDParser engine). The .nsd import is done.

| Issue | Topic | Desktop | Web status |
|---|---|---|---|
| #1241 | C parser chokes on `FILE` type | open | **Out of scope** |
| #1225 | Python import | open | **Out of scope** (candidate for a later phase) |
| #1144 | Java import: qualified `new` | open (wontfix) | **Out of scope** |
| #1087 | C import: struct/enum/typedef | partly | **Out of scope** |
| #1081 | C import: increment operator, false endless loop warning | fixed | **Out of scope**; Analyser (P3) must not report `i++` loops as endless |
| #1022 | Haxe import | open | **Out of scope** |
| #636 | COBOL COPY/REPLACE | open | **Out of scope** |
| #606 | Import progress on command line | open | **N/A** |
| #470, #472 | GOLDParser token handling | open | **N/A** (no GOLDParser in the web version) |

## 5. What 0.1.0 does differently by design (avoids desktop debt)

- Model, layout and rendering are separate pure modules (desktop issue "hardly existent
  MVC decomposition", `sourcecode/info.txt`).
- CASE and Parallel structure follow their text through explicit operations (D-05);
  inconsistent files are repaired on load with a warning.
- Keywords are stored per diagram and written back unchanged; no silent global refactoring.
