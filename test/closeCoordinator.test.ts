import { describe, expect, it } from 'vitest'
import { CloseGuard } from '../src/main/closeCoordinator'

describe('CloseGuard — safe shutdown handshake', () => {
  it('starts open', () => {
    expect(new CloseGuard().getState()).toBe('open')
  })

  describe('ordinary window close (not an app quit)', () => {
    it('defers the first close request and begins flushing', () => {
      const guard = new CloseGuard()
      const decision = guard.requestClose(false)
      expect(decision.proceed).toBe(false)
      expect(decision.shouldFlush).toBe(true)
      expect(guard.getState()).toBe('flushing')
    })

    it('keeps deferring while a flush is still in progress, without re-flushing', () => {
      const guard = new CloseGuard()
      guard.requestClose(false)
      const second = guard.requestClose(false)
      expect(second.proceed).toBe(false)
      // A duplicate OS close event must not kick a second flush round-trip.
      expect(second.shouldFlush).toBe(false)
      expect(guard.getState()).toBe('flushing')
    })

    it('resumes the window close (not an app quit) once the flush acks', () => {
      const guard = new CloseGuard()
      guard.requestClose(false)
      const result = guard.onFlushComplete()
      expect(guard.getState()).toBe('closable')
      expect(result.resume).toBe('close')
    })

    it('lets the resumed close proceed without intercepting it again', () => {
      const guard = new CloseGuard()
      guard.requestClose(false)
      guard.onFlushComplete()
      const resumed = guard.requestClose(false)
      expect(resumed.proceed).toBe(true)
      expect(resumed.shouldFlush).toBe(false)
    })

    it('treats a flush timeout like completion so shutdown can never hang', () => {
      const guard = new CloseGuard()
      guard.requestClose(false)
      const result = guard.onFlushTimeout()
      expect(guard.getState()).toBe('closable')
      expect(result.resume).toBe('close')
      expect(guard.requestClose(false).proceed).toBe(true)
    })
  })

  describe('app quit (Cmd+Q / app.quit())', () => {
    it('defers the quit-initiated close and flushes once', () => {
      const guard = new CloseGuard()
      const decision = guard.requestClose(true)
      expect(decision.proceed).toBe(false)
      expect(decision.shouldFlush).toBe(true)
      expect(guard.getState()).toBe('flushing')
    })

    it('resumes the app quit (not just the window) once the flush acks', () => {
      const guard = new CloseGuard()
      guard.requestClose(true)
      const result = guard.onFlushComplete()
      expect(guard.getState()).toBe('closable')
      // Must resume the *quit*, otherwise on macOS the app lingers in the dock.
      expect(result.resume).toBe('quit')
    })

    it('permits the resumed quit close without re-intercepting or re-flushing', () => {
      const guard = new CloseGuard()
      guard.requestClose(true)
      guard.onFlushComplete()
      const resumed = guard.requestClose(true)
      expect(resumed.proceed).toBe(true)
      expect(resumed.shouldFlush).toBe(false)
    })

    it('resumes the quit on a flush timeout too', () => {
      const guard = new CloseGuard()
      guard.requestClose(true)
      expect(guard.onFlushTimeout().resume).toBe('quit')
      expect(guard.requestClose(true).proceed).toBe(true)
    })

    it('upgrades an in-progress ordinary-close flush to a quit when Cmd+Q lands mid-flush', () => {
      const guard = new CloseGuard()
      guard.requestClose(false)
      const midFlush = guard.requestClose(true)
      expect(midFlush.proceed).toBe(false)
      expect(midFlush.shouldFlush).toBe(false)
      // The user's ultimate intent is to quit, so resume must be a quit.
      expect(guard.onFlushComplete().resume).toBe('quit')
    })
  })

  describe('idempotency and spurious signals', () => {
    it('ignores a late ack that arrives after a timeout already resolved things', () => {
      const guard = new CloseGuard()
      guard.requestClose(false)
      guard.onFlushTimeout()
      const late = guard.onFlushComplete()
      expect(late.resume).toBe('none')
      expect(guard.getState()).toBe('closable')
    })

    it('ignores an ack that arrives when no close is pending', () => {
      const guard = new CloseGuard()
      const result = guard.onFlushComplete()
      expect(result.resume).toBe('none')
      expect(guard.getState()).toBe('open')
    })

    it('can be reset when a close is cancelled or a new window is created', () => {
      const guard = new CloseGuard()
      guard.requestClose(true)
      guard.reset()
      expect(guard.getState()).toBe('open')
      // A subsequent close starts the handshake fresh (as an ordinary close).
      const next = guard.requestClose(false)
      expect(next.shouldFlush).toBe(true)
    })

    it('does not loop: repeated quit requests while closable just proceed', () => {
      const guard = new CloseGuard()
      guard.requestClose(true)
      guard.onFlushComplete()
      expect(guard.requestClose(true).proceed).toBe(true)
      expect(guard.requestClose(true).proceed).toBe(true)
    })
  })
})
