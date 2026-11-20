module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        curtain: "#56202E",
        velvet: "#7A3244",
        brass: "#D9A441",
        paper: "#F4EFE3",
        ticket: "#FBF7EC",
        ink: "#241B17",
        "ink-soft": "#6B5E55",
        moss: "#3F6B4F",
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
