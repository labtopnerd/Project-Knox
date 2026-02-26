import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Project Knox brand colors
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
        support: {
          DEFAULT: '#16a34a', // green-600
          light: '#dcfce7',
          dark: '#15803d',
        },
        oppose: {
          DEFAULT: '#dc2626', // red-600
          light: '#fee2e2',
          dark: '#b91c1c',
        },
        neutral: {
          DEFAULT: '#9ca3af', // gray-400
          light: '#f3f4f6',
          dark: '#6b7280',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
