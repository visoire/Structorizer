# Agent Prompt: Structorizer Web – Foundation Phase

> **Status 2026-11-18:** the analysis below (steps 1 and 2) is done. Results:
> `docs/source-analysis.md`, `docs/nsd-format.md`, `docs/layout-spec.md`,
> `docs/decisions.md`, revised `01-data-model.md`.
> **Implementation agents: skip this file and start with `plan.md`.**
> This file is kept as the original brief.

You are a senior full-stack TypeScript engineer building a modern, GDPR-compliant, fully client-side web version of **Structorizer** (Nassi-Shneiderman Diagram editor).

## Primary Goal (this phase)
Create solid foundations. Do **not** jump into UI polish or advanced features yet.

### Mandatory first steps (in this exact order)

1. **Clone / analyze the original source code**
   - Repository: https://github.com/fesch/Structorizer.Desktop
   - Focus especially on:
     - `src/lu/fisch/structorizer/elements/` (core data model)
     - `src/lu/fisch/structorizer/executor/`
     - `src/lu/fisch/structorizer/generators/`
     - `src/lu/fisch/structorizer/gui/` (only for understanding drawing & interaction)
     - `src/lu/fisch/structorizer/io/` (file format)
   - Read the most important classes thoroughly:
     - `Element.java` (base class)
     - `Root.java`
     - `Subqueue.java`
     - `Instruction.java`, `Alternative.java`, `Case.java`, `For.java`, `While.java`, `Repeat.java`, `Forever.java`, `Call.java`, `Jump.java`, `Parallel.java`, `Try.java`
   - Document the class hierarchy, important fields, and the recursive structure (Subqueue containing Elements).

2. **Produce a clear analysis document** (`docs/source-analysis.md`) containing:
   - Package / folder overview
   - Element hierarchy (inheritance + composition)
   - How drawing / layout currently works (high-level)
   - How the executor works (high-level)
   - .nsd file format notes
   - Key design decisions and technical debt of the original

3. **Only after the analysis is complete**, continue with the foundations listed in the accompanying documents:
   - `01-data-model.md`
   - `02-project-scaffold.md`
   - `03-diagram-renderer.md`
   - `04-roadmap.md`

## Strict Constraints
- Pure client-side (no backend required for core features)
- TypeScript + modern tooling (Vite recommended)
- GDPR-friendly / school-friendly (localStorage / File System Access API only)
- Clean, modern architecture (prefer composition + discriminated unions over deep inheritance)
- Keep the original Structorizer philosophy (NSD visual language, executable diagrams) but redesign the code cleanly

## Working Style
- Work incrementally and commit often
- Write clear TypeScript interfaces first
- Prefer small, testable modules
- Document important decisions in `docs/decisions.md`
- After finishing the analysis, wait for confirmation before large implementation steps (or follow the phase order in the roadmap)

Start now with step 1: deep analysis of the original source code.