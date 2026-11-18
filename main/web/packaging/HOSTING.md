# Hosting Structorizer Web

Structorizer Web is a set of static files. It needs no PHP, no database and no server-side
code, and it never contacts a server after loading (Content Security Policy `connect-src 'none'`).

## Two packages

| Package | Contents | Use it when |
|---|---|---|
| `structorizer-web-<version>.zip` | `index.html`, `assets/`, `docs/` (documentation page), icon | you host it on a web server and want the documentation next to the editor |
| `structorizer-single-<version>.zip` / `structorizer-<version>.html` | one self-contained `index.html` | you want a single file: upload it anywhere, put it on a USB stick, attach it to a course page |

## Web servers

- **Apache** (also XAMPP, most school servers): unzip into any folder. The included `.htaccess` sets caching and compression when `mod_headers` / `mod_deflate` are available.
- **nginx**: serve the folder as static files; optionally `add_header Cache-Control "no-cache";` for `index.html` and long caching for `assets/`.
- **Netlify / Cloudflare Pages**: upload the folder; `_headers` contains the same rules.
- **GitHub Pages, Nextcloud, IIS**: copy the folder; no configuration needed.

The app works in any sub folder (`https://school.example/tools/structorizer/`).

## Opening the single file directly

Most browsers run the single `index.html` also from the file system (double-click). Some
lock down `file://` pages; if saving or opening files does not work there, use a web server.

## Data

Diagrams, recent files and preferences stay in the browser's local storage of each user and
device. Nothing is sent to the host. The host only sees the usual web server log entries of
the page requests.
