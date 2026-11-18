// End-to-end test: a real MCP client starts the server over stdio and calls every tool, resource and prompt.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'dist', 'cli.js');
const root = mkdtempSync(path.join(tmpdir(), 'structorizer-mcp-'));

const transport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp', '--root', root] });
const client = new Client({ name: 'smoke-test', version: '1.0.0' });
await client.connect(transport);

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  const t = r.content.map((c) => c.text).join('\n');
  if (r.isError) throw new Error(`${name}: ${t}`);
  return t;
};
let passed = 0;
const step = async (label, fn) => { await fn(); passed++; console.log(`ok  ${label}`); };

try {
  await step('lists all 21 tools with complete MCP annotations', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      'add-element', 'analyse-diagram', 'batch', 'create-diagram', 'delete-element', 'diagram-info',
      'execute-diagram', 'export-code', 'export-picture', 'find-in-diagrams', 'list-commands',
      'list-diagrams', 'move-element', 'pack-arrz', 'read-diagram', 'replace-in-diagram',
      'transmute-element', 'unpack-arrz', 'update-diagram', 'update-element', 'validate-diagram',
    ]);
    for (const tool of tools) {
      assert.equal(typeof tool.annotations?.readOnlyHint, 'boolean', `${tool.name} missing readOnlyHint`);
      assert.equal(typeof tool.annotations?.destructiveHint, 'boolean', `${tool.name} missing destructiveHint`);
      assert.equal(tool.annotations?.openWorldHint, false, `${tool.name} missing openWorldHint`);
      assert.ok(tool.annotations?.title, `${tool.name} missing title`);
    }
  });

  await step('list-commands reports tools, element kinds and 9 code languages', async () => {
    const info = JSON.parse(await call('list-commands', {}));
    assert.equal(info.readOnly, false);
    assert.equal(info.tools.length, 21);
    assert.equal(info.elementKinds.length, 11);
    assert.deepEqual(info.codeLanguages.map((l) => l.id), ['python', 'java', 'javascript', 'c', 'cpp', 'csharp', 'pascal', 'php', 'bash']);
  });

  await step('creates a diagram', async () => {
    const out = await call('create-diagram', {
      path: 'demo/max.nsd', name: 'MaxDemo', comment: 'Largest of two numbers',
      elements: [
        { kind: 'instruction', text: ['INPUT a', 'INPUT b'] },
        { kind: 'alternative', text: 'a > b', then: [{ kind: 'instruction', text: 'm <- a' }], else: [{ kind: 'instruction', text: 'm <- b' }] },
        { kind: 'instruction', text: 'OUTPUT "max = ", m' },
      ],
    });
    assert.match(out, /1\s+IF\s+a > b/);
    assert.ok(existsSync(path.join(root, 'demo', 'max.nsd')));
  });

  await step('reads it with paths and subtrees', async () => {
    const out = await call('read-diagram', { path: 'demo/max.nsd', format: 'outline' });
    assert.match(out, /1\/then\/0\s+INSTRUCTION\s+m <- a/);
    const sub = JSON.parse(await call('read-diagram', { path: 'demo/max.nsd', element: '1/then/0' }));
    assert.equal(sub.kind, 'instruction');
    assert.deepEqual(sub.text, ['m <- a']);
  });

  await step('adds a loop into the else branch', async () => {
    const out = await call('add-element', {
      path: 'demo/max.nsd', at: { parent: '1', slot: 'else' },
      element: { kind: 'for', text: 'for i <- 1 to 3', body: [{ kind: 'instruction', text: 'OUTPUT i' }] },
    });
    assert.match(out, /1\/else\/1\s+FOR/);
    assert.match(out, /1\/else\/1\/body\/0\s+INSTRUCTION\s+OUTPUT i/);
  });

  await step('updates header and element', async () => {
    const hdr = await call('update-diagram', { path: 'demo/max.nsd', author: 'Alice', framed: true });
    assert.match(hdr, /\[program\] MaxDemo/);
    const out = await call('update-element', { path: 'demo/max.nsd', element: '2', text: 'OUTPUT "Maximum: ", m', color: 'ffff80' });
    assert.match(out, /2\s+INSTRUCTION\s+OUTPUT "Maximum: ", m\s+\[#ffff80\]/);
  });

  await step('moves, transmutes, finds, replaces and deletes elements', async () => {
    await call('move-element', { path: 'demo/max.nsd', element: '1/else/1', to: { index: 0 } });
    let out = await call('read-diagram', { path: 'demo/max.nsd', format: 'outline' });
    assert.match(out, /\n {2}0\s+FOR/);
    out = await call('delete-element', { path: 'demo/max.nsd', element: '0' });
    assert.doesNotMatch(out, /FOR/);

    // split multi-line INPUT into two single instructions via transmute-element
    const splitOut = await call('transmute-element', { path: 'demo/max.nsd', element: '0' });
    assert.match(splitOut, /0\s+INSTRUCTION\s+INPUT a/);
    assert.match(splitOut, /1\s+INSTRUCTION\s+INPUT b/);

    const found = JSON.parse(await call('find-in-diagrams', { query: 'Maximum' }));
    assert.equal(found.length, 1);
    assert.equal(found[0].matches[0].text[0], 'OUTPUT "Maximum: ", m');

    const rep = await call('replace-in-diagram', { path: 'demo/max.nsd', search: 'Maximum:', replace: 'Max:' });
    assert.match(rep, /"replacements": 1/);
  });

  await step('batch edits a diagram atomically and validates', async () => {
    await call('create-diagram', {
      path: 'demo/sub_helper.nsd', type: 'sub', name: 'doubleVal(x: int): int',
      elements: [{ kind: 'instruction', text: 'return 2 * x' }],
    });
    const batchOut = await call('batch', {
      path: 'demo/caller.nsd',
      operations: [],
    }).catch(() => 'rejected-empty');
    assert.equal(batchOut, 'rejected-empty');

    await call('create-diagram', { path: 'demo/caller.nsd', name: 'Caller', elements: [] });
    const out = await call('batch', {
      path: 'demo/caller.nsd',
      operations: [
        { op: 'set-header', author: 'Test' },
        { op: 'add', element: { kind: 'instruction', text: 'n <- 5' } },
        { op: 'add', element: { kind: 'call', text: 'res <- doubleVal(n)' } },
        { op: 'add', element: { kind: 'instruction', text: 'OUTPUT res' } },
      ],
    });
    assert.match(out, /"applied": 4/);
    const check = JSON.parse(await call('validate-diagram', { path: 'demo/caller.nsd' }));
    assert.equal(check.valid, true);
    assert.equal(check.issues.length, 0);

    const execOut = JSON.parse(await call('execute-diagram', { path: 'demo/caller.nsd' }));
    assert.deepEqual(execOut.outputs, ['10']);
    assert.equal(execOut.variables.res, 10);

    const anaOut = JSON.parse(await call('analyse-diagram', { path: 'demo/caller.nsd' }));
    assert.equal(anaOut.count, 0);

    const packOut = await call('pack-arrz', { output: 'demo/bundle.arrz', files: ['demo/caller.nsd', 'demo/sub_helper.nsd'] });
    assert.match(packOut, /Packed 2 diagrams/);
    const unpackOut = JSON.parse(await call('unpack-arrz', { path: 'demo/bundle.arrz', outDir: 'demo/unpacked' }));
    assert.equal(unpackOut.extracted.length, 2);
    assert.ok(existsSync(path.join(root, 'demo', 'unpacked', 'caller.nsd')));
  });

  await step('exports code across Python, Java, C, C# and Pascal with workspace subroutines', async () => {
    const py = await call('export-code', { path: 'demo/max.nsd', language: 'python', output: 'demo/max.py' });
    assert.match(py, /Generated by Structorizer 3\.32-35/);
    assert.match(py, /if a > b:/);
    assert.ok(existsSync(path.join(root, 'demo', 'max.py')));
    const java = await call('export-code', { path: 'demo/max.nsd', language: 'java' });
    assert.match(java, /public class MaxDemo/);
    const c = await call('export-code', { path: 'demo/caller.nsd', language: 'c' });
    assert.match(c, /int doubleVal\(int x\)/);
    const cs = await call('export-code', { path: 'demo/caller.nsd', language: 'csharp' });
    assert.match(cs, /public static int doubleVal\(int x\)/);
    const pas = await call('export-code', { path: 'demo/caller.nsd', language: 'pascal' });
    assert.match(pas, /function doubleVal\(x: Integer\): Integer;/);
  });

  await step('exports SVG and EMF pictures including inline returnSvg', async () => {
    const svgOut = await call('export-picture', { path: 'demo/max.nsd', format: 'svg', returnSvg: true });
    assert.match(svgOut, /<svg /);
    await call('export-picture', { path: 'demo/max.nsd', format: 'emf' });
    assert.match(readFileSync(path.join(root, 'demo', 'max.svg'), 'utf8'), /<svg /);
    const emf = readFileSync(path.join(root, 'demo', 'max.emf'));
    assert.equal(emf.readUInt32LE(40), 0x464d4520);
  });

  await step('exposes info, lists files, MCP resources and prompts', async () => {
    const info = JSON.parse(await call('diagram-info', { path: 'demo/max.nsd' }));
    assert.deepEqual(info.variables, ['a', 'b', 'm']);
    assert.equal(info.meta.author, 'Alice');
    const files = await call('list-diagrams', {});
    assert.match(files, /demo\/max\.nsd/);

    const { resources } = await client.listResources();
    assert.ok(resources.some((r) => r.uri === 'structorizer://reference/syntax'));
    const ref = await client.readResource({ uri: 'structorizer://reference/syntax' });
    assert.match(ref.contents[0].text, /Structorizer Syntax/);
    const diagRes = await client.readResource({ uri: 'structorizer://diagram/demo/max.nsd' });
    assert.match(diagRes.contents[0].text, /MaxDemo/);

    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map((p) => p.name).sort(), ['create-algorithm', 'review-diagram']);
    const pRes = await client.getPrompt({ name: 'review-diagram', arguments: { path: 'demo/max.nsd' } });
    assert.match(pRes.messages[0].content.text, /validate-diagram/);
  });

  await step('refuses paths outside the root and hides writes in --read-only mode', async () => {
    await assert.rejects(call('read-diagram', { path: '../secret.nsd' }), /outside the root/);
    const roTransport = new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp', '--root', root, '--read-only'] });
    const roClient = new Client({ name: 'smoke-ro', version: '1.0.0' });
    await roClient.connect(roTransport);
    try {
      const { tools } = await roClient.listTools();
      assert.deepEqual(tools.map((t) => t.name).sort(), [
        'analyse-diagram', 'diagram-info', 'execute-diagram', 'export-code',
        'find-in-diagrams', 'list-commands', 'list-diagrams', 'read-diagram', 'validate-diagram',
      ]);
    } finally {
      await roClient.close();
    }
  });

  await step('the saved file is valid for the web editor', async () => {
    const xml = readFileSync(path.join(root, 'demo', 'max.nsd'), 'utf8');
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<root xmlns:nsd="https:\/\/structorizer\.fisch\.lu" version="3\.32-35"/);
  });
} finally {
  await client.close();
  rmSync(root, { recursive: true, force: true });
}
console.log(`\n${passed} checks passed`);
