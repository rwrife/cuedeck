/**
 * A subtle "copied" chime (#8), played when the copy-sound preference is on.
 *
 * Implemented with the Web Audio API so it needs no bundled audio asset and
 * stays tiny: a short, quiet sine blip with a fast fade-out. The AudioContext is
 * created lazily and reused, and every step is guarded so this is a no-op in any
 * environment without Web Audio (it never throws into the copy path).
 */

let ctx: AudioContext | null = null

/** Lazily create (and resume) a shared AudioContext, or return null if unsupported. */
function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    if (!ctx) ctx = new Ctor()
    // Autoplay policies can leave the context suspended until a user gesture;
    // a copy is a user gesture, so resuming here is allowed.
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/**
 * Play a short, quiet confirmation blip. Safe to call from anywhere on the copy
 * path; failures (no Web Audio, blocked autoplay) are swallowed so audio never
 * interferes with the actual clipboard write.
 */
export function playCopyChime(): void {
  const audio = getContext()
  if (!audio) return
  try {
    const now = audio.currentTime
    const osc = audio.createOscillator()
    const gain = audio.createGain()

    osc.type = 'sine'
    // A pleasant, unobtrusive two-step ping.
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.setValueAtTime(1174, now + 0.05)

    // Quiet, with a quick attack and exponential release so it doesn't click.
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)

    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start(now)
    osc.stop(now + 0.18)
  } catch {
    // Ignore — a missing/blocked audio device must never break copying.
  }
}
