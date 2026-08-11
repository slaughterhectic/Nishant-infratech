/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF3EC',
          100: '#FFE3D1',
          200: '#FFC5A3',
          300: '#FFA06B',
          400: '#FA7F3D',
          500: '#F5691F',
          600: '#DB5210',
          700: '#B33F0C',
          800: '#8A3010',
          900: '#6B270F',
        },
        purchase: '#1E6FC0',
        sale: '#2D7A1F',
        outstanding: '#C0271E',
        'stock-warn': '#B8620A',
        profit: '#0F7A4B',
        // Semantic tokens backed by CSS variables so they swap with theme
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'card-border': 'rgb(var(--color-card-border) / <alpha-value>)',
        heading: 'rgb(var(--color-heading) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
