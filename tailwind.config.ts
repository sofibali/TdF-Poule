import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // TDF jersey palette — wired up later in components
        yellow_jersey: "#FDE047",
        green_jersey: "#22C55E",
        polkadot: "#EF4444",
        white_jersey: "#F8FAFC",
      },
    },
  },
  plugins: [],
};

export default config;
