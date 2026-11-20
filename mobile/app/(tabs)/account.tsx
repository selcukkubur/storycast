import { Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, { FadeInDown } from "react-native-reanimated"
import { router } from "expo-router"
import { Bell, ChevronRight, HelpCircle, Ticket, Users } from "lucide-react-native"
import { VStack } from "@/components/ui/vstack"
import { HStack } from "@/components/ui/hstack"
import { Text } from "@/components/ui/text"
import { LEDGER, WALLET } from "@/src/flows/shared/mock-data"

const EYEBROW = "font-body-bold text-[11px] uppercase tracking-[1px]"
const NOCTURNE: readonly [string, string] = ["#2A3BC0", "#131A4E"]
const CARD_SHADOW = {
  shadowColor: "#1B1330",
  shadowOpacity: 0.14,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 14 },
  elevation: 7,
} as const

export default function AccountScreen() {
  return (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerClassName="pb-10">
        <LinearGradient
          colors={NOCTURNE}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 20, paddingTop: 64, paddingBottom: 44, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}
        >
          <View className="absolute -right-10 top-8 h-40 w-40 rounded-full border border-marigold/20" />
          <Text className={`${EYEBROW} text-marigold`}>Your ticket book</Text>
          <HStack space="sm" className="mt-1 items-baseline">
            <Text className="font-display text-[56px] leading-[60px] text-ticket">{WALLET.credits}</Text>
            <Text className="text-[15px] text-ticket/85">tickets left</Text>
          </HStack>
          <Text className="mt-1 text-[13px] leading-5 text-ticket/85">{WALLET.rolloverNote}</Text>
        </LinearGradient>

        <Animated.View entering={FadeInDown.duration(420)}>
          <VStack space="lg" className="-mt-8 px-5">
            <Pressable onPress={() => router.push("/paywall")} accessibilityRole="button">
              <LinearGradient
                colors={["#FFD36E", "#F2A112"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 24, padding: 18, flexDirection: "row", alignItems: "center", gap: 14, shadowColor: "#B47B00", shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }}
              >
                <View className="h-11 w-11 items-center justify-center rounded-full bg-ink/10">
                  <Ticket size={20} stroke="#1B1330" />
                </View>
                <VStack space="xs" className="flex-1">
                  <Text className="font-display text-lg leading-6 text-ink">Starter book · renews monthly</Text>
                  <Text className="text-[13px] leading-5 text-ink/80">Change plan or top up tickets</Text>
                </VStack>
                <ChevronRight size={16} stroke="#1B1330" />
              </LinearGradient>
            </Pressable>

            <View className="rounded-3xl bg-ticket p-5" style={CARD_SHADOW}>
              <Text className={`${EYEBROW} text-ink-soft`}>Recent activity</Text>
              <VStack space="sm" className="mt-3">
                {LEDGER.map((tx) => (
                  <HStack key={tx.id} className="items-center justify-between">
                    <VStack space="xs" className="flex-1 pr-3">
                      <Text className="text-sm text-ink" numberOfLines={1}>
                        {tx.label}
                      </Text>
                      <Text className="text-xs text-ink-soft">{tx.when}</Text>
                    </VStack>
                    <Text className={`font-body-bold text-[15px] ${tx.credits > 0 ? "text-mint" : "text-red-600"}`}>
                      {tx.credits > 0 ? `+${tx.credits}` : tx.credits}
                    </Text>
                  </HStack>
                ))}
              </VStack>
            </View>

            <View className="overflow-hidden rounded-3xl bg-ticket" style={CARD_SHADOW}>
              {[
                { icon: <Bell size={16} stroke="#22319B" />, title: "Notifications" },
                { icon: <Users size={16} stroke="#22319B" />, title: "Family sharing" },
                { icon: <HelpCircle size={16} stroke="#22319B" />, title: "Help and feedback" },
              ].map((row, i) => (
                <Pressable key={row.title} accessibilityRole="button" className={`min-h-12 flex-row items-center gap-3 px-4 py-3 active:bg-paper/60 ${i > 0 ? "border-t border-ink/5" : ""}`}>
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-paper">{row.icon}</View>
                  <Text className="flex-1 text-[15px] font-body-bold text-ink">{row.title}</Text>
                  <ChevronRight size={16} stroke="#6F6480" />
                </Pressable>
              ))}
            </View>

            <Text className="text-center text-xs text-ink-soft">Storycast 0.1 · every frame made on fal</Text>
          </VStack>
        </Animated.View>
      </ScrollView>
    </View>
  )
}
