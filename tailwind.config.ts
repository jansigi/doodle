import type { Config } from "tailwindcss";

// Ease-out-quart: fast start, soft landing. Used for every state change.
const easeOut = "cubic-bezier(0.25, 1, 0.5, 1)";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(15 23 42 / 0.04)",
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.03)",
        popover:
          "0 0 0 1px rgb(15 23 42 / 0.06), 0 10px 24px -8px rgb(15 23 42 / 0.18)",
        dialog:
          "0 0 0 1px rgb(15 23 42 / 0.06), 0 24px 48px -12px rgb(15 23 42 / 0.3)",
      },
      // Semantic stacking order, lowest first.
      zIndex: {
        sticky: "10",
        dropdown: "20",
        bar: "30",
        modal: "50",
        toast: "60",
      },
      transitionTimingFunction: {
        "out-quart": easeOut,
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "dialog-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "none" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(-4px) scale(0.98)" },
          to: { opacity: "1", transform: "none" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        countdown: {
          from: { transform: "scaleX(1)" },
          to: { transform: "scaleX(0)" },
        },
      },
      animation: {
        "fade-in": `fade-in 160ms ${easeOut}`,
        "dialog-in": `dialog-in 220ms ${easeOut}`,
        "pop-in": `pop-in 140ms ${easeOut}`,
        "rise-in": `rise-in 240ms ${easeOut}`,
        // The undo window of the regenerate toast.
        countdown: "countdown 10s linear forwards",
      },
    },
  },
  plugins: [],
};
export default config;
