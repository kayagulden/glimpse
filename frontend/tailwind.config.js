/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#0e0e0e',
          1: '#141414',
          2: '#1a1a1a',
          3: '#222222',
          4: '#2a2a2a',
        },
        accent: '#3b82f6',
        'log-info': '#8b8fa3',
        'log-warn': '#e5a63b',
        'log-error': '#ef4444',
        'log-debug': '#555566',
        border: '#2a2a2a',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'Menlo', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      fontSize: {
        'log': ['12.5px', '20px'],
      },
    },
  },
  plugins: [],
}
