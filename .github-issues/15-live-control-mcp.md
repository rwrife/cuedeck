## Summary
**(Stretch)** Add a **live control channel** so an MCP client can drive the *running* CueDeck app during a demo — advance/select cards and copy snippets on cue — via a local IPC bridge, extending the authoring MCP (#15) with runtime tools.

## Motivation
Authoring (build the deck ahead of time) is v1. The stretch goal is AI as a **live demo co-pilot**: while you talk, the assistant advances to the right card and copies the exact snippet you need, so it's on your clipboard the instant you reach that step. This is the "wow" demo, but it needs a controlled bridge into the Electron process.

## Scope & safety
- This is explicitly a **stretch/optional** issue; only pursue after #13–#15 land.
- The control channel must be **local-only** (loopback socket or named pipe), **opt-in** (off by default; user enables "Allow live control" in the running app), and must never expose deck-mutating or filesystem operations beyond the minimal runtime set below. No remote/network exposure.

## Requirements
- A **local IPC bridge** in the Electron app (e.g. a loopback socket / named pipe or local HTTP on 127.0.0.1 with a random port + token) that, when enabled, accepts a small runtime command set:
  - `getState` → current deck id, active card index/id, card count.
  - `selectCard` (index or id) → change the active card.
  - `nextCard` / `prevCard`.
  - `copySnippet` (index or id on the active card) → place it on the clipboard (reuses the existing clipboard path).
  - `enterPresenter` / `exitPresenter` (integrates with #5 if merged).
- **MCP runtime tools** in the server (guarded/namespaced, e.g. `live_*`) that talk to the bridge: `live_get_state`, `live_select_card`, `live_next`, `live_prev`, `live_copy_snippet`. These should clearly no-op with a helpful error if the app isn't running or live control is disabled.
- **In-app UX:** a visible toggle + indicator showing live control is active, the port/token (or a copy-config button), and a way to revoke instantly.
- **Docs:** extend `docs/mcp.md` (or add `docs/live-control.md`) with setup, the security model, and an example "co-pilot my demo" prompt.

## Implementation notes
- Reuse the existing main-process clipboard + always-on-top/presenter handlers; add a guarded transport rather than widening the preload API to the renderer.
- Generate a per-session token; require it on every request. Bind strictly to loopback.
- Keep the authoring tools (#15) and these runtime tools clearly separated so a client can use one without the other.
- Add a test for the bridge command handlers (state/select/copy) using a mock/fake window, and a test that requests without the token are rejected.

## Acceptance criteria
- [ ] Opt-in, loopback-only, token-guarded control bridge in the app (off by default).
- [ ] MCP `live_*` tools drive the running app (select/next/prev/copy/state) and fail gracefully when it's off/closed.
- [ ] In-app toggle + indicator + revoke.
- [ ] Security model + example documented.
- [ ] Handler + auth-rejection tests pass; `npm run typecheck`, `npm run test`, `npm run build` pass.

Depends on: #13, #15 (and integrates with #5 if present). Priority: stretch — after the authoring stack.
