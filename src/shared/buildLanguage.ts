/**
 * Presenter-facing language for the Build workspace (#35).
 *
 * The Build workspace rebuilds authoring around presenter-friendly language and
 * progressive disclosure: cue cards are shown as demo "steps" and snippets as
 * "paste-ready content", so the core editing sequence is understandable without
 * knowing CueDeck's internal terminology. The domain model still speaks in
 * `CueCard`/`Snippet`; these are the human-facing labels used in the primary UI.
 *
 * Keeping the strings and the DOM-id helpers here (DOM-free) lets the labels be
 * asserted in unit tests and lets the editor build stable ids for autofocus of
 * newly created steps and paste-ready content, without a DOM in the test env.
 */

/** Presenter-facing labels for the Build workspace primary UI. */
export const BUILD_LANGUAGE = {
  /** A cue card, shown to the author as a demo step. */
  step: {
    singular: 'Step',
    plural: 'Steps',
    /** Left-pane running-order heading. */
    listHeading: 'Steps',
    /** Add-a-card action label. */
    add: 'Add step',
    /** Placeholder shown in a fresh step's title field. */
    titlePlaceholder: 'Name this step…',
    /** Default title used for a newly created step. */
    defaultTitle: 'New step',
    /** Delete-a-step action label. */
    remove: 'Delete step',
    /** Empty-list explanation + next action. */
    emptyTitle: 'No steps yet',
    emptyBody: 'A step is one beat of your demo — what you say and the content you paste.',
    emptyAction: 'Add your first step'
  },
  /** A snippet, shown to the author as paste-ready content. */
  content: {
    singular: 'Paste-ready content',
    plural: 'Paste-ready content',
    /** Section heading in the editor. */
    listHeading: 'Paste-ready content',
    /** Add-a-snippet action label. */
    add: 'Add content',
    /** Placeholder shown in a fresh block's label field. */
    labelPlaceholder: 'Label this content…',
    /** Default label used for a newly created block. */
    defaultLabel: 'New content',
    /** Empty-list explanation + next action. */
    emptyTitle: 'No paste-ready content',
    emptyBody: 'Add the text you copy and paste live — commands, code, or talking points.',
    emptyAction: 'Add content'
  },
  /** The talking-points notes field. */
  notes: {
    heading: 'Talking points',
    placeholder: "What you'll say on this step…"
  },
  /** The collapsible advanced-tools disclosure. */
  advanced: {
    heading: 'Advanced tools',
    hint: 'Variables, Markdown help, export, and live control'
  }
} as const

/**
 * Stable DOM id for the title input of a step (cue card). Used so newly created
 * steps can be focused immediately (acceptance criteria) without threading refs
 * through the store.
 */
export function stepTitleFieldId(cardId: string): string {
  return `cuedeck-step-title-${cardId}`
}

/**
 * Stable DOM id for the label input of a paste-ready content block (snippet), so
 * newly added content is focused and ready for typing immediately.
 */
export function contentLabelFieldId(snippetId: string): string {
  return `cuedeck-content-label-${snippetId}`
}
