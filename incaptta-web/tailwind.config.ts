import { defineConfig } from 'tailwindcss'

export default defineConfig({
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1B5E20',
          dark: '#0D1F12',
          light: '#2E7D32'
        },
        accent: {
          DEFAULT: '#F9A825',
          dark: '#F57F17',
          light: '#FFF176'
        },
        surface: {
          dark: '#0D1F12',
          light: '#F5F7F5'
        },
        text: {
          dark: '#1A1A1A',
          muted: '#6B7280',
          light: '#FFFFFF'
        }
      },
      fontFamily: {
        heading: ['Poppins', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
})
