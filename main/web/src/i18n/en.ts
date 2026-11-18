export const en = {
  appName: 'Structorizer Web',
  tagline: 'Nassi-Shneiderman diagrams in the browser',
  // file
  new: 'New', open: 'Open', save: 'Save', saveAs: 'Save as', examples: 'Examples',
  exportSvg: 'Export SVG', exportPng: 'Export PNG', file: 'File', export: 'Export',
  discardChanges: 'Discard unsaved changes?',
  openFailed: 'The file could not be opened',
  loadedWithWarnings: 'Loaded with warnings',
  // edit
  undo: 'Undo', redo: 'Redo', edit: 'Edit', delete: 'Delete', cut: 'Cut', copy: 'Copy', paste: 'Paste',
  duplicate: 'Duplicate', moveUp: 'Move up', moveDown: 'Move down', disable: 'Disable / enable',
  collapse: 'Collapse / expand', insertBefore: 'Insert before (Shift)', diagramProps: 'Diagram',
  // elements
  'kind.instruction': 'Instruction', 'kind.call': 'Call', 'kind.jump': 'Exit (Jump)',
  'kind.alternative': 'IF', 'kind.case': 'CASE', 'kind.for': 'FOR loop', 'kind.while': 'WHILE loop',
  'kind.repeat': 'REPEAT loop', 'kind.forever': 'Endless loop', 'kind.parallel': 'Parallel', 'kind.try': 'TRY',
  // editor
  text: 'Text', comment: 'Comment', color: 'Colour', disabled: 'Disabled', ok: 'OK', cancel: 'Cancel',
  diagramName: 'Diagram name / function signature', diagramType: 'Diagram type',
  'type.program': 'Main program', 'type.sub': 'Subroutine', 'type.includable': 'Includable',
  boxed: 'Framed (boxed) diagram', author: 'Author', includeList: 'Diagrams to be included (one per line)',
  hintCase: 'First line: discriminator. Following lines: one selector list per branch (e.g. 1, 2). Last line: default label, or % for no default branch.',
  hintParallel: 'Number of parallel branches (1 to 20).',
  hintTry: 'Name of the variable that receives the caught exception.',
  hintFor: 'Counter loop: for i <- 1 to 10 by 2. Traversal: foreach v in {1, 2, 3}',
  hintInstruction: 'One statement per line, e.g. x <- 5, INPUT x, OUTPUT "x = ", x',
  hintJump: 'leave [n], return [value], exit [code] or throw "message". Empty means leave.',
  hintKeys: 'Shift+Enter or Ctrl+Enter: OK. Esc: cancel.',
  // view
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomFit: 'Fit', language: 'Language',
  about: 'About', help: 'Help', close: 'Close',
  selectHint: 'Tap an element or an empty branch, then choose an element to insert.',
  autosaved: 'Saved in this browser', unsaved: 'Unsaved changes', saved: 'Saved',
  privacy: 'Privacy: everything stays on your device. No server, no cookies, no tracking.',
  aboutText: 'Structorizer Web is a free, open source (GPL-3.0) browser version of Structorizer by Bob Fisch, Kay Gürtzig and contributors. It reads and writes the .nsd files of Structorizer Desktop.',
  sourceCode: 'Source code',
  keyboard: 'Keyboard',
  keysList: 'F5 Instruction · F6 IF · F10 CASE · F7 FOR · F8 WHILE · F9 REPEAT · Ctrl+F7 Endless · F11 Call · F12 Jump · Ctrl+F6 Parallel · Ctrl+F5 TRY (with Shift: insert before) · Enter edit · Del delete · Ctrl+↑/↓ move · ↑/↓/←/→ select · Ctrl+7 disable · Numpad −/+ collapse · Ctrl+Z/Y undo/redo · Ctrl+C/X/V · Ctrl+S save · Ctrl+O open · Ctrl+E PNG',
  keysNote: 'Some keys (e.g. F11, F12, Ctrl+N) are reserved by the browser; use the toolbar instead.',
  dropHere: 'Drop here',
} as const;

export type Dict = Record<keyof typeof en, string>;
