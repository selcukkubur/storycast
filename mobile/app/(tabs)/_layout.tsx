import { Tabs } from "expo-router"
import { Clapperboard, Home, UserRound } from "lucide-react-native"

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#22319B",
        tabBarInactiveTintColor: "#6F6480",
        tabBarStyle: {
          backgroundColor: "#FFF9F0",
          borderTopColor: "rgba(27,19,48,0.08)",
          height: 88,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: "Nunito_700Bold", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color, focused }) => <Home size={22} color={color} strokeWidth={focused ? 2.4 : 1.9} /> }}
      />
      <Tabs.Screen
        name="create"
        options={{ title: "Create", tabBarIcon: ({ color, focused }) => <Clapperboard size={22} color={color} strokeWidth={focused ? 2.4 : 1.9} /> }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Account", tabBarIcon: ({ color, focused }) => <UserRound size={22} color={color} strokeWidth={focused ? 2.4 : 1.9} /> }}
      />
    </Tabs>
  )
}
