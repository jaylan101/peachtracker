import type { Config } from "tailwindcss";

// PeachTracker design tokens — mirrors the palette from the static site.
// Non-negotiable rules (per project memory):
//   - No border-radius except circular candidate photos
//   - No shadows, no gradients
//   - Outfit font, weights 400-900
//   - 1.5px card borders, 2px dark borders on nav/footer
const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Peach family
        peach: {
          DEFAULT: "#E0956E",
          pastel: "#F5D5C3",
          bg: "#FDF0E8",
        },
        // Green family
        green: {
          DEFAULT: "#5E9470",
          pastel: "#C3DECA",
          bg: "#EBF3ED",
        },
        // Neutrals
        page: "#F7F5F2",
        card: "#FFFFFF",
        border: "#E0DCD6",
        ink: {
          DEFAULT: "#2A2725",
          secondary: "#87817A",
          light: "#B5AFA8",
        },
        // Party badges
        dem: "#2563EB",
        rep: "#DC2626",
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
      },
      borderWidth: {
        "1.5": "1.5px",
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
    },
  },
  plugins: [],
};

export default config;
