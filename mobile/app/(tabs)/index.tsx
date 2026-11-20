import { Image, Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, { FadeInDown } from "react-native-reanimated"
import { router } from "expo-router"
import { Play, Sparkles, Ticket } from "lucide-react-native"
import { VStack } from "@/components/ui/vstack"
import { HStack } from "@/components/ui/hstack"
import { Text } from "@/components/ui/text"
import { FILMS, NARRATORS, WALLET } from "@/src/flows/shared/mock-data"

const EYEBROW = "font-body-semibold text-[10px] uppercase tracking-[2.5px]"
const NOCTURNE: readonly [string, string] = ["#2A3BC0", "#131A4E"]
const CARD_SHADOW = {
  shadowColor: "#1B1330",
  shadowOpacity: 0.14,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 14 },
  elevation: 7,
} as const

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export default function HomeScreen() {
  const hero = FILMS[1]
  const heroNarrator = NARRATORS.find((n) => n.id === hero.narratorId)

  return (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerClassName="pb-10">
        <LinearGradient
          colors={NOCTURNE}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 20, paddingTop: 64, paddingBottom: 44, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}
        >
          <View className="absolute -right-12 top-6 h-44 w-44 rounded-full border border-marigold/20" />
          <View className="absolute left-6 top-14 h-1.5 w-1.5 rounded-full bg-marigold/80" />
          <View className="absolute left-24 top-24 h-1 w-1 rounded-full bg-coral/70" />

          <HStack className="items-start justify-between">
            <VStack space="xs">
              <Text className={`${EYEBROW} text-marigold`}>The little picture house</Text>
              <Text className="font-display text-[30px] leading-[36px] text-ticket">Tonight's programme</Text>
            </VStack>
            <Pressable
              onPress={() => router.push("/account")}
              className="flex-row items-center gap-1.5 rounded-full border border-marigold/50 bg-ticket/10 px-3 py-1.5"
              accessibilityRole="button"
              accessibilityLabel="Open ticket book"
            >
              <Ticket size={13} stroke="#FFB627" />
              <Text className="font-body-bold text-xs text-marigold">{WALLET.credits} tickets</Text>
            </Pressable>
          </HStack>
        </LinearGradient>

        <Animated.View entering={FadeInDown.duration(450)}>
          <VStack space="lg" className="-mt-8 px-5">
            <Pressable onPress={() => router.push("/watch")} accessibilityRole="button">
              <View className="overflow-hidden rounded-3xl bg-night" style={CARD_SHADOW}>
                <Image source={hero.poster} className="aspect-[16/10] w-full" resizeMode="cover" />
                <LinearGradient
                  colors={["transparent", "rgba(20,28,87,0.55)", "rgba(13,18,60,0.95)"]}
                  locations={[0.3, 0.65, 1]}
                  style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingBottom: 16, paddingTop: 48 }}
                >
                  <Text className={`${EYEBROW} text-marigold`}>Continue watching</Text>
                  <Text className="mt-1 font-display text-2xl leading-7 text-ticket" numberOfLines={2}>
                    {hero.title}
                  </Text>
                  <HStack className="mt-1 justify-between">
                    <Text className="text-xs text-ticket/70">
                      {heroNarrator?.name} · {hero.created}
                    </Text>
                    <Text className={`${EYEBROW} text-marigold`}>{clock(hero.durationSec)}</Text>
                  </HStack>
                </LinearGradient>
                <View className="absolute inset-0 items-center justify-center">
                  <View
                    className="rounded-full border-2 border-coral/70 bg-marigold p-5"
                    style={{ shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}
                  >
                    <Play size={24} stroke="#1B1330" fill="#1B1330" />
                  </View>
                </View>
              </View>
            </Pressable>

            <View>
              <HStack className="items-center justify-between">
                <HStack space="xs" className="items-center">
                  <View style={{ height: 2, width: 16, backgroundColor: "#6F6480", opacity: 0.7 }} />
                  <Text className={`${EYEBROW} text-ink-soft`}>Family library</Text>
                </HStack>
                <Text className="text-[11px] text-ink-soft">{FILMS.length} films</Text>
              </HStack>
              <View className="mt-3 flex-row flex-wrap justify-between" style={{ rowGap: 16 }}>
                {FILMS.map((f) => {
                  const n = NARRATORS.find((x) => x.id === f.narratorId)
                  return (
                    <Pressable key={f.id} onPress={() => router.push("/watch")} className="w-[48%]" accessibilityRole="button">
                      <View className="overflow-hidden rounded-2xl bg-night" style={CARD_SHADOW}>
                        <Image source={f.poster} className="aspect-[4/5] w-full" resizeMode="cover" />
                        <View className="absolute bottom-2 right-2 rounded-md bg-night/70 px-1.5 py-0.5">
                          <Text className="text-[10px] font-body-bold text-ticket">{clock(f.durationSec)}</Text>
                        </View>
                      </View>
                      <Text className="mt-2 font-body-semibold text-sm text-ink" numberOfLines={2}>
                        {f.title}
                      </Text>
                      <Text className="text-[11px] text-ink-soft">
                        {n?.name} · {f.created}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            <Pressable onPress={() => router.push("/create")} accessibilityRole="button">
              <LinearGradient
                colors={["#FFD36E", "#F2A112"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 24, padding: 20, flexDirection: "row", alignItems: "center", gap: 14, shadowColor: "#B47B00", shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }}
              >
                <View className="h-11 w-11 items-center justify-center rounded-full bg-ink/10">
                  <Sparkles size={20} stroke="#1B1330" />
                </View>
                <VStack space="xs" className="flex-1">
                  <Text className="font-display text-xl leading-6 text-ink">Make tonight's film</Text>
                  <Text className="text-xs text-ink/70">Pick a topic, a narrator and a look.</Text>
                </VStack>
                <Play size={16} stroke="#1B1330" />
              </LinearGradient>
            </Pressable>
          </VStack>
        </Animated.View>
      </ScrollView>
    </View>
  )
}
