/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        deck: {
          bg: '#0f1117',
          panel: '#171a23',
          card: '#1e222d',
          border: '#2a2f3d',
          accent: '#6366f1',
          accentHover: '#818cf8',
          text: '#e5e7eb',
          muted: '#9ca3af'
        }
      }
    }
  },
  plugins: []
}
