import { useMemo, useState } from "react"
import { Dimensions, Image, Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, { FadeInDown } from "react-native-reanimated"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ChevronRight, Grid2x2, Grid3x3, Play, Sparkles, Ticket } from "lucide-react-native"
import { VStack } from "@/components/ui/vstack"
import { HStack } from "@/components/ui/hstack"
import { Text } from "@/components/ui/text"
import { FILMS, NARRATORS, WALLET } from "@/src/flows/shared/mock-data"
import type { FilmCategory } from "@/src/flows/shared/types"

const EYEBROW = "font-body-bold text-[11px] uppercase tracking-[1px]"
const CARD_SHADOW = {
  shadowColor: "#0B102A",
  shadowOpacity: 0.16,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 14 },
  elevation: 8,
} as const

const { width: SW } = Dimensions.get("window")
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

const FILTERS: { key: "all" | FilmCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "nature", label: "Nature" },
  { key: "science", label: "Science" },
  { key: "history", label: "History" },
  { key: "machines", label: "Machines" },
]

const TILES: { key: FilmCategory; label: string; posterIndex: number; blurb: string }[] = [
  { key: "nature", label: "Nature", posterIndex: 4, blurb: "Leaves, bees, storms" },
  { key: "science", label: "Science", posterIndex: 0, blurb: "Wind and weather" },
  { key: "history", label: "History", posterIndex: 2, blurb: "Firsts and legends" },
  { key: "machines", label: "Machines", posterIndex: 5, blurb: "Gears and wires" },
]

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
  const [filter, setFilter] = useState<"all" | FilmCategory>("all")
  const [compact, setCompact] = useState(false)

  const hero = FILMS.find((f) => !f.watched) ?? FILMS[0]
  const heroNarrator = NARRATORS.find((n) => n.id === hero.narratorId)
  const fresh = FILMS.slice(0, 6)
  const shown = useMemo(() => (filter === "all" ? FILMS : FILMS.filter((f) => f.category === filter)), [filter])
  const countOf = (c: FilmCategory) => FILMS.filter((f) => f.category === c).length

  const heroHeight = Math.round(SW * 1.12)
  const itemWidth = compact ? ("31.3%" as const) : ("48%" as const)

  return (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerClassName="pb-10" showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.push("/watch")} accessibilityRole="button" accessibilityLabel={`Play ${hero.title}`}>
          <View style={{ height: heroHeight }} className="relative w-full bg-night">
            <Image source={hero.poster} className="absolute h-full w-full" resizeMode="cover" />
            <LinearGradient
              colors={["rgba(10,14,42,0.75)", "rgba(10,14,42,0.15)", "transparent"]}
              style={{ position: "absolute", left: 0, right: 0, top: 0, height: 180 }}
            />
            <LinearGradient
              colors={["transparent", "rgba(19,26,78,0.72)", "#131A4E"]}
              locations={[0.35, 0.72, 1]}
              style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: Math.round(heroHeight * 0.62) }}
            />

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

            <View className="absolute bottom-10 left-5 right-5">
              <HStack space="xs" className="items-center">
                <Text className={`${EYEBROW} text-marigold`}>Tonight's feature</Text>
                {!hero.watched ? (
                  <View className="-rotate-2 rounded-md bg-coral px-1.5 py-0.5">
                    <Text className={`${EYEBROW} text-ticket`}>New</Text>
                  </View>
                ) : null}
              </HStack>
              <Text className="mt-2 font-display text-[34px] leading-[38px] text-ticket" numberOfLines={2}>
                {hero.title}
              </Text>
              <HStack space="sm" className="mt-2 items-center">
                <Text className="text-[13px] text-ticket/85">
                  {heroNarrator?.name} · {heroNarrator?.look}
                </Text>
                <View className="h-1 w-1 rounded-full bg-ticket/50" />
                <Text className="text-[13px] text-ticket/85">{clock(hero.durationSec)} min</Text>
              </HStack>
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
        </Pressable>

        <View className="relative -mt-6 rounded-t-[28px] bg-paper px-5 pt-5">
          <Animated.View entering={FadeInDown.duration(420)}>
            <VStack space="lg">
              <Pressable onPress={() => router.push("/watch")} accessibilityRole="button" accessibilityLabel={`Resume ${hero.title}`}>
                <View className="flex-row items-center gap-3 rounded-2xl bg-ticket p-3" style={CARD_SHADOW}>
                  <Image source={hero.poster} className="h-14 w-14 rounded-xl" resizeMode="cover" />
                  <VStack space="xs" className="flex-1">
                    <Text className={`${EYEBROW} text-ink-soft`}>Continue watching</Text>
                    <Text className="font-body-semibold text-sm text-ink" numberOfLines={1}>
                      {hero.title}
                    </Text>
                    <View className="h-1 overflow-hidden rounded-full bg-ink/10">
                      <View className="h-full rounded-full bg-marigold" style={{ width: "38%" }} />
                    </View>
                  </VStack>
                  <VStack className="items-end">
                    <Text className="text-xs text-ink-soft">0:24 / {clock(hero.durationSec)}</Text>
                    <ChevronRight size={16} stroke="#5A4F66" />
                  </VStack>
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
                          <Image source={FILMS[t.posterIndex % FILMS.length].poster} className="absolute h-full w-full" resizeMode="cover" />
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
                <SectionHeader title="New this week" count={fresh.length} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 4 }}>
                  {fresh.map((f, i) => (
                    <Pressable key={`fresh-${f.id}`} onPress={() => router.push("/watch")} className="w-40" accessibilityRole="button">
                      <View className="overflow-hidden rounded-2xl bg-night" style={CARD_SHADOW}>
                        <Image source={f.poster} className="aspect-[4/5] w-full" resizeMode="cover" />
                        <Text
                          className="absolute left-2 top-0 font-display text-[40px] leading-[46px] text-ticket/90"
                          style={{ textShadowColor: "rgba(0,0,0,0.45)", textShadowRadius: 8 }}
                        >
                          {i + 1}
                        </Text>
                        <View className="absolute bottom-2 right-2 rounded-md bg-night/85 px-1.5 py-0.5">
                          <Text className="text-[11px] font-body-bold text-ticket">{clock(f.durationSec)}</Text>
                        </View>
                      </View>
                      <Text className="mt-2 font-body-semibold text-[13px] leading-5 text-ink" numberOfLines={2}>
                        {f.title}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </VStack>

              <VStack space="sm">
                <SectionHeader title="Family library" count={shown.length}>
                  <View className="flex-row rounded-full bg-ink/5 p-1">
                    {[
                      { compact: false, Icon: Grid2x2, label: "Comfort grid, two posters per row" },
                      { compact: true, Icon: Grid3x3, label: "Compact grid, three posters per row" },
                    ].map((o) => {
                      const active = compact === o.compact
                      return (
                        <Pressable
                          key={String(o.compact)}
                          onPress={() => setCompact(o.compact)}
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
                      const n = f.key === "all" ? FILMS.length : countOf(f.key)
                      return (
                        <Pressable
                          key={f.key}
                          onPress={() => setFilter(f.key)}
                          className={`min-h-10 justify-center rounded-full px-4 ${active ? "bg-ink" : ""}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text className={`text-[13px] ${active ? "font-body-bold text-ticket" : "font-body-semibold text-ink-soft"}`}>
                            {f.label} · {n}
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
                ) : (
                  <View className="flex-row flex-wrap" style={{ gap: 12, rowGap: 18 }}>
                    {shown.map((f) => {
                      const n = NARRATORS.find((x) => x.id === f.narratorId)
                      return (
                        <Pressable
                          key={f.id}
                          onPress={() => router.push("/watch")}
                          style={{ width: itemWidth }}
                          className="active:opacity-85"
                          accessibilityRole="button"
                          accessibilityLabel={`${f.title}, ${clock(f.durationSec)}`}
                        >
                          <View className="overflow-hidden rounded-xl bg-night" style={CARD_SHADOW}>
                            <Image
                              source={f.poster}
                              className="w-full"
                              style={{ aspectRatio: compact ? 2 / 3 : 3 / 4 }}
                              resizeMode="cover"
                            />
                            <View className="absolute bottom-1.5 right-1.5 rounded bg-night/85 px-1 py-0.5">
                              <Text className="text-[11px] font-body-bold text-ticket">{clock(f.durationSec)}</Text>
                            </View>
                            {!f.watched && !compact ? (
                              <View className="absolute left-1.5 top-1.5 -rotate-2 rounded bg-coral px-1.5 py-0.5">
                                <Text className={`${EYEBROW} text-ticket`}>New</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text
                            className={`mt-2 text-ink ${compact ? "font-body-semibold text-xs leading-4" : "font-body-bold text-[14px] leading-5"}`}
                            numberOfLines={compact ? 1 : 2}
                          >
                            {f.title}
                          </Text>
                          {!compact ? (
                            <Text className="text-xs text-ink-soft" numberOfLines={1}>
                              {n?.name} · {f.created}
                            </Text>
                          ) : null}
                        </Pressable>
                      )
                    })}
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
