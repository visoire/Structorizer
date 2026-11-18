// SPDX-License-Identifier: GPL-3.0-or-later
// MCP server (stdio) for Structorizer diagrams, modelled on the Craft apps' MCP servers.
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { generateCode, LANGUAGES, type LangId } from '../../web/src/core/gen/generators';
import { diagramVariables, parseSignature } from '../../web/src/core/lang/analyze';
import { createLayoutEngine } from '../../web/src/core/layout';
import { walk, type Diagram, type DiagramType, type Element } from '../../web/src/core/model';
import { sceneToEmf } from '../../web/src/core/render/emf';
import { sceneToSvg } from '../../web/src/core/render/svg';
import {
  approxMeasure, buildDiagram, buildElement, elementAt, findInDiagram, insertAt, KINDS,
  loadWorkspacePool, moveTo, normalizeColor, outline, removeById, replaceInDiagram,
  setCollapsedAt, toJson, toPosition, transmuteElementAt, updateElement, updateHeader,
  validateDiagram, VERSION, Workspace,
  type ElementInput, type PositionInput,
} from './diagrams';

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const fail = (e: unknown) => ({ content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true });

const ro = (title: string) => ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const rw = (title: string, destructive = false, idempotent = false) => ({ title, readOnlyHint: false, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: false });

const ELEMENT_HELP = 'An element is a JSON object {kind, text?, comment?, color?, disabled?, then?, else?, body?, branches?, try?, catch?, finally?}. ' +
  'kind: instruction | call | jump | alternative (IF) | case | for | while | repeat | forever | parallel | try. ' +
  'text: string or array of lines, e.g. "x <- 5", "INPUT x", "OUTPUT \\"x = \\", x"; IF: condition; CASE: [discriminator, selector lines..., "default"]; ' +
  'FOR: "for i <- 1 to 10" or "foreach v in {1,2,3}"; WHILE: "while (cond)"; REPEAT: "until (cond)"; jump: "leave" | "return x" | "exit 1" | "throw \\"msg\\""; ' +
  'parallel: number of threads; try: name of the exception variable. then/else/body/try/catch/finally are arrays of elements, branches is an array of arrays (CASE branches, parallel threads).';

const SYNTAX_REF = [
  '# Structorizer Syntax & MCP Reference',
  '',
  '## Element kinds',
  `- \`instruction\`: assignments (\`x <- 5\`), declarations (\`var n: int <- 0\`), I/O (\`INPUT x\`, \`OUTPUT "v=", x\`)`,
  `- \`call\`: subroutine calls (\`result <- fact(n)\`, \`greet("hi")\`)`,
  `- \`jump\`: \`leave [n]\`, \`return [expr]\`, \`exit [code]\`, \`throw "msg"\` (empty = leave)`,
  `- \`alternative\`: \`text\` is condition; children in \`then\` and \`else\``,
  `- \`case\`: \`text\` is \`[discriminator, branch0Selectors..., defaultOr%]\`; children in \`branches[]\``,
  `- \`for\`: \`"for i <- 1 to 10 by 2"\` or \`"foreach v in {1, 2, 3}"\`; children in \`body\``,
  `- \`while\`: \`"while (cond)"\`; children in \`body\``,
  `- \`repeat\`: \`"until (cond)"\`; children in \`body\``,
  `- \`forever\`: unconditional loop; children in \`body\``,
  `- \`parallel\`: concurrent threads; \`branches[]\` arrays`,
  `- \`try\`: \`text\` = caught exception variable; children in \`try\`, \`catch\`, \`finally\``,
  '',
  '## Code export languages',
  LANGUAGES.map((l) => `- \`${l.id}\` (${l.name}, \`.${l.ext}\`)`).join('\n'),
  '',
  '## Element paths',
  'Zero-based tree paths: `"0"`, `"1/then/0"`, `"1/else/2/body/0"`, `"3/branch/1/0"`, `"4/catch/0"`.',
].join('\n');

const positionSchema = z.object({
  parent: z.string().optional().describe('path of the structured element to insert into, e.g. "2"; omit for the top level'),
  slot: z.enum(['then', 'else', 'body', 'try', 'catch', 'finally', 'branch']).optional(),
  branch: z.number().int().min(0).optional().describe('branch number for CASE and PARALLEL (0-based)'),
  index: z.number().int().min(0).optional().describe('insert before this index; default: at the end'),
}).optional();

const batchOpSchema = z.object({
  op: z.enum(['add', 'update', 'delete', 'move', 'transmute', 'collapse', 'set-header']),
  element: z.any().optional().describe('for "add": ElementInput object; for "update"/"delete"/"move"/"transmute"/"collapse": target path (e.g. "1/then/0")'),
  at: positionSchema.describe('for "add": insert position'),
  to: positionSchema.describe('for "move": destination position'),
  text: z.union([z.string(), z.array(z.string())]).optional(),
  comment: z.union([z.string(), z.array(z.string())]).optional(),
  color: z.string().optional(),
  disabled: z.boolean().optional(),
  collapsed: z.boolean().optional(),
  name: z.union([z.string(), z.array(z.string())]).optional().describe('for "set-header"'),
  type: z.enum(['program', 'sub', 'includable']).optional().describe('for "set-header"'),
  framed: z.boolean().optional().describe('for "set-header"'),
  includes: z.array(z.string()).optional().describe('for "set-header"'),
  author: z.string().optional().describe('for "set-header"'),
  license: z.string().optional().describe('for "set-header"'),
});

const asLines = (v: string | string[]) => (Array.isArray(v) ? v : v.split(/\r?\n/));

function applyBatchOp(d: Diagram, op: z.infer<typeof batchOpSchema>): Diagram {
  switch (op.op) {
    case 'add':
      if (!op.element || typeof op.element !== 'object') throw new Error('batch "add" requires element object');
      return insertAt(d, toPosition(d, op.at as PositionInput | undefined), buildElement(op.element as ElementInput, d));
    case 'update': {
      if (typeof op.element !== 'string') throw new Error('batch "update" requires element path string');
      const target = elementAt(d, op.element);
      const col = normalizeColor(op.color);
      return updateElement(d, target.id, {
        ...(op.text !== undefined ? { text: asLines(op.text) } : {}),
        ...(op.comment !== undefined ? { comment: asLines(op.comment) } : {}),
        ...(col ? { color: col } : {}),
        ...(op.disabled !== undefined ? { disabled: op.disabled } : {}),
        ...(op.collapsed !== undefined ? { collapsed: op.collapsed } : {}),
      });
    }
    case 'delete':
      if (typeof op.element !== 'string') throw new Error('batch "delete" requires element path string');
      return removeById(d, elementAt(d, op.element).id);
    case 'move': {
      if (typeof op.element !== 'string') throw new Error('batch "move" requires element path string');
      const next = moveTo(d, elementAt(d, op.element).id, toPosition(d, op.to as PositionInput | undefined));
      if (next === d) throw new Error(`Cannot move "${op.element}" to requested position`);
      return next;
    }
    case 'transmute':
      if (typeof op.element !== 'string') throw new Error('batch "transmute" requires element path string');
      return transmuteElementAt(d, op.element);
    case 'collapse':
      if (typeof op.element !== 'string') throw new Error('batch "collapse" requires element path string');
      return setCollapsedAt(d, op.element, op.collapsed ?? true);
    case 'set-header':
      return updateHeader(d, {
        type: op.type, name: op.name, comment: op.comment, framed: op.framed,
        includes: op.includes, author: op.author, license: op.license,
      });
  }
}

export async function runMcpServer(ws: Workspace): Promise<void> {
  const server = new McpServer({ name: 'structorizer', title: 'Structorizer', version: VERSION });
  const catalog: { name: string; title: string; readOnly: boolean; description: string }[] = [];
  const toolCfg = <C extends { title: string; description: string; inputSchema: z.ZodRawShape; annotations: ReturnType<typeof ro> }>(
    name: string,
    cfg: C,
  ): C => {
    catalog.push({ name, title: cfg.title, readOnly: !!cfg.annotations.readOnlyHint, description: cfg.description });
    return cfg;
  };

  server.registerTool('list-commands', toolCfg('list-commands', {
    title: 'List commands',
    description: 'Lists Structorizer MCP tools, element kinds and supported code export languages.',
    inputSchema: { query: z.string().optional().describe('optional filter substring') },
    annotations: ro('List commands'),
  }), async ({ query }) => {
    const q = query?.trim().toLowerCase() ?? '';
    const tools = q ? catalog.filter((c) => c.name.includes(q) || c.description.toLowerCase().includes(q)) : catalog;
    return text(JSON.stringify({
      version: VERSION,
      readOnly: ws.readOnly,
      tools,
      elementKinds: KINDS,
      codeLanguages: LANGUAGES,
    }, null, 1));
  });

  server.registerTool('list-diagrams', toolCfg('list-diagrams', {
    title: 'List diagrams',
    description: 'Lists the Structorizer diagram files (.nsd) under the root folder or a sub folder.',
    inputSchema: {
      dir: z.string().optional().describe('folder relative to the root, default "."'),
      depth: z.number().int().min(0).max(10).optional().describe('directory traversal depth, default 4'),
    },
    annotations: ro('List diagrams'),
  }), async ({ dir, depth }) => {
    try {
      const files = await ws.list(dir ?? '.', depth ?? 4);
      return text(files.length ? files.join('\n') : 'No .nsd files found.');
    } catch (e) { return fail(e); }
  });

  server.registerTool('read-diagram', toolCfg('read-diagram', {
    title: 'Read diagram',
    description: 'Reads a diagram (or one element subtree): an outline with element paths and the JSON tree.',
    inputSchema: {
      path: z.string().describe('diagram file, e.g. "sort.nsd"'),
      format: z.enum(['outline', 'json', 'both']).optional(),
      element: z.string().optional().describe('optional element path to inspect a single subtree'),
    },
    annotations: ro('Read diagram'),
  }), async ({ path, format, element }) => {
    try {
      const d = await ws.load(path);
      if (element) {
        const el: Element = elementAt(d, element);
        return text(JSON.stringify(el, null, 1));
      }
      const f = format ?? 'both';
      const parts: string[] = [];
      if (f !== 'json') parts.push(outline(d));
      if (f !== 'outline') parts.push(JSON.stringify(toJson(d), null, 1));
      return text(parts.join('\n\n'));
    } catch (e) { return fail(e); }
  });

  server.registerTool('diagram-info', toolCfg('diagram-info', {
    title: 'Diagram info',
    description: 'Header, parameters, variables, includes, element counts, validation summary and metadata of a diagram.',
    inputSchema: { path: z.string() },
    annotations: ro('Diagram info'),
  }), async ({ path }) => {
    try {
      const d = await ws.load(path);
      const sig = parseSignature(d);
      const counts: Record<string, number> = {};
      walk(d, (el) => { counts[el.kind] = (counts[el.kind] ?? 0) + 1; });
      const pool = await loadWorkspacePool(ws, path);
      const check = validateDiagram(d, pool);
      return text(JSON.stringify({
        type: d.diagramType,
        name: sig.name,
        framed: d.boxed,
        includes: d.includeList,
        parameters: sig.params.map((p) => ({ name: p.name, type: p.type.base + (p.type.array ? '[]' : ''), default: p.def })),
        result: sig.result ? sig.result.base : null,
        variables: [...diagramVariables(d)].sort(),
        elements: counts,
        meta: d.meta,
        warnings: check.issues.filter((i) => i.level !== 'info').length,
      }, null, 1));
    } catch (e) { return fail(e); }
  });

  server.registerTool('validate-diagram', toolCfg('validate-diagram', {
    title: 'Validate diagram',
    description: 'Validates a diagram for empty branches, unparsed FOR headers, disabled blocks and missing workspace subroutines/includables.',
    inputSchema: { path: z.string() },
    annotations: ro('Validate diagram'),
  }), async ({ path }) => {
    try {
      const d = await ws.load(path);
      const pool = await loadWorkspacePool(ws, path);
      return text(JSON.stringify(validateDiagram(d, pool), null, 1));
    } catch (e) { return fail(e); }
  });

  server.registerTool('find-in-diagrams', toolCfg('find-in-diagrams', {
    title: 'Find in diagrams',
    description: 'Searches element text and comments across a diagram or all .nsd files in a folder.',
    inputSchema: {
      query: z.string().describe('text to search for'),
      path: z.string().optional().describe('single .nsd file; omit to search all .nsd files under dir'),
      dir: z.string().optional().describe('folder when path is omitted, default "."'),
      matchCase: z.boolean().optional(),
      inComments: z.boolean().optional(),
    },
    annotations: ro('Find in diagrams'),
  }), async ({ query, path: singlePath, dir, matchCase, inComments }) => {
    try {
      const files = singlePath ? [singlePath] : await ws.list(dir ?? '.');
      const results: { file: string; matches: ReturnType<typeof findInDiagram> }[] = [];
      for (const file of files) {
        try {
          const d = await ws.load(file);
          const matches = findInDiagram(d, query, { matchCase, inComments });
          if (matches.length) results.push({ file, matches });
        } catch { /* skip invalid files in multi-file search */ }
      }
      return text(JSON.stringify(results, null, 1));
    } catch (e) { return fail(e); }
  });

  server.registerTool('export-code', toolCfg('export-code', {
    title: 'Export code',
    description: `Generates program code from a diagram (${LANGUAGES.map((l) => l.name).join(', ')}). Resolves workspace subroutines automatically when involveSubroutines is enabled.`,
    inputSchema: {
      path: z.string(),
      language: z.enum(LANGUAGES.map((l) => l.id) as [LangId, ...LangId[]]),
      output: z.string().optional().describe('file to write, relative to the root (not allowed in read-only mode)'),
      subroutines: z.array(z.string()).optional().describe('explicit .nsd files with called subroutines or includables'),
      involveSubroutines: z.boolean().optional().describe('auto-include called subroutines/includables from workspace; default true'),
    },
    annotations: ro('Export code'),
  }), async ({ path, language, output, subroutines, involveSubroutines }) => {
    try {
      const d = await ws.load(path);
      const involve = involveSubroutines !== false;
      const pool = subroutines
        ? [d, ...(await Promise.all(subroutines.map((p) => ws.load(p))))]
        : involve ? [d, ...(await loadWorkspacePool(ws, path))] : [d];
      const r = generateCode(d, language, { pool, involveSubroutines: involve, version: VERSION });
      if (output) await ws.writeFile(output, r.code);
      return text(r.code);
    } catch (e) { return fail(e); }
  });

  if (!ws.readOnly) {
    server.registerTool('create-diagram', toolCfg('create-diagram', {
      title: 'Create diagram',
      description: `Creates a new diagram file. ${ELEMENT_HELP}`,
      inputSchema: {
        path: z.string().describe('new file, e.g. "factorial.nsd"'),
        type: z.enum(['program', 'sub', 'includable']).optional(),
        name: z.string().describe('program name or subroutine signature, e.g. "fact(n: int): int"'),
        comment: z.string().optional(),
        elements: z.array(z.any()).describe('top-level elements (see the element format above)'),
        framed: z.boolean().optional(),
        includes: z.array(z.string()).optional(),
        author: z.string().optional(),
        license: z.string().optional(),
        overwrite: z.boolean().optional(),
      },
      annotations: rw('Create diagram'),
    }), async ({ path, type, name, comment, elements, framed, includes, author, license, overwrite }) => {
      try {
        if (!overwrite) {
          const exists = await ws.load(path).then(() => true, () => false);
          if (exists) throw new Error(`${path} exists; pass overwrite: true to replace it`);
        }
        const d = buildDiagram((type ?? 'program') as DiagramType, name, comment, elements as ElementInput[], { framed, includes, author, license });
        await ws.save(path, d);
        return text(`Created ${path}\n\n${outline(d)}`);
      } catch (e) { return fail(e); }
    });

    server.registerTool('update-diagram', toolCfg('update-diagram', {
      title: 'Update diagram header',
      description: 'Updates a diagram name/signature, type, comment, framed setting, includes list or author/license metadata.',
      inputSchema: {
        path: z.string(),
        type: z.enum(['program', 'sub', 'includable']).optional(),
        name: z.union([z.string(), z.array(z.string())]).optional(),
        comment: z.union([z.string(), z.array(z.string())]).optional(),
        framed: z.boolean().optional(),
        includes: z.array(z.string()).optional(),
        author: z.string().optional(),
        license: z.string().optional(),
      },
      annotations: rw('Update diagram header', false, true),
    }), async ({ path, type, name, comment, framed, includes, author, license }) => {
      try {
        const d = await ws.load(path);
        const next = updateHeader(d, { type, name, comment, framed, includes, author, license });
        await ws.save(path, next);
        return text(outline(next));
      } catch (e) { return fail(e); }
    });

    server.registerTool('add-element', toolCfg('add-element', {
      title: 'Add element',
      description: `Inserts an element (with nested elements) into a diagram. ${ELEMENT_HELP}`,
      inputSchema: { path: z.string(), element: z.any().describe('the element to insert'), at: positionSchema },
      annotations: rw('Add element'),
    }), async ({ path, element, at }) => {
      try {
        const d = await ws.load(path);
        const el = buildElement(element as ElementInput, d);
        const next = insertAt(d, toPosition(d, at as PositionInput | undefined), el);
        await ws.save(path, next);
        return text(outline(next));
      } catch (e) { return fail(e); }
    });

    server.registerTool('update-element', toolCfg('update-element', {
      title: 'Update element',
      description: 'Changes text, comment, colour (6 hex digits), disabled state or collapsed state of the element at a path.',
      inputSchema: {
        path: z.string(),
        element: z.string().describe('element path from read-diagram, e.g. "1/then/0"'),
        text: z.union([z.string(), z.array(z.string())]).optional(),
        comment: z.union([z.string(), z.array(z.string())]).optional(),
        color: z.string().optional(),
        disabled: z.boolean().optional(),
        collapsed: z.boolean().optional(),
      },
      annotations: rw('Update element', false, true),
    }), async ({ path, element, text: t, comment, color, disabled, collapsed }) => {
      try {
        const d = await ws.load(path);
        const el = elementAt(d, element);
        const col = normalizeColor(color);
        const next = updateElement(d, el.id, {
          ...(t !== undefined ? { text: asLines(t) } : {}),
          ...(comment !== undefined ? { comment: asLines(comment) } : {}),
          ...(col ? { color: col } : {}),
          ...(disabled !== undefined ? { disabled } : {}),
          ...(collapsed !== undefined ? { collapsed } : {}),
        });
        await ws.save(path, next);
        return text(outline(next));
      } catch (e) { return fail(e); }
    });

    server.registerTool('delete-element', toolCfg('delete-element', {
      title: 'Delete element',
      description: 'Deletes the element at a path (with all nested elements).',
      inputSchema: { path: z.string(), element: z.string() },
      annotations: rw('Delete element', true),
    }), async ({ path, element }) => {
      try {
        const d = await ws.load(path);
        const next = removeById(d, elementAt(d, element).id);
        await ws.save(path, next);
        return text(outline(next));
      } catch (e) { return fail(e); }
    });

    server.registerTool('move-element', toolCfg('move-element', {
      title: 'Move element',
      description: 'Moves the element at a path to another position (an element cannot move into itself).',
      inputSchema: { path: z.string(), element: z.string(), to: positionSchema },
      annotations: rw('Move element'),
    }), async ({ path, element, to }) => {
      try {
        const d = await ws.load(path);
        const el = elementAt(d, element);
        const next = moveTo(d, el.id, toPosition(d, to as PositionInput | undefined));
        if (next === d) throw new Error('This move is not possible');
        await ws.save(path, next);
        return text(outline(next));
      } catch (e) { return fail(e); }
    });

    server.registerTool('transmute-element', toolCfg('transmute-element', {
      title: 'Transmute element',
      description: 'Splits multi-line instructions into individual instructions, or cycles instruction/call/jump and while/repeat loops.',
      inputSchema: { path: z.string(), element: z.string() },
      annotations: rw('Transmute element'),
    }), async ({ path, element }) => {
      try {
        const d = await ws.load(path);
        const next = transmuteElementAt(d, element);
        await ws.save(path, next);
        return text(outline(next));
      } catch (e) { return fail(e); }
    });

    server.registerTool('replace-in-diagram', toolCfg('replace-in-diagram', {
      title: 'Replace in diagram',
      description: 'Find and replace text in element bodies and optionally comments across one diagram.',
      inputSchema: {
        path: z.string(),
        search: z.string(),
        replace: z.string(),
        matchCase: z.boolean().optional(),
        inComments: z.boolean().optional(),
      },
      annotations: rw('Replace in diagram'),
    }), async ({ path, search, replace, matchCase, inComments }) => {
      try {
        const d = await ws.load(path);
        const res = replaceInDiagram(d, search, replace, { matchCase, inComments });
        if (res.replacements > 0) await ws.save(path, res.diagram);
        return text(JSON.stringify({ replacements: res.replacements, modifiedPaths: res.paths }, null, 1) + '\n\n' + outline(res.diagram));
      } catch (e) { return fail(e); }
    });

    server.registerTool('batch', toolCfg('batch', {
      title: 'Batch edit diagram',
      description: 'Applies several editing operations (add, update, delete, move, transmute, collapse, set-header) to a diagram in a single atomic save.',
      inputSchema: {
        path: z.string(),
        operations: z.array(batchOpSchema).min(1),
        keepGoing: z.boolean().optional().describe('continue remaining operations after an error and save successful ones'),
      },
      annotations: rw('Batch edit diagram'),
    }), async ({ path, operations, keepGoing }) => {
      try {
        let d = await ws.load(path);
        const errors: string[] = [];
        let applied = 0;
        for (let i = 0; i < operations.length; i++) {
          try {
            d = applyBatchOp(d, operations[i]);
            applied++;
          } catch (err) {
            const msg = `step ${i} (${operations[i].op}): ${(err as Error).message}`;
            if (!keepGoing) throw new Error(msg);
            errors.push(msg);
          }
        }
        await ws.save(path, d);
        return text(
          JSON.stringify({ applied, total: operations.length, errors }, null, 1) + '\n\n' + outline(d),
        );
      } catch (e) { return fail(e); }
    });

    server.registerTool('export-picture', toolCfg('export-picture', {
      title: 'Export picture',
      description: 'Writes the diagram as SVG or EMF next to it (or to output), with optional dark theme, comments, highlighting or inline SVG output.',
      inputSchema: {
        path: z.string(),
        format: z.enum(['svg', 'emf']),
        output: z.string().optional(),
        theme: z.enum(['light', 'dark']).optional(),
        comments: z.boolean().optional(),
        highlight: z.boolean().optional(),
        returnSvg: z.boolean().optional().describe('for svg format: also include the SVG markup in the response'),
      },
      annotations: rw('Export picture', false, true),
    }), async ({ path, format, output, theme, comments, highlight, returnSvg }) => {
      try {
        const d = await ws.load(path);
        const scene = createLayoutEngine(approxMeasure, { highlight: highlight ?? true, showComments: !!comments }).layout(d);
        const out = output ?? path.replace(/\.nsd$/i, `.${format}`);
        const svg = format === 'svg' ? sceneToSvg(scene, { standalone: true, title: d.text[0], theme: theme ?? 'light' }) : null;
        await ws.writeFile(out, svg ?? sceneToEmf(scene, approxMeasure));
        const msg = `Wrote ${out} (${Math.round(scene.width)} x ${Math.round(scene.height)} px)`;
        return text(returnSvg && svg ? `${msg}\n\n${svg}` : msg);
      } catch (e) { return fail(e); }
    });
  }

  // ---------------------------------------------------------------- resources
  server.registerResource('syntax-reference', 'structorizer://reference/syntax', {
    title: 'Structorizer Syntax Reference',
    description: 'Element kinds, expression syntax, paths and code export languages.',
    mimeType: 'text/markdown',
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: SYNTAX_REF }] }));

  server.registerResource('diagram', new ResourceTemplate('structorizer://diagram/{+path}', {
    list: async () => {
      const files = await ws.list('.', 4);
      return { resources: files.map((f) => ({ uri: `structorizer://diagram/${f}`, name: f, mimeType: 'application/json' })) };
    },
    complete: {
      path: async (value) => {
        const files = await ws.list('.', 4);
        return files.filter((f) => f.toLowerCase().includes(value.toLowerCase()));
      },
    },
  }), {
    title: 'Structorizer Diagram',
    description: 'Outline and JSON representation of a .nsd diagram in the workspace.',
    mimeType: 'application/json',
  }, async (uri, vars) => {
    const p = Array.isArray(vars.path) ? vars.path.join('/') : String(vars.path ?? '');
    const d = await ws.load(p);
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify({ outline: outline(d), diagram: toJson(d) }, null, 1),
      }],
    };
  });

  // ---------------------------------------------------------------- prompts
  server.registerPrompt('create-algorithm', {
    title: 'Design a Nassi-Shneiderman diagram',
    description: 'Guides creating and validating a structured .nsd diagram cleanly in the workspace.',
    argsSchema: {
      goal: z.string().describe('algorithm description or problem statement'),
      language: z.string().optional().describe('optional target export language (e.g. python, java, c, pascal)'),
    },
  }, ({ goal, language }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Design a clean Nassi-Shneiderman diagram (.nsd) for: ${goal}\n` +
          `1. Use \`create-diagram\` with proper Structorizer notation (INPUT, OUTPUT, <- assignments, IF, CASE, FOR, WHILE, REPEAT).\n` +
          `2. Run \`validate-diagram\` to ensure there are no empty branches or unparsed loop headers.\n` +
          (language ? `3. Export and review code with \`export-code\` (${language}).` : `3. Export and inspect the result with \`export-code\`.`),
      },
    }],
  }));

  server.registerPrompt('review-diagram', {
    title: 'Review and export a diagram',
    description: 'Inspects a .nsd diagram for structure, warnings and target code output.',
    argsSchema: { path: z.string().describe('diagram path relative to workspace root') },
  }, ({ path }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Inspect "${path}" using \`read-diagram\`, \`diagram-info\` and \`validate-diagram\`. Report any structural issues or unused/unparsed blocks and summarize the algorithm clearly.`,
      },
    }],
  }));

  await server.connect(new StdioServerTransport());
}
