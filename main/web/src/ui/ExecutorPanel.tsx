// SPDX-License-Identifier: GPL-3.0-or-later
// Executor control panel, variable watch, call stack, console, and Turtleizer window (P2-06, P2-07, P2-09).
import { useEffect, useRef, useState } from 'react';
import { formatValue, parseInputString, turtleToSvg, typeNameOf, type RuntimeVal } from '../core/exec';
import { parseSignature } from '../core/lang/analyze';
import { useTranslator } from '../i18n';
import { useStore } from '../store/diagramStore';
import { useExecStore } from '../store/execStore';
import { usePrefs } from '../store/prefsStore';

export function ExecutorPanel() {
  const ex = useExecStore();
  const diagram = useStore((s) => s.diagram);
  const selection = useStore((s) => s.selection);
  const lang = usePrefs((p) => p.lang);
  const t = useTranslator(lang);

  const [inputVal, setInputVal] = useState('');
  const [editingVar, setEditingVar] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [subArgs, setSubArgs] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const sig = parseSignature(diagram);
  const isSubWithParams = diagram.diagramType === 'sub' && sig.params.length > 0;

  useEffect(() => {
    if (ex.status === 'waitingInput') {
      setInputVal('');
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [ex.status, ex.inputRequest]);

  if (!ex.open && !ex.turtleOpen) return null;

  const frames = ex.execState.frames;
  const topFrame = frames[frames.length - 1];
  const vars = topFrame ? [...topFrame.vars.entries()] : [];

  const getDefaultSubArg = (name: string, idx: number): string => {
    if (subArgs[name] !== undefined) return subArgs[name];
    if (sig.name.toLowerCase() === 'hilbert') {
      return idx === 0 ? '12' : idx === 1 ? '4' : '1';
    }
    return sig.params[idx]?.def ?? '1';
  };

  const buildArgs = (): RuntimeVal[] | undefined => {
    if (!isSubWithParams) return undefined;
    return sig.params.map((p, i) => parseInputString(getDefaultSubArg(p.name, i), p.type, diagram.id));
  };

  const handleRun = () => {
    if (ex.status === 'paused') ex.resume();
    else ex.start('run', buildArgs());
  };

  const handleStep = () => {
    if (ex.status === 'idle' || ex.status === 'done' || ex.status === 'error') {
      ex.start('step', buildArgs());
    } else {
      ex.step();
    }
  };

  const selElId = selection?.t === 'el' ? selection.id : undefined;
  const hasBp = selElId ? ex.breakpoints.has(selElId) : false;

  return (
    <>
      {ex.open && (
        <section className="exec-panel" aria-label={t('executor')}>
          <div className="exec-bar">
            <strong className="exec-title">{t('executor')}</strong>
            <span className={'exec-badge ' + ex.status}>{ex.status.toUpperCase()}</span>
            <button
              type="button"
              className="btn small primary"
              disabled={ex.status === 'running' || ex.status === 'waitingInput'}
              onClick={handleRun}
            >
              ▶ {ex.status === 'paused' ? 'Resume' : 'Run'}
            </button>
            <button
              type="button"
              className="btn small"
              disabled={ex.status === 'waitingInput'}
              onClick={handleStep}
            >
              ⏭ Step
            </button>
            <button
              type="button"
              className="btn small"
              disabled={ex.status !== 'running'}
              onClick={ex.pause}
            >
              ⏸ Pause
            </button>
            <button
              type="button"
              className="btn small"
              disabled={ex.status === 'idle'}
              onClick={ex.stop}
            >
              ⏹ Stop
            </button>
            <label className="exec-speed" title="Execution delay per step (ms)">
              <span>Speed</span>
              <input
                type="range"
                min={0}
                max={800}
                step={20}
                value={800 - Math.min(800, ex.speedMs)}
                onChange={(e) => ex.setSpeed(800 - +e.target.value)}
              />
              <small>{ex.speedMs} ms</small>
            </label>
            <button
              type="button"
              className={'btn small' + (hasBp ? ' bp-on' : '')}
              disabled={!selElId}
              title={`${t('breakpoint')} (Ctrl+B)`}
              onClick={() => ex.toggleBreakpoint(selElId)}
            >
              ● {t('breakpoint')}
            </button>
            <button
              type="button"
              className={'btn small' + (ex.coverageOverlay ? ' on' : '')}
              aria-pressed={ex.coverageOverlay}
              onClick={ex.toggleCoverage}
              title="Toggle execution count & coverage overlay (P2-09)"
            >
              ✓ Coverage
            </button>
            <button
              type="button"
              className={'btn small' + (ex.turtleOpen ? ' on' : '')}
              aria-pressed={ex.turtleOpen}
              onClick={() => ex.setTurtleOpen(!ex.turtleOpen)}
            >
              🐢 {t('turtleizer')}
            </button>
            <button
              type="button"
              className="icon-btn close"
              aria-label={t('close')}
              title={t('close')}
              onClick={() => { ex.stop(); ex.setOpen(false); }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {isSubWithParams && (ex.status === 'idle' || ex.status === 'done' || ex.status === 'error') && (
            <div className="exec-params">
              <span className="hint">Parameters for <code>{sig.name}</code>:</span>
              {sig.params.map((p, i) => (
                <label key={p.name} className="exec-param">
                  <span>{p.name}:</span>
                  <input
                    type="text"
                    value={getDefaultSubArg(p.name, i)}
                    onChange={(e) => setSubArgs({ ...subArgs, [p.name]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          )}

          {ex.status === 'waitingInput' && ex.inputRequest && (
            <form
              className="exec-input-bar"
              onSubmit={(e) => {
                e.preventDefault();
                ex.submitInput(inputVal);
              }}
            >
              <label>
                <strong>INPUT</strong> <span>{ex.inputRequest.prompt}</span>
              </label>
              <input
                ref={inputRef}
                type="text"
                value={inputVal}
                placeholder={`Value for ${ex.inputRequest.target}`}
                onChange={(e) => setInputVal(e.target.value)}
              />
              <button type="submit" className="btn small primary">{t('ok')}</button>
            </form>
          )}

          <div className="exec-grid">
            <div className="exec-vars">
              <div className="exec-sec-head">
                <span>Variables {topFrame ? `(${topFrame.name})` : ''}</span>
                {frames.length > 1 && (
                  <span className="exec-stack" title="Call stack">
                    Stack: {frames.map((f) => f.name).join(' → ')}
                  </span>
                )}
              </div>
              {vars.length === 0 ? (
                <p className="hint small exec-empty">No variables assigned yet.</p>
              ) : (
                <table className="keys exec-table">
                  <thead>
                    <tr><th>Name</th><th>Type</th><th>Value</th></tr>
                  </thead>
                  <tbody>
                    {vars.map(([name, val]) => {
                      const ty = typeNameOf(val, topFrame?.types.get(name));
                      const isEditing = editingVar === name;
                      return (
                        <tr key={name}>
                          <td><code>{name}</code></td>
                          <td className="hint">{ty}</td>
                          <td
                            onClick={() => {
                              if (ex.status === 'paused' || ex.status === 'done') {
                                setEditingVar(name);
                                setEditVal(formatValue(val));
                              }
                            }}
                            title={ex.status === 'paused' ? 'Click to edit variable value' : undefined}
                          >
                            {isEditing ? (
                              <input
                                type="text"
                                className="watch-edit"
                                value={editVal}
                                autoFocus
                                onChange={(e) => setEditVal(e.target.value)}
                                onBlur={() => { ex.setWatchVar(name, editVal); setEditingVar(null); }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { ex.setWatchVar(name, editVal); setEditingVar(null); }
                                  else if (e.key === 'Escape') setEditingVar(null);
                                }}
                              />
                            ) : (
                              <code>{formatValue(val)}</code>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="exec-console">
              <div className="exec-sec-head">
                <span>Output Console ({ex.execState.outputs.length})</span>
                {ex.returnValue !== undefined && ex.returnValue !== null && (
                  <span className="exec-ret">Return: <code>{formatValue(ex.returnValue)}</code></span>
                )}
              </div>
              <div className="exec-out-list">
                {ex.execState.outputs.map((line, i) => (
                  <div key={i} className="exec-out-line"><code>{line}</code></div>
                ))}
                {ex.error && (
                  <div
                    className="exec-error"
                    onClick={() => {
                      if (ex.error?.elementId) useStore.getState().select({ t: 'el', id: ex.error.elementId });
                    }}
                  >
                    ⚠ {ex.error.message}
                  </div>
                )}
                {ex.execState.outputs.length === 0 && !ex.error && (
                  <p className="hint small exec-empty">Program output will appear here.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
      {ex.turtleOpen && <TurtleizerPanel />}
    </>
  );
}

function TurtleizerPanel() {
  const ex = useExecStore();
  const lang = usePrefs((p) => p.lang);
  const t = useTranslator(lang);
  const turtle = ex.execState.turtle;

  const xs = [turtle.homeX, turtle.x, ...turtle.segments.flatMap((s) => [s.x1, s.x2])];
  const ys = [turtle.homeY, turtle.y, ...turtle.segments.flatMap((s) => [s.y1, s.y2])];
  const minX = Math.floor(Math.min(0, ...xs) - 24);
  const minY = Math.floor(Math.min(0, ...ys) - 24);
  const maxX = Math.ceil(Math.max(500, ...xs) + 24);
  const maxY = Math.ceil(Math.max(500, ...ys) + 24);
  const vw = Math.max(200, maxX - minX);
  const vh = Math.max(200, maxY - minY);

  const downloadSvg = () => {
    const svg = turtleToSvg(turtle);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'turtleizer.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="turtle-float" role="dialog" aria-label={t('turtleizer')}>
      <div className="turtle-head">
        <strong>🐢 {t('turtleizer')}</strong>
        <span className="hint small">
          X: {Math.round(turtle.x)} · Y: {Math.round(turtle.y)} · {Math.round(turtle.orientation)}°
        </span>
        <button type="button" className="btn small" onClick={ex.clearTurtle}>Clear</button>
        <button type="button" className="btn small" onClick={downloadSvg}>SVG</button>
        <button type="button" className="icon-btn close" aria-label={t('close')} onClick={() => ex.setTurtleOpen(false)}>
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="turtle-canvas-wrap" style={{ background: turtle.bgColor }}>
        <svg viewBox={`${minX} ${minY} ${vw} ${vh}`} className="turtle-svg">
          {turtle.segments.map((s, i) => (
            <line
              key={i}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke={s.color}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          ))}
          {turtle.visible && (
            <g transform={`translate(${turtle.x}, ${turtle.y}) rotate(${turtle.orientation})`}>
              <polygon points="0,-9 6,7 0,4 -6,7" fill="#16a34a" stroke="#052e16" strokeWidth="1.2" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
