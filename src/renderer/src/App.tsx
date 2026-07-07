import { useEffect } from 'react'
import { useDeckStore } from './store/deckStore'
import { DeckPicker } from './components/DeckPicker'
import { DeckWorkspace } from './components/DeckWorkspace'

/**
 * Root component. Shows the DeckPicker until a deck is open, then the workspace.
 */
export default function App(): JSX.Element {
  const deck = useDeckStore((s) => s.deck)
  const refreshSummaries = useDeckStore((s) => s.refreshSummaries)

  useEffect(() => {
    refreshSummaries()
  }, [refreshSummaries])

  return (
    <div className="h-full w-full bg-deck-bg text-deck-text">
      {deck ? <DeckWorkspace /> : <DeckPicker />}
    </div>
  )
}
