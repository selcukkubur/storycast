import "../global.css"
import { useFonts } from "expo-font"
import { Stack } from "expo-router"
import { Fraunces_600SemiBold, Fraunces_600SemiBold_Italic } from "@expo-google-fonts/fraunces"
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold } from "@expo-google-fonts/nunito"

export default function RootLayout() {
  const [loaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  })

  if (!loaded) return null

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FBEDE2" } }} />
}
