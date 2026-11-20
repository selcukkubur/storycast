import { useEffect, useMemo, useRef, useState } from "react"
import { Image, Pressable, ScrollView, View } from "react-native"
import { Play, Ticket } from "lucide-react-native"
import { Box } from "@/components/ui/box"
import { VStack } from "@/components/ui/vstack"
import { HStack } from "@/components/ui/hstack"
import { Text } from "@/components/ui/text"
import { Button, ButtonText } from "@/components/ui/button"
import { InputField } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { NARRATORS, LOOKS, TOPIC_CHIPS, WALLET, FILMS } from "@/src/flows/shared/mock-data"
import { STAGE_LABELS, STAGE_ORDER, creditsFor, type Resolution } from "@/src/flows/shared/types"

type Step = "compose" | "gate" | "progress" | "result"

const EYEBROW = "font-body-semibold text-[11px] uppercase tracking-[2px]"

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
        <ScrollView contentContainerClassName="pb-48">
          <View className="rounded-b-[32px] bg-curtain px-5 pb-6 pt-16">
            <HStack className="items-start justify-between">
              <VStack space="xs">
                <Text className={`${EYEBROW} text-brass`}>Little picture house</Text>
                <Text className="font-display text-3xl text-ticket">Make a film</Text>
              </VStack>
              <View className="flex-row items-center gap-1.5 rounded-full border border-brass/50 bg-ticket/10 px-3 py-1.5">
                <Ticket size={14} stroke="#D9A441" />
                <Text className="font-body-bold text-xs text-brass">{credits} tickets</Text>
              </View>
            </HStack>
            <Text className="mt-2 text-sm leading-5 text-ticket/70">
              {narrator.name} tells tonight's story in {narrator.look.toLowerCase()}.
            </Text>
          </View>

          <VStack space="lg" className="px-5 pt-6">
            <VStack space="sm">
              <Text className={`${EYEBROW} text-ink-soft`}>Tonight's topic</Text>
              <View className="rounded-2xl border border-ink/10 bg-ticket px-4">
                <InputField
                  value={topic}
                  onChangeText={setTopic}
                  placeholder="e.g. How do bees make honey?"
                  accessibilityLabel="Film topic"
                />
              </View>
              <HStack space="sm" className="flex-wrap">
                {TOPIC_CHIPS.map((chip) => (
                  <Pressable
                    key={chip}
                    onPress={() => setTopic(chip)}
                    className="min-h-11 justify-center rounded-full border border-ink/15 bg-ticket px-3 active:bg-paper"
                  >
                    <Text className="text-xs text-ink">{chip}</Text>
                  </Pressable>
                ))}
              </HStack>
            </VStack>

            <VStack space="sm">
              <Text className={`${EYEBROW} text-ink-soft`}>The cast</Text>
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
                        className="w-28"
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <View
                          className={`rounded-2xl border-2 p-1 ${selected ? "border-brass" : "border-transparent"}`}
                          style={selected ? { backgroundColor: "#FBF7EC" } : undefined}
                        >
                          <Image source={n.photo} className="h-24 w-24 rounded-xl" resizeMode="cover" />
                        </View>
                        <Text className="mt-1.5 font-body-semibold text-sm text-ink">{n.name}</Text>
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
              <Text className={`${EYEBROW} text-ink-soft`}>Art style</Text>
              <HStack space="sm" className="flex-wrap">
                {LOOKS.map((l) => (
                  <Pressable
                    key={l}
                    onPress={() => setLook(l)}
                    className={`min-h-11 justify-center rounded-full px-3 ${l === look ? "bg-ink" : "border border-ink/15 bg-ticket"}`}
                  >
                    <Text className={`text-xs ${l === look ? "text-ticket" : "text-ink"}`}>{l}</Text>
                  </Pressable>
                ))}
              </HStack>
            </VStack>

            <VStack space="sm">
              <Text className={`${EYEBROW} text-ink-soft`}>Show settings</Text>
              <View className="rounded-2xl border border-ink/10 bg-ticket p-4" style={{ gap: 14 }}>
                <VStack space="xs">
                  <HStack className="justify-between">
                    <Text className="text-sm font-body-semibold text-ink">Length</Text>
                    <Text className="text-xs text-ink-soft">up to {WALLET.maxMinutes} min on your plan</Text>
                  </HStack>
                  <HStack space="xs">
                    {[1, 2, 3, 4, 5].map((m) => {
                      const disabled = m > WALLET.maxMinutes
                      const active = m === minutes
                      return (
                        <Pressable
                          key={m}
                          onPress={() => setMinutes(m)}
                          disabled={disabled}
                          className={`min-h-11 flex-1 items-center justify-center rounded-xl ${active ? "bg-brass" : "bg-paper"} ${disabled ? "opacity-35" : ""}`}
                        >
                          <Text className={`font-body-bold text-sm ${active ? "text-ink" : "text-ink-soft"}`}>{m}</Text>
                        </Pressable>
                      )
                    })}
                  </HStack>
                </VStack>
                <View className="h-px bg-ink/10" />
                <VStack space="xs">
                  <Text className="text-sm font-body-semibold text-ink">Picture</Text>
                  <HStack space="xs">
                    {(["480P", "768P"] as Resolution[]).map((r) => {
                      const active = r === resolution
                      return (
                        <Pressable
                          key={r}
                          onPress={() => setResolution(r)}
                          className={`min-h-11 flex-1 items-center justify-center rounded-xl ${active ? "bg-brass" : "bg-paper"}`}
                        >
                          <Text className={`font-body-bold text-xs ${active ? "text-ink" : "text-ink-soft"}`}>
                            {r === "480P" ? "Standard" : "Sharper · 2× tickets"}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </HStack>
                </VStack>
              </View>
            </VStack>

            <View className="flex-row overflow-hidden rounded-2xl bg-curtain">
              <View className="flex-1 p-4">
                <Text className={`${EYEBROW} text-brass`}>Tonight's stub</Text>
                <Text className="mt-1 font-body-bold text-base text-ticket">
                  {minutes} min · {resolution.toLowerCase()} · {narrator.name}
                </Text>
                <Text className="mt-1.5 text-xs leading-4 text-ticket/70">
                  {canAfford
                    ? `${credits - cost} ticket${credits - cost === 1 ? "" : "s"} stay in your book after the show.`
                    : minutes > WALLET.maxMinutes
                      ? "Longer shows need a Family ticket book."
                      : "Your book is short a ticket — top it up to start."}
                </Text>
              </View>
              <View style={{ width: 0, borderLeftWidth: 1, borderStyle: "dashed", borderColor: "rgba(251,247,236,0.35)", marginVertical: 14 }} />
              <View className="w-24 items-center justify-center p-3">
                <Text className="font-display text-3xl text-brass">{cost}</Text>
                <Text className={`${EYEBROW} text-ticket/60`}>{cost === 1 ? "ticket" : "tickets"}</Text>
              </View>
            </View>
          </VStack>
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink/10 bg-paper px-5 pb-8 pt-3">
          <Button
            className="min-h-12 rounded-2xl"
            isDisabled={!topic.trim() || !canAfford}
            onPress={() => {
              setGateError("")
              setGateAnswer("")
              setStep("gate")
            }}
          >
            <ButtonText>Make the film</ButtonText>
          </Button>
          <Text className="mt-2 text-center text-[11px] text-ink-soft">
            A grown-up answers a quick question before the show starts.
          </Text>
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
        <View className="rounded-3xl bg-ticket p-6" style={{ gap: 14 }}>
          <Text className={`${EYEBROW} text-brass`}>Grown-ups only</Text>
          <Text className="font-display text-2xl text-ink">Quick question</Text>
          <Text className="text-sm leading-5 text-ink-soft">
            To start tonight's show, what is <Text className="font-body-bold text-ink">8 × 4</Text>?
          </Text>
          <View className="rounded-2xl border border-ink/10 bg-paper px-4">
            <InputField
              value={gateAnswer}
              onChangeText={setGateAnswer}
              keyboardType="number-pad"
              placeholder="Answer"
              accessibilityLabel="Parental gate answer"
            />
          </View>
          {gateError ? <Text className="text-sm text-red-700">{gateError}</Text> : null}
          <HStack space="sm">
            <Button variant="outline" className="min-h-12 flex-1 rounded-2xl" onPress={() => setStep("compose")}>
              <ButtonText>Cancel</ButtonText>
            </Button>
            <Button
              className="min-h-12 flex-1 rounded-2xl"
              onPress={() => {
                if (gateAnswer.trim() === "32") {
                  setStageIndex(0)
                  setStep("progress")
                } else {
                  setGateError("That's not it — try again.")
                }
              }}
            >
              <ButtonText>Start the show</ButtonText>
            </Button>
          </HStack>
        </View>
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
        <VStack space="lg">
          <HStack space="sm" className="items-center">
            <Image source={narrator.photo} className="h-14 w-14 rounded-full border-2 border-brass" resizeMode="cover" />
            <VStack space="xs" className="flex-1">
              <Text className={`${EYEBROW} text-brass`}>Now rolling</Text>
              <Text className="font-display text-2xl leading-7 text-ticket" numberOfLines={3}>
                {title}
              </Text>
            </VStack>
          </HStack>

          <VStack space="xs">
            <View className="h-1.5 overflow-hidden rounded-full bg-ticket/15">
              <View className="h-full rounded-full bg-brass" style={{ width: `${progress}%` }} />
            </View>
            <HStack className="justify-between">
              <Text className="text-[11px] text-ticket/60">
                Stage {stageIndex + 1} of {STAGE_ORDER.length}
              </Text>
              <Text className="text-[11px] text-ticket/60">{progress}%</Text>
            </HStack>
          </VStack>

          <VStack space="sm">
            {STAGE_ORDER.map((stage, i) => {
              const done = i < stageIndex
              const active = i === stageIndex
              return (
                <HStack key={stage} space="sm" className="items-center">
                  <View className={`h-2.5 w-2.5 rounded-full ${done ? "bg-brass" : active ? "bg-brass/80" : "bg-ticket/20"}`} />
                  <Text
                    className={`text-sm ${done ? "text-ticket/45" : active ? "font-body-bold text-ticket" : "text-ticket/35"}`}
                  >
                    {STAGE_LABELS[stage]}
                  </Text>
                  {active ? <Spinner size="small" /> : null}
                </HStack>
              )
            })}
          </VStack>

          <Text className="text-xs leading-4 text-ticket/50">
            You can leave this screen — the film keeps going and we'll nudge you when it's ready.
          </Text>
        </VStack>
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
    <View className="flex-1 bg-paper px-5 pt-16">
      <VStack space="lg">
        <VStack space="xs">
          <Text className={`${EYEBROW} text-ink-soft`}>Now showing</Text>
          <Text className="font-display text-3xl leading-9 text-ink" numberOfLines={3}>
            {title}
          </Text>
          <Text className="text-sm text-ink-soft">
            {narrator.name} · {look} · {minutes} min
          </Text>
        </VStack>

        <View className="overflow-hidden rounded-3xl">
          <Image source={poster} className="aspect-[16/10] w-full" resizeMode="cover" />
          <View className="absolute inset-0 items-center justify-center bg-curtain/25">
            <View className="rounded-full bg-brass p-4">
              <Play size={26} stroke="#241B17" fill="#241B17" />
            </View>
          </View>
        </View>

        <View className="flex-row overflow-hidden rounded-2xl border border-ink/10 bg-ticket">
          <View className="flex-1 p-4">
            <Text className={`${EYEBROW} text-ink-soft`}>Ticket used</Text>
            <Text className="mt-1 font-body-bold text-base text-ink">
              {cost} ticket{cost === 1 ? "" : "s"} · {credits - cost} left in your book
            </Text>
          </View>
        </View>

        <VStack space="sm">
          <Button className="min-h-12 rounded-2xl">
            <ButtonText>Watch now</ButtonText>
          </Button>
          <Button variant="outline" className="min-h-12 rounded-2xl" onPress={() => setStep("compose")}>
            <ButtonText>Make another</ButtonText>
          </Button>
        </VStack>
      </VStack>
    </View>
  )
}
