import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        yellow_jersey: "#FDE047",
        green_jersey: "#22C55E",
        polkadot: "#EF4444",
        white_jersey: "#F8FAFC",
      },
      borderRadius: {
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};

export default config;
