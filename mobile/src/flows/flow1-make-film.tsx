import { useEffect, useMemo, useRef, useState } from "react"
import { FlatList, Image, Modal, Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated"
import { Check, ChevronRight, Lock, Mic, Play, Plus, Ticket, X } from "lucide-react-native"
import { VStack } from "@/components/ui/vstack"
import { HStack } from "@/components/ui/hstack"
import { Text } from "@/components/ui/text"
import { Button, ButtonText } from "@/components/ui/button"
import { InputField } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { router } from "expo-router"
import { NARRATORS, LOOKS, TOPIC_CHIPS, WALLET, FILMS } from "@/src/flows/shared/mock-data"
import { LANGUAGES, languageOf } from "@/src/flows/shared/languages"
import { VOICES, voiceOf } from "@/src/flows/shared/voices"
import { STAGE_LABELS, STAGE_ORDER, creditsFor, type Resolution } from "@/src/flows/shared/types"

type Step = "compose" | "gate" | "progress" | "result"

const EYEBROW = "font-body-bold text-[11px] uppercase tracking-[1px]"
const NOCTURNE: readonly [string, string] = ["#2A3BC0", "#131A4E"]
const CARD_SHADOW = {
  shadowColor: "#1B1330",
  shadowOpacity: 0.14,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 14 },
  elevation: 7,
} as const

function Eyebrow({ children, tone = "marigold" }: { children: string; tone?: "marigold" | "soft" | "ticket" }) {
  const color = tone === "marigold" ? "text-marigold" : tone === "ticket" ? "text-ticket/60" : "text-ink-soft"
  const rule = tone === "marigold" ? "#FFB627" : tone === "ticket" ? "#FFF9F088" : "#6F6480"
  return (
    <HStack space="xs" className="items-center">
      <View style={{ height: 2, width: 16, backgroundColor: rule, opacity: 0.7 }} />
      <Text className={`${EYEBROW} ${color}`}>{children}</Text>
    </HStack>
  )
}

function GoldButton({ label, disabled, onPress, icon }: { label: string; disabled?: boolean; onPress: () => void; icon?: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`overflow-hidden rounded-2xl ${disabled ? "opacity-40" : "active:opacity-90"}`}
      style={disabled ? undefined : { shadowColor: "#B47B00", shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }}
    >
      <LinearGradient
        colors={["#FFD36E", "#F2A112"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ minHeight: 54, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}
      >
        {icon}
        <Text className="font-body-bold text-[15px] uppercase tracking-[1px] text-ink">{label}</Text>
      </LinearGradient>
    </Pressable>
  )
}

export default function MakeAFilmFlow() {
  const [step, setStep] = useState<Step>("compose")
  const [topic, setTopic] = useState("")
  const [narratorId, setNarratorId] = useState(NARRATORS[0].id)
  const [look, setLook] = useState(LOOKS[0])
  const [minutes, setMinutes] = useState(1)
  const [resolution, setResolution] = useState<Resolution>("480P")
  const [langCode, setLangCode] = useState("en")
  const [langOpen, setLangOpen] = useState(false)
  const [langQuery, setLangQuery] = useState("")
  const [voiceId, setVoiceId] = useState(VOICES[0].id)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [gateAnswer, setGateAnswer] = useState("")
  const [gateError, setGateError] = useState("")
  const [stageIndex, setStageIndex] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const credits = WALLET.credits
  const cost = creditsFor(minutes, resolution)
  const canAfford = cost <= credits && minutes <= WALLET.maxMinutes
  const narrator = useMemo(() => NARRATORS.find((n) => n.id === narratorId) ?? NARRATORS[0], [narratorId])
  const poster = FILMS[Math.max(0, NARRATORS.findIndex((n) => n.id === narratorId)) % FILMS.length].poster

  useEffect(() => {
    if (step !== "progress") return
    timer.current = setInterval(() => {
      setStageIndex((i) => {
        if (i + 1 >= STAGE_ORDER.length) {
          if (timer.current) clearInterval(timer.current)
          setStep("result")
          return i
        }
        return i + 1
      })
    }, 900)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [step])

  const title = topic.trim() || "Your first story"

  /* ================================================
     FLOW: Make a Film
     SCREEN 1 of 4: Composer
     PLATFORM: React Native (Expo + NativeWind + local Gluestack-style components)
     ------------------------------------------------
     ENTRY:  Create tab / Home hero "Start a story"
     EXIT:   "Make the film" → Parental gate
     BRANCH: cost > tickets → upsell note (Flow B)
     ================================================ */
  if (step === "compose") {
    return (
      <View className="flex-1 bg-paper">
        <ScrollView contentContainerClassName="pb-52">
          <LinearGradient
            colors={NOCTURNE}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderBottomLeftRadius: 40, borderBottomRightRadius: 40, paddingHorizontal: 20, paddingTop: 64, paddingBottom: 96 }}
          >
            <View className="absolute -bottom-20 -right-14 h-56 w-56 rounded-full border border-marigold/25" />
            <View className="absolute -bottom-10 right-10 h-24 w-24 rounded-full border border-coral/25" />
            <View className="absolute left-6 top-12 h-1.5 w-1.5 rounded-full bg-marigold/80" />
            <View className="absolute left-24 top-20 h-1 w-1 rounded-full bg-coral/70" />
            <View className="absolute right-24 top-10 h-1 w-1 rounded-full bg-marigold/60" />

            <Eyebrow tone="marigold">Little picture house</Eyebrow>
            <Text className="mt-2 font-display text-[42px] leading-[48px] text-ticket">
              Make a <Text className="font-display-italic text-marigold">film.</Text>
            </Text>
            <Text className="mt-2 max-w-[78%] text-[15px] leading-6 text-ticket/85">
              {narrator.name} tells tonight's story in {narrator.look.toLowerCase()}.
            </Text>

            <View
              className="absolute right-4 top-14 -rotate-3 rounded-xl bg-marigold px-3 py-2"
              style={{ shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
            >
              <HStack space="xs" className="items-center">
                <Ticket size={13} stroke="#1B1330" />
                <Text className={`${EYEBROW} text-ink`}>{credits} tickets</Text>
              </HStack>
            </View>
          </LinearGradient>

          <Animated.View entering={FadeInDown.duration(450)}>
            <VStack space="lg" className="-mt-14 px-5">
              <View className="rounded-3xl bg-ticket p-5" style={CARD_SHADOW}>
                <Eyebrow tone="soft">Tonight's topic</Eyebrow>
                <View className="mt-3 rounded-2xl bg-paper px-4">
                  <InputField
                    value={topic}
                    onChangeText={setTopic}
                    placeholder="e.g. How do bees make honey?"
                    accessibilityLabel="Film topic"
                  />
                </View>
                <HStack space="sm" className="mt-3 flex-wrap">
                  {TOPIC_CHIPS.map((chip) => (
                    <Pressable
                      key={chip}
                      onPress={() => setTopic(chip)}
                      className="min-h-11 justify-center rounded-full border border-ink/20 bg-paper px-3.5 active:bg-ticket"
                    >
                      <Text className="text-sm text-ink">{chip}</Text>
                    </Pressable>
                  ))}
                </HStack>
              </View>

              <VStack space="sm">
                <HStack className="items-center justify-between">
                  <Eyebrow tone="soft">The cast</Eyebrow>
                  <Text className="text-xs text-ink-soft">50 narrators</Text>
                </HStack>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <HStack space="sm">
                    {NARRATORS.map((n) => {
                      const selected = n.id === narratorId
                      return (
                        <Pressable
                          key={n.id}
                          onPress={() => {
                            setNarratorId(n.id)
                            setLook(n.look)
                          }}
                          className="w-32"
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        >
                          <View
                            className={`relative overflow-hidden rounded-[22px] border-2 bg-ticket p-1 ${selected ? "border-marigold" : "border-ink/10"}`}
                            style={selected ? CARD_SHADOW : undefined}
                          >
                            <Image source={n.photo} className="h-28 w-full rounded-[16px]" resizeMode="cover" />
                            {selected ? (
                              <View className="absolute left-2 top-2 -rotate-2 rounded-md bg-coral px-1.5 py-0.5">
                                <Text className={`${EYEBROW} text-ticket`}>On stage</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text className="mt-2 font-body-semibold text-sm text-ink">{n.name}</Text>
                          <Text className="text-xs text-ink-soft" numberOfLines={1}>
                            {n.look}
                          </Text>
                        </Pressable>
                      )
                    })}
                    <Pressable
                      onPress={() => router.push("/narrator")}
                      className="w-32"
                      accessibilityRole="button"
                      accessibilityLabel="Create a narrator"
                    >
                      <View className="h-[122px] items-center justify-center rounded-[22px] border-2 border-dashed border-ink/20 bg-ticket/60">
                        <Plus size={22} stroke="#6F6480" />
                        <Text className="mt-1 text-xs text-ink-soft">New narrator</Text>
                      </View>
                    </Pressable>
                  </HStack>
                </ScrollView>
                <Text className="text-[13px] leading-5 text-ink-soft">
                  {narrator.personality} · voice: {narrator.voice}
                </Text>
              </VStack>

              <VStack space="sm">
                <Eyebrow tone="soft">Art style</Eyebrow>
                <HStack space="sm" className="flex-wrap">
                  {LOOKS.map((l) => (
                    <Pressable
                      key={l}
                      onPress={() => setLook(l)}
                      className={`min-h-11 justify-center rounded-full px-4 ${l === look ? "bg-royal" : "border border-ink/20 bg-ticket"}`}
                    >
                      <Text className={`text-sm ${l === look ? "font-body-semibold text-ticket" : "text-ink"}`}>{l}</Text>
                    </Pressable>
                  ))}
                </HStack>
              </VStack>

              <VStack space="sm">
                <Eyebrow tone="soft">Narration</Eyebrow>
                <View className="overflow-hidden rounded-3xl bg-ticket" style={CARD_SHADOW}>
                  <Pressable
                    onPress={() => {
                      setLangQuery("")
                      setLangOpen(true)
                    }}
                    className="flex-row items-center justify-between p-4 active:bg-paper/60"
                    accessibilityRole="button"
                    accessibilityLabel="Choose narration language"
                  >
                    <VStack space="xs">
                      <Text className="text-[15px] font-body-bold text-ink">{languageOf(langCode).native}</Text>
                      <Text className="text-xs text-ink-soft">{languageOf(langCode).name} · {LANGUAGES.length} languages</Text>
                    </VStack>
                    <ChevronRight size={16} stroke="#5A4F66" />
                  </Pressable>
                  <View className="h-px bg-ink/10" />
                  <Pressable
                    onPress={() => setVoiceOpen(true)}
                    className="flex-row items-center justify-between p-4 active:bg-paper/60"
                    accessibilityRole="button"
                    accessibilityLabel="Choose narration voice"
                  >
                    <HStack space="sm" className="flex-1 items-center">
                      <View className="h-9 w-9 items-center justify-center rounded-full bg-paper">
                        <Mic size={15} stroke="#22319B" />
                      </View>
                      <VStack space="xs" className="flex-1 pr-2">
                        <Text className="text-[15px] font-body-bold text-ink">{voiceOf(voiceId).name}</Text>
                        <Text className="text-xs text-ink-soft" numberOfLines={1}>
                          {voiceOf(voiceId).description}
                        </Text>
                      </VStack>
                    </HStack>
                    <ChevronRight size={16} stroke="#5A4F66" />
                  </Pressable>
                </View>
              </VStack>

              <View className="rounded-3xl bg-ticket p-5" style={CARD_SHADOW}>
                <Eyebrow tone="soft">Show settings</Eyebrow>
                <HStack className="mt-3 justify-between">
                  <Text className="text-[15px] font-body-bold text-ink">Length</Text>
                  <Text className="text-xs text-ink-soft">up to {WALLET.maxMinutes} min on your plan</Text>
                </HStack>
                <HStack space="xs" className="mt-2">
                  {[1, 2, 3, 4, 5].map((m) => {
                    const disabled = m > WALLET.maxMinutes
                    const active = m === minutes
                    return (
                      <Pressable
                        key={m}
                        onPress={() => setMinutes(m)}
                        disabled={disabled}
                        className={`min-h-11 flex-1 items-center justify-center rounded-xl ${active ? "bg-marigold" : "bg-paper"} ${disabled ? "opacity-30" : ""}`}
                      >
                        <Text className={`font-body-bold text-base ${active ? "text-ink" : "text-ink-soft"}`}>{m}</Text>
                      </Pressable>
                    )
                  })}
                </HStack>
                <View className="my-3 h-px bg-ink/10" />
                <HStack className="justify-between">
                  <Text className="text-[15px] font-body-bold text-ink">Picture</Text>
                  <Text className="text-xs text-ink-soft">sharper costs double</Text>
                </HStack>
                <HStack space="xs" className="mt-2">
                  {(["480P", "768P"] as Resolution[]).map((r) => {
                    const active = r === resolution
                    return (
                      <Pressable
                        key={r}
                        onPress={() => setResolution(r)}
                        className={`min-h-11 flex-1 items-center justify-center rounded-xl ${active ? "bg-marigold" : "bg-paper"}`}
                      >
                        <Text className={`font-body-bold text-[13px] ${active ? "text-ink" : "text-ink-soft"}`}>
                          {r === "480P" ? "Standard" : "Sharper"}
                        </Text>
                      </Pressable>
                    )
                  })}
                </HStack>
              </View>

              <View className="relative">
                <LinearGradient colors={NOCTURNE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, flexDirection: "row", overflow: "hidden" }}>
                  <View className="flex-1 p-5">
                    <Eyebrow tone="marigold">Admit one</Eyebrow>
                    <Text className="mt-2 font-display text-xl leading-6 text-ticket">
                      {minutes} min · {resolution.toLowerCase()} · {narrator.name}
                    </Text>
                    <Text className="mt-1.5 text-[13px] leading-5 text-ticket/85">
                      {canAfford
                        ? `${credits - cost} ticket${credits - cost === 1 ? "" : "s"} stay in your book after the show.`
                        : minutes > WALLET.maxMinutes
                          ? "Longer shows need a Family ticket book."
                          : "Your book is short a ticket — top it up to start."}
                    </Text>
                    <View className="mt-4 flex-row items-end gap-[3px]">
                      {[3, 7, 4, 9, 3, 6, 10, 4, 7, 3, 8, 5, 9, 3].map((h, i) => (
                        <View key={i} className="w-[3px] rounded-sm bg-marigold/60" style={{ height: h * 2 }} />
                      ))}
                    </View>
                  </View>
                  <View
                    style={{ width: 0, borderLeftWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,249,240,0.35)", marginVertical: 16 }}
                  />
                  <View className="w-24 items-center justify-center p-3">
                    <Text className="font-display text-4xl text-marigold">{cost}</Text>
                    <Text className={`${EYEBROW} mt-1 text-ticket/60`}>{cost === 1 ? "ticket" : "tickets"}</Text>
                  </View>
                </LinearGradient>
                <View className="absolute h-6 w-6 rounded-full bg-paper" style={{ right: 84, top: -12 }} />
                <View className="absolute h-6 w-6 rounded-full bg-paper" style={{ right: 84, bottom: -12 }} />
              </View>
            </VStack>
          </Animated.View>
        </ScrollView>

        <Modal visible={voiceOpen} transparent animationType="slide" onRequestClose={() => setVoiceOpen(false)}>
          <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(10,14,36,0.55)" }}>
            <View className="max-h-[72%] rounded-t-3xl bg-paper px-5 pb-8 pt-4">
              <HStack className="items-center justify-between">
                <VStack space="xs">
                  <Eyebrow tone="soft">Narration voice</Eyebrow>
                  <Text className="font-display text-2xl text-ink">Who reads it aloud?</Text>
                </VStack>
                <Pressable
                  onPress={() => setVoiceOpen(false)}
                  className="h-11 w-11 items-center justify-center rounded-full bg-ticket"
                  accessibilityRole="button"
                  accessibilityLabel="Close voice picker"
                >
                  <X size={18} stroke="#1B1330" />
                </Pressable>
              </HStack>
              <FlatList
                className="mt-3"
                data={VOICES}
                keyExtractor={(v) => v.id}
                renderItem={({ item }) => {
                  const active = item.id === voiceId
                  return (
                    <Pressable
                      onPress={() => {
                        setVoiceId(item.id)
                        setVoiceOpen(false)
                      }}
                      className={`min-h-12 flex-row items-center justify-between rounded-xl px-3 py-2.5 ${active ? "bg-royal" : ""}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <HStack space="sm" className="flex-1 items-center">
                        <View className={`h-9 w-9 items-center justify-center rounded-full ${active ? "bg-ticket/15" : "bg-ticket"}`}>
                          <Mic size={15} stroke={active ? "#FFF9F0" : "#22319B"} />
                        </View>
                        <VStack space="xs" className="flex-1 pr-2">
                          <Text className={`text-[15px] font-body-semibold ${active ? "text-ticket" : "text-ink"}`}>{item.name}</Text>
                          <Text className={`text-xs ${active ? "text-ticket/70" : "text-ink-soft"}`} numberOfLines={1}>
                            {item.description}
                          </Text>
                        </VStack>
                      </HStack>
                      {active ? <Check size={16} stroke="#FFF9F0" /> : null}
                    </Pressable>
                  )
                }}
              />
            </View>
          </View>
        </Modal>

        <Modal visible={langOpen} transparent animationType="slide" onRequestClose={() => setLangOpen(false)}>
          <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(10,14,36,0.55)" }}>
            <View className="max-h-[82%] rounded-t-3xl bg-paper px-5 pb-8 pt-4">
              <HStack className="items-center justify-between">
                <VStack space="xs">
                  <Eyebrow tone="soft">Narration language</Eyebrow>
                  <Text className="font-display text-2xl text-ink">Who speaks tonight?</Text>
                </VStack>
                <Pressable
                  onPress={() => setLangOpen(false)}
                  className="h-11 w-11 items-center justify-center rounded-full bg-ticket"
                  accessibilityRole="button"
                  accessibilityLabel="Close language picker"
                >
                  <X size={18} stroke="#1B1330" />
                </Pressable>
              </HStack>
              <View className="mt-3 rounded-2xl border border-ink/25 bg-ticket px-4">
                <InputField value={langQuery} onChangeText={setLangQuery} placeholder="Search 74 languages" accessibilityLabel="Search languages" />
              </View>
              <FlatList
                className="mt-3"
                data={LANGUAGES.filter(
                  (l) => !langQuery.trim() || `${l.native} ${l.name} ${l.code}`.toLowerCase().includes(langQuery.trim().toLowerCase()),
                )}
                keyExtractor={(l) => l.code}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const active = item.code === langCode
                  return (
                    <Pressable
                      onPress={() => {
                        setLangCode(item.code)
                        setLangOpen(false)
                      }}
                      className={`min-h-12 flex-row items-center justify-between rounded-xl px-3 py-2.5 ${active ? "bg-royal" : ""}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <VStack space="xs">
                        <Text className={`text-[15px] font-body-semibold ${active ? "text-ticket" : "text-ink"}`}>{item.native}</Text>
                        <Text className={`text-xs ${active ? "text-ticket/70" : "text-ink-soft"}`}>{item.name}</Text>
                      </VStack>
                      {active ? <Check size={16} stroke="#FFF9F0" /> : null}
                    </Pressable>
                  )
                }}
              />
            </View>
          </View>
        </Modal>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink/10 bg-paper px-5 pb-8 pt-3">
          <GoldButton
            label="Make the film"
            disabled={!topic.trim() || !canAfford}
            onPress={() => {
              setGateError("")
              setGateAnswer("")
              setStep("gate")
            }}
            icon={<Ticket size={16} stroke="#1B1330" />}
          />
          <HStack space="xs" className="mt-2 items-center justify-center">
            <Lock size={11} stroke="#6F6480" />
            <Text className="text-[11px] text-ink-soft">A grown-up answers a quick question before the show starts.</Text>
          </HStack>
        </View>
      </View>
    )
  }

  /* ================================================
     FLOW: Make a Film
     SCREEN 2 of 4: Parental gate
     PLATFORM: React Native
     ------------------------------------------------
     ENTRY:  Composer "Make the film"
     EXIT:   Solved → Production; Cancel → Composer
     ================================================ */
  if (step === "gate") {
    return (
      <LinearGradient colors={NOCTURNE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <View className="absolute left-1/4 top-16 h-40 w-40 rounded-full border border-marigold/20" />
        <View className="absolute bottom-20 right-6 h-24 w-24 rounded-full border border-coral/25" />
        <View className="flex-1 justify-center p-6">
          <Animated.View entering={FadeIn.duration(350)}>
            <View className="rounded-3xl bg-ticket p-6" style={CARD_SHADOW}>
              <View className="-rotate-2 self-start rounded-md bg-coral px-2 py-1">
                <Text className={`${EYEBROW} text-ticket`}>For grown-ups</Text>
              </View>
              <Text className="mt-4 font-display text-[28px] leading-8 text-ink">One little question</Text>
              <Text className="mt-2 text-sm leading-5 text-ink-soft">
                To start tonight's show, what is <Text className="font-body-bold text-ink">8 × 4</Text>?
              </Text>
              <View className="mt-4 rounded-2xl border border-ink/25 bg-paper px-4">
                <InputField
                  value={gateAnswer}
                  onChangeText={setGateAnswer}
                  keyboardType="number-pad"
                  placeholder="Answer"
                  accessibilityLabel="Parental gate answer"
                />
              </View>
              {gateError ? <Text className="mt-2 text-sm text-red-700">{gateError}</Text> : null}
              <HStack space="sm" className="mt-5">
                <Button variant="outline" className="min-h-12 flex-1 rounded-2xl" onPress={() => setStep("compose")}>
                  <ButtonText>Cancel</ButtonText>
                </Button>
                <View className="flex-1">
                  <GoldButton
                    label="Start"
                    onPress={() => {
                      if (gateAnswer.trim() === "32") {
                        setStageIndex(0)
                        setStep("progress")
                      } else {
                        setGateError("That's not it — try again.")
                      }
                    }}
                  />
                </View>
              </HStack>
            </View>
          </Animated.View>
        </View>
      </LinearGradient>
    )
  }

  /* ================================================
     FLOW: Make a Film
     SCREEN 3 of 4: Production
     PLATFORM: React Native
     ------------------------------------------------
     ENTRY:  Parental gate solved
     EXIT:   All stages done → Result
     BRANCH: safe to leave; job continues (notifications)
     ================================================ */
  if (step === "progress") {
    const progress = Math.round(((stageIndex + 1) / STAGE_ORDER.length) * 100)
    return (
      <LinearGradient colors={NOCTURNE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <View className="absolute -right-10 top-1/3 h-52 w-52 rounded-full border border-marigold/15" />
        <View className="flex-1 px-6 pt-16">
          <Animated.View entering={FadeInDown.duration(420)}>
            <VStack space="lg">
              <HStack space="sm" className="items-center">
                <Image source={narrator.photo} className="h-14 w-14 rounded-full border-2 border-marigold" resizeMode="cover" />
                <VStack space="xs" className="flex-1">
                  <Eyebrow tone="marigold">Now rolling</Eyebrow>
                  <Text className="font-display text-2xl leading-7 text-ticket" numberOfLines={3}>
                    {title}
                  </Text>
                </VStack>
              </HStack>

              <HStack className="items-end justify-between">
                <Text className="font-display text-[56px] leading-[60px] text-marigold">{progress}%</Text>
                <Text className={`${EYEBROW} mb-2 text-ticket/50`}>In production</Text>
              </HStack>

              <View className="h-1.5 overflow-hidden rounded-full bg-ticket/15">
                <View className="h-full rounded-full bg-marigold" style={{ width: `${progress}%` }} />
              </View>

              <VStack space="xs">
                {STAGE_ORDER.map((stage, i) => {
                  const done = i < stageIndex
                  const active = i === stageIndex
                  return (
                    <View key={stage} className={`rounded-xl px-3 py-2.5 ${active ? "bg-ticket/10" : ""}`}>
                      <HStack space="sm" className="items-center">
                        <View className={`h-2.5 w-2.5 rounded-full ${done ? "bg-marigold" : active ? "bg-coral" : "bg-ticket/20"}`} />
                        <Text className={`flex-1 text-sm ${done ? "text-ticket/40" : active ? "font-body-bold text-ticket" : "text-ticket/30"}`}>
                          {STAGE_LABELS[stage]}
                        </Text>
                        {active ? <Spinner size="small" /> : done ? <Text className="text-[11px] font-body-bold text-marigold">done</Text> : null}
                      </HStack>
                    </View>
                  )
                })}
              </VStack>

              <Text className="text-xs leading-4 text-ticket/45">
                You can leave this screen — the film keeps going and we'll nudge you when it's ready.
              </Text>
            </VStack>
          </Animated.View>
        </View>
      </LinearGradient>
    )
  }

  /* ================================================
     FLOW: Make a Film
     SCREEN 4 of 4: Result
     PLATFORM: React Native
     ------------------------------------------------
     ENTRY:  Production completed
     EXIT:   Watch → player (Flow C); Make another → Composer
     ================================================ */
  return (
    <ScrollView className="flex-1 bg-paper" contentContainerClassName="px-5 pb-10 pt-16">
      <Animated.View entering={FadeInDown.duration(450)}>
        <VStack space="lg">
          <HStack className="items-center justify-between">
            <Eyebrow tone="soft">Now showing</Eyebrow>
            <View className="-rotate-2 rounded-md bg-coral px-2 py-1">
              <Text className={`${EYEBROW} text-ticket`}>Premiere</Text>
            </View>
          </HStack>

          <View className="overflow-hidden rounded-3xl bg-night" style={CARD_SHADOW}>
            <Image source={poster} className="aspect-[4/3] w-full" resizeMode="cover" />
            <LinearGradient
              colors={["transparent", "rgba(20,28,87,0.55)", "rgba(13,18,60,0.95)"]}
              locations={[0.35, 0.7, 1]}
              style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingBottom: 16, paddingTop: 48 }}
            >
              <Text className="font-display text-2xl leading-7 text-ticket" numberOfLines={2}>
                {title}
              </Text>
              <HStack className="mt-1 justify-between">
                <Text className="text-xs text-ticket/70">
                  {narrator.name} · {look}
                </Text>
                <Text className={`${EYEBROW} text-marigold`}>{minutes} min</Text>
              </HStack>
            </LinearGradient>
            <View className="absolute inset-0 items-center justify-center">
              <View
                className="rounded-full border-2 border-coral/70 bg-marigold p-5"
                style={{ shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}
              >
                <Play size={26} stroke="#1B1330" fill="#1B1330" />
              </View>
            </View>
          </View>

          <View className="flex-row overflow-hidden rounded-2xl border border-ink/10 bg-ticket" style={CARD_SHADOW}>
            <View className="flex-1 p-4">
              <Eyebrow tone="soft">Ticket used</Eyebrow>
              <Text className="mt-1.5 font-body-bold text-base text-ink">
                {cost} ticket{cost === 1 ? "" : "s"} · {credits - cost} left in your book
              </Text>
            </View>
          </View>

          <VStack space="sm">
            <GoldButton label="Watch now" onPress={() => router.push({ pathname: "/watch", params: { id: FILMS[0].id } })} icon={<Play size={15} stroke="#1B1330" fill="#1B1330" />} />
            <Button variant="outline" className="min-h-[54px] rounded-2xl" onPress={() => setStep("compose")}>
              <ButtonText>Make another</ButtonText>
            </Button>
          </VStack>
        </VStack>
      </Animated.View>
    </ScrollView>
  )
}
