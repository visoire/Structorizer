# 02 – Project Scaffold

> Superseded by `docs/decisions.md` (D-01, D-02, D-18) and `plan.md` P0-01 ... P0-02.
> Final choices: React (not Svelte), project folder `main/web/`, core folders
> `src/core/{model,io,layout,lang,exec,gen}`.

## Recommended Stack (2026)
- **Vite** + **TypeScript**
- **React** (or Svelte if preferred – both are fine)
- **Zustand** or **Jotai** for state (or plain React context + Immer)
- **SVG** as primary rendering technology (better for interaction & export than pure Canvas)
- **uuid** or `crypto.randomUUID()` for element IDs
- **file-saver** / native File System Access API for save/load
- Optional later: Vitest + Playwright

## Folder Structure (suggested)

```
structorizer-main/web/
├── public/
├── src/
│   ├── components/          # UI components
│   │   ├── DiagramCanvas.tsx
│   │   ├── Toolbar.tsx
│   │   ├── ElementEditor.tsx
│   │   └── ...
│   ├── core/                # pure logic
│   │   ├── types/
│   │   │   └── elements.ts
│   │   ├── layout/          # layout calculation
│   │   ├── executor/        # later
│   │   └── generators/      # later
│   ├── store/               # Zustand store etc.
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── docs/
│   ├── source-analysis.md
│   ├── data-model.md
│   ├── decisions.md
│   └── roadmap.md
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Initial package.json scripts
- `dev` – Vite dev server
- `build` – production build
- `preview`
- `test` (optional)

## GDPR / School Requirements
- No external analytics
- No accounts
- All data stays in the browser (localStorage / IndexedDB / user-chosen files)
- Clear “Export / Download” instead of silent cloud sync
- PWA-ready (manifest + service worker) for offline & iPad Home Screen

## First Tasks for the Agent
1. Create the Vite + React + TS project
2. Install only necessary dependencies
3. Set up the folder structure above
4. Add a minimal working App that shows “Structorizer Web – Foundation”
5. Commit the scaffold

After the scaffold is ready, continue with the data model and then the renderer.