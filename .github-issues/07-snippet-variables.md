## Summary
Add **snippet templating** with placeholder variables (e.g. `{{email}}`, `{{orderId}}`) plus deck-level variable values, so snippets can be parameterized and filled at copy time.

## Motivation
Demo blobs often differ only by a few values (a test email, an environment URL, a fake order number). Instead of duplicating near-identical snippets, let users define variables once and reuse them, or fill them just-in-time before copying.

## Requirements
- Snippets may contain `{{variableName}}` placeholders.
- A **deck-level variables** map (`Record<string, string>`) provides default values; editable from a "Variables" panel.
- On copy, placeholders are substituted with current variable values before the text hits the clipboard.
- If a placeholder has **no value**, either prompt for it at copy time OR visibly flag it (choose one; document the choice in the PR).
- The snippet editor should surface which variables a snippet references.
- Add `variables?: Record<string, string>` to the `Deck` type and bump `CURRENT_SCHEMA_VERSION`; ensure older decks (without the field) still load (default to `{}`).

## Implementation notes
- Substitution helper in `shared/`: `renderSnippet(content, vars)` → replaces `{{name}}`; leaves unknown placeholders visibly marked if not prompting.
- Include a lightweight migration path in `deckStore` load (fill missing `variables` with `{}`, upgrade `schemaVersion`).
- Unit-test the substitution + missing-variable behavior thoroughly.

## Acceptance criteria
- [ ] Deck-level variables can be defined and edited.
- [ ] Copying a snippet substitutes `{{vars}}` correctly.
- [ ] Missing-variable behavior works as documented.
- [ ] Old decks without `variables` still load (migration verified by test).
- [ ] `npm run typecheck` and `npm run build` pass.
