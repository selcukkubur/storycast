import { useMemo, useState } from "react"
import { Image, Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated"
import { router } from "expo-router"
import { ChevronLeft, Download, MessageCircle, Pause, Play, RotateCw, Share2, X } from "lucide-react-native"
import { VStack } from "@/components/ui/vstack"
import { HStack } from "@/components/ui/hstack"
import { Text } from "@/components/ui/text"
import { FILMS, NARRATORS } from "@/src/flows/shared/mock-data"

type Step = "library" | "player" | "share"

const EYEBROW = "font-body-bold text-[11px] uppercase tracking-[1px]"
const NOCTURNE: readonly [string, string] = ["#2A3BC0", "#131A4E"]
const CARD_SHADOW = {
  shadowColor: "#1B1330",
  shadowOpacity: 0.14,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 14 },
  elevation: 7,
} as const

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

/* ================================================
   FLOW: Watch & Share
   SCREENS 1-3: Library → Player → Share
   PLATFORM: React Native (Expo + NativeWind + local Gluestack-style components)
   ENTRY:  Home hero · notification · result screen
   EXIT:   ✅ watched/shared · ↩ back to library
   ================================================ */
export default function WatchFlow() {
  const [step, setStep] = useState<Step>("library")
  const [filmId, setFilmId] = useState(FILMS[0].id)
  const [playing, setPlaying] = useState(true)
  const [subtitles, setSubtitles] = useState(true)

  const film = useMemo(() => FILMS.find((f) => f.id === filmId) ?? FILMS[0], [filmId])
  const narrator = NARRATORS.find((n) => n.id === film.narratorId)

  /* SCREEN 1 — Library */
  if (step === "library") {
    return (
      <View className="flex-1 bg-paper">
        <ScrollView contentContainerClassName="pb-10">
          <LinearGradient colors={NOCTURNE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 44, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
            <View className="absolute -right-12 top-4 h-44 w-44 rounded-full border border-marigold/20" />
            <HStack className="justify-between">
              <VStack space="xs">
                <Text className={`${EYEBROW} text-marigold`}>The family library</Text>
                <Text className="font-display text-[34px] leading-[40px] text-ticket">
                  Tonight at the <Text className="font-display-italic text-marigold">picture house.</Text>
                </Text>
              </VStack>
              <Pressable onPress={() => router.back()} className="h-11 w-11 items-center justify-center rounded-full bg-ticket/10 active:bg-ticket/20" accessibilityLabel="Close">
                <X size={18} stroke="#FFF9F0" />
              </Pressable>
            </HStack>
            <Text className="mt-2 text-sm leading-5 text-ticket/70">{FILMS.length} films made in this house.</Text>
          </LinearGradient>

          <Animated.View entering={FadeInDown.duration(420)}>
            <VStack space="md" className="-mt-6 px-5">
              <HStack space="sm">
                <View className="rounded-full bg-royal px-3 py-1.5">
                  <Text className="text-xs font-body-bold text-ticket">All films</Text>
                </View>
                <View className="rounded-full border border-ink/10 bg-ticket px-3 py-1.5">
                  <Text className="text-xs text-ink">Unwatched</Text>
                </View>
              </HStack>

              {FILMS.length === 0 ? (
                <View className="items-center rounded-3xl bg-ticket p-6" style={CARD_SHADOW}>
                  <Text className="font-display text-xl text-ink">Nothing in the library yet</Text>
                  <Text className="mt-1 text-xs text-ink-soft">Your first film takes about six minutes to make.</Text>
                </View>
              ) : null}
              <View className="flex-row flex-wrap justify-between" style={{ rowGap: 16 }}>
                {FILMS.map((f) => {
                  const n = NARRATORS.find((x) => x.id === f.narratorId)
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => {
                        setFilmId(f.id)
                        setPlaying(true)
                        setStep("player")
                      }}
                      className="w-[48%]"
                      accessibilityRole="button"
                    >
                      <View className="overflow-hidden rounded-2xl bg-night" style={CARD_SHADOW}>
                        <Image source={f.poster} className="aspect-[4/5] w-full" resizeMode="cover" />
                        {!f.watched ? (
                          <View className="absolute left-2 top-2 -rotate-2 rounded-md bg-coral px-1.5 py-0.5">
                            <Text className={`${EYEBROW} text-ticket`}>New</Text>
                          </View>
                        ) : null}
                        <View className="absolute bottom-2 right-2 rounded-md bg-night/85 px-1.5 py-0.5">
                          <Text className="text-[11px] font-body-bold text-ticket">{clock(f.durationSec)}</Text>
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
            </VStack>
          </Animated.View>
        </ScrollView>
      </View>
    )
  }

  /* SCREEN 2 — Player */
  if (step === "player") {
    return (
      <View className="flex-1 bg-night">
        <ScrollView contentContainerClassName="pb-10">
          <Animated.View entering={FadeInDown.duration(350)}>
            <View className="relative">
              <Image source={film.poster} className="aspect-[4/3] w-full" resizeMode="cover" />
              <LinearGradient colors={["rgba(13,18,60,0.35)", "transparent"]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 120 }} />
              <HStack className="absolute left-4 right-4 top-14 justify-between">
                <Pressable onPress={() => setStep("library")} className="h-11 w-11 items-center justify-center rounded-full bg-night/60 active:bg-night/80" accessibilityLabel="Back">
                  <ChevronLeft size={18} stroke="#FFF9F0" />
                </Pressable>
                <Pressable onPress={() => setStep("share")} className="h-11 w-11 items-center justify-center rounded-full bg-night/60 active:bg-night/80" accessibilityLabel="Share">
                  <Share2 size={17} stroke="#FFF9F0" />
                </Pressable>
              </HStack>
              <Pressable
                onPress={() => setPlaying((p) => !p)}
                className="absolute inset-0 items-center justify-center"
                accessibilityLabel={playing ? "Pause" : "Play"}
              >
                <View className="rounded-full border-2 border-coral/70 bg-marigold p-5" style={{ shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}>
                  {playing ? <Pause size={24} stroke="#1B1330" fill="#1B1330" /> : <Play size={24} stroke="#1B1330" fill="#1B1330" />}
                </View>
              </Pressable>
            </View>

            <View className="px-5">
              <View className="mt-4 h-1.5 overflow-hidden rounded-full bg-ticket/15">
                <View className="h-full rounded-full bg-marigold" style={{ width: "38%" }} />
              </View>
              <HStack className="mt-1.5 justify-between">
                <Text className="text-[11px] text-ticket/50">0:24</Text>
                <Text className="text-[11px] text-ticket/50">{clock(film.durationSec)}</Text>
              </HStack>

              <Text className="mt-4 font-display text-[28px] leading-8 text-ticket">{film.title}</Text>
              <HStack space="sm" className="mt-1 items-center">
                <Text className="text-xs text-ticket/60">
                  {narrator?.name} · {narrator?.look}
                </Text>
                {subtitles ? (
                  <View className="rounded-full bg-ticket/10 px-2 py-0.5">
                    <Text className={`${EYEBROW} text-marigold`}>Subtitles on</Text>
                  </View>
                ) : null}
              </HStack>

              <HStack space="sm" className="mt-6">
                <Pressable
                  onPress={() => setSubtitles((s) => !s)}
                  className={`min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-2xl ${subtitles ? "bg-ticket/15" : "border border-ticket/20"}`}
                >
                  <Text className="text-xs font-body-semibold text-ticket">Subtitles</Text>
                </Pressable>
                <Pressable className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-ticket/20 active:bg-ticket/10">
                  <Download size={14} stroke="#FFF9F0" />
                  <Text className="text-xs font-body-semibold text-ticket">Save</Text>
                </Pressable>
                <Pressable onPress={() => setStep("share")} className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-ticket/20 active:bg-ticket/10">
                  <Share2 size={14} stroke="#FFF9F0" />
                  <Text className="text-xs font-body-semibold text-ticket">Share</Text>
                </Pressable>
              </HStack>

              <Pressable
                onPress={() => {
                  setPlaying(true)
                  setStep("player")
                }}
                className="mt-6 min-h-11 flex-row items-center justify-center gap-2 rounded-2xl bg-royal active:opacity-90"
              >
                <RotateCw size={14} stroke="#FFF9F0" />
                <Text className="text-sm font-body-bold text-ticket">Watch again from the start</Text>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    )
  }

  /* SCREEN 3 — Share sheet */
  return (
    <View className="flex-1 justify-end bg-night/95">
      <Animated.View entering={FadeIn.duration(250)}>
        <View className="rounded-t-3xl bg-ticket p-6" style={CARD_SHADOW}>
          <View className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/15" />
          <HStack className="items-center justify-between">
            <VStack space="xs">
              <Text className={`${EYEBROW} text-ink-soft`}>Share tonight's film</Text>
              <Text className="font-display text-xl leading-6 text-ink" numberOfLines={1}>
                {film.title}
              </Text>
            </VStack>
            <Pressable onPress={() => setStep("player")} className="h-11 w-11 items-center justify-center rounded-full bg-ink/5" accessibilityLabel="Close">
              <X size={16} stroke="#1B1330" />
            </Pressable>
          </HStack>
          <VStack space="sm" className="mt-5">
            {[
              { icon: <MessageCircle size={16} stroke="#22319B" />, title: "Send a link", note: "Anyone in the family can watch" },
              { icon: <Download size={16} stroke="#22319B" />, title: "Save the film", note: "Downloaded to your device" },
              { icon: <Share2 size={16} stroke="#22319B" />, title: "More options", note: "AirDrop, Messages, Photos" },
            ].map((row) => (
              <Pressable key={row.title} className="min-h-11 flex-row items-center gap-3 rounded-2xl bg-paper p-3 active:bg-paper/70">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-ticket">{row.icon}</View>
                <VStack space="xs">
                  <Text className="text-sm font-body-semibold text-ink">{row.title}</Text>
                  <Text className="text-[11px] text-ink-soft">{row.note}</Text>
                </VStack>
              </Pressable>
            ))}
          </VStack>
        </View>
      </Animated.View>
    </View>
  )
}
