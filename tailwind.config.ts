import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: {
          50: '#f2fbf9',
          100: '#d3f4ee',
          200: '#a7e9de',
          300: '#71d7c9',
          400: '#3dbcae',
          500: '#25a094',
          600: '#1b8078',
          700: '#186761',
          800: '#17524f',
          900: '#164542',
          950: '#062927',
        },
      },
    },
  },
  plugins: [],
};

export default config;
