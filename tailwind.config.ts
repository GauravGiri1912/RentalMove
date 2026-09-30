import type { Config } from "tailwindcss";

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        "surface-2": token("surface-2"),
        line: token("line"),
        ink: token("ink"),
        "ink-2": token("ink-2"),
        "ink-3": token("ink-3"),
        signal: token("signal"),
        ok: token("ok"),
        warn: token("warn"),
        danger: token("danger"),
        info: token("info"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { xl: "14px", "2xl": "20px" },
      boxShadow: {
        card: "0 1px 0 rgb(var(--line) / 0.6), 0 1px 2px rgb(0 0 0 / 0.04)",
        lift: "0 12px 40px -12px rgb(0 0 0 / 0.25), 0 2px 6px rgb(0 0 0 / 0.06)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        scan: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(100%)" } },
        pulse_ring: { "0%": { boxShadow: "0 0 0 0 rgb(var(--signal) / 0.45)" }, "100%": { boxShadow: "0 0 0 10px rgb(var(--signal) / 0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "sweep-clip": { "0%, 100%": { clipPath: "inset(0 72% 0 0)" }, "50%": { clipPath: "inset(0 22% 0 0)" } },
        "sweep-line": { "0%, 100%": { left: "28%" }, "50%": { left: "78%" } },
        marquee: { to: { transform: "translateX(-50%)" } },
      },
      animation: {
        "fade-up": "fade-up .45s cubic-bezier(.2,.7,.2,1) both",
        scan: "scan 1.8s cubic-bezier(.4,0,.2,1) infinite",
        "pulse-ring": "pulse_ring 1.6s ease-out infinite",
        shimmer: "shimmer 1.6s infinite",
        "sweep-clip": "sweep-clip 7s cubic-bezier(.65,0,.35,1) infinite",
        "sweep-line": "sweep-line 7s cubic-bezier(.65,0,.35,1) infinite",
        marquee: "marquee 40s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
