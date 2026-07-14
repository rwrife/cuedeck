import { describe, it, expect } from 'vitest'
import {
  BUILD_LANGUAGE,
  stepTitleFieldId,
  contentLabelFieldId
} from '../src/shared/buildLanguage'

/**
 * The Build workspace (#35) presents cue cards as demo "steps" and snippets as
 * "paste-ready content" using presenter-friendly language. These tests lock in
 * that terminology and the stable field-id helpers used to autofocus newly
 * created steps and content, so the primary UI stays understandable without
 * CueDeck-internal jargon.
 */
describe('build workspace language (#35)', () => {
  it('uses presenter-friendly step language, not "card"', () => {
    const stepStrings = [
      BUILD_LANGUAGE.step.singular,
      BUILD_LANGUAGE.step.plural,
      BUILD_LANGUAGE.step.listHeading,
      BUILD_LANGUAGE.step.add,
      BUILD_LANGUAGE.step.remove,
      BUILD_LANGUAGE.step.defaultTitle,
      BUILD_LANGUAGE.step.titlePlaceholder,
      BUILD_LANGUAGE.step.emptyTitle,
      BUILD_LANGUAGE.step.emptyBody,
      BUILD_LANGUAGE.step.emptyAction
    ]
    expect(BUILD_LANGUAGE.step.singular).toBe('Step')
    for (const s of stepStrings) {
      expect(s.toLowerCase()).not.toContain('card')
      expect(s.trim().length).toBeGreaterThan(0)
    }
  })

  it('uses "paste-ready content" language, not "snippet"', () => {
    const contentStrings = [
      BUILD_LANGUAGE.content.listHeading,
      BUILD_LANGUAGE.content.add,
      BUILD_LANGUAGE.content.defaultLabel,
      BUILD_LANGUAGE.content.labelPlaceholder,
      BUILD_LANGUAGE.content.emptyTitle,
      BUILD_LANGUAGE.content.emptyBody,
      BUILD_LANGUAGE.content.emptyAction
    ]
    for (const s of contentStrings) {
      expect(s.toLowerCase()).not.toContain('snippet')
      expect(s.trim().length).toBeGreaterThan(0)
    }
  })

  it('empty states explain the concept and give one next action', () => {
    // Body explains what the concept is; action is a short imperative CTA.
    expect(BUILD_LANGUAGE.step.emptyBody.length).toBeGreaterThan(20)
    expect(BUILD_LANGUAGE.content.emptyBody.length).toBeGreaterThan(20)
    expect(BUILD_LANGUAGE.step.emptyAction.length).toBeGreaterThan(0)
    expect(BUILD_LANGUAGE.content.emptyAction.length).toBeGreaterThan(0)
  })

  it('surfaces advanced tools as a distinct, non-primary group', () => {
    expect(BUILD_LANGUAGE.advanced.heading.toLowerCase()).toContain('advanced')
    expect(BUILD_LANGUAGE.advanced.hint.length).toBeGreaterThan(0)
  })

  it('builds stable, unique, id-safe field ids for autofocus', () => {
    expect(stepTitleFieldId('abc123')).toBe('cuedeck-step-title-abc123')
    expect(contentLabelFieldId('xyz789')).toBe('cuedeck-content-label-xyz789')

    // Distinct namespaces so a step and a content block never collide.
    expect(stepTitleFieldId('same')).not.toBe(contentLabelFieldId('same'))

    // Deterministic (safe to call in render).
    expect(stepTitleFieldId('id')).toBe(stepTitleFieldId('id'))
  })
})
