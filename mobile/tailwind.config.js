module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        night: "#141C57",
        royal: "#22319B",
        marigold: "#FFB627",
        coral: "#F4738C",
        paper: "#FBEDE2",
        ticket: "#FFF9F0",
        ink: "#1B1330",
        "ink-soft": "#5A4F66",
        mint: "#2E7D6B",
      },
      fontFamily: {
        display: ["Fraunces_600SemiBold"],
        "display-italic": ["Fraunces_600SemiBold_Italic"],
        body: ["Nunito_400Regular"],
        "body-semibold": ["Nunito_600SemiBold"],
        "body-bold": ["Nunito_700Bold"],
      },
    },
  },
  plugins: [],
}
