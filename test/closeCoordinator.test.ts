import { describe, expect, it } from 'vitest'
import { CloseGuard } from '../src/main/closeCoordinator'

describe('CloseGuard — safe app/window shutdown handshake', () => {
  it('starts open', () => {
    expect(new CloseGuard().getState()).toBe('open')
  })

  it('defers the first close request and begins flushing', () => {
    const guard = new CloseGuard()
    const decision = guard.requestClose()
    expect(decision.proceed).toBe(false)
    expect(decision.shouldFlush).toBe(true)
    expect(guard.getState()).toBe('flushing')
  })

  it('keeps deferring while a flush is still in progress, without re-flushing', () => {
    const guard = new CloseGuard()
    guard.requestClose()
    const second = guard.requestClose()
    expect(second.proceed).toBe(false)
    // A duplicate OS close event must not kick a second flush round-trip.
    expect(second.shouldFlush).toBe(false)
    expect(guard.getState()).toBe('flushing')
  })

  it('becomes closable once the renderer acks the flush, and asks to re-close', () => {
    const guard = new CloseGuard()
    guard.requestClose()
    const result = guard.onFlushComplete()
    expect(guard.getState()).toBe('closable')
    expect(result.shouldClose).toBe(true)
  })

  it('lets the close proceed after the flush completes', () => {
    const guard = new CloseGuard()
    guard.requestClose()
    guard.onFlushComplete()
    expect(guard.requestClose().proceed).toBe(true)
  })

  it('treats a flush timeout like completion so shutdown can never hang', () => {
    const guard = new CloseGuard()
    guard.requestClose()
    const result = guard.onFlushTimeout()
    expect(guard.getState()).toBe('closable')
    expect(result.shouldClose).toBe(true)
    expect(guard.requestClose().proceed).toBe(true)
  })

  it('ignores a late ack that arrives after a timeout already resolved the close', () => {
    const guard = new CloseGuard()
    guard.requestClose()
    guard.onFlushTimeout()
    // Renderer's flushComplete lands late — must be a harmless no-op.
    const late = guard.onFlushComplete()
    expect(late.shouldClose).toBe(false)
    expect(guard.getState()).toBe('closable')
  })

  it('ignores an ack that arrives when no close is pending', () => {
    const guard = new CloseGuard()
    const result = guard.onFlushComplete()
    expect(result.shouldClose).toBe(false)
    expect(guard.getState()).toBe('open')
  })

  it('can be reset when a close is cancelled elsewhere', () => {
    const guard = new CloseGuard()
    guard.requestClose()
    guard.reset()
    expect(guard.getState()).toBe('open')
    // A subsequent close starts the handshake fresh.
    expect(guard.requestClose().shouldFlush).toBe(true)
  })
})
