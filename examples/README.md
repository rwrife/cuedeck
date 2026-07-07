# CueDeck authoring examples

Worked **demo brief → deck** examples that back the
[AI-authoring guide](../docs/ai-authoring.md). Each folder is a complete example
and doubles as a **round-trip fixture** that locks the authoring contract in the
test suite.

## Layout

Each `examples/<name>/` contains:

| File | What it is |
| --- | --- |
| `brief.md` | The human-authored **demo brief** (the input a person writes). |
| `outline.json` | The structured outline an assistant / the `cuedeck-mcp` `create_deck_from_outline` tool produces from that brief. |
| `deck.json` | The **expected deck** that outline builds, with ids/timestamps normalized to deterministic sentinels. |

## Examples

- **[`saas-onboarding/`](./saas-onboarding/)** — a 6-card SaaS onboarding
  walkthrough (sign in → create workspace → invite → connect data → first
  insight → next steps).
- **[`api-devtool/`](./api-devtool/)** — a 6-card API / developer-tool demo
  (polling pain → API key → first request → SDK → webhook → recap).

## How the round-trip works

[`test/example-authoring.test.ts`](../test/example-authoring.test.ts) feeds each
`outline.json` through the *same* code path the MCP server uses
(`DeckRepository.createDeckFromOutline`) and asserts the result equals the
committed `deck.json` after normalizing volatile fields (ids → positional
`card-1`, `card-1-snippet-2`, …; timestamps → a fixed sentinel). It also checks
that every `{{variable}}` used in a snippet is declared on the deck.

So if you change an outline, the deck model, or the builder, the test fails until
you regenerate the fixtures:

```bash
npm run gen:examples          # rewrite every deck.json from its outline.json
node scripts/gen-examples.mjs --check   # CI-friendly: fail if any is stale
```

`deck.json` is **generated** — edit `outline.json` (or `brief.md`) and
regenerate; don't hand-edit `deck.json`.
