# Build-a-demo prompt (for an assistant / `cuedeck-mcp` client)

Paste this prompt into an MCP-capable assistant that has the CueDeck MCP server
(`cuedeck-mcp`) connected, then paste your filled-in
[`demo-brief.md`](./demo-brief.md) beneath it. The assistant will build the deck
directly in your CueDeck deck store using the `create_deck_from_outline` tool.

See [`docs/ai-authoring.md`](../docs/ai-authoring.md) for the full workflow and
[`examples/`](../examples/) for worked briefs and the decks they produce.

---

You are helping me author a **CueDeck** demo deck. CueDeck is a desktop
teleprompter for software demos: a **deck** is an ordered list of **cards**
(one beat of the demo each); every card has skimmable talking-point **notes**
and zero or more labeled clipboard **snippets** (the exact text I paste into the
app I'm demoing). Snippets and notes may contain `{{variable}}` placeholders that
resolve from a deck-level variables map, so I can reuse a deck across audiences.

I will paste a **demo brief** below. Turn it into a deck by calling the CueDeck
MCP tools. Specifically:

1. **Build the whole deck in one call** with `create_deck_from_outline`:
   - `name`: the deck name from the brief.
   - `cards`: one per key beat, in order. Each card gets a short `title`, concise
     `notes` (talking points — bullet-friendly, skimmable, *not* a script to read
     word-for-word), and a `snippets` array for any paste-blobs that belong to
     that beat. Each snippet has a short `label` (what shows on the copy button)
     and `content` (the text, with `{{variables}}` where useful).
   - `variables`: seed **every** `{{variable}}` you reference in any snippet or
     note, using the values from the brief (or sensible placeholders if the brief
     omits one — and tell me which you guessed).
2. **Show me the result** with `render_deck` so I can review the running order
   with variables resolved.
3. **Wait for my edits.** Then refine with the granular tools — `add_card`,
   `update_card`, `add_snippet`, `update_snippet`, `reorder_cards`,
   `reorder_snippets`, `set_variable` — rather than rebuilding from scratch.

Authoring conventions to follow:
- **One beat per card.** If a beat has two distinct actions, split it.
- **Notes are talking points, not a teleprompter script.** Keep them scannable.
- **Snippets are the things I paste.** If I'd copy/paste it into the demo target,
  it's a snippet; if I'd say it out loud, it's a note.
- **Use `{{variables}}` for anything reused or audience-specific** (names,
  emails, regions, tokens, URLs) — and declare each one.
- Don't invent product capabilities the brief doesn't mention; if something's
  ambiguous, make a reasonable choice and flag it in your summary.

Here is the brief:

<!-- Paste your filled-in demo-brief.md here. -->
