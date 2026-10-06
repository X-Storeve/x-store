tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#09090e',
          card: '#12121e',
          cyan: '#00f2ff',
          magenta: '#e000ff',
          purple: '#8b00ff'
        }
      },
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        sans: ['Inter', 'sans-serif']
      },
      boxShadow: {
        'neon-cyan': '0 0 15px rgba(0,242,255,0.4)',
        'neon-cyan-lg': '0 0 25px rgba(0,242,255,0.6)'
      }
    }
  }
};