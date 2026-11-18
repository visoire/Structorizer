# Structorizer Web

A browser version of [Structorizer](https://structorizer.fisch.lu), the Nassi-Shneiderman
diagram editor used in many schools. It runs completely on your device, in any current
browser, including Safari on iPad (desktop issue
[#1244](https://github.com/fesch/Structorizer.Desktop/issues/1244)).

- Free and open source: **GPL-3.0-or-later**, like Structorizer Desktop.
- Privacy by design: no server, no account, no cookies, no tracking, no external
  resources. The build enforces this with a Content Security Policy (`connect-src 'none'`).
- Compatible: reads and writes the `.nsd` files of Structorizer Desktop 3.32.

Status: **0.1.0, first basic version** (editor, files, export). The executor, code export
and the other desktop tools follow, see [info/plan.md](info/plan.md) and [info/04-roadmap.md](info/04-roadmap.md).
Changes: [CHANGELOG.md](CHANGELOG.md).

## Features (0.1.0)

- All 11 element types, three diagram types, desktop-like rendering
- Insert, edit, delete, cut/copy/paste, duplicate, move, drag and drop (long press on touch)
- Undo/redo, autosave in the browser, open/save `.nsd`, export SVG and PNG
- Desktop keyboard shortcuts, pinch zoom, German and English UI
- Bundled examples

## Use it

Open `main/web/dist/index.html` from any web server, for example with XAMPP:
`http://localhost/Structorizer/main/web/dist/`. The folder `main/web/dist` can be copied to any
static host (school server, GitHub Pages, Nextcloud). It does not need PHP or a database.

On iPad: open the address in Safari, then *Share > Add to Home Screen*.

## Develop

Requirements: Node.js 20 or newer.

```bash
cd main/web
npm install
npm run dev      # development server with hot reload
npm test         # unit tests (Vitest)
npm run build    # production build into main/web/dist
```

Project layout:

| Path | Content |
|---|---|
| `main/web/src/core/model` | data model and immutable tree operations |
| `main/web/src/core/io` | `.nsd` reader and writer |
| `main/web/src/core/layout` | Nassi-Shneiderman layout (pure, testable) |
| `main/web/src/core/render` | scene to SVG (screen and export) |
| `main/web/src/store` | application state, undo/redo |
| `main/web/src/ui` | React components |
| `main/web/tests` | unit tests and fixtures |
| `docs/` | source analysis, file format, layout spec, decisions, issue review |
| `info/` | plan, roadmap, data model and the original agent briefs |

The rules for contributors and implementation agents are in [info/plan.md](info/plan.md) and
[docs/decisions.md](docs/decisions.md).

## Credits

Structorizer was created by Bob Fisch and is maintained by Bob Fisch, Kay Gürtzig and
contributors ([fesch/Structorizer.Desktop](https://github.com/fesch/Structorizer.Desktop)).
This web version is an independent reimplementation in TypeScript. Its layout rules,
the file format and the keyboard shortcuts follow the desktop source code and user guide.
The example `hilbert-3.nsd` is a desktop sample by Kay Gürtzig (GPLv3).

"Structorizer" refers to the original project; this repository is not an official release
of the desktop team.

## License

GNU General Public License v3.0 or later, see [LICENSE](LICENSE).
