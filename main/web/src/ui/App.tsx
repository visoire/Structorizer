// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import { readNsd, writeNsd } from '../core/io';
import { createDiagram, findById, STRUCTURED_KINDS, type ElementKind } from '../core/model';
import { EXAMPLES } from '../examples';
import { translator, type TKey } from '../i18n';
import { isDirty, useStore } from '../store/diagramStore';
import { DiagramView } from './DiagramView';
import { DiagramEditor, ElementEditor, Modal } from './ElementEditor';
import { APP_VERSION, exportPng, exportSvg, forgetSaveHandle, pickFile, readFile, saveDiagram } from './exporters';
import { Icon, KindIcon } from './icons';

const KINDS: ElementKind[] = ['instruction', 'alternative', 'case', 'for', 'while', 'repeat', 'forever', 'call', 'jump', 'parallel', 'try'];

/** Desktop key bindings (user guide chapter 13). */
const KEY_INSERT: Record<string, ElementKind> = {
  F5: 'instruction', F6: 'alternative', F10: 'case', F7: 'for', F8: 'while', F9: 'repeat', F11: 'call', F12: 'jump',
};
const CTRL_KEY_INSERT: Record<string, ElementKind> = { F7: 'forever', F6: 'parallel', F5: 'try' };

const AUTOSAVE_KEY = 'structorizer-web:current';
const REPO_URL = 'https://github.com/visoire/Structorizer';

function ToolButton({ label, onClick, disabled, children, pressed, wide }: {
  label: string; onClick: (e: React.MouseEvent) => void; disabled?: boolean; children: React.ReactNode; pressed?: boolean; wide?: boolean;
}) {
  return (
    <button type="button" className={'tool' + (wide ? ' wide' : '')} title={label} aria-label={label}
      aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      {children}
      {wide && <span className="tool-label">{label}</span>}
    </button>
  );
}

export function App() {
  const s = useStore();
  const t = translator(s.lang);
  const dirty = isDirty(s);
  const [menu, setMenu] = useState<'file' | null>(null);
  const [about, setAbout] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  const sel = s.selection;
  const selEl = sel?.t === 'el' ? findById(s.diagram, sel.id)?.el ?? null : null;
  const hasEl = !!selEl;

  // ---------- restore + autosave (local only, D-03)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { xml: string; fileName: string | null };
        const { diagram } = readNsd(saved.xml);
        useStore.getState().load(diagram, saved.fileName);
      }
    } catch { /* corrupt or blocked storage: start empty */ }
  }, []);

  useEffect(() => {
    const h = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ xml: writeNsd(s.diagram, APP_VERSION), fileName: s.fileName, ts: Date.now() }));
        setStorageOk(true);
      } catch {
        setStorageOk(false);
      }
    }, 800);
    return () => clearTimeout(h);
  }, [s.diagram, s.fileName]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (!storageOk && isDirty(useStore.getState())) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [storageOk]);

  useEffect(() => { document.documentElement.lang = s.lang; }, [s.lang]);

  // toast auto-hide
  useEffect(() => {
    if (!s.message) return;
    const h = setTimeout(() => useStore.setState({ message: null }), s.message.kind === 'error' ? 7000 : 3500);
    return () => clearTimeout(h);
  }, [s.message]);

  // close menu on outside tap
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  // ---------- file actions
  const confirmDiscard = () => !isDirty(useStore.getState()) || window.confirm(t('discardChanges'));

  const doNew = () => {
    if (!confirmDiscard()) return;
    forgetSaveHandle();
    useStore.getState().load(createDiagram(), null);
    setMenu(null);
  };

  const loadXml = (xml: string, name: string | null) => {
    try {
      const { diagram, warnings } = readNsd(xml);
      forgetSaveHandle();
      useStore.getState().load(diagram, name);
      useStore.getState().requestFit();
      if (warnings.length > 0) useStore.getState().notify(`${t('loadedWithWarnings')}: ${warnings.slice(0, 3).join(' ')}`);
    } catch (e) {
      useStore.getState().notify(`${t('openFailed')}: ${(e as Error).message}`, 'error');
    }
  };

  const doOpen = async () => {
    setMenu(null);
    if (!confirmDiscard()) return;
    const file = await pickFile();
    if (!file) return;
    try {
      const { diagram, warnings } = await readFile(file);
      forgetSaveHandle();
      useStore.getState().load(diagram, file.name);
      useStore.getState().requestFit();
      if (warnings.length > 0) useStore.getState().notify(`${t('loadedWithWarnings')}: ${warnings.slice(0, 3).join(' ')}`);
    } catch (e) {
      useStore.getState().notify(`${t('openFailed')}: ${(e as Error).message}`, 'error');
    }
  };

  const doSave = async (saveAs = false) => {
    setMenu(null);
    try {
      const name = await saveDiagram(useStore.getState().diagram, saveAs);
      if (name) { useStore.getState().markSaved(name); useStore.getState().notify(`${t('saved')}: ${name}`); }
    } catch (e) {
      useStore.getState().notify((e as Error).message, 'error');
    }
  };

  const labels: [string, string] = ['T', 'F'];
  const doPng = async () => {
    setMenu(null);
    try { await exportPng(useStore.getState().diagram, labels); } catch (e) { useStore.getState().notify((e as Error).message, 'error'); }
  };
  const doSvg = () => { setMenu(null); exportSvg(useStore.getState().diagram, labels); };

  const insert = (kind: ElementKind, e?: { shiftKey: boolean }) => {
    const st = useStore.getState();
    st.insert(kind, !!e?.shiftKey || st.insertBefore);
    if (st.insertBefore) st.setInsertBefore(false);
  };

  // ---------- keyboard (only when no dialog is open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (st.editor || about) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      let handled = true;
      if (!ctrl && !e.altKey && KEY_INSERT[k]) st.insert(KEY_INSERT[k], e.shiftKey);
      else if (ctrl && !e.altKey && CTRL_KEY_INSERT[k]) st.insert(CTRL_KEY_INSERT[k], e.shiftKey);
      else if (ctrl && (k === 'z' || k === 'Z')) { if (e.shiftKey) st.redo(); else st.undo(); }
      else if (ctrl && (k === 'y' || k === 'Y')) st.redo();
      else if (ctrl && (k === 'c' || k === 'C' || k === 'Insert')) st.copy();
      else if (ctrl && (k === 'x' || k === 'X')) st.cut();
      else if (ctrl && (k === 'v' || k === 'V')) st.paste();
      else if (e.shiftKey && k === 'Delete') st.cut();
      else if (e.shiftKey && k === 'Insert') st.paste();
      else if (ctrl && (k === 's' || k === 'S')) void doSave(e.altKey);
      else if (ctrl && (k === 'o' || k === 'O')) void doOpen();
      else if (ctrl && (k === 'e' || k === 'E')) void doPng();
      else if (ctrl && k === '7') st.toggleDisabled();
      else if (ctrl && k === 'ArrowUp') st.shift(-1);
      else if (ctrl && k === 'ArrowDown') st.shift(1);
      else if (k === 'ArrowUp') st.navigate('up');
      else if (k === 'ArrowDown') st.navigate('down');
      else if (k === 'ArrowLeft') st.navigate('left');
      else if (k === 'ArrowRight') st.navigate('right');
      else if (k === 'Delete' || k === 'Backspace') st.removeSelected();
      else if (k === 'Enter') {
        if (st.selection?.t === 'el') st.openEditor({ t: 'el', id: st.selection.id, isNew: false });
        else if (st.selection?.t === 'root') st.openEditor({ t: 'root' });
        else handled = false;
      }
      else if (e.code === 'NumpadSubtract') st.toggleCollapsed(true);
      else if (e.code === 'NumpadAdd') st.toggleCollapsed(false);
      else if (k === 'Escape') { st.select(null); setMenu(null); }
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [about, s.lang]);

  const title = s.diagram.text[0] ?? '???';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true"><KindIcon kind="alternative" /></span>
          <span className="brand-name">{t('appName')}</span>
          <span className="doc-name" title={s.fileName ?? title}>{s.fileName ?? title}{dirty ? ' •' : ''}</span>
        </div>
        <nav className="top-actions" aria-label={t('file')}>
          <div className="menu-wrap" ref={menuRef}>
            <ToolButton label={t('file')} wide onClick={() => setMenu(menu ? null : 'file')} pressed={menu === 'file'}><Icon name="open" /></ToolButton>
            {menu === 'file' && (
              <div className="menu" role="menu">
                <button role="menuitem" onClick={doNew}><Icon name="new" /> {t('new')}</button>
                <button role="menuitem" onClick={() => void doOpen()}><Icon name="open" /> {t('open')} <kbd>Ctrl+O</kbd></button>
                <button role="menuitem" onClick={() => void doSave(false)}><Icon name="save" /> {t('save')} <kbd>Ctrl+S</kbd></button>
                <button role="menuitem" onClick={() => void doSave(true)}><Icon name="save" /> {t('saveAs')}</button>
                <hr />
                <button role="menuitem" onClick={() => void doPng()}><Icon name="image" /> {t('exportPng')} <kbd>Ctrl+E</kbd></button>
                <button role="menuitem" onClick={doSvg}><Icon name="image" /> {t('exportSvg')}</button>
                <hr />
                <div className="menu-label">{t('examples')}</div>
                {EXAMPLES.map((ex) => (
                  <button key={ex.id} role="menuitem" onClick={() => { setMenu(null); if (confirmDiscard()) loadXml(ex.xml, null); }}>{ex.title}</button>
                ))}
              </div>
            )}
          </div>
          <ToolButton label={t('save')} onClick={() => void doSave(false)}><Icon name="save" /></ToolButton>
          <span className="sep" />
          <ToolButton label={t('undo')} disabled={s.past.length === 0} onClick={s.undo}><Icon name="undo" /></ToolButton>
          <ToolButton label={t('redo')} disabled={s.future.length === 0} onClick={s.redo}><Icon name="redo" /></ToolButton>
          <span className="sep" />
          <ToolButton label={t('zoomOut')} onClick={() => s.setZoom(s.zoom / 1.2)}><Icon name="zoomOut" /></ToolButton>
          <button type="button" className="zoom-label" title={t('zoomFit')} onClick={() => s.setZoom(1)}>{Math.round(s.zoom * 100)}%</button>
          <ToolButton label={t('zoomIn')} onClick={() => s.setZoom(s.zoom * 1.2)}><Icon name="zoomIn" /></ToolButton>
          <ToolButton label={t('zoomFit')} onClick={s.requestFit}><Icon name="zoomFit" /></ToolButton>
          <span className="sep" />
          <button type="button" className="lang" onClick={() => s.setLang(s.lang === 'de' ? 'en' : 'de')} title={t('language')}>
            {s.lang === 'de' ? 'EN' : 'DE'}
          </button>
          <ToolButton label={t('about')} onClick={() => setAbout(true)}><Icon name="info" /></ToolButton>
        </nav>
      </header>

      <div className="palette" role="toolbar" aria-label="Elements">
        {KINDS.map((k) => (
          <ToolButton key={k} label={t(('kind.' + k) as TKey)} onClick={(e) => insert(k, e)}><KindIcon kind={k} /></ToolButton>
        ))}
        <ToolButton label={t('insertBefore')} pressed={s.insertBefore} onClick={() => s.setInsertBefore(!s.insertBefore)}><Icon name="before" /></ToolButton>
        <span className="sep" />
        <ToolButton label={t('edit')} disabled={!hasEl && sel?.t !== 'root'} onClick={() => {
          if (sel?.t === 'el') s.openEditor({ t: 'el', id: sel.id, isNew: false });
          else if (sel?.t === 'root') s.openEditor({ t: 'root' });
        }}><Icon name="edit" /></ToolButton>
        <ToolButton label={t('delete')} disabled={!hasEl} onClick={s.removeSelected}><Icon name="delete" /></ToolButton>
        <ToolButton label={t('cut')} disabled={!hasEl} onClick={s.cut}><Icon name="cut" /></ToolButton>
        <ToolButton label={t('copy')} disabled={!hasEl} onClick={s.copy}><Icon name="copy" /></ToolButton>
        <ToolButton label={t('paste')} disabled={!s.clipboard} onClick={s.paste}><Icon name="paste" /></ToolButton>
        <ToolButton label={t('duplicate')} disabled={!hasEl} onClick={s.duplicate}><Icon name="duplicate" /></ToolButton>
        <ToolButton label={t('moveUp')} disabled={!hasEl} onClick={() => s.shift(-1)}><Icon name="up" /></ToolButton>
        <ToolButton label={t('moveDown')} disabled={!hasEl} onClick={() => s.shift(1)}><Icon name="down" /></ToolButton>
        <ToolButton label={t('disable')} disabled={!hasEl} pressed={selEl?.disabled} onClick={s.toggleDisabled}><Icon name="disable" /></ToolButton>
        <ToolButton label={t('collapse')} disabled={!selEl || !STRUCTURED_KINDS.has(selEl.kind)} pressed={!!selEl?.collapsed}
          onClick={() => s.toggleCollapsed()}><Icon name="collapse" /></ToolButton>
        <ToolButton label={t('diagramProps')} onClick={() => s.openEditor({ t: 'root' })}><Icon name="diagram" /></ToolButton>
      </div>

      <main className="workspace">
        <DiagramView />
      </main>

      <footer className="statusbar">
        <span>{s.selection ? (selEl ? t(('kind.' + selEl.kind) as TKey) : s.selection.t === 'root' ? t('diagramProps') : '∅') : t('selectHint')}</span>
        <span className="status-right">{storageOk ? t('autosaved') : t('unsaved')}</span>
      </footer>

      <ElementEditor />
      <DiagramEditor />

      {about && (
        <Modal title={`${t('appName')} ${APP_VERSION}`} onClose={() => setAbout(false)} cancelLabel={t('close')}>
          <p>{t('aboutText')}</p>
          <p><strong>{t('privacy')}</strong></p>
          <p>{t('sourceCode')}: <a href={REPO_URL} target="_blank" rel="noopener noreferrer">{REPO_URL}</a> · Structorizer Desktop: <a href="https://github.com/fesch/Structorizer.Desktop" target="_blank" rel="noopener noreferrer">fesch/Structorizer.Desktop</a></p>
          <h3>{t('keyboard')}</h3>
          <p className="small">{t('keysList')}</p>
          <p className="small hint">{t('keysNote')}</p>
        </Modal>
      )}

      {s.message && (
        <div className={'toast ' + s.message.kind} role="status" onClick={() => useStore.setState({ message: null })}>{s.message.text}</div>
      )}
    </div>
  );
}
