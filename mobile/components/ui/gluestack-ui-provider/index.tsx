import { View } from "react-native"

export function GluestackUIProvider({ mode = "light", children }: { mode?: "light" | "dark"; children: React.ReactNode }) {
  return <View className={mode === "dark" ? "dark flex-1 bg-gray-950" : "flex-1 bg-white"}>{children}</View>
}
