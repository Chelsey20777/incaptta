/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#00A63E',
          50: '#E8F7ED',
          100: '#C5E8D4',
          200: '#9CD9B9',
          300: '#73CA9E',
          400: '#4ABB83',
          500: '#00A63E',
          600: '#008532',
          700: '#006426',
          800: '#00431A',
          900: '#00220D',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
