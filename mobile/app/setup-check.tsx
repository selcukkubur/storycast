import { View, Text } from "react-native"

export default function Bisect() {
  return (
    <View style={{ flex: 1, backgroundColor: "#f5f5f5", paddingTop: 80, paddingHorizontal: 24 }}>
      <View style={{ backgroundColor: "#dc2626", padding: 16, borderRadius: 12, marginBottom: 16 }}>
        <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: "700" }}>A: plain React Native styles work</Text>
      </View>
      <View className="rounded-xl bg-blue-600 p-4">
        <Text className="text-base font-bold text-white">B: NativeWind className works</Text>
      </View>
      <Text style={{ marginTop: 24, color: "#555555" }}>If you see A but not B, NativeWind is not running.</Text>
    </View>
  )
}
