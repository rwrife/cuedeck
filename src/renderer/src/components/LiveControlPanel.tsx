import { useCallback, useEffect, useState } from 'react'

/**
 * In-app live-control status surfaced to the renderer for the toggle/indicator.
 * Structurally matches the preload's `LiveControlStatus`; defined locally so this
 * renderer component doesn't import across the web/node tsconfig boundary.
 */
interface LiveControlStatus {
  enabled: boolean
  descriptor: {
    host: string
    port: number
    token: string
    version: number
    pid: number
  } | null
}

/**
 * Custom DOM event any component can dispatch to open the Live Control panel
 * (e.g. the "🎛 Live" button in the workspace header). Mirrors the
 * settings-modal / command-palette pattern so entry points stay decoupled.
 */
export const OPEN_LIVE_CONTROL_EVENT = 'cuedeck:open-live-control'

/** An accessible on/off toggle switch (matches the SettingsModal toggle). */
function Toggle({
  checked,
  onChange,
  ariaLabel,
  disabled
}: {
  checked: boolean
  onChange: (next: boolean) => void
  ariaLabel: string
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-deck-accent' : 'bg-deck-card border border-deck-border'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

/** A read-only value row with a copy button (used for host:port and token). */
function CopyRow({
  label,
  value,
  mono = true,
  reveal
}: {
  label: string
  value: string
  mono?: boolean
  reveal?: boolean
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  const shown = reveal === false ? '•'.repeat(Math.min(value.length, 24)) : value

  async function copy(): Promise<void> {
    await window.cuedeck.clipboard.write(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-deck-muted">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <code
          className={`min-w-0 truncate rounded bg-deck-card px-2 py-1 text-xs text-deck-text ${
            mono ? 'font-mono' : ''
          }`}
          title={reveal === false ? 'Hidden — use Copy' : value}
        >
          {shown}
        </code>
        <button
          onClick={() => void copy()}
          className="shrink-0 rounded px-2 py-1 text-xs text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
          title={`Copy ${label}`}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/**
 * Build the JSON snippet a user pastes into an MCP client's config `env` block
 * so the `live_*` tools can find this session's bridge. Point tools at the
 * per-session descriptor via `CUEDECK_LIVE_FILE`, OR pass host/port/token
 * inline — we show the descriptor-file form plus the raw values so either works.
 */
function configJson(status: LiveControlStatus): string {
  if (!status.descriptor) return ''
  const { host, port, token } = status.descriptor
  return JSON.stringify(
    {
      host,
      port,
      token
    },
    null,
    2
  )
}

/**
 * Live Control panel (#17): the in-app UX for the opt-in remote control bridge.
 *
 * Shows a master toggle ("Allow live control"), a clear active/off indicator,
 * and — while active — the loopback endpoint, the per-session token (hidden by
 * default, copyable), a one-click "Copy config" button, and an instant
 * **Revoke** action. Enabling starts a loopback-only, token-guarded HTTP bridge
 * in the main process; revoking closes it and deletes the on-disk descriptor so
 * the `live_*` MCP tools can no longer connect.
 *
 * The security model is deliberately conservative and surfaced right here: the
 * bridge is loopback-only, off by default, and exposes only runtime
 * select/next/prev/copy/presenter commands — never deck edits or file access.
 */
export function LiveControlPanel(): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<LiveControlStatus>({ enabled: false, descriptor: null })
  const [busy, setBusy] = useState(false)
  const [showToken, setShowToken] = useState(false)

  const refresh = useCallback(async () => {
    const next = await window.cuedeck.live.getStatus()
    setStatus(next)
  }, [])

  // Open via the shared event; refresh status each time it opens.
  useEffect(() => {
    function onOpen(): void {
      setOpen(true)
      void refresh()
    }
    window.addEventListener(OPEN_LIVE_CONTROL_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_LIVE_CONTROL_EVENT, onOpen)
  }, [refresh])

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function toggle(next: boolean): Promise<void> {
    setBusy(true)
    try {
      const result = next
        ? await window.cuedeck.live.enable()
        : await window.cuedeck.live.disable()
      setStatus(result)
      if (!next) setShowToken(false)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const d = status.descriptor
  const endpoint = d ? `${d.host}:${d.port}` : ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-deck-border bg-deck-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-deck-border px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-deck-text">🎛 Live Control</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                status.enabled
                  ? 'bg-green-600 text-white'
                  : 'bg-deck-card text-deck-muted border border-deck-border'
              }`}
            >
              {status.enabled ? '● Active' : 'Off'}
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="rounded px-2 py-1 text-sm text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
            aria-label="Close live control"
          >
            ✕
          </button>
        </header>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-medium text-deck-text">Allow live control</div>
              <div className="mt-0.5 text-xs text-deck-muted">
                Let an MCP client drive this running app during a demo — advance
                cards and copy snippets on cue.
              </div>
            </div>
            <div className="shrink-0 pt-0.5">
              <Toggle
                checked={status.enabled}
                onChange={(next) => void toggle(next)}
                ariaLabel="Allow live control"
                disabled={busy}
              />
            </div>
          </div>

          {status.enabled && d ? (
            <div className="rounded-lg border border-deck-border bg-deck-bg p-3">
              <CopyRow label="Endpoint" value={endpoint} />
              <div className="flex items-center justify-between gap-3 py-1.5">
                <span className="shrink-0 text-xs text-deck-muted">Session token</span>
                <button
                  onClick={() => setShowToken((v) => !v)}
                  className="rounded px-2 py-1 text-xs text-deck-muted transition hover:bg-deck-card hover:text-deck-text"
                >
                  {showToken ? 'Hide' : 'Reveal'}
                </button>
              </div>
              <CopyRow label="Token" value={d.token} reveal={showToken} />
              <CopyRow label="Config JSON" value={configJson(status)} mono />
              <p className="mt-2 text-[11px] leading-snug text-deck-muted">
                Loopback only (127.0.0.1) · token required on every request ·
                runtime commands only (no deck edits or file access). See
                <span className="font-mono"> docs/live-control.md</span>.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-deck-border bg-deck-bg p-3 text-xs text-deck-muted">
              Live control is <strong className="text-deck-text">off</strong>.
              Nothing is listening. Turn it on to expose a loopback-only,
              token-guarded bridge for MCP <span className="font-mono">live_*</span>{' '}
              tools.
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 border-t border-deck-border px-5 py-3">
          <span className="text-xs text-deck-muted">
            {status.enabled ? 'Revoke instantly to stop all access.' : 'Off by default for safety.'}
          </span>
          {status.enabled ? (
            <button
              onClick={() => void toggle(false)}
              disabled={busy}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              Revoke
            </button>
          ) : (
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg bg-deck-accent px-4 py-1.5 text-sm font-medium text-white transition hover:bg-deck-accentHover"
            >
              Done
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
