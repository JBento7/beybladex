import type { Config } from "tailwindcss";

// LBL design tokens. Colors, type scale, radii and shadows live here (and as
// CSS variables in globals.css); components use the token names instead of
// raw hex values. Contrast of every text/surface pair was measured — see
// globals.css.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        // Mobile < 768 (Tailwind md), tablet 768–1199, desktop ≥ 1200.
        desk: "1200px",
      },
      colors: {
        app: "#0B0D10",     // page background
        shell: "#111419",   // sidebar + header
        card: "#171B22",    // cards
        field: "#202630",   // inputs, inner surfaces
        hover: "#272F3B",   // hovered surface
        line: "#343E4D",    // 1px borders
        fg: { DEFAULT: "#F8FAFC", 2: "#B8C2D0", 3: "#98A6B9" },
        brand: {
          red: "#C8102E", "red-hover": "#AA0E27",
          yellow: "#F5B800", "yellow-hover": "#D99F00",
          ink: "#111419", // text on yellow
        },
        success: { DEFAULT: "#4ADE80", bg: "#10271C" },
        info: { DEFAULT: "#93C5FD", bg: "#16243A" },
        warn: { DEFAULT: "#FDE047", bg: "#30270F" },
        danger: { DEFAULT: "#FDA4AF", bg: "#351720" },
        medal: { gold: "#F5B800", silver: "#CBD5E1", bronze: "#D6A06A" },
        // Gray scale realigned to the tokens, so existing gray-* classes
        // follow the new palette.
        gray: {
          50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 300: "#CBD5E1", 400: "#B8C2D0",
          500: "#98A6B9", 600: "#4B5768", 700: "#343E4D", 800: "#202630", 900: "#171B22", 950: "#0B0D10",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        display: ["var(--font-barlow)", "sans-serif"],
      },
      fontSize: {
        // rem-based so the browser's font-size setting is respected.
        "title-1": ["1.875rem", { lineHeight: "2.125rem", fontWeight: "700" }],      // 30/34 mobile
        "title-1-lg": ["2.5rem", { lineHeight: "2.75rem", fontWeight: "700" }],      // 40/44 desktop
        "title-2": ["1.5rem", { lineHeight: "1.875rem", fontWeight: "700" }],        // 24/30 mobile
        "title-2-lg": ["1.75rem", { lineHeight: "2.125rem", fontWeight: "700" }],    // 28/34 desktop
        "title-3": ["1.375rem", { lineHeight: "1.75rem", fontWeight: "600" }],       // 22/28 card title
        body: ["1rem", { lineHeight: "1.5rem" }],                                    // 16/24
        small: ["0.875rem", { lineHeight: "1.25rem" }],                              // 14/20
        label: ["0.75rem", { lineHeight: "1rem", fontWeight: "600" }],               // 12/16 tags
        stat: ["1.75rem", { lineHeight: "2rem", fontWeight: "700" }],                // 28/32 mobile
        "stat-lg": ["2.25rem", { lineHeight: "2.5rem", fontWeight: "700" }],         // 36/40 desktop
      },
      borderRadius: { tag: "6px", ctl: "10px", card: "16px" },
      boxShadow: {
        card: "0 8px 24px rgba(0, 0, 0, 0.18)",
        menu: "0 16px 48px rgba(0, 0, 0, 0.35)",
      },
      maxWidth: { content: "80rem" }, // 1280px
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};

export default config;
