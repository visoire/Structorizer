# Structorizer Web

A browser version of [Structorizer](https://structorizer.fisch.lu), the Nassi-Shneiderman
diagram editor used in many schools. It runs completely on your device, in any current
browser, including Safari on iPad (desktop issue
[#1244](https://github.com/fesch/Structorizer.Desktop/issues/1244)).

- Free and open source: **GPL-3.0-or-later**, like Structorizer Desktop.
- Privacy by design: no server, no account, no cookies, no tracking, no external
  resources. The build enforces this with a Content Security Policy (`connect-src 'none'`).
- Compatible: reads and writes the `.nsd` files of Structorizer Desktop 3.32.

Version **3.32-35** (web build `3.32.35-web.2`). Changes: [CHANGELOG.md](CHANGELOG.md).
Plan and roadmap: [info/plan.md](info/plan.md), [info/04-roadmap.md](info/04-roadmap.md).

## Features

- Menus like Structorizer Desktop 3.32 (File, Edit, View, Diagram, Preferences, Debug, Help) and its key bindings
- All 11 element types, programs, subroutines and includables, several diagrams open at once
- Side panel with **Code preview** and **Arranger index**
- Code export: Python, Java, JavaScript, C++, PHP, Bash
- Pictures: PNG, PNG (multiple), EMF, PDF, SVG; print; copy as picture
- Find/replace, transmute, outsource, collapse, disable, undo/redo, drag and drop, context menu
- Preferences (language, light/dark, view options, parser keywords), German and English
- Documentation page with the Structorizer User Guide (PDF)
- MCP server for AI assistants (`main/mcp`)

Not yet: Executor, Turtleizer, Analyser, source code import (see the roadmap).

## Use it

Open `main/web/dist/` from any web server, for example with XAMPP:
`http://localhost/Structorizer/main/web/dist/` (documentation: `.../dist/docs/`).
The folder `main/web/dist` can be copied to any static host (school server, GitHub Pages,
Nextcloud). It does not need PHP or a database. On iPad: open it in Safari, then
*Share > Add to Home Screen*.

## Develop

Requirements: Node.js 20 or newer.

```bash
cd main/web
npm install
npm run dev      # development server with hot reload
npm test         # unit tests (Vitest)
npm run build    # production build into main/web/dist
```

The user guide PDF is not part of the repository (it belongs to the desktop project).
To show it on the documentation page, put `structorizer_user_guide_3.32-35.pdf` from the
[Structorizer downloads](https://structorizer.fisch.lu) as
`main/web/public/docs/structorizer-user-guide-3.32-35.pdf` before building.

### MCP server

```bash
cd main/mcp
npm install
npm test                                   # builds and runs the end-to-end check
node dist/cli.js mcp --root /path/to/diagrams
```

Tools and client configuration: documentation page, section *MCP server*.

### Project layout

| Path | Content |
|---|---|
| `main/web/src/core/model` | data model and immutable tree operations |
| `main/web/src/core/io` | `.nsd` reader and writer |
| `main/web/src/core/lang` | tokenizer and statement analysis |
| `main/web/src/core/layout` | Nassi-Shneiderman layout and highlighting (pure, testable) |
| `main/web/src/core/render` | SVG, EMF and PDF writers |
| `main/web/src/core/gen` | code generators |
| `main/web/src/store` | application state, documents, preferences |
| `main/web/src/ui` | React components (menu bar, side panel, dialogs ...) |
| `main/web/docs` | documentation page |
| `main/web/tests` | unit tests and fixtures |
| `main/mcp` | CLI and MCP server |
| `docs/` | source analysis, file format, layout spec, decisions, issue review |
| `info/` | plan, roadmap, data model and the original agent briefs |

## Credits

Structorizer was created by Bob Fisch and is maintained by Bob Fisch, Kay Gürtzig and
contributors ([fesch/Structorizer.Desktop](https://github.com/fesch/Structorizer.Desktop)).
This web version is an independent reimplementation in TypeScript. Its layout rules,
the file format, the menus and the keyboard shortcuts follow the desktop source code and
user guide. The example `hilbert-3.nsd` is a desktop sample by Kay Gürtzig (GPLv3).

"Structorizer" refers to the original project; this repository is not an official release
of the desktop team.

## License

GNU General Public License v3.0 or later, see [LICENSE](LICENSE).
