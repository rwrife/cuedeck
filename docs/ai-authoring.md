# AI-authoring guide: from a demo brief to a CueDeck deck

CueDeck can be authored **conversationally**. The [`cuedeck-mcp`](mcp.md) server
(and the headless [`cuedeck` CLI](cli.md)) let an assistant build a complete,
openable demo deck from a short **demo brief** — no manual data entry. This guide
defines the brief format, shows exactly how it maps to a deck, and lists the
conventions that make AI-authored demos actually good.

- **Templates** to hand an assistant: [`templates/demo-brief.md`](../templates/demo-brief.md)
  and [`templates/build-demo.prompt.md`](../templates/build-demo.prompt.md).
- **Worked examples** (brief → outline → deck): [`examples/`](../examples/).
- **The tool that does the work:** `create_deck_from_outline` (see [`docs/mcp.md`](mcp.md)),
  backed by the shared [`DeckRepository`](../src/cli/deckRepository.ts) — the same
  code path the CLI uses, so app / CLI / MCP never drift.

> **Model recap.** A **deck** is an ordered list of **cards** (one beat of the
> demo each). Each card has talking-point **notes** and zero or more labeled
> clipboard **snippets** (the exact text you paste into the app you're demoing).
> Notes and snippets may reference `{{variables}}` that resolve from a deck-level
> map. See [`docs/deck-format.md`](deck-format.md) for the full file format.

---

## The workflow in one picture

```
demo brief  ──►  outline  ──►  create_deck_from_outline  ──►  deck on disk
(you write)      (assistant)   (one MCP/CLI call)             (open in the app)
     ▲                                                              │
     └──────────────── refine: render_deck, then edit ◄────────────┘
```

1. **You** write a brief (or fill in [`templates/demo-brief.md`](../templates/demo-brief.md)).
2. **The assistant** turns it into an *outline* and calls **`create_deck_from_outline`**,
   building the whole deck in one shot.
3. **You review** with `render_deck` (the running order with variables resolved).
4. **You refine** with the granular tools (`add_card`, `update_card`,
   `add_snippet`, `reorder_cards`, `set_variable`, …) — never a from-scratch rebuild.

---

## The demo brief

A brief is a short, structured description of the demo you want. It's plain
Markdown; the shape below is what the [prompt template](../templates/build-demo.prompt.md)
expects. None of it is rigidly parsed — it's context for the assistant — but
covering these fields yields consistently well-structured decks.

| Section | What to put | Why it matters |
| --- | --- | --- |
| **Goal** | One or two sentences: what the audience should believe or be able to do by the end. | Keeps the deck about outcomes, not a feature dump. |
| **Audience** | Who's watching and how technical. | Sets tone and how much code/detail to show. |
| **Product / feature** | What you're demoing, in a line; the scoped flow if partial. | Bounds the material so the deck stays on-topic. |
| **Key beats** | The running order, ideally **one beat per line**. | Becomes the cards, in order. |
| **Paste-blobs / data needed** | The exact text you'll paste into the target app. | Becomes the snippets. |
| **Variables** | Reusable/audience-specific values (`customer`, `demoEmail`, `region`, `token`, …). | Become deck variables so one deck serves many audiences. |
| **Desired length** | Rough card count / target minutes. | Guides how finely to split beats. |

See two filled-in briefs: [`examples/saas-onboarding/brief.md`](../examples/saas-onboarding/brief.md)
and [`examples/api-devtool/brief.md`](../examples/api-devtool/brief.md).

---

## How a brief maps to a deck

The assistant converts the brief into the outline that `create_deck_from_outline`
accepts, then calls it. The mapping is direct:

| Brief | → | Deck |
| --- | --- | --- |
| Deck name (from **Goal**/title) | → | `name` |
| Each **key beat** | → | a `card` (in order), with a short `title` |
| Talking points for a beat | → | that card's `notes` (skimmable Markdown) |
| A **paste-blob** for a beat | → | a `snippet` on that card (`label` + `content`) |
| A reusable value | → | an entry in the deck-level `variables` map, referenced as `{{name}}` |

The outline is exactly the input to `create_deck_from_outline`:

```jsonc
{
  "name": "SaaS Onboarding Walkthrough",
  "variables": { "customer": "Acme", "demoEmail": "ada@acme.example" },
  "cards": [
    {
      "title": "Welcome & sign in",
      "notes": "Set the stage; sign in with the demo account.",
      "snippets": [
        { "label": "Demo email", "content": "{{demoEmail}}" },
        { "label": "Demo password", "content": "hunter2-demo-only" }
      ]
    },
    { "title": "Next steps" }
  ]
}
```

That single call returns the fully-populated, persisted deck (with generated
ids), ready to open in the app. Compare the input
[`outline.json`](../examples/saas-onboarding/outline.json) with the resulting
[`deck.json`](../examples/saas-onboarding/deck.json) to see the round-trip.

### Variables (forward-compatible with snippet substitution, #7)

Any `{{name}}` in a snippet resolves from the deck's `variables` map at copy /
drag / preview time (see [`docs/deck-format.md`](deck-format.md) and
[`src/shared/variables.ts`](../src/shared/variables.ts)). So:

- Put **audience-specific or repeated** values in variables (customer, email,
  region, token, URL), then reference them everywhere.
- **Declare every variable you use.** An unfilled `{{token}}` renders as a visible
  `⟦token⟧` marker on the clipboard rather than silently shipping a raw
  placeholder — the round-trip tests enforce that examples declare all of theirs.
- To reuse a deck for a new audience, change the variables, not every snippet.

---

## Conventions for good AI-authored demos

These are the rules the [prompt template](../templates/build-demo.prompt.md) tells
the assistant to follow — and the ones the worked examples model:

- **One beat per card.** If a beat has two distinct actions ("connect the source"
  *and* "run the first query"), split it into two cards.
- **Notes are talking points, not a teleprompter script.** Keep them short and
  scannable (bullets welcome). You'll be *presenting*, not reading aloud.
- **Snippets are the things you paste.** Litmus test: if you'd copy/paste it into
  the app you're demoing, it's a snippet; if you'd say it out loud, it's a note.
- **Label snippets for the button.** The `label` is what shows on the copy button
  mid-demo ("Auth header", "Deploy cmd") — make it glanceable under pressure.
- **Lead with the problem; end each beat on a win.** Especially for developer
  demos, open on the pain and make every card land a concrete result.
- **Use variables for anything reused or audience-specific**, and declare them.
- **Don't invent capabilities** the brief doesn't mention. If something's
  ambiguous, make a reasonable choice and say so.

---

## Round-trip fixtures (regression guard)

The examples aren't just docs — they're **fixtures** that lock the authoring
contract. [`test/example-authoring.test.ts`](../test/example-authoring.test.ts)
feeds each example's `outline.json` through the same
`DeckRepository.createDeckFromOutline` the MCP tool uses and asserts the built
deck equals the committed `deck.json`, after normalizing volatile fields (ids →
positional `card-1`, `card-1-snippet-2`, …; timestamps → a fixed sentinel). It
also validates each fixture and checks that every `{{variable}}` used is declared.

If you change an outline, the deck model, or the builder, the test fails until
you regenerate the fixtures:

```bash
npm run gen:examples                      # rewrite every deck.json from its outline.json
node scripts/gen-examples.mjs --check     # CI-friendly: fail if any is stale
```

`deck.json` is **generated** — edit the `outline.json` (or `brief.md`) and
regenerate; never hand-edit `deck.json`. More detail in
[`examples/README.md`](../examples/README.md).

---

## See also

- [`docs/mcp.md`](mcp.md) — the MCP server, every tool, and client config.
- [`docs/cli.md`](cli.md) — the headless CLI (same operations, from a shell/CI).
- [`docs/deck-format.md`](deck-format.md) — the on-disk deck format + JSON Schema.
