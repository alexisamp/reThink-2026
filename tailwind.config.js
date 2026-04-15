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
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
        mono:  ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      colors: {
        burnham:  '#003720',
        shuttle:  '#536471',
        mercury:  '#E3E3E3',
        pastel:   '#79D65E',
        gossip:   '#E5F9BD',
        midnight: '#1A1A1A',
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
