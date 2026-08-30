import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefdf3",
          100: "#d7f9e2",
          200: "#b3f0cb",
          400: "#34d17a",
          500: "#1fb968",
          600: "#16a34a",
          700: "#128a3e",
        },
      },
      boxShadow: {
        popover: "0 12px 32px -8px rgba(15, 23, 42, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
