/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Editorial palette: warm paper, near-black ink, gold as a marker.
        paper: "#FBFAF7",
        paperAlt: "#F3F1EA",
        ink: "#15161A",
        inkSoft: "#3A3B41",
        gold: "#F5B301",
        goldDeep: "#C98F00",
        rule: "#E4E1D8",
        ruleDark: "#2C2D33",
      },
      fontFamily: {
        display: ['"Instrument Serif"', "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Editorial display scale — tight, large, deliberate.
        d1: ["clamp(2.75rem, 6.5vw, 5.5rem)", { lineHeight: "0.95", letterSpacing: "-0.02em" }],
        d2: ["clamp(2rem, 4.2vw, 3.5rem)", { lineHeight: "1.02", letterSpacing: "-0.015em" }],
        d3: ["clamp(1.5rem, 2.6vw, 2.25rem)", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
      },
      letterSpacing: { eyebrow: "0.18em" },
      maxWidth: { reading: "68ch" },
    },
  },
  plugins: [],
};
