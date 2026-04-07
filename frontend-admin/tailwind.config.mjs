/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand Colors - Warm Palette (Crema)
        cream: {
          50: '#FFF9F0',
          100: '#FFF3E0',
          200: '#FFE4C4',
          300: '#FFD4A3',
          400: '#FFC27E',
          500: '#FFAF5A', // Primary
          600: '#E69A4A',
          700: '#CC8533',
          800: '#996626',
          900: '#664719',
        },
        // Accent - Orange
        orange: {
          50: '#FFF5EB',
          100: '#FFE8D4',
          200: '#FFD4AA',
          300: '#FFBF7D',
          400: '#FFAA50',
          500: '#FF9524', // Accent
          600: '#E67E1A',
          700: '#CC6610',
          800: '#99500A',
          900: '#663A05',
        },
        // Secondary - Coffee
        coffee: {
          50: '#F5EDE6',
          100: '#EBD9CC',
          200: '#D9C2AD',
          300: '#C7AA8E',
          400: '#B59370',
          500: '#A37C52', // Secondary
          600: '#8A6543',
          700: '#704F35',
          800: '#573926',
          900: '#3D2318',
        },
        // Surface colors (Dark mode first)
        surface: {
          50: '#FAFAFA',
          100: '#F5F5F5',
          200: '#E5E5E5',
          300: '#D4D4D4',
          400: '#A3A3A3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0D0D0D', // Deep dark
        },
      },
      fontFamily: {
        // Using Inter as body (as per brand spec)
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Display for headings - will use a bold weight
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        // Custom border radius
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        // Warm shadows
        'warm': '0 4px 14px -3px rgba(255, 175, 90, 0.15)',
        'warm-lg': '0 10px 25px -5px rgba(255, 175, 90, 0.2)',
        'dark': '0 4px 14px -3px rgba(0, 0, 0, 0.3)',
        'dark-lg': '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}