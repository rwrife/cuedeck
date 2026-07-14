/** @type {import('tailwindcss').Config} */
export default {
  // Class-based theming (#8): the app sets `data-theme="dark|light"` and a
  // matching `.dark` class on <html>; the `deck-*` colors below resolve to
  // CSS custom properties that are redefined per-theme in
  // src/renderer/src/styles/index.css. This lets the existing `bg-deck-*` /
  // `text-deck-*` utilities re-theme with no markup changes while still giving
  // the light theme hand-picked, legible values (not just inverted colors).
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        deck: {
          bg: 'var(--deck-bg)',
          panel: 'var(--deck-panel)',
          card: 'var(--deck-card)',
          border: 'var(--deck-border)',
          accent: 'var(--deck-accent)',
          accentHover: 'var(--deck-accent-hover)',
          text: 'var(--deck-text)',
          muted: 'var(--deck-muted)',
          status: {
            neutral: 'var(--deck-status-neutral)',
            success: 'var(--deck-status-success)',
            warning: 'var(--deck-status-warning)',
            error: 'var(--deck-status-error)',
            info: 'var(--deck-status-info)'
          },
          statusSurface: {
            neutral: 'var(--deck-status-neutral-surface)',
            success: 'var(--deck-status-success-surface)',
            warning: 'var(--deck-status-warning-surface)',
            error: 'var(--deck-status-error-surface)',
            info: 'var(--deck-status-info-surface)'
          }
        }
      },
      fontSize: {
        // Presenter/notes font scale (#8) driven by a CSS variable so the
        // settings font-size preference can nudge the whole presenter surface.
        // Falls back to 1 (no scaling) when the variable is unset.
        scaled: ['calc(1rem * var(--deck-font-scale, 1))', '1.5']
      }
    }
  },
  plugins: []
}
