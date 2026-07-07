/**
 * `deckRepository` — the shared, headless deck *operations* layer.
 *
 * `DeckStore` (see `./store.ts`) knows how to persist whole decks to disk; this
 * module sits one level up and provides the granular authoring operations that
 * both the `cuedeck` CLI (#14) and the `cuedeck-mcp` MCP server (#15) need:
 * add/update cards and snippets, reorder them, set variables, render a preview,
 * and build a whole deck from an outline in one call. Extracting it here means
 * the CLI and MCP server share exactly one implementation of every mutation, so
 * they can never drift, and all writes still go through the shared
 * `validateDeck`/`normalizeDeck` core via the store.
 *
 * ## Error model
 *
 * Every operation that can fail for a caller-supplied reason (unknown deck /
 * card / snippet id, bad input) throws a {@link DeckRepositoryError} carrying a
 * machine-readable {@link DeckRepositoryErrorCode}. Callers translate that into
 * their own surface — a nonzero CLI exit, or a structured MCP error — instead of
 * crashing. Nothing here writes to stdout/stderr or calls `process.exit`, so it
 * stays a pure library usable from any host.
 */

import { generateId, renderSnippet, type CueCard, type Deck, type DeckSummary, type Snippet } from '../shared'
import { move } from '../shared/reorder'
import { renderDeckText } from './render'
import type { DeckStore } from './store'

/** Machine-readable failure categories for {@link DeckRepositoryError}. */
export type DeckRepositoryErrorCode =
  /** A referenced deck id does not exist in the store. */
  | 'deck_not_found'
  /** A referenced card id does not exist in the named deck. */
  | 'card_not_found'
  /** A referenced snippet id does not exist in the named card. */
  | 'snippet_not_found'
  /** Caller-supplied input was structurally invalid (empty name, bad index, …). */
  | 'invalid_input'

/**
 * A recoverable, caller-attributable repository failure. The {@link code} lets a
 * host map it to a structured error (MCP) or an exit code (CLI); the message is
 * human-readable.
 */
export class DeckRepositoryError extends Error {
  constructor(
    readonly code: DeckRepositoryErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'DeckRepositoryError'
  }
}

/** A single card in an {@link DeckOutline}. */
export interface OutlineCard {
  title: string
  notes?: string
  snippets?: OutlineSnippet[]
}

/** A single snippet in an {@link OutlineCard}. */
export interface OutlineSnippet {
  label: string
  content: string
}

/**
 * A structured deck outline accepted by {@link DeckRepository.createDeckFromOutline}.
 * The ergonomic "build me a demo" shape: a deck name plus an ordered list of
 * cards, each with optional notes and snippets.
 */
export interface DeckOutline {
  name: string
  cards: OutlineCard[]
  /** Optional deck-level variables to seed (`{{placeholder}}` substitution, #7). */
  variables?: Record<string, string>
}

/* -------------------------------------------------------------------------- */
/* Small internal helpers                                                     */
/* -------------------------------------------------------------------------- */

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DeckRepositoryError('invalid_input', `${field} must be a non-empty string.`)
  }
  return value
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new DeckRepositoryError('invalid_input', `${field} must be a string.`)
  }
  return value
}

function requireIndex(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new DeckRepositoryError('invalid_input', `${field} must be a non-negative integer.`)
  }
  return value
}

/**
 * High-level authoring operations over a {@link DeckStore}. Construct one with a
 * store (which already encapsulates the deck directory) and call its methods.
 * Every mutating method loads the deck, applies the change in memory, and
 * persists via `store.save`, so the on-disk file is always re-normalized.
 */
export class DeckRepository {
  constructor(private readonly store: DeckStore) {}

  /** Underlying store, exposed for hosts that need the deck directory, etc. */
  get deckStore(): DeckStore {
    return this.store
  }

  /** Load a deck by id or throw {@link DeckRepositoryError} `deck_not_found`. */
  private async require(deckId: string): Promise<Deck> {
    requireNonEmpty(deckId, 'deckId')
    const deck = await this.store.load(deckId)
    if (!deck) {
      throw new DeckRepositoryError('deck_not_found', `Deck "${deckId}" not found.`)
    }
    return deck
  }

  private findCard(deck: Deck, cardId: string): CueCard {
    const card = deck.cards.find((c) => c.id === cardId)
    if (!card) {
      throw new DeckRepositoryError('card_not_found', `Card "${cardId}" not found in deck "${deck.id}".`)
    }
    return card
  }

  private findSnippet(card: CueCard, snippetId: string): Snippet {
    const snippet = card.snippets.find((s) => s.id === snippetId)
    if (!snippet) {
      throw new DeckRepositoryError(
        'snippet_not_found',
        `Snippet "${snippetId}" not found in card "${card.id}".`
      )
    }
    return snippet
  }

  /* ------------------------------ Reads -------------------------------- */

  /** List all decks in the store as lightweight summaries (newest first). */
  async listDecks(): Promise<DeckSummary[]> {
    return this.store.list()
  }

  /** Load a full deck by id (throws `deck_not_found` when absent). */
  async getDeck(deckId: string): Promise<Deck> {
    return this.require(deckId)
  }

  /** Render a deck's plain-text running order (`{{variables}}` resolved). */
  async renderDeck(deckId: string): Promise<string> {
    const deck = await this.require(deckId)
    return renderDeckText(deck)
  }

  /* ------------------------------ Decks -------------------------------- */

  /** Create and persist a new, empty deck. Returns the created deck. */
  async createDeck(name: string): Promise<Deck> {
    requireNonEmpty(name, 'name')
    return this.store.create(name)
  }

  /* ------------------------------ Cards -------------------------------- */

  /** Append a card to a deck; returns the created card. */
  async addCard(deckId: string, title: string, notes?: string): Promise<CueCard> {
    const deck = await this.require(deckId)
    requireString(title, 'title')
    const card: CueCard = {
      id: generateId(),
      title,
      notes: notes ?? '',
      snippets: []
    }
    deck.cards.push(card)
    await this.store.save(deck)
    return card
  }

  /**
   * Update a card's `title` and/or `notes` (only the fields provided change).
   * Returns the updated card.
   */
  async updateCard(
    deckId: string,
    cardId: string,
    changes: { title?: string; notes?: string }
  ): Promise<CueCard> {
    const deck = await this.require(deckId)
    const card = this.findCard(deck, cardId)
    if (changes.title !== undefined) card.title = requireString(changes.title, 'title')
    if (changes.notes !== undefined) card.notes = requireString(changes.notes, 'notes')
    await this.store.save(deck)
    return card
  }

  /** Move a card from one index to another (indices are clamped). */
  async reorderCards(deckId: string, from: number, to: number): Promise<Deck> {
    const deck = await this.require(deckId)
    requireIndex(from, 'from')
    requireIndex(to, 'to')
    deck.cards = move(deck.cards, from, to)
    return this.store.save(deck)
  }

  /* ----------------------------- Snippets ------------------------------ */

  /** Append a snippet to a card; returns the created snippet. */
  async addSnippet(deckId: string, cardId: string, label: string, content: string): Promise<Snippet> {
    const deck = await this.require(deckId)
    const card = this.findCard(deck, cardId)
    requireString(label, 'label')
    requireString(content, 'content')
    const snippet: Snippet = { id: generateId(), label, content }
    card.snippets.push(snippet)
    await this.store.save(deck)
    return snippet
  }

  /**
   * Update a snippet's `label` and/or `content` (only provided fields change).
   * Returns the updated snippet.
   */
  async updateSnippet(
    deckId: string,
    cardId: string,
    snippetId: string,
    changes: { label?: string; content?: string }
  ): Promise<Snippet> {
    const deck = await this.require(deckId)
    const card = this.findCard(deck, cardId)
    const snippet = this.findSnippet(card, snippetId)
    if (changes.label !== undefined) snippet.label = requireString(changes.label, 'label')
    if (changes.content !== undefined) snippet.content = requireString(changes.content, 'content')
    await this.store.save(deck)
    return snippet
  }

  /** Remove a snippet from a card. Returns the removed snippet's id. */
  async removeSnippet(deckId: string, cardId: string, snippetId: string): Promise<string> {
    const deck = await this.require(deckId)
    const card = this.findCard(deck, cardId)
    this.findSnippet(card, snippetId) // validate existence for a clear error
    card.snippets = card.snippets.filter((s) => s.id !== snippetId)
    await this.store.save(deck)
    return snippetId
  }

  /** Move a snippet within a card from one index to another (indices clamped). */
  async reorderSnippets(deckId: string, cardId: string, from: number, to: number): Promise<CueCard> {
    const deck = await this.require(deckId)
    const card = this.findCard(deck, cardId)
    requireIndex(from, 'from')
    requireIndex(to, 'to')
    card.snippets = move(card.snippets, from, to)
    await this.store.save(deck)
    return card
  }

  /* ---------------------------- Variables ------------------------------ */

  /**
   * Set a deck-level variable (`{{name}}` substitution, #7). Returns the updated
   * deck. Forward-compatible with the app's variable panel: the value is stored
   * verbatim.
   */
  async setVariable(deckId: string, name: string, value: string): Promise<Deck> {
    const deck = await this.require(deckId)
    requireNonEmpty(name, 'name')
    requireString(value, 'value')
    const variables = { ...(deck.variables ?? {}) }
    variables[name] = value
    return this.store.save({ ...deck, variables })
  }

  /* ----------------------------- Outline ------------------------------- */

  /**
   * Build a complete deck from a structured outline in one call — the ergonomic
   * "build me a demo" path. Creates the deck, then appends every card and its
   * snippets in order, seeds any variables, and persists once at the end.
   *
   * Returns the fully-populated, persisted deck.
   */
  async createDeckFromOutline(outline: DeckOutline): Promise<Deck> {
    if (typeof outline !== 'object' || outline === null) {
      throw new DeckRepositoryError('invalid_input', 'outline must be an object.')
    }
    requireNonEmpty(outline.name, 'name')
    if (!Array.isArray(outline.cards)) {
      throw new DeckRepositoryError('invalid_input', 'outline.cards must be an array.')
    }

    // Build the whole deck in memory first, then write once (fewer disk writes,
    // and the deck never exists half-populated on disk).
    const created = await this.store.create(outline.name)

    const cards: CueCard[] = outline.cards.map((rawCard, ci) => {
      if (typeof rawCard !== 'object' || rawCard === null) {
        throw new DeckRepositoryError('invalid_input', `outline.cards[${ci}] must be an object.`)
      }
      requireString(rawCard.title, `outline.cards[${ci}].title`)
      const snippets: Snippet[] = Array.isArray(rawCard.snippets)
        ? rawCard.snippets.map((rawSnippet, si) => {
            if (typeof rawSnippet !== 'object' || rawSnippet === null) {
              throw new DeckRepositoryError(
                'invalid_input',
                `outline.cards[${ci}].snippets[${si}] must be an object.`
              )
            }
            requireString(rawSnippet.label, `outline.cards[${ci}].snippets[${si}].label`)
            requireString(rawSnippet.content, `outline.cards[${ci}].snippets[${si}].content`)
            return { id: generateId(), label: rawSnippet.label, content: rawSnippet.content }
          })
        : []
      return {
        id: generateId(),
        title: rawCard.title,
        notes: rawCard.notes ?? '',
        snippets
      }
    })

    const variables: Record<string, string> = {}
    if (outline.variables !== undefined) {
      if (typeof outline.variables !== 'object' || outline.variables === null) {
        throw new DeckRepositoryError('invalid_input', 'outline.variables must be an object.')
      }
      for (const [key, value] of Object.entries(outline.variables)) {
        variables[key] = requireString(value, `outline.variables.${key}`)
      }
    }

    return this.store.save({ ...created, cards, variables })
  }
}

/**
 * Re-export the shared snippet renderer so hosts that already depend on the
 * repository can resolve `{{variables}}` without a second import.
 */
export { renderSnippet }
