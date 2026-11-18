// SPDX-License-Identifier: GPL-3.0-or-later
// MCP server (stdio) for Structorizer diagrams, in the style of the Craft apps' "<app>-cli mcp".
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { generateCode, LANGUAGES, type LangId } from '../../web/src/core/gen/generators';
import { diagramVariables, parseSignature } from '../../web/src/core/lang/analyze';
import { createLayoutEngine } from '../../web/src/core/layout';
import { insertAt, moveTo, removeById, updateElement, walk, type DiagramType } from '../../web/src/core/model';
import { sceneToEmf } from '../../web/src/core/render/emf';
import { sceneToSvg } from '../../web/src/core/render/svg';
import {
  approxMeasure, buildDiagram, buildElement, elementAt, outline, toJson, toPosition, VERSION, Workspace,
  type ElementInput, type PositionInput,
} from './diagrams';

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const fail = (e: unknown) => ({ content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true });

const ELEMENT_HELP = 'An element is a JSON object {kind, text?, comment?, color?, disabled?, then?, else?, body?, branches?, try?, catch?, finally?}. ' +
  'kind: instruction | call | jump | alternative (IF) | case | for | while | repeat | forever | parallel | try. ' +
  'text: string or array of lines, e.g. "x <- 5", "INPUT x", "OUTPUT \\"x = \\", x"; IF: condition; CASE: [discriminator, selector lines..., "default"]; ' +
  'FOR: "for i <- 1 to 10" or "foreach v in {1,2,3}"; WHILE: "while (cond)"; REPEAT: "until (cond)"; jump: "leave" | "return x" | "exit 1" | "throw \\"msg\\""; ' +
  'parallel: number of threads; try: name of the exception variable. then/else/body/try/catch/finally are arrays of elements, branches is an array of arrays (CASE branches, parallel threads).';

const positionSchema = z.object({
  parent: z.string().optional().describe('path of the structured element to insert into, e.g. "2"; omit for the top level'),
  slot: z.enum(['then', 'else', 'body', 'try', 'catch', 'finally', 'branch']).optional(),
  branch: z.number().int().min(0).optional().describe('branch number for CASE and PARALLEL (0-based)'),
  index: z.number().int().min(0).optional().describe('insert before this index; default: at the end'),
}).optional();

export async function runMcpServer(ws: Workspace): Promise<void> {
  const server = new McpServer({ name: 'structorizer', version: VERSION });

  server.registerTool('list-diagrams', {
    description: 'Lists the Structorizer diagram files (.nsd) under the root folder or a sub folder.',
    inputSchema: { dir: z.string().optional().describe('folder relative to the root, default "."') },
    annotations: { readOnlyHint: true },
  }, async ({ dir }) => {
    try {
      const files = await ws.list(dir ?? '.');
      return text(files.length ? files.join('\n') : 'No .nsd files found.');
    } catch (e) { return fail(e); }
  });

  server.registerTool('read-diagram', {
    description: 'Reads a diagram: an outline with the element paths (used by the editing tools) and the full JSON tree.',
    inputSchema: { path: z.string().describe('diagram file, e.g. "sort.nsd"'), format: z.enum(['outline', 'json', 'both']).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ path, format }) => {
    try {
      const d = await ws.load(path);
      const f = format ?? 'both';
      const parts: string[] = [];
      if (f !== 'json') parts.push(outline(d));
      if (f !== 'outline') parts.push(JSON.stringify(toJson(d), null, 1));
      return text(parts.join('\n\n'));
    } catch (e) { return fail(e); }
  });

  server.registerTool('diagram-info', {
    description: 'Header, parameters, variables, element counts and metadata of a diagram.',
    inputSchema: { path: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ path }) => {
    try {
      const d = await ws.load(path);
      const sig = parseSignature(d);
      const counts: Record<string, number> = {};
      walk(d, (el) => { counts[el.kind] = (counts[el.kind] ?? 0) + 1; });
      return text(JSON.stringify({
        type: d.diagramType, name: sig.name,
        parameters: sig.params.map((p) => ({ name: p.name, type: p.type.base + (p.type.array ? '[]' : ''), default: p.def })),
        result: sig.result ? sig.result.base : null, variables: [...diagramVariables(d)].sort(), elements: counts, meta: d.meta,
      }, null, 1));
    } catch (e) { return fail(e); }
  });

  server.registerTool('export-code', {
    description: `Generates program code from a diagram (${LANGUAGES.map((l) => l.name).join(', ')}). Returns the code; with output it is also written to a file.`,
    inputSchema: {
      path: z.string(),
      language: z.enum(LANGUAGES.map((l) => l.id) as [LangId, ...LangId[]]),
      output: z.string().optional().describe('file to write, relative to the root'),
      subroutines: z.array(z.string()).optional().describe('other .nsd files with called subroutines or includables'),
    },
  }, async ({ path, language, output, subroutines }) => {
    try {
      const d = await ws.load(path);
      const pool = [d, ...(await Promise.all((subroutines ?? []).map((p) => ws.load(p))))];
      const r = generateCode(d, language, { pool, version: VERSION });
      if (output) await ws.writeFile(output, r.code);
      return text(r.code);
    } catch (e) { return fail(e); }
  });

  if (!ws.readOnly) {
    server.registerTool('create-diagram', {
      description: `Creates a new diagram file. ${ELEMENT_HELP}`,
      inputSchema: {
        path: z.string().describe('new file, e.g. "factorial.nsd"'),
        type: z.enum(['program', 'sub', 'includable']).optional(),
        name: z.string().describe('program name or subroutine signature, e.g. "fact(n: int): int"'),
        comment: z.string().optional(),
        elements: z.array(z.any()).describe('top-level elements (see the element format above)'),
        overwrite: z.boolean().optional(),
      },
      annotations: { destructiveHint: false },
    }, async ({ path, type, name, comment, elements, overwrite }) => {
      try {
        if (!overwrite) {
          const exists = await ws.load(path).then(() => true, () => false);
          if (exists) throw new Error(`${path} exists; pass overwrite: true to replace it`);
        }
        const d = buildDiagram((type ?? 'program') as DiagramType, name, comment, elements as ElementInput[]);
        await ws.save(path, d);
        return text(`Created ${path}\n\n${outline(d)}`);
      } catch (e) { return fail(e); }
    });

    server.registerTool('add-element', {
      description: `Inserts an element (with nested elements) into a diagram. ${ELEMENT_HELP}`,
      inputSchema: { path: z.string(), element: z.any().describe('the element to insert'), at: positionSchema },
    }, async ({ path, element, at }) => {
      try {
        const d = await ws.load(path);
        const el = buildElement(element as ElementInput, d);
        const next = insertAt(d, toPosition(d, at as PositionInput | undefined), el);
        await ws.save(path, next);
        return text(outline(next));
      } catch (e) { return fail(e); }
    });

    server.registerTool('update-element', {
      description: 'Changes text, comment, colour (6 hex digits) or disabled state of the element at a path.',
      inputSchema: {
        path: z.string(), element: z.string().describe('element path from read-diagram, e.g. "1/then/0"'),
        text: z.union([z.string(), z.array(z.string())]).optional(),
        comment: z.union([z.string(), z.array(z.string())]).optional(),
        color: z.string().optional(), disabled: z.boolean().optional(),
      },
    }, async ({ path, element, text: t, comment, color, disabled }) => {
      try {
        const d = await ws.load(path);
        const el = elementAt(d, element);
        const asLines = (v: string | string[]) => (Array.isArray(v) ? v : v.split(/\r?\n/));
        const next = updateElement(d, el.id, {
          ...(t !== undefined ? { text: asLines(t) } : {}),
          ...(comment !== undefined ? { comment: asLines(comment) } : {}),
          ...(color && /^#?[0-9a-f]{6}$/i.test(color) ? { color: color.replace('#', '').toLowerCase() } : {}),
          ...(disabled !== undefined ? { disabled } : {}),
        });
        await ws.save(path, next);
        return text(outline(next));
      } catch (e) { return fail(e); }
    });

    server.registerTool('delete-element', {
      description: 'Deletes the element at a path (with all nested elements).',
      inputSchema: { path: z.string(), element: z.string() },
      annotations: { destructiveHint: true },
    }, async ({ path, element }) => {
      try {
        const d = await ws.load(path);
        const next = removeById(d, elementAt(d, element).id);
        await ws.save(path, next);
        return text(outline(next));
      } catch (e) { return fail(e); }
    });

    server.registerTool('move-element', {
      description: 'Moves the element at a path to another position (an element cannot move into itself).',
      inputSchema: { path: z.string(), element: z.string(), to: positionSchema },
    }, async ({ path, element, to }) => {
      try {
        const d = await ws.load(path);
        const el = elementAt(d, element);
        const next = moveTo(d, el.id, toPosition(d, to as PositionInput | undefined));
        if (next === d) throw new Error('This move is not possible');
        await ws.save(path, next);
        return text(outline(next));
      } catch (e) { return fail(e); }
    });

    server.registerTool('export-picture', {
      description: 'Writes the diagram as SVG or EMF (vector) file next to it or to output.',
      inputSchema: { path: z.string(), format: z.enum(['svg', 'emf']), output: z.string().optional() },
    }, async ({ path, format, output }) => {
      try {
        const d = await ws.load(path);
        const scene = createLayoutEngine(approxMeasure, { highlight: true }).layout(d);
        const out = output ?? path.replace(/\.nsd$/i, `.${format}`);
        await ws.writeFile(out, format === 'svg' ? sceneToSvg(scene, { standalone: true, title: d.text[0] }) : sceneToEmf(scene, approxMeasure));
        return text(`Wrote ${out} (${Math.round(scene.width)} x ${Math.round(scene.height)} px)`);
      } catch (e) { return fail(e); }
    });
  }

  await server.connect(new StdioServerTransport());
}
