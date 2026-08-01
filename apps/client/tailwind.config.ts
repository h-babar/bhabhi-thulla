import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101624",
        lagoon: "#0f766e",
        ember: "#f97316",
        sunrise: "#f9c74f"
      },
      boxShadow: {
        glow: "0 18px 70px rgba(45, 212, 191, 0.22)",
        card: "0 18px 35px rgba(15, 23, 42, 0.24)"
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
