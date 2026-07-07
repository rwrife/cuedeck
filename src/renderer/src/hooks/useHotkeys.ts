import { useEffect } from 'react'
import { useDeckStore } from '../store/deckStore'
import {
  cardStepForKey,
  isTypingTarget,
  snippetForKey
} from '@shared/hotkeys'

/**
 * Global demo hotkeys, attached once at the workspace level:
 *
 *  - `1`..`9`  copy the matching snippet on the **active** card (flashing it).
 *  - `\u2190` / `\u2192`  move to the previous / next card in the running order.
 *
 * All hotkeys are ignored while the user is typing in an input/textarea/
 * contenteditable, so editing labels and notes is never hijacked. Modifier
 * combos (Ctrl/Meta/Alt) are also left alone so browser/OS shortcuts and the
 * future command palette keep working.
 */
export function useHotkeys(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      // Leave modifier combos to the OS / other handlers.
      if (e.ctrlKey || e.metaKey || e.altKey) return

      // Don't hijack typing.
      if (isTypingTarget(e.target as HTMLElement | null)) return

      // Read the latest state directly to avoid stale-closure bugs.
      const { deck, activeCardId, copySnippet, stepActiveCard } = useDeckStore.getState()
      if (!deck) return

      // Card navigation.
      const step = cardStepForKey(e.key)
      if (step !== null) {
        e.preventDefault()
        stepActiveCard(step)
        return
      }

      // Snippet copy by number.
      const activeCard = deck.cards.find((c) => c.id === activeCardId)
      if (!activeCard) return
      const snippet = snippetForKey(e.key, activeCard.snippets)
      if (snippet) {
        e.preventDefault()
        void copySnippet(activeCard.id, snippet.id)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
