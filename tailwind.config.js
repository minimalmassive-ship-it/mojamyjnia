/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Zdefiniowane w specyfikacji kolory dla punktacji
        brand: {
          purple: '#9333ea', // bg-purple-600
          lightPurple: '#c084fc', // bg-purple-400
          blue: '#3b82f6', // bg-blue-500
        },
        dark: {
          bg: '#121212',
          surface: '#1e1e1e',
          surfaceHover: '#2a2a2a',
          border: '#333333',
        }
      }
    },
  },
  plugins: [],
}
