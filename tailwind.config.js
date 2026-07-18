/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      keyframes: {
        'slide-up': {
          '0%':   { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      fontFamily: {
        sans:  ['Inter', 'Geist', 'system-ui', 'sans-serif'],
        serif: ['Inter', 'Geist', 'system-ui', 'sans-serif'],
        mono:  ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['11px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '19px' }],
        base: ['13.5px', { lineHeight: '20px' }],
        lg: ['15px', { lineHeight: '22px' }],
        xl: ['18px', { lineHeight: '24px' }],
        '2xl': ['22px', { lineHeight: '28px' }],
        '3xl': ['26px', { lineHeight: '32px' }],
        '4xl': ['32px', { lineHeight: '38px' }],
        '5xl': ['40px', { lineHeight: '46px' }],
        '6xl': ['48px', { lineHeight: '54px' }],
      },
      letterSpacing: {
        tighter: '0',
        tight: '0',
        normal: '0',
        wide: '0',
        wider: '0',
        widest: '0',
      },
      colors: {
        burnham:  '#1C1D1F',
        moss:     '#266DF0',
        shuttle:  '#6F7988',
        mercury:  '#E4E7EC',
        pastel:   '#E4EDFF',
        gossip:   '#E4EDFF',
        midnight: '#101113',
        canvas:   '#FFFFFF',
        sidebar:  '#F4F5F6',
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        lg: '10px',
        xl: '14px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
}
