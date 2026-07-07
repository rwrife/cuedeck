## Summary
Support **rich talking-point notes** with lightweight Markdown rendering (bold, italics, lists, headings, inline code, checklists) instead of plain-text-only notes.

## Motivation
Demo scripts benefit from structure: a checklist of steps, a bolded warning ("DON'T click Save yet"), inline code for commands. Plain text makes scripts harder to scan while presenting.

## Requirements
- The card notes editor supports Markdown input.
- In **presenter/read** contexts, notes render as formatted HTML (headings, **bold**, *italics*, `code`, bullet/numbered lists, and `- [ ]` checkboxes).
- Rendering must be **safe**: no raw HTML injection / script execution (sanitize, and keep the existing CSP intact).
- A simple edit/preview toggle (or live side-by-side) is acceptable; keep it minimal.
- Existing plain-text notes remain valid (Markdown is a superset — no migration needed).

## Implementation notes
- Use a small, safe renderer (e.g. `marked` + `DOMPurify`, or `markdown-it` with HTML disabled). Justify the dependency in the PR.
- The renderer's CSP (`src/renderer/index.html`) forbids inline scripts; ensure the chosen approach complies (no `dangerouslySetInnerHTML` with unsanitized content).
- Keep notes stored as raw Markdown text in the `CueCard.notes` field (no schema change required).

## Acceptance criteria
- [ ] Notes can be written in Markdown and render formatted in read/presenter view.
- [ ] Checkboxes, lists, bold/italic, headings, and inline code all render.
- [ ] Output is sanitized; a test string with `<script>` does not execute or inject.
- [ ] `npm run typecheck` and `npm run build` pass.
