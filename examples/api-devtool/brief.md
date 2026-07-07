# Demo brief — API / Dev-Tool Demo

> Worked example. Hand a brief like this to an assistant (or the `cuedeck-mcp`
> server) and it produces the deck in [`outline.json`](./outline.json) /
> [`deck.json`](./deck.json). See the [AI-authoring guide](../../docs/ai-authoring.md).

## Goal
Convince a developer audience that our API is fast to adopt: from first request
to a live webhook in one short demo, with copy-paste that always works.

## Audience
Application developers evaluating the API for a real integration. Technical —
they *want* to see curl, JSON, and SDK code.

## Product / feature
A developer API with a REST surface, a typed SDK, and webhooks. The story arc is
**polling is painful → keys are easy → requests just work → the SDK is nicer →
webhooks replace polling.**

## Key beats
1. The problem in one screen (messy polling, missed events).
2. Grab an API key (self-serve; onto the clipboard).
3. First request (hello-world curl returns real JSON).
4. Use the SDK (same call, three typed lines).
5. Subscribe to a webhook (the headline: stop polling, get pushed).
6. Recap & docs (tie it together, point at docs, Q&A).

## Paste-blobs / data needed
- The old polling loop (the "before").
- API token + an `Authorization` header.
- A `list` curl and a `POST` curl.
- SDK install + a short TypeScript usage snippet.
- A webhook-register curl and an example event payload.
- The docs URL.

## Variables (reused across the deck)
- `apiBase` = `https://api.example.com/v1`
- `token` = `sk_demo_00000000`
- `eventType` = `checkout.completed`

## Desired length
6 cards, ~6 minutes. Lead with the pain; every card ends on a concrete win.
