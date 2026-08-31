/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Дизайн-токенов в макете нет — get_variable_defs отдаёт только две тени.
      // Поэтому цвета и тени сняты посекционно через get_design_context
      // и собраны здесь вручную.
      colors: {
        ink: '#14181d',
        heading: '#1f2937',
        body: '#363636',
        muted: '#8a94a6',
        'muted-dark': '#76829b',
        strike: '#9ca3af',
        surface: '#f4f5f7',
        'surface-alt': '#eff1f5',
        line: '#e8eaed',
        'line-strong': '#dfe5ef',
        'line-soft': '#e5e9f1',
        page: '#f2f4f7',
        price: '#4c9a2a',
        badge: '#6eb83f',
        'promo-tint': 'rgba(38,139,243,0.1)',
      },
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // AX и 1Ч1Ч1Ч1 из макета
        icon: '0px 4px 8px 0px #d1d9e4',
        block: '0px 10px 34px 0px rgba(20,40,80,0.08)',
        card: '0px 11px 25px 0px rgba(20,40,80,0.1)',
        'card-hover': '0px 18px 34px 0px rgba(20,40,80,0.18)',
      },
    },
  },
  plugins: [],
};
