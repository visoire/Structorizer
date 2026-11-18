// SPDX-License-Identifier: GPL-3.0-or-later
// structorizer-cli: headless tools for Structorizer diagrams.
//   structorizer-cli mcp [--root <dir>] [--read-only]     MCP server on stdio
//   structorizer-cli code <file.nsd> --lang <python|java|javascript|cpp|php|bash>
//   structorizer-cli outline <file.nsd>
import path from 'node:path';
import { generateCode, LANGUAGES, type LangId } from '../../web/src/core/gen/generators';
import { outline, VERSION, Workspace } from './diagrams';
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
      process.stdout.write(generateCode(await ws.load(file), lang, { version: VERSION }).code);
      return;
    }
    case 'outline':
      process.stdout.write(outline(await ws.load(file)) + '\n');
      return;
    case '--version':
    case 'version':
      process.stdout.write(`structorizer-cli ${VERSION}\n`);
      return;
    default:
      process.stdout.write('Usage: structorizer-cli mcp [--root <dir>] [--read-only] | code <file.nsd> --lang <id> | outline <file.nsd>\n');
  }
}

main().catch((e) => {
  process.stderr.write(`structorizer-cli: ${(e as Error).message}\n`);
  process.exit(1);
});
