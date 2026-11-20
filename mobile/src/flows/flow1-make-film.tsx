import { useEffect, useMemo, useRef, useState } from "react"
import { Image, Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated"
import { Lock, Play, Ticket } from "lucide-react-native"
import { VStack } from "@/components/ui/vstack"
import { HStack } from "@/components/ui/hstack"
import { Text } from "@/components/ui/text"
import { Button, ButtonText } from "@/components/ui/button"
import { InputField } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { NARRATORS, LOOKS, TOPIC_CHIPS, WALLET, FILMS } from "@/src/flows/shared/mock-data"
import { STAGE_LABELS, STAGE_ORDER, creditsFor, type Resolution } from "@/src/flows/shared/types"

type Step = "compose" | "gate" | "progress" | "result"

const EYEBROW = "font-body-semibold text-[10px] uppercase tracking-[2.5px]"
const CARD_SHADOW = {
  shadowColor: "#241B17",
  shadowOpacity: 0.12,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 12 },
  elevation: 6,
} as const

function Eyebrow({ children, tone = "brass" }: { children: string; tone?: "brass" | "soft" | "ticket" }) {
  const color = tone === "brass" ? "text-brass" : tone === "ticket" ? "text-ticket/60" : "text-ink-soft"
  const rule = tone === "brass" ? "#D9A441" : tone === "ticket" ? "#FBF7EC88" : "#6B5E55"
  return (
    <HStack space="xs" className="items-center">
      <View style={{ height: 2, width: 16, backgroundColor: rule, opacity: 0.6 }} />
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
      style={disabled ? undefined : { shadowColor: "#8A6118", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }}
    >
      <LinearGradient
        colors={["#EDBD5B", "#C9902F"]}
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
          <View className="rounded-b-[40px] bg-curtain px-5 pb-24 pt-16">
            <View className="absolute -bottom-20 -right-14 h-56 w-56 rounded-full border border-brass/20" />
            <View className="absolute -bottom-10 right-10 h-24 w-24 rounded-full border border-brass/15" />
            <View className="absolute left-6 top-12 h-1.5 w-1.5 rounded-full bg-brass/70" />
            <View className="absolute left-24 top-20 h-1 w-1 rounded-full bg-brass/40" />
            <View className="absolute right-24 top-10 h-1 w-1 rounded-full bg-brass/50" />

            <Eyebrow tone="brass">Little picture house</Eyebrow>
            <Text className="mt-2 font-display text-[40px] leading-[46px] text-ticket">
              Make a <Text className="font-display-italic text-brass">film.</Text>
            </Text>
            <Text className="mt-2 max-w-[78%] text-sm leading-5 text-ticket/70">
              {narrator.name} tells tonight's story in {narrator.look.toLowerCase()}.
            </Text>

            <View
              className="absolute right-4 top-14 -rotate-3 rounded-xl bg-brass px-3 py-2"
              style={{ shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
            >
              <HStack space="xs" className="items-center">
                <Ticket size={13} stroke="#241B17" />
                <Text className={`${EYEBROW} text-ink`}>{credits} tickets</Text>
              </HStack>
            </View>
          </View>

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
                      className="min-h-11 justify-center rounded-full border border-ink/10 bg-paper px-3 active:bg-ticket"
                    >
                      <Text className="text-xs text-ink">{chip}</Text>
                    </Pressable>
                  ))}
                </HStack>
              </View>

              <VStack space="sm">
                <HStack className="items-center justify-between">
                  <Eyebrow tone="soft">The cast</Eyebrow>
                  <Text className="text-[11px] text-ink-soft">50 narrators</Text>
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
                            className={`relative overflow-hidden rounded-[22px] border-2 bg-ticket p-1 ${selected ? "border-brass" : "border-ink/10"}`}
                            style={selected ? CARD_SHADOW : undefined}
                          >
                            <Image source={n.photo} className="h-28 w-full rounded-[16px]" resizeMode="cover" />
                            {selected ? (
                              <View className="absolute left-2 top-2 -rotate-2 rounded-md bg-brass px-1.5 py-0.5">
                                <Text className={`${EYEBROW} text-ink`}>On stage</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text className="mt-2 font-body-semibold text-sm text-ink">{n.name}</Text>
                          <Text className="text-[11px] text-ink-soft" numberOfLines={1}>
                            {n.look}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </HStack>
                </ScrollView>
                <Text className="text-xs leading-4 text-ink-soft">
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
                      className={`min-h-11 justify-center rounded-full px-3.5 ${l === look ? "bg-ink" : "border border-ink/10 bg-ticket"}`}
                    >
                      <Text className={`text-xs ${l === look ? "font-body-semibold text-ticket" : "text-ink"}`}>{l}</Text>
                    </Pressable>
                  ))}
                </HStack>
              </VStack>

              <View className="rounded-3xl bg-ticket p-5" style={CARD_SHADOW}>
                <Eyebrow tone="soft">Show settings</Eyebrow>
                <HStack className="mt-3 justify-between">
                  <Text className="text-sm font-body-semibold text-ink">Length</Text>
                  <Text className="text-[11px] text-ink-soft">up to {WALLET.maxMinutes} min on your plan</Text>
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
                        className={`min-h-11 flex-1 items-center justify-center rounded-xl ${active ? "bg-brass" : "bg-paper"} ${disabled ? "opacity-30" : ""}`}
                      >
                        <Text className={`font-body-bold text-sm ${active ? "text-ink" : "text-ink-soft"}`}>{m}</Text>
                      </Pressable>
                    )
                  })}
                </HStack>
                <View className="my-3 h-px bg-ink/10" />
                <HStack className="justify-between">
                  <Text className="text-sm font-body-semibold text-ink">Picture</Text>
                  <Text className="text-[11px] text-ink-soft">sharper costs double</Text>
                </HStack>
                <HStack space="xs" className="mt-2">
                  {(["480P", "768P"] as Resolution[]).map((r) => {
                    const active = r === resolution
                    return (
                      <Pressable
                        key={r}
                        onPress={() => setResolution(r)}
                        className={`min-h-11 flex-1 items-center justify-center rounded-xl ${active ? "bg-brass" : "bg-paper"}`}
                      >
                        <Text className={`font-body-bold text-xs ${active ? "text-ink" : "text-ink-soft"}`}>
                          {r === "480P" ? "Standard" : "Sharper"}
                        </Text>
                      </Pressable>
                    )
                  })}
                </HStack>
              </View>

              <View className="flex-row overflow-hidden rounded-3xl bg-curtain" style={CARD_SHADOW}>
                <View className="flex-1 p-5">
                  <Eyebrow tone="brass">Admit one</Eyebrow>
                  <Text className="mt-2 font-display text-xl leading-6 text-ticket">
                    {minutes} min · {resolution.toLowerCase()} · {narrator.name}
                  </Text>
                  <Text className="mt-1.5 text-xs leading-4 text-ticket/65">
                    {canAfford
                      ? `${credits - cost} ticket${credits - cost === 1 ? "" : "s"} stay in your book after the show.`
                      : minutes > WALLET.maxMinutes
                        ? "Longer shows need a Family ticket book."
                        : "Your book is short a ticket — top it up to start."}
                  </Text>
                  <View className="mt-4 flex-row items-end gap-[3px]">
                    {[3, 7, 4, 9, 3, 6, 10, 4, 7, 3, 8, 5, 9, 3].map((h, i) => (
                      <View key={i} className="w-[3px] rounded-sm bg-brass/50" style={{ height: h * 2 }} />
                    ))}
                  </View>
                </View>
                <View
                  style={{ width: 0, borderLeftWidth: 1, borderStyle: "dashed", borderColor: "rgba(251,247,236,0.3)", marginVertical: 16 }}
                />
                <View className="w-24 items-center justify-center p-3">
                  <Text className="font-display text-4xl text-brass">{cost}</Text>
                  <Text className={`${EYEBROW} mt-1 text-ticket/60`}>{cost === 1 ? "ticket" : "tickets"}</Text>
                </View>
                <View className="absolute h-6 w-6 rounded-full bg-paper" style={{ right: 84, top: -12 }} />
                <View className="absolute h-6 w-6 rounded-full bg-paper" style={{ right: 84, bottom: -12 }} />
              </View>
            </VStack>
          </Animated.View>
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink/10 bg-paper px-5 pb-8 pt-3">
          <GoldButton
            label="Make the film"
            disabled={!topic.trim() || !canAfford}
            onPress={() => {
              setGateError("")
              setGateAnswer("")
              setStep("gate")
            }}
            icon={<Ticket size={16} stroke="#241B17" />}
          />
          <HStack space="xs" className="mt-2 items-center justify-center">
            <Lock size={11} stroke="#6B5E55" />
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
      <View className="flex-1 justify-center bg-curtain p-6">
        <View className="absolute left-1/4 top-16 h-40 w-40 rounded-full border border-brass/15" />
        <View className="absolute bottom-20 right-6 h-24 w-24 rounded-full border border-brass/10" />
        <Animated.View entering={FadeIn.duration(350)}>
          <View className="rounded-3xl bg-ticket p-6" style={CARD_SHADOW}>
            <View className="-rotate-2 self-start rounded-md bg-brass px-2 py-1">
              <Text className={`${EYEBROW} text-ink`}>For grown-ups</Text>
            </View>
            <Text className="mt-4 font-display text-[28px] leading-8 text-ink">One little question</Text>
            <Text className="mt-2 text-sm leading-5 text-ink-soft">
              To start tonight's show, what is <Text className="font-body-bold text-ink">8 × 4</Text>?
            </Text>
            <View className="mt-4 rounded-2xl border border-ink/10 bg-paper px-4">
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
      <View className="flex-1 bg-curtain px-6 pt-16">
        <Animated.View entering={FadeInDown.duration(420)}>
          <VStack space="lg">
            <HStack space="sm" className="items-center">
              <Image source={narrator.photo} className="h-14 w-14 rounded-full border-2 border-brass" resizeMode="cover" />
              <VStack space="xs" className="flex-1">
                <Eyebrow tone="brass">Now rolling</Eyebrow>
                <Text className="font-display text-2xl leading-7 text-ticket" numberOfLines={3}>
                  {title}
                </Text>
              </VStack>
            </HStack>

            <HStack className="items-end justify-between">
              <Text className="font-display text-[56px] leading-[60px] text-brass">{progress}%</Text>
              <Text className={`${EYEBROW} mb-2 text-ticket/50`}>In production</Text>
            </HStack>

            <View className="h-1.5 overflow-hidden rounded-full bg-ticket/15">
              <View className="h-full rounded-full bg-brass" style={{ width: `${progress}%` }} />
            </View>

            <VStack space="xs">
              {STAGE_ORDER.map((stage, i) => {
                const done = i < stageIndex
                const active = i === stageIndex
                return (
                  <View key={stage} className={`rounded-xl px-3 py-2.5 ${active ? "bg-ticket/10" : ""}`}>
                    <HStack space="sm" className="items-center">
                      <View className={`h-2.5 w-2.5 rounded-full ${done ? "bg-brass" : active ? "bg-brass/80" : "bg-ticket/20"}`} />
                      <Text className={`flex-1 text-sm ${done ? "text-ticket/40" : active ? "font-body-bold text-ticket" : "text-ticket/30"}`}>
                        {STAGE_LABELS[stage]}
                      </Text>
                      {active ? <Spinner size="small" /> : done ? <Text className="text-[10px] text-brass">done</Text> : null}
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
            <View className="-rotate-2 rounded-md bg-brass px-2 py-1">
              <Text className={`${EYEBROW} text-ink`}>Premiere</Text>
            </View>
          </HStack>

          <View className="overflow-hidden rounded-3xl bg-ink" style={CARD_SHADOW}>
            <Image source={poster} className="aspect-[4/3] w-full" resizeMode="cover" />
            <LinearGradient
              colors={["transparent", "rgba(36,27,23,0.55)", "rgba(36,27,23,0.92)"]}
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
                <Text className={`${EYEBROW} text-brass`}>{minutes} min</Text>
              </HStack>
            </LinearGradient>
            <View className="absolute inset-0 items-center justify-center">
              <View
                className="rounded-full bg-brass p-5"
                style={{ shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }}
              >
                <Play size={26} stroke="#241B17" fill="#241B17" />
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
            <GoldButton label="Watch now" onPress={() => {}} icon={<Play size={15} stroke="#241B17" fill="#241B17" />} />
            <Button variant="outline" className="min-h-[54px] rounded-2xl" onPress={() => setStep("compose")}>
              <ButtonText>Make another</ButtonText>
            </Button>
          </VStack>
        </VStack>
      </Animated.View>
    </ScrollView>
  )
}
