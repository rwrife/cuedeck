# 🎬 CueDeck

**Demo cue cards with instant clipboard snippets.** A desktop teleprompter for software demos — lay out your talking points as cue cards, attach the text blobs you paste into the app you're demoing, and copy or drag them out in one click.

Built with **Electron + React + TypeScript + Vite + Tailwind + Zustand**.

---

## Why

If you give software demos, you probably script them: what to click, what to say, and the exact chunks of text you paste into forms mid-demo. Doing that in Notepad means constant alt-tabbing and hunting for the right blob. CueDeck gives that workflow real structure:

- **Cue cards** for each beat of the demo (your running order).
- **Talking-point notes** per card.
- **Snippets** — labeled text blobs with a big **Copy** button and a **drag handle** so you can drop them straight into the target app.
- **Pin-on-top** presenter mode so the deck floats above your demo window.
- **Import / export** decks as `.json` files via native OS dialogs — back them up, commit them to a repo, or share with a teammate.

## Concepts

| Term | Meaning |
| --- | --- |
| **Deck** | A full demo script. Saved as one `*.cuedeck.json` file. |
| **Cue Card** | One step/beat. Has a title, notes, and 0..N snippets. |
| **Snippet** | A labeled blob of text. One-click copy + drag-out. |

> **Deck file format:** decks are a single versioned JSON document
> (`*.cuedeck.json`). The format is documented in
> [`docs/deck-format.md`](docs/deck-format.md) with a published JSON Schema
> ([`schema/cuedeck.schema.json`](schema/cuedeck.schema.json), Draft 2020-12).
> Validation/normalization lives in one shared module
> ([`src/shared/deck.ts`](src/shared/deck.ts)) used by the app, CLI, and MCP
> server.

## Getting Started

```bash
npm install
npm run dev        # launch the app in dev mode (hot reload)
```

### Other scripts

```bash
npm run build      # type-check + build main/preload/renderer
npm run typecheck  # TS type-check (node + web)
npm run lint       # ESLint
npm run test       # Vitest unit tests
npm run package    # build a distributable with electron-builder
```

## Project Structure

```
src/
├── main/           # Electron main process
│   ├── index.ts        # window + core IPC (clipboard, always-on-top)
│   └── deckStore.ts    # deck persistence (JSON files in userData)
├── preload/        # contextBridge API (window.cuedeck.*)
│   └── index.ts
├── renderer/       # React app
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── components/     # DeckPicker, DeckWorkspace, CardList, CardEditor, SnippetButton
│       ├── store/          # Zustand store w/ debounced auto-save
│       └── styles/
└── shared/         # types + IPC channels + deck validator/normalizer (both sides)
```

## Data Storage

Decks are stored as individual JSON files under Electron's `userData` directory:

- **Windows:** `%APPDATA%/cuedeck/decks/`
- **macOS:** `~/Library/Application Support/cuedeck/decks/`
- **Linux:** `~/.config/cuedeck/decks/`

Each deck is human-readable JSON, so export/backup is just a file copy. You can also use **Export** (deck picker or workspace top bar) to save a deck anywhere via a native save dialog, and **Import…** to load a deck file back in — imported decks are validated and assigned a fresh id so they never collide with existing ones.

## Roadmap

See the GitHub Issues for the build-out plan — keyboard-driven copy hotkeys, drag-to-reorder, deck import/export, search, presenter compact mode, themes, and packaging for all platforms.

## License

MIT © rwrife
