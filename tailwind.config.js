/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        du: {
          crimson: "#BA0C2F",
          crimsonDark: "#8E0A24",
          crimsonSoft: "#F8E6EA",
          gold: "#A89968",
          goldSoft: "#F4F1E6",
          goldDeep: "#C6B98A",
        },
        surface: {
          light: "#FAF9F7",
          card: "#FFFFFF",
          border: "#E8E6E1",
          dark: "#121212",
          darkCard: "#1C1C1C",
          darkBorder: "#2A2A2A",
        },
        ink: {
          main: "#1C1C1C",
          sub: "#5C5C5C",
          muted: "#8C8C8C",
          onDark: "#F5F5F5",
          subOnDark: "#C8C8C8",
        },
      },
      borderRadius: {
        xl: "16px",
        lg: "12px",
      },
      boxShadow: {
        card: "0 6px 20px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
};