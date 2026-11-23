import { useCallback, useEffect, useMemo, useState } from "react"
import { ActivityIndicator, Image, Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated"
import { router, useFocusEffect, useLocalSearchParams } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useVideoPlayer, VideoView } from "expo-video"
import { ChevronLeft, Download, MessageCircle, RotateCcw, Share2, X } from "lucide-react-native"
import { VStack } from "@/components/ui/vstack"
import { HStack } from "@/components/ui/hstack"
import { Text } from "@/components/ui/text"
import { FILMS } from "@/src/flows/shared/mock-data"
import type { Film } from "@/src/flows/shared/types"
import { generatedFilms } from "@/src/lib/generated"
import { languageOf } from "@/src/flows/shared/languages"

type Step = "library" | "player" | "share"

const EYEBROW = "font-body-bold text-[11px] uppercase tracking-[1px]"
const INK = "#0A0E24"
const MARIGOLD = "#FFB627"
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

function Chip({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
      <Text className="text-[11px] font-body-semibold text-ticket/90">{label}</Text>
    </View>
  )
}

/* ================================================
   FLOW: Watch & Share
   SCREENS: Library ↔ Player → Share
   PLATFORM: React Native (Expo + NativeWind + expo-video)
   ENTRY:  Home poster deep-link (?id=) · notification · result screen
   EXIT:   ✅ watched/shared · ↩ back
   ================================================ */
export default function WatchFlow() {
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ id?: string }>()
  const paramId = typeof params.id === "string" ? params.id : undefined

  const [mine, setMine] = useState<Film[] | null>(null)

  useFocusEffect(
    useCallback(() => {
      let alive = true
      generatedFilms()
        .then((films) => {
          if (alive) setMine(films)
        })
        .catch(() => {
          if (alive) setMine([])
        })
      return () => {
        alive = false
      }
    }, []),
  )

  const all = useMemo(() => [...(mine ?? []), ...FILMS], [mine])
  const deepId = paramId && all.some((f) => f.id === paramId) ? paramId : undefined

  /* Navigation is derived, not promoted after paint: the override wins, otherwise a
     resolved deep link opens the player and anything else lands on the library. */
  const [stepOverride, setStepOverride] = useState<Step | null>(null)
  const [filmId, setFilmId] = useState<string | null>(null)
  const active: Step = stepOverride ?? (deepId ? "player" : "library")

  const film = useMemo(() => {
    const id = filmId ?? deepId ?? FILMS[0].id
    return all.find((f) => f.id === id) ?? all[0]
  }, [all, filmId, deepId])
  const upNext = useMemo(() => all.filter((f) => f.id !== film.id).slice(0, 6), [all, film.id])

  const player = useVideoPlayer(film.video)

  useEffect(() => {
    player.replace(film.video)
  }, [film.id])

  useEffect(() => {
    if (active === "player") player.play()
    else player.pause()
  }, [active, film.id])

  const openFilm = (id: string) => {
    setFilmId(id)
    setStepOverride("player")
  }

  /* A deep link may point at a generated film that is still loading from storage. */
  const waitingOnDeepLink = mine === null && Boolean(paramId) && !FILMS.some((f) => f.id === paramId)
  if (waitingOnDeepLink) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: INK }}>
        <ActivityIndicator color={MARIGOLD} />
      </View>
    )
  }

  /* SCREEN 1 — Library (via back / direct route / unknown deep link) */
  if (active === "library") {
    return (
      <View className="flex-1" style={{ backgroundColor: INK }}>
        <ScrollView contentContainerClassName="pb-10" showsVerticalScrollIndicator={false}>
          <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 20 }}>
            <HStack className="items-center justify-between">
              <VStack space="xs">
                <Text className={`${EYEBROW} text-marigold`}>The family library</Text>
                <Text className="font-display text-[30px] leading-9 text-ticket">All our films</Text>
              </VStack>
              <Pressable
                onPress={() => router.back()}
                className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={18} stroke="#FFF9F0" />
              </Pressable>
            </HStack>
            <Text className="mt-1 text-[13px] text-ticket/70">{all.length} films made in this house</Text>
          </View>

          <View className="px-5">
            <View className="flex-row flex-wrap" style={{ gap: 12, rowGap: 16 }}>
              {all.map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => openFilm(f.id)}
                  style={{ width: "48%" }}
                  className="active:opacity-85"
                  accessibilityRole="button"
                  accessibilityLabel={`${f.title}, ${clock(f.durationSec)}`}
                >
                  <View className="overflow-hidden rounded-xl" style={{ backgroundColor: "#10163B" }}>
                    <Image source={f.poster} className="w-full" style={{ aspectRatio: 16 / 9 }} resizeMode="cover" />
                    <LinearGradient colors={["transparent", "rgba(10,14,36,0.65)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 32 }} />
                    <Text className="absolute bottom-1.5 right-2 text-[11px] font-body-bold text-ticket">{clock(f.durationSec)}</Text>
                    {!f.watched ? (
                      <View className="absolute left-1.5 top-1.5 rounded bg-marigold px-1.5 py-0.5">
                        <Text className="text-[10px] font-body-bold uppercase tracking-[0.5px] text-ink">New</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="mt-1.5 font-body-bold text-[14px] leading-5 text-ticket" numberOfLines={2}>
                    {f.title} {f.subtitle}
                  </Text>
                  <Text className="text-xs text-ticket/60" numberOfLines={1}>
                    {f.styleLabel} · {f.narrator}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    )
  }

  /* SCREEN 2 — Player (real video via expo-video) */
  if (active === "player") {
    return (
      <View className="flex-1" style={{ backgroundColor: INK }}>
        <ScrollView contentContainerClassName="pb-10" showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(250)}>
            <View className="relative w-full bg-black" style={{ aspectRatio: 16 / 9 }}>
              <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="contain" nativeControls />
              <LinearGradient
                colors={["rgba(10,14,36,0.65)", "transparent"]}
                style={{ position: "absolute", left: 0, right: 0, top: 0, height: Math.round(insets.top + 72) }}
                pointerEvents="none"
              />
              <View style={{ paddingTop: insets.top + 8 }} className="absolute left-4 right-4 flex-row items-center justify-between">
                <Pressable
                  onPress={() => (deepId ? router.back() : setStepOverride("library"))}
                  className="h-11 w-11 items-center justify-center rounded-full bg-black/40"
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                >
                  <ChevronLeft size={20} stroke="#FFF9F0" />
                </Pressable>
                <Pressable
                  onPress={() => setStepOverride("share")}
                  className="h-11 w-11 items-center justify-center rounded-full bg-black/40"
                  accessibilityRole="button"
                  accessibilityLabel="Share film"
                >
                  <Share2 size={17} stroke="#FFF9F0" />
                </Pressable>
              </View>
            </View>

            <View className="px-5 pt-4">
              <HStack className="items-center justify-between">
                <HStack space="sm" className="items-center">
                  <Text className={`${EYEBROW} text-marigold`}>Now playing</Text>
                  <Text className="text-xs text-ticket/50">{film.created}</Text>
                </HStack>
                <Pressable
                  onPress={() => {
                    player.currentTime = 0
                    player.play()
                  }}
                  className="min-h-11 flex-row items-center gap-1.5 px-2"
                  accessibilityRole="button"
                  accessibilityLabel="Restart film"
                >
                  <RotateCcw size={13} stroke={MARIGOLD} />
                  <Text className="text-xs font-body-semibold text-marigold">Restart</Text>
                </Pressable>
              </HStack>

              <Text className="mt-1 font-display text-[30px] leading-[36px] text-ticket">{film.title}</Text>
              <Text className="font-display-italic text-[17px] leading-6 text-ticket/80">{film.subtitle}</Text>

              <HStack space="xs" className="mt-3 flex-wrap">
                <Chip label={film.styleLabel} />
                <Chip label={film.narrator} />
                <Chip label={clock(film.durationSec)} />
                <Chip label="480P" />
                <Chip label={languageOf(film.lang).native} />
              </HStack>

              <View className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                <Text className={`${EYEBROW} text-ticket/60`}>About this film</Text>
                <Text className="mt-2 text-[14px] leading-[22px] text-ticket/85">{film.topic}</Text>
                <View className="mt-3 h-px bg-white/10" />
                {[
                  { label: "Language", value: `${languageOf(film.lang).native} · ${languageOf(film.lang).name}` },
                  { label: "Look", value: film.styleLabel },
                  { label: "Narrator", value: film.narrator },
                  { label: "Length", value: `${clock(film.durationSec)} min` },
                ].map((row, i) => (
                  <View key={row.label} className={i > 0 ? "mt-2.5" : "mt-2.5"}>
                    <HStack className="justify-between">
                      <Text className="text-[13px] text-ticket/55">{row.label}</Text>
                      <Text className="text-[13px] font-body-semibold text-ticket/90">{row.value}</Text>
                    </HStack>
                  </View>
                ))}
              </View>

              <HStack space="sm" className="mt-5">
                <Pressable
                  onPress={() => setStepOverride("share")}
                  className="min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 active:bg-white/10"
                  accessibilityRole="button"
                >
                  <Share2 size={15} stroke="#FFF9F0" />
                  <Text className="text-[13px] font-body-bold text-ticket">Share</Text>
                </Pressable>
                <Pressable
                  className="min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 active:bg-white/10"
                  accessibilityRole="button"
                >
                  <Download size={15} stroke="#FFF9F0" />
                  <Text className="text-[13px] font-body-bold text-ticket">Save</Text>
                </Pressable>
              </HStack>

              <View className="mt-5 h-px bg-white/10" />

              <HStack className="mt-4 items-center justify-between">
                <HStack space="xs" className="items-center">
                  <View style={{ height: 2, width: 16, backgroundColor: MARIGOLD, opacity: 0.8 }} />
                  <Text className={`${EYEBROW} text-ticket/60`}>Up next</Text>
                </HStack>
              </HStack>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingTop: 12, paddingRight: 4 }}>
                {upNext.map((f) => (
                  <Pressable key={f.id} onPress={() => openFilm(f.id)} className="w-40" accessibilityRole="button" accessibilityLabel={`Play ${f.title}`}>
                    <View className="overflow-hidden rounded-xl" style={{ backgroundColor: "#10163B" }}>
                      <Image source={f.poster} className="w-full" style={{ aspectRatio: 16 / 9 }} resizeMode="cover" />
                      <Text className="absolute bottom-1.5 right-2 text-[11px] font-body-bold text-ticket">{clock(f.durationSec)}</Text>
                    </View>
                    <Text className="mt-1.5 font-body-semibold text-[13px] leading-5 text-ticket" numberOfLines={1}>
                      {f.title} {f.subtitle}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    )
  }

  /* SCREEN 3 — Share sheet */
  return (
    <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(6,9,24,0.94)" }}>
      <Animated.View entering={FadeInDown.duration(260)}>
        <View className="rounded-t-3xl px-6 pb-8 pt-3" style={{ backgroundColor: "#10163B" }}>
          <View className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
          <HStack className="items-center justify-between">
            <VStack space="xs" className="flex-1 pr-4">
              <Text className={`${EYEBROW} text-marigold`}>Share tonight's film</Text>
              <Text className="font-display text-xl leading-6 text-ticket" numberOfLines={2}>
                {film.title} {film.subtitle}
              </Text>
            </VStack>
            <Pressable onPress={() => setStepOverride("player")} className="h-11 w-11 items-center justify-center rounded-full bg-white/10" accessibilityRole="button" accessibilityLabel="Close">
              <X size={16} stroke="#FFF9F0" />
            </Pressable>
          </HStack>
          <VStack space="sm" className="mt-5">
            {[
              { icon: <MessageCircle size={16} stroke={MARIGOLD} />, title: "Send a link", note: "Anyone in the family can watch" },
              { icon: <Download size={16} stroke={MARIGOLD} />, title: "Save the film", note: "Downloaded to your device" },
              { icon: <Share2 size={16} stroke={MARIGOLD} />, title: "More options", note: "AirDrop, Messages, Photos" },
            ].map((row) => (
              <Pressable key={row.title} className="min-h-12 flex-row items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 active:bg-white/10">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-white/10">{row.icon}</View>
                <VStack space="xs">
                  <Text className="text-sm font-body-bold text-ticket">{row.title}</Text>
                  <Text className="text-[11px] text-ticket/60">{row.note}</Text>
                </VStack>
              </Pressable>
            ))}
          </VStack>
        </View>
      </Animated.View>
    </View>
  )
}
