// SPDX-License-Identifier: GPL-3.0-or-later
// Documentation page: one article per hash route, grouped navigation and "On this page".
import './docs.css';

const articles = [...document.querySelectorAll<HTMLElement>('article[data-page]')];
const nav = document.getElementById('doc-nav')!;
const toc = document.getElementById('toc')!;
const title = document.getElementById('page-title')!;
const lead = document.getElementById('page-lead')!;
const crumb = document.getElementById('crumb-page')!;
const DEFAULT_TITLE = title.innerHTML;
const DEFAULT_LEAD = lead.textContent ?? '';

// ---------- theme: same preference as the editor (stored in this browser)
function storedTheme(): 'light' | 'dark' | 'system' {
  try {
    const p = JSON.parse(localStorage.getItem('structorizer-web:prefs') ?? '{}') as { theme?: string };
    if (p.theme === 'light' || p.theme === 'dark') return p.theme;
  } catch { /* ignore */ }
  return 'system';
}
const sysDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
function applyTheme(t = storedTheme()) {
  document.documentElement.dataset.theme = t === 'system' ? (sysDark() ? 'dark' : 'light') : t;
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
document.getElementById('theme-btn')!.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try {
    const p = JSON.parse(localStorage.getItem('structorizer-web:prefs') ?? '{}') as Record<string, unknown>;
    p.theme = next;
    localStorage.setItem('structorizer-web:prefs', JSON.stringify(p));
  } catch { /* ignore */ }
  applyTheme(next);
});

// ---------- navigation grouped like the WorkCraft docs
const groups = new Map<string, HTMLElement[]>();
for (const a of articles) {
  const g = a.dataset.group ?? '';
  groups.set(g, [...(groups.get(g) ?? []), a]);
}
for (const [g, list] of groups) {
  const h = document.createElement('p');
  h.className = 'nav-group';
  h.textContent = g;
  nav.appendChild(h);
  const ul = document.createElement('ul');
  for (const a of list) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${a.dataset.page}`;
    link.textContent = a.dataset.title ?? a.dataset.page ?? '';
    link.dataset.page = a.dataset.page;
    li.appendChild(link);
    ul.appendChild(li);
  }
  nav.appendChild(ul);
}

function show() {
  const hash = decodeURIComponent(location.hash.slice(1));
  // a hash can be a page or a heading inside a page
  let page = articles.find((a) => a.dataset.page === hash);
  let anchor: HTMLElement | null = null;
  if (!page && hash) {
    anchor = document.getElementById(hash);
    page = articles.find((a) => anchor && a.contains(anchor));
  }
  page ??= articles[0];
  for (const a of articles) a.hidden = a !== page;
  for (const l of nav.querySelectorAll<HTMLAnchorElement>('a')) {
    if (l.dataset.page === page.dataset.page) l.setAttribute('aria-current', 'page');
    else l.removeAttribute('aria-current');
  }
  const isHome = page === articles[0] && !hash;
  title.innerHTML = isHome ? DEFAULT_TITLE : '';
  if (!isHome) title.textContent = page.dataset.title ?? '';
  lead.textContent = isHome ? DEFAULT_LEAD : page.dataset.lead ?? '';
  crumb.textContent = page.dataset.title ?? '';
  document.title = `${page.dataset.title} | Structorizer Web documentation`;

  // on this page
  const heads = [...page.querySelectorAll<HTMLHeadingElement>('h2[id]')];
  toc.hidden = heads.length < 2;
  toc.innerHTML = '';
  if (heads.length >= 2) {
    const p = document.createElement('p');
    p.className = 'nav-group';
    p.textContent = 'On this page';
    toc.appendChild(p);
    const ul = document.createElement('ul');
    for (const h of heads) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${h.id}`;
      a.textContent = h.textContent ?? '';
      li.appendChild(a);
      ul.appendChild(li);
    }
    toc.appendChild(ul);
  }
  // load the PDF only when its page is shown
  if (page.dataset.page === 'user-guide') {
    const f = document.getElementById('pdf') as HTMLIFrameElement;
    if (!f.src && f.dataset.src) f.src = f.dataset.src;
  }
  if (anchor) anchor.scrollIntoView();
  else window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', show);
show();
