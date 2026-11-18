// SPDX-License-Identifier: GPL-3.0-or-later
// structorizer-cli: headless tools for Structorizer diagrams.
//   structorizer-cli mcp [--root <dir>] [--read-only]
//   structorizer-cli code <file.nsd> --lang <id> [--root <dir>]
//   structorizer-cli outline <file.nsd>
//   structorizer-cli info <file.nsd>
//   structorizer-cli validate <file.nsd>
//   structorizer-cli find <query> [--dir <dir>]
//   structorizer-cli export <file.nsd> --format svg|emf [--out <file>]
import path from 'node:path';
import { generateCode, LANGUAGES, type LangId } from '../../web/src/core/gen/generators';
import { diagramVariables, parseSignature } from '../../web/src/core/lang/analyze';
import { createLayoutEngine } from '../../web/src/core/layout';
import { walk } from '../../web/src/core/model';
import { sceneToEmf } from '../../web/src/core/render/emf';
import { sceneToSvg } from '../../web/src/core/render/svg';
import {
  approxMeasure, findInDiagram, loadWorkspacePool, outline, validateDiagram, VERSION, Workspace,
} from './diagrams';
import { runMcpServer } from './server';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const [cmd, file] = process.argv.slice(2);
  const root = path.resolve(arg('--root') ?? process.cwd());
  const ws = new Workspace(root, process.argv.includes('--read-only'));
  switch (cmd) {
    case 'mcp':
      await runMcpServer(ws);
      return;
    case 'code': {
      const lang = (arg('--lang') ?? 'python') as LangId;
      if (!LANGUAGES.some((l) => l.id === lang)) throw new Error(`Unknown language ${lang}`);
      const d = await ws.load(file);
      const pool = [d, ...(await loadWorkspacePool(ws, file))];
      process.stdout.write(generateCode(d, lang, { pool, version: VERSION }).code);
      return;
    }
    case 'outline':
      process.stdout.write(outline(await ws.load(file)) + '\n');
      return;
    case 'info': {
      const d = await ws.load(file);
      const sig = parseSignature(d);
      const counts: Record<string, number> = {};
      walk(d, (el) => { counts[el.kind] = (counts[el.kind] ?? 0) + 1; });
      process.stdout.write(JSON.stringify({
        type: d.diagramType, name: sig.name, framed: d.boxed, includes: d.includeList,
        variables: [...diagramVariables(d)].sort(), elements: counts, meta: d.meta,
      }, null, 2) + '\n');
      return;
    }
    case 'validate': {
      const d = await ws.load(file);
      const pool = await loadWorkspacePool(ws, file);
      const res = validateDiagram(d, pool);
      process.stdout.write(JSON.stringify(res, null, 2) + '\n');
      if (!res.valid) process.exitCode = 1;
      return;
    }
    case 'find': {
      const files = await ws.list(arg('--dir') ?? '.');
      const out = [];
      for (const f of files) {
        try {
          const matches = findInDiagram(await ws.load(f), file);
          if (matches.length) out.push({ file: f, matches });
        } catch { /* skip */ }
      }
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      return;
    }
    case 'export': {
      const fmt = (arg('--format') ?? 'svg') as 'svg' | 'emf';
      if (fmt !== 'svg' && fmt !== 'emf') throw new Error(`Unknown format ${fmt} (use svg or emf)`);
      const d = await ws.load(file);
      const scene = createLayoutEngine(approxMeasure, { highlight: true }).layout(d);
      const out = arg('--out') ?? file.replace(/\.nsd$/i, `.${fmt}`);
      await ws.writeFile(out, fmt === 'svg' ? sceneToSvg(scene, { standalone: true, title: d.text[0] }) : sceneToEmf(scene, approxMeasure));
      process.stdout.write(`Wrote ${out}\n`);
      return;
    }
    case '--version':
    case 'version':
      process.stdout.write(`structorizer-cli ${VERSION}\n`);
      return;
    default: {
      const langs = LANGUAGES.map((l) => l.id).join('|');
      process.stdout.write(
        `Usage: structorizer-cli mcp [--root <dir>] [--read-only]\n` +
        `       structorizer-cli code <file.nsd> --lang <${langs}> [--root <dir>]\n` +
        `       structorizer-cli outline|info|validate <file.nsd> [--root <dir>]\n` +
        `       structorizer-cli find <query> [--dir <dir>] [--root <dir>]\n` +
        `       structorizer-cli export <file.nsd> --format <svg|emf> [--out <file>] [--root <dir>]\n`,
      );
    }
  }
}

main().catch((e) => {
  process.stderr.write(`structorizer-cli: ${(e as Error).message}\n`);
  process.exit(1);
});
