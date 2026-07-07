/**
 * Renderer half of the live demo control bridge (#17).
 *
 * The bridge transport + protocol live in the main process; the app's runtime
 * state (open deck, active card, presenter mode) lives here in the Zustand
 * store. This module is the glue:
 *
 *  - {@link applyLiveCommand} translates an incoming bridge command
 *    (select/next/prev/copy/enter/exitPresenter) into the store actions that
 *    already power the UI, so remote control and the keyboard/mouse drive the
 *    exact same code paths. It returns a reply for main (including, for
 *    `copySnippet`, the resolved text main writes to the clipboard).
 *  - {@link publishLiveState} projects the current store state into the
 *    lightweight {@link LiveState} snapshot and pushes it to main, which serves
 *    it from cache for `getState`.
 *  - {@link initLiveControlBridge} wires both up: it subscribes to incoming
 *    commands and re-publishes state whenever the relevant slice changes, and
 *    returns a teardown function.
 *
 * Nothing here opens a socket or handles auth — that's all main. This file only
 * runs when the app is running, which is exactly when live control is useful.
 */

import { buildLiveState, resolveCardIndex, resolveSnippetIndex } from '@shared/liveControl'
import { useDeckStore } from './store/deckStore'

/** The command payload the renderer receives (mirrors the preload envelope). */
interface LiveCommandMessage {
  command:
    | 'selectCard'
    | 'nextCard'
    | 'prevCard'
    | 'copySnippet'
    | 'enterPresenter'
    | 'exitPresenter'
  index?: number
  cardId?: string
  snippetId?: string
}

/**
 * The reply the renderer sends back to main for a command. Kept structurally in
 * sync with the preload's `LiveCommandReply` (main narrows on `reason`); defined
 * locally so this renderer module doesn't import across the web/node tsconfig
 * boundary.
 */
type LiveCommandReply =
  | { ok: false; reason: 'no_deck_open' | 'card_not_found' | 'snippet_not_found'; message: string }
  | { ok: true; copy?: { snippetId: string; label: string; copied: string } }

/**
 * Apply one bridge command to the deck store and produce a reply for main.
 *
 * Domain failures (no deck open, card/snippet not found) come back as
 * `{ ok: false, reason }` so the bridge maps them to precise error codes; a
 * successful `copySnippet` returns the resolved `copy` payload for main to place
 * on the clipboard through its trusted path.
 */
export function applyLiveCommand(message: LiveCommandMessage): LiveCommandReply {
  const store = useDeckStore.getState()
  const deck = store.deck
  if (!deck) {
    return { ok: false, reason: 'no_deck_open', message: 'No deck is currently open.' }
  }

  switch (message.command) {
    case 'selectCard': {
      const idx = resolveCardIndex(deck.cards, { index: message.index, cardId: message.cardId })
      if (idx < 0) {
        return {
          ok: false,
          reason: 'card_not_found',
          message: 'No card matches the given index or id.'
        }
      }
      store.setActiveCard(deck.cards[idx].id)
      return { ok: true }
    }

    case 'nextCard': {
      store.stepActiveCard(1)
      return { ok: true }
    }

    case 'prevCard': {
      store.stepActiveCard(-1)
      return { ok: true }
    }

    case 'copySnippet': {
      const activeCard = deck.cards.find((c) => c.id === store.activeCardId)
      if (!activeCard) {
        return {
          ok: false,
          reason: 'card_not_found',
          message: 'There is no active card to copy a snippet from.'
        }
      }
      const idx = resolveSnippetIndex(activeCard.snippets, {
        index: message.index,
        snippetId: message.snippetId
      })
      if (idx < 0) {
        return {
          ok: false,
          reason: 'snippet_not_found',
          message: 'No snippet matches the given index or id on the active card.'
        }
      }
      const snippet = activeCard.snippets[idx]
      const copy = store.copySnippetForLive(activeCard.id, snippet.id)
      if (!copy) {
        return { ok: false, reason: 'snippet_not_found', message: 'The snippet could not be read.' }
      }
      return { ok: true, copy }
    }

    case 'enterPresenter': {
      store.setMode('present')
      return { ok: true }
    }

    case 'exitPresenter': {
      store.setMode('edit')
      return { ok: true }
    }

    default:
      return {
        ok: false,
        reason: 'no_deck_open',
        message: `Unhandled command: ${String((message as LiveCommandMessage).command)}.`
      }
  }
}

/** Project the current store state and push a fresh snapshot to main. */
export function publishLiveState(): void {
  const { deck, activeCardId, mode } = useDeckStore.getState()
  const state = buildLiveState(deck, activeCardId, mode === 'present')
  window.cuedeck.live.publishState(state)
}

/**
 * Wire the renderer into the live-control bridge: subscribe to incoming
 * commands (applying them to the store) and publish a fresh state snapshot now
 * and on every relevant store change. Returns a teardown that unsubscribes both.
 *
 * State is published unconditionally (cheap) regardless of whether the bridge is
 * currently enabled; main simply caches the latest snapshot and only serves it
 * when a client connects, so the snapshot is always warm the instant the user
 * enables live control mid-demo.
 */
export function initLiveControlBridge(): () => void {
  // Apply incoming commands to the store; the reply flows back to main.
  const unsubscribeCommands = window.cuedeck.live.onCommand(async (message) =>
    applyLiveCommand(message)
  )

  // Publish once immediately so getState is correct before any change fires.
  publishLiveState()

  // Re-publish whenever the deck, active card, or presenter mode changes. The
  // full deck object identity changes on any edit, so this also keeps card
  // titles / snippet lists in the snapshot current.
  const unsubscribeStore = useDeckStore.subscribe((state, prev) => {
    if (
      state.deck !== prev.deck ||
      state.activeCardId !== prev.activeCardId ||
      state.mode !== prev.mode
    ) {
      publishLiveState()
    }
  })

  return () => {
    unsubscribeCommands()
    unsubscribeStore()
  }
}
