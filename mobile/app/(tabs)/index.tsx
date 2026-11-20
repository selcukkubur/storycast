import { useMemo, useState } from "react"
import { Dimensions, Image, Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, { FadeInDown } from "react-native-reanimated"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Grid2x2, List, Play, Sparkles, Ticket } from "lucide-react-native"
import { VStack } from "@/components/ui/vstack"
import { HStack } from "@/components/ui/hstack"
import { Text } from "@/components/ui/text"
import { FILMS, WALLET } from "@/src/flows/shared/mock-data"
import type { FilmCategory } from "@/src/flows/shared/types"

const EYEBROW = "font-body-bold text-[11px] uppercase tracking-[1px]"
const CARD_SHADOW = {
  shadowColor: "#0B102A",
  shadowOpacity: 0.14,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
} as const

const { width: SW } = Dimensions.get("window")
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

type FilterKey = "all" | "new" | FilmCategory
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "nature", label: "Nature" },
  { key: "science", label: "Science" },
  { key: "history", label: "History" },
  { key: "machines", label: "Machines" },
]

const TILES: { key: FilmCategory; label: string; blurb: string }[] = [
  { key: "nature", label: "Nature", blurb: "Leaves, bees, storms" },
  { key: "science", label: "Science", blurb: "Wind and weather" },
  { key: "history", label: "History", blurb: "Firsts and legends" },
  { key: "machines", label: "Machines", blurb: "Gears and wires" },
]

const tilePoster = (c: FilmCategory) => FILMS.find((f) => f.category === c)?.poster ?? FILMS[0].poster

function SectionHeader({ title, count, children }: { title: string; count?: number; children?: React.ReactNode }) {
  return (
    <HStack className="items-center justify-between">
      <HStack space="xs" className="items-center">
        <View style={{ height: 2, width: 16, backgroundColor: "#5A4F66", opacity: 0.6 }} />
        <Text className={`${EYEBROW} text-ink-soft`}>{title}</Text>
        {typeof count === "number" ? <Text className="text-xs text-ink-soft">· {count}</Text> : null}
      </HStack>
      {children}
    </HStack>
  )
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets()
  const [filter, setFilter] = useState<FilterKey>("all")
  const [listMode, setListMode] = useState(false)

  const hero = FILMS[0]
  const shown = useMemo(() => {
    if (filter === "all") return FILMS
    if (filter === "new") return FILMS.filter((f) => !f.watched)
    return FILMS.filter((f) => f.category === filter)
  }, [filter])
  const countOf = (k: FilterKey) =>
    k === "all" ? FILMS.length : k === "new" ? FILMS.filter((f) => !f.watched).length : FILMS.filter((f) => f.category === k).length

  const heroImageHeight = Math.round((SW * 9) / 16)

  return (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerClassName="pb-10" showsVerticalScrollIndicator={false}>
        <View className="bg-night">
          <Pressable onPress={() => router.push("/watch")} accessibilityRole="button" accessibilityLabel={`Play ${hero.title} ${hero.subtitle}`}>
            <View style={{ height: heroImageHeight }} className="relative w-full">
              <Image source={hero.poster} className="h-full w-full" resizeMode="cover" />
              <LinearGradient
                colors={["rgba(10,14,42,0.7)", "transparent"]}
                style={{ position: "absolute", left: 0, right: 0, top: 0, height: 130 }}
              />
            </View>
          </Pressable>

          <View style={{ paddingTop: insets.top + 12 }} className="absolute left-5 right-5 flex-row items-center justify-between">
            <HStack space="xs" className="items-center rounded-full bg-white/10 px-3 py-1.5">
              <Sparkles size={12} stroke="#FFB627" />
              <Text className={`${EYEBROW} text-ticket`}>Storycast</Text>
            </HStack>
            <Pressable
              onPress={() => router.push("/account")}
              className="flex-row items-center gap-1.5 rounded-full border border-marigold/60 bg-black/25 px-3 py-1.5"
              accessibilityRole="button"
              accessibilityLabel="Open ticket book"
            >
              <Ticket size={13} stroke="#FFB627" />
              <Text className="font-body-bold text-xs text-marigold">{WALLET.credits} tickets</Text>
            </Pressable>
          </View>

          <View className="px-5 pb-14 pt-4">
            <HStack space="xs" className="items-center">
              <Text className={`${EYEBROW} text-marigold`}>Tonight's feature</Text>
              {!hero.watched ? (
                <View className="-rotate-2 rounded-md bg-coral px-1.5 py-0.5">
                  <Text className={`${EYEBROW} text-ticket`}>New</Text>
                </View>
              ) : null}
            </HStack>
            <HStack space="sm" className="mt-1 items-baseline">
              <Text className="font-display text-[30px] leading-[34px] text-ticket">{hero.title}</Text>
              <Text className="flex-1 font-display-italic text-[19px] leading-6 text-ticket/85" numberOfLines={2}>
                {hero.subtitle}
              </Text>
            </HStack>
            <Text className="mt-1.5 text-[13px] text-ticket/80">
              {hero.styleLabel} · {hero.narrator} · {clock(hero.durationSec)} min
            </Text>
            <HStack space="sm" className="mt-4">
              <Pressable
                onPress={() => router.push("/watch")}
                className="min-h-12 flex-row items-center gap-2 rounded-full px-6"
                style={{ backgroundColor: "#FFB627" }}
                accessibilityRole="button"
              >
                <Play size={16} stroke="#1B1330" fill="#1B1330" />
                <Text className="font-body-bold text-[15px] text-ink">Play film</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push("/watch")}
                className="min-h-12 flex-row items-center rounded-full border border-ticket/40 px-5 active:bg-white/10"
                accessibilityRole="button"
              >
                <Text className="font-body-bold text-[15px] text-ticket">Details</Text>
              </Pressable>
            </HStack>
          </View>
        </View>

        <View className="relative -mt-6 rounded-t-[28px] bg-paper px-5 pt-5">
          <Animated.View entering={FadeInDown.duration(420)}>
            <VStack space="lg">
              <Pressable onPress={() => router.push("/watch")} accessibilityRole="button" accessibilityLabel={`Resume ${hero.title}`}>
                <View className="flex-row items-center gap-3 rounded-2xl bg-ticket p-2.5" style={CARD_SHADOW}>
                  <Image source={hero.poster} className="rounded-lg" style={{ width: 92, height: 52 }} resizeMode="cover" />
                  <VStack space="xs" className="flex-1">
                    <Text className={`${EYEBROW} text-ink-soft`}>Continue watching</Text>
                    <Text className="font-body-semibold text-sm text-ink" numberOfLines={1}>
                      {hero.title} {hero.subtitle}
                    </Text>
                    <View className="h-1 overflow-hidden rounded-full bg-ink/10">
                      <View className="h-full rounded-full bg-marigold" style={{ width: "38%" }} />
                    </View>
                  </VStack>
                  <Text className="text-xs text-ink-soft">0:24 / {clock(hero.durationSec)}</Text>
                </View>
              </Pressable>

              <VStack space="sm">
                <SectionHeader title="Browse by world" />
                <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                  {TILES.map((t) => {
                    const selected = filter === t.key
                    return (
                      <Pressable
                        key={t.key}
                        onPress={() => setFilter(selected ? "all" : t.key)}
                        style={{ width: (SW - 40 - 12) / 2 }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <View className={`relative h-24 overflow-hidden rounded-2xl ${selected ? "border-2 border-marigold" : ""}`} style={CARD_SHADOW}>
                          <Image source={tilePoster(t.key)} className="absolute h-full w-full" resizeMode="cover" />
                          <View className="absolute inset-0 bg-night/55" />
                          <View className="absolute bottom-2 left-3 right-3">
                            <Text className="font-display text-lg leading-6 text-ticket">{t.label}</Text>
                            <Text className="text-[11px] text-ticket/80">
                              {t.blurb} · {countOf(t.key)}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
              </VStack>

              <VStack space="sm">
                <SectionHeader title="Family library" count={shown.length}>
                  <View className="flex-row rounded-full bg-ink/5 p-1">
                    {[
                      { list: false, Icon: Grid2x2, label: "Poster grid" },
                      { list: true, Icon: List, label: "Compact list" },
                    ].map((o) => {
                      const active = listMode === o.list
                      return (
                        <Pressable
                          key={String(o.list)}
                          onPress={() => setListMode(o.list)}
                          hitSlop={4}
                          className={`h-9 w-12 items-center justify-center rounded-full ${active ? "bg-ticket" : ""}`}
                          style={active ? CARD_SHADOW : undefined}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={o.label}
                        >
                          <o.Icon size={16} stroke={active ? "#22319B" : "#5A4F66"} />
                        </Pressable>
                      )
                    })}
                  </View>
                </SectionHeader>

                <View className="rounded-full bg-ticket p-1" style={CARD_SHADOW}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                    {FILTERS.map((f) => {
                      const active = filter === f.key
                      return (
                        <Pressable
                          key={f.key}
                          onPress={() => setFilter(f.key)}
                          className={`min-h-10 justify-center rounded-full px-4 ${active ? "bg-ink" : ""}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text className={`text-[13px] ${active ? "font-body-bold text-ticket" : "font-body-semibold text-ink-soft"}`}>
                            {f.label} · {countOf(f.key)}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </ScrollView>
                </View>

                {shown.length === 0 ? (
                  <View className="items-center rounded-3xl bg-ticket p-6" style={CARD_SHADOW}>
                    <Text className="font-display text-xl text-ink">Nothing here yet</Text>
                    <Text className="mt-1 text-center text-[13px] leading-5 text-ink-soft">Make a film in this world and it will appear here.</Text>
                  </View>
                ) : listMode ? (
                  <VStack space="sm">
                    {shown.map((f) => (
                      <Pressable
                        key={f.id}
                        onPress={() => router.push("/watch")}
                        className="flex-row items-center gap-3 rounded-2xl bg-ticket p-2.5 active:opacity-85"
                        style={CARD_SHADOW}
                        accessibilityRole="button"
                        accessibilityLabel={`${f.title}, ${clock(f.durationSec)}`}
                      >
                        <Image source={f.poster} className="rounded-lg" style={{ width: 118, height: 66 }} resizeMode="cover" />
                        <VStack space="xs" className="flex-1">
                          <Text className="font-body-bold text-[15px] leading-5 text-ink" numberOfLines={2}>
                            {f.title} {f.subtitle}
                          </Text>
                          <Text className="text-xs text-ink-soft" numberOfLines={1}>
                            {f.styleLabel} · {f.narrator}
                          </Text>
                        </VStack>
                        <Text className="text-xs font-body-semibold text-ink-soft">{clock(f.durationSec)}</Text>
                      </Pressable>
                    ))}
                  </VStack>
                ) : (
                  <View className="flex-row flex-wrap" style={{ gap: 12, rowGap: 16 }}>
                    {shown.map((f) => (
                      <Pressable
                        key={f.id}
                        onPress={() => router.push("/watch")}
                        style={{ width: (SW - 40 - 12) / 2 }}
                        className="active:opacity-85"
                        accessibilityRole="button"
                        accessibilityLabel={`${f.title}, ${clock(f.durationSec)}`}
                      >
                        <View className="overflow-hidden rounded-xl bg-night" style={CARD_SHADOW}>
                          <Image source={f.poster} className="w-full" style={{ aspectRatio: 16 / 9 }} resizeMode="cover" />
                          <LinearGradient
                            colors={["transparent", "rgba(10,14,42,0.6)"]}
                            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 34 }}
                          />
                          <Text className="absolute bottom-1.5 right-2 text-[11px] font-body-bold text-ticket">{clock(f.durationSec)}</Text>
                          {!f.watched ? (
                            <View className="absolute left-1.5 top-1.5 rounded bg-marigold px-1.5 py-0.5">
                              <Text className="text-[10px] font-body-bold uppercase tracking-[0.5px] text-ink">New</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="mt-1.5 font-body-bold text-[14px] leading-5 text-ink" numberOfLines={2}>
                          {f.title} {f.subtitle}
                        </Text>
                        <Text className="text-xs text-ink-soft" numberOfLines={1}>
                          {f.styleLabel} · {f.narrator}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </VStack>

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
                    <Text className="text-[13px] leading-5 text-ink/80">Pick a topic, a narrator and a look.</Text>
                  </VStack>
                  <Play size={16} stroke="#1B1330" />
                </LinearGradient>
              </Pressable>
            </VStack>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  )
}
