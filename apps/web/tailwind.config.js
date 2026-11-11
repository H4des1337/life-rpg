/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07080b',
          900: '#0b0d12',
          850: '#101319',
          800: '#151922',
          700: '#1e2430',
          600: '#2b3342',
          500: '#3d4759',
          400: '#6b7688',
          300: '#98a2b3',
          200: '#c3c9d4',
          100: '#e7eaf0',
        },
        gold: {
          400: '#e3c27a',
          500: '#cfa960',
          600: '#a8853f',
        },
        ember: '#d97757',
        jade: '#6fbfa0',
        blood: '#c05a5a',
      },
      fontFamily: {
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Georgia', 'serif'],
        sans: ['Inter', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Code"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 18px 48px -24px rgba(0,0,0,0.9)',
      },
      keyframes: {
        'float-idle': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'float-idle': 'float-idle 5s ease-in-out infinite',
        'fade-up': 'fade-up 240ms ease-out both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
