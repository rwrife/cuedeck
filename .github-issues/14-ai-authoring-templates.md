## Summary
Add **AI-authoring ergonomics**: a documented `demo-brief → deck` workflow, reusable prompt templates, and example briefs so the CLI/MCP produce great demos with minimal fuss. Plus round-trip fixtures that lock the authoring contract.

## Motivation
The CLI (#12) and MCP (#13) give AI the *ability* to build decks; this issue makes it *good*. A clear brief format and example prompts turn "build me a demo" into consistently well-structured cue cards and snippets, and give us fixtures to prevent regressions.

## Requirements
- **Authoring guide:** `docs/ai-authoring.md` covering:
  - The recommended **demo brief** shape (goal, audience, product/feature, key beats, the paste-blobs/data needed, desired length).
  - How that maps to decks → cards → snippets (and variables, forward-compat with #7).
  - Best-practice conventions (one beat per card, snippet labels, keeping talking points skimmable).
- **Prompt templates** under `templates/` (e.g. `templates/demo-brief.md` and `templates/build-demo.prompt.md`) that a user can hand to an assistant/MCP client to generate a deck via the tools.
- **Example briefs + expected outlines:** at least 2 worked examples (e.g. "SaaS onboarding demo", "API/dev-tool demo") as fixtures under `examples/`, each with the brief and the resulting deck JSON.
- **Round-trip tests:** feed each example outline through the same code path the MCP `create_deck_from_outline` uses, and assert the produced deck validates and matches the committed fixture (normalizing volatile fields like ids/timestamps).
- Wire a short "AI authoring" section into `README.md` linking to the guide and templates.

## Implementation notes
- Reuse the shared deck core (#11) and the outline-building logic from #13 — do not reimplement deck construction; this issue is docs + fixtures + tests around it.
- For fixture stability, strip/normalize ids and timestamps before comparison (or inject deterministic ids in tests).
- If #13 isn't merged yet, target the shared outline builder module it introduces; coordinate the module boundary so this issue only adds guide/templates/fixtures/tests.

## Acceptance criteria
- [ ] `docs/ai-authoring.md` documents the brief→deck workflow.
- [ ] `templates/` contains a demo-brief template and a build-demo prompt template.
- [ ] `examples/` has ≥2 briefs with expected deck outputs.
- [ ] Round-trip tests validate the example outlines against committed fixtures.
- [ ] `README.md` links the AI-authoring workflow.
- [ ] `npm run typecheck`, `npm run test`, and `npm run build` pass.

Depends on: #11; pairs with #12/#13.
