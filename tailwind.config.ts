import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-bricolage)", "sans-serif"],
        sans:    ["var(--font-hanken)", "sans-serif"],
        mono:    ["var(--font-geist-mono)", "JetBrains Mono", "monospace"],
      },
      colors: {
        /* ── Design tokens ── */
        bg:    "var(--bg)",
        "bg-1": "var(--bg-1)",
        "bg-2": "var(--bg-2)",
        "bg-3": "var(--bg-3)",

        text:    "var(--text)",
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",

        brand:      "var(--brand)",
        "brand-deep":"var(--brand-deep)",

        warn:   "var(--warn)",
        danger: "var(--danger)",

        /* ── shadcn compatibility ── */
        border:      "var(--border)",
        input:       "var(--input)",
        ring:        "var(--ring)",
        background:  "var(--background)",
        foreground:  "var(--foreground)",
        primary: {
          DEFAULT:    "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT:    "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT:    "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT:    "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT:    "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        card: {
          DEFAULT:    "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT:    "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
      },
      borderRadius: {
        sm:   "var(--radius-sm)",
        md:   "var(--radius-md)",
        lg:   "var(--radius-lg)",
        pill: "var(--radius-pill)",
        /* also keep default shadcn alias */
        DEFAULT: "var(--radius-md)",
      },
      boxShadow: {
        card:     "var(--shadow-card)",
        elevated: "var(--shadow-elevated)",
        jade:     "var(--shadow-jade)",
      },
      spacing: {
        /* 4-pt grid aliases (base = 4px) */
        "1":  "4px",
        "2":  "8px",
        "3":  "12px",
        "4":  "16px",
        "5":  "20px",
        "6":  "24px",
        "8":  "32px",
        "10": "40px",
        "12": "48px",
        "16": "64px",
        "20": "80px",
        "24": "96px",
      },
      animation: {
        "fade-in":    "fade-in 220ms cubic-bezier(0.22,1,0.36,1) both",
        "slide-up":   "slide-up 220ms cubic-bezier(0.22,1,0.36,1) both",
        "slide-down": "slide-down 220ms cubic-bezier(0.22,1,0.36,1) both",
        "scale-in":   "scale-in 160ms cubic-bezier(0.22,1,0.36,1) both",
        "count-up":   "count-up 320ms cubic-bezier(0.22,1,0.36,1) both",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
        "count-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
