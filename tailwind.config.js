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
          // Pressed/active fill (#32) — e.g. `active:` button states and
          // toggled-on indicators.
          accentPressed: 'var(--deck-accent-pressed)',
          text: 'var(--deck-text)',
          muted: 'var(--deck-muted)',
          // Semantic status tones (#32), shared by Button, StatusBanner, and
          // any success/warning/danger feedback across the app.
          success: 'var(--deck-success)',
          successHover: 'var(--deck-success-hover)',
          warning: 'var(--deck-warning)',
          warningHover: 'var(--deck-warning-hover)',
          danger: 'var(--deck-danger)',
          dangerHover: 'var(--deck-danger-hover)',
          focusRing: 'var(--deck-focus-ring)'
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
