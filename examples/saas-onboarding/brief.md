# Demo brief — SaaS Onboarding Walkthrough

> Worked example. Hand a brief like this to an assistant (or the `cuedeck-mcp`
> server) and it produces the deck in [`outline.json`](./outline.json) /
> [`deck.json`](./deck.json). See the [AI-authoring guide](../../docs/ai-authoring.md).

## Goal
Show a prospect that they can go from zero to a working, data-connected
workspace in a five-minute live demo — and feel like the product was built for
them.

## Audience
Evaluator / champion at a mid-market company (**Acme**). Semi-technical: they'll
connect a data source but won't read code.

## Product / feature
The onboarding flow of a collaborative analytics SaaS: create a workspace,
invite a teammate, connect a data source, see a first insight.

## Key beats
1. Welcome & sign in (land on a populated workspace, not an empty shell).
2. Create your workspace (show the empty state first, then create it live).
3. Invite a teammate (collaboration hook — keep it to ~20s).
4. Connect a data source (the "aha": real data flowing in).
5. See your first insight (pay off the connection immediately).
6. Next steps (recap + clear call to action + Q&A).

## Paste-blobs / data needed
- Demo login (email + throwaway password).
- Workspace slug named after the customer.
- A teammate invite email + a friendly invite message.
- The data source name and a (masked) connection string.
- One sample metric name to narrate.

## Variables (reused across the deck)
- `customer` = `Acme`
- `demoEmail` = `ada@acme.example`
- `workspace` = `acme-hq`
- `dataSource` = `Postgres (analytics-prod)`

## Desired length
6 cards, ~5 minutes. One beat per card; talking points skimmable.
