# CueDeck live demo control (`live_*`)

**Live control** lets an MCP client drive the **running** CueDeck app during a
demo — advance/select cards and copy snippets on cue — over a small, **opt-in,
loopback-only, token-guarded** bridge. It extends the authoring MCP server
([`docs/mcp.md`](mcp.md), #15) with a separate family of **runtime** tools
(`live_*`).

This is the "**AI co-pilots my demo**" capability: while you talk, the assistant
advances to the right card and copies the exact snippet you need, so it's on your
clipboard the instant you reach that step.

> **Authoring vs. live control.** The [authoring tools](mcp.md) edit decks **on
> disk** and never touch a running app. The `live_*` tools do the opposite: they
> **only** talk to a running app and never edit deck files. Use either without
> the other.

- **App bridge (transport + execution):** [`src/main/liveControl.ts`](../src/main/liveControl.ts)
  (pure protocol/handler) + [`src/main/liveControlStore.ts`](../src/main/liveControlStore.ts)
  (Electron/IPC wiring).
- **Shared contract:** [`src/shared/liveControl.ts`](../src/shared/liveControl.ts)
  — command set, wire shapes, auth helpers, and the connection descriptor,
  shared by the app, the MCP tools, and the tests so they can't drift.
- **MCP tools:** [`src/mcp/liveTools.ts`](../src/mcp/liveTools.ts).
- **In-app UX:** [`src/renderer/src/components/LiveControlPanel.tsx`](../src/renderer/src/components/LiveControlPanel.tsx).

---

## Security model

Live control is designed to be safe by default. It is:

- **Off by default.** Nothing listens until you explicitly enable **🎛 Live →
  Allow live control** in the running app. There is no way to enable it remotely.
- **Loopback only.** The bridge binds strictly to `127.0.0.1` on an OS-assigned
  ephemeral port. It is **never** exposed on a routable/network interface, so
  only processes on your machine can reach it.
- **Token-guarded.** Enabling generates a fresh, high-entropy **per-session
  token**. Every request must present it as `Authorization: Bearer <token>`;
  requests without the exact token are rejected with `401`. Disabling rotates it
  away (a new enable mints a new token).
- **Minimal surface.** Only a small **runtime** command set is exposed —
  select/next/prev card, copy a snippet, and enter/exit Presenter Mode. There
  are **no** deck-mutating (create/delete/edit) or filesystem operations, and no
  way to read full snippet contents in bulk. Deck authoring stays in the
  separate on-disk MCP tools (#15).
- **Instantly revocable.** The panel's **Revoke** button (or toggling off)
  immediately closes the socket and deletes the on-disk descriptor, so the
  `live_*` tools can no longer connect. The bridge is also torn down on app quit.

The token is written to a descriptor file (below) with `0600` (user-read/write
only) permissions because it grants control of your running app for the session.

---

## Turning it on

1. Launch the CueDeck desktop app and open a deck.
2. Click **🎛 Live** in the workspace header.
3. Flip **Allow live control** on. The panel shows:
   - a **● Active** indicator (also reflected on the header button),
   - the **endpoint** (`127.0.0.1:<port>`),
   - the **session token** (hidden by default; **Reveal**/**Copy**), and
   - a **Config JSON** blob you can copy straight into a client config.
4. Point your MCP client at the bridge (see below).
5. When you're done, click **Revoke** (or toggle off) to shut it down.

---

## How the tools find the app

When enabled, the app writes a **connection descriptor** to its per-user data
directory and deletes it on disable/quit:

| OS | Descriptor path |
| --- | --- |
| **Windows** | `%APPDATA%\cuedeck\live-control.json` |
| **macOS** | `~/Library/Application Support/cuedeck/live-control.json` |
| **Linux** | `~/.config/cuedeck/live-control.json` (honors `$XDG_CONFIG_HOME`) |

```jsonc
{
  "host": "127.0.0.1",
  "port": 51734,        // OS-assigned each time you enable
  "token": "…",         // fresh per session
  "version": 1,
  "pid": 12345
}
```

The `live_*` tools read this file automatically (same `userData` resolution the
[CLI](cli.md) and [authoring server](mcp.md) use, no Electron boot required). For
headless/CI or an unusual setup, override the path with the
**`CUEDECK_LIVE_FILE`** environment variable pointing directly at a descriptor
file.

Because the MCP server is a subprocess of your client, run it on the **same
machine** as the app so it can reach `127.0.0.1` and read the descriptor.

### Client configuration

The `live_*` tools are part of the same `cuedeck-mcp` server as the authoring
tools — no separate server to configure. A typical entry (see [`docs/mcp.md`](mcp.md)
for the full walkthrough):

```json
{
  "mcpServers": {
    "cuedeck": {
      "command": "node",
      "args": ["/absolute/path/to/cuedeck/out/mcp/index.js"]
    }
  }
}
```

Omit `CUEDECK_DIR` so authoring writes to the app's default deck directory, and
run the client on the same machine as the running app so the `live_*` tools can
reach the loopback bridge.

---

## Tools

Every tool returns a structured error (`isError: true`) instead of throwing. When
the app is closed or live control is off, tools **no-op** with
`live_control_unavailable` and a hint to enable it — so an assistant can
gracefully ask you to turn it on rather than failing hard.

| Tool | Input | Result |
| --- | --- | --- |
| `live_get_state` | — | `{ deckOpen, deckId, deckName, cardCount, activeCardIndex, activeCardId, presenting, snippets[], cards[] }` |
| `live_select_card` | `index` **or** `cardId` | The resulting live state. |
| `live_next` | — | The resulting live state (clamped at the end). |
| `live_prev` | — | The resulting live state (clamped at the start). |
| `live_copy_snippet` | `index` **or** `snippetId` | `{ snippetId, label, copied }` — copies a snippet on the **active** card to the clipboard (`{{variables}}` resolved). |
| `live_enter_presenter` | — | Enters Presenter Mode; resulting live state. |
| `live_exit_presenter` | — | Exits Presenter Mode; resulting live state. |

`live_copy_snippet` targets the **active card's** snippets, so a typical flow is
`live_select_card` (or `live_next`) then `live_copy_snippet`. Use
`live_get_state` first to read the current card's snippet ids/labels.

Structured error codes you may see from the bridge: `no_deck_open`,
`card_not_found`, `snippet_not_found`, `unauthorized`, `bad_request`,
`unknown_command`, `internal_error` — plus `live_control_unavailable` from the
tool layer when the app can't be reached.

---

## Example: "co-pilot my demo"

With live control enabled and the client running on the same machine, a prompt
like this drives the runtime tools end-to-end:

> **You:** _You're my demo co-pilot. I'll tell you which beat I'm on; keep the
> CueDeck app on that card and put the right snippet on my clipboard just before
> I need it. Start by entering Presenter Mode and telling me what's on card 1._

A capable assistant will typically:

1. Call **`live_enter_presenter`** to switch the app into the compact demo view.
2. Call **`live_get_state`** to read the deck and the active card's snippets.
3. As you narrate, call **`live_next`** / **`live_select_card`** to stay on the
   right beat, and **`live_copy_snippet`** the instant before you paste — so the
   exact text (with `{{variables}}` resolved) is already on your clipboard.

If you haven't enabled live control (or closed the app), the tools return
`live_control_unavailable` and the assistant will ask you to turn on **🎛 Live**.

---

## Tests

Behavior is covered by [`test/liveControl.test.ts`](../test/liveControl.test.ts):

- the shared **state projection + selector** helpers,
- the pure **request handler** against a fake controller — including the required
  state/select/copy handlers and the **auth-rejection** path (missing/wrong token
  → `unauthorized`),
- the real **loopback HTTP bridge** (authorized command succeeds; unauthenticated
  request → `401`), and
- the **MCP `live_*` tools** over a fake transport (successful `live_copy_snippet`,
  the graceful `live_control_unavailable` no-op when the app is off, and verbatim
  pass-through of bridge errors).
