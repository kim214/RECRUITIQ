/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#4f46e5',
          600: '#4338ca',
          700: '#3730a3',
        },
        accent: {
          400: '#22d3ee',
          500: '#06b6d4',
        },
        ink: {
          50: '#f8fafc',
          100: '#f1f5f9',
          400: '#94a3b8',
          500: '#64748b',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 24px rgba(15, 23, 42, 0.08)',
        glow: '0 0 40px rgba(79, 70, 229, 0.18)',
      },
    },
  },
  plugins: [],
}
