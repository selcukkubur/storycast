import { useEffect, useMemo, useRef, useState } from "react"
import { ScrollView, TextInput as RNTextInput } from "react-native"
import { Play, Sparkles } from "lucide-react-native"
import { Box } from "@/components/ui/box"
import { VStack } from "@/components/ui/vstack"
import { HStack } from "@/components/ui/hstack"
import { Text } from "@/components/ui/text"
import { Button, ButtonText } from "@/components/ui/button"
import { Badge, BadgeText } from "@/components/ui/badge"
import { Input, InputField } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { NARRATORS, LOOKS, TOPIC_CHIPS, WALLET } from "@/src/flows/shared/mock-data"
import { STAGE_LABELS, STAGE_ORDER, creditsFor, type Resolution } from "@/src/flows/shared/types"

type Step = "compose" | "gate" | "progress" | "result"

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

  /* ================================================
     FLOW: Make a Film
     SCREEN 1 of 4: Composer
     PLATFORM: React Native (Expo + NativeWind + local Gluestack-style components)
     ------------------------------------------------
     ENTRY:  Create tab / Home hero "Start a story"
     EXIT:   "Make the film" → Parental gate
     BRANCH: cost > credits → paywall upsell note (Flow B)
     ================================================ */
  if (step === "compose") {
    return (
      <ScrollView className="flex-1 bg-white" contentContainerClassName="p-5 pb-10">
        <VStack space="lg">
          <HStack className="justify-between">
            <VStack space="xs">
              <Text className="text-2xl font-bold">Make a film</Text>
              <Text className="text-sm text-gray-500">Pick a topic, a narrator and a look.</Text>
            </VStack>
            <Badge action="warning">
              <BadgeText action="warning">{credits} credits</BadgeText>
            </Badge>
          </HStack>

          <VStack space="sm">
            <Text className="text-sm font-semibold text-gray-700">Topic</Text>
            <Input>
              <InputField
                value={topic}
                onChangeText={setTopic}
                placeholder="e.g. How do bees make honey?"
                accessibilityLabel="Film topic"
              />
            </Input>
            <HStack space="sm" className="flex-wrap">
              {TOPIC_CHIPS.map((chip) => (
                <Button key={chip} variant="outline" size="sm" onPress={() => setTopic(chip)}>
                  <ButtonText className="text-xs text-amber-700">{chip}</ButtonText>
                </Button>
              ))}
            </HStack>
          </VStack>

          <VStack space="sm">
            <Text className="text-sm font-semibold text-gray-700">Narrator</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <HStack space="sm">
                {NARRATORS.map((n) => {
                  const selected = n.id === narratorId
                  return (
                    <Button
                      key={n.id}
                      variant={selected ? "solid" : "outline"}
                      className="min-h-11 px-3"
                      onPress={() => {
                        setNarratorId(n.id)
                        setLook(n.look)
                      }}
                    >
                      <ButtonText className={selected ? "text-white" : "text-gray-700"}>{n.name}</ButtonText>
                    </Button>
                  )
                })}
              </HStack>
            </ScrollView>
            <HStack space="sm">
              <Badge action="info">
                <BadgeText action="info">{narrator.look}</BadgeText>
              </Badge>
              <Badge>
                <BadgeText>Voice · {narrator.voice}</BadgeText>
              </Badge>
            </HStack>
            <Text className="text-xs text-gray-500">{narrator.personality}</Text>
          </VStack>

          <VStack space="sm">
            <Text className="text-sm font-semibold text-gray-700">Look</Text>
            <HStack space="sm" className="flex-wrap">
              {LOOKS.map((l) => (
                <Button key={l} variant={l === look ? "solid" : "outline"} size="sm" onPress={() => setLook(l)}>
                  <ButtonText className={l === look ? "text-white text-xs" : "text-gray-700 text-xs"}>{l}</ButtonText>
                </Button>
              ))}
            </HStack>
          </VStack>

          <VStack space="sm">
            <HStack className="justify-between">
              <Text className="text-sm font-semibold text-gray-700">Length</Text>
              <Text className="text-xs text-gray-500">up to {WALLET.maxMinutes} min on your plan</Text>
            </HStack>
            <HStack space="sm">
              {[1, 2, 3, 4, 5].map((m) => {
                const disabled = m > WALLET.maxMinutes
                return (
                  <Button
                    key={m}
                    variant={m === minutes ? "solid" : "outline"}
                    size="sm"
                    isDisabled={disabled}
                    className="min-h-11 min-w-11 flex-1"
                    onPress={() => setMinutes(m)}
                  >
                    <ButtonText className={m === minutes ? "text-white" : "text-gray-700"}>{m}</ButtonText>
                  </Button>
                )
              })}
            </HStack>
          </VStack>

          <VStack space="sm">
            <Text className="text-sm font-semibold text-gray-700">Quality</Text>
            <HStack space="sm">
              {(["480P", "768P"] as Resolution[]).map((r) => (
                <Button
                  key={r}
                  variant={r === resolution ? "solid" : "outline"}
                  size="sm"
                  className="min-h-11 flex-1"
                  onPress={() => setResolution(r)}
                >
                  <ButtonText className={r === resolution ? "text-white" : "text-gray-700"}>
                    {r === "480P" ? "480P · standard" : "768P · sharper (2× credits)"}
                  </ButtonText>
                </Button>
              ))}
            </HStack>
          </VStack>

          <Box className="rounded-xl bg-amber-50 p-4">
            <HStack className="justify-between">
              <Text className="text-sm text-amber-800">
                {minutes} min · {resolution} · {narrator.name}
              </Text>
              <Text className="text-sm font-bold text-amber-800">
                {cost} credit{cost === 1 ? "" : "s"}
              </Text>
            </HStack>
            <Text className="mt-1 text-xs text-amber-700">
              {canAfford
                ? `${credits - cost} credit${credits - cost === 1 ? "" : "s"} left after this film`
                : minutes > WALLET.maxMinutes
                  ? "This length needs a bigger plan — see Family."
                  : "Not enough credits — top up or upgrade."}
            </Text>
          </Box>

          <Button
            isDisabled={!topic.trim() || !canAfford}
            onPress={() => {
              setGateError("")
              setGateAnswer("")
              setStep("gate")
            }}
          >
            <ButtonText>Make the film</ButtonText>
          </Button>
        </VStack>
      </ScrollView>
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
      <Box className="flex-1 justify-center bg-white p-6">
        <VStack space="md">
          <Text className="text-xl font-bold">Ask a grown-up</Text>
          <Text className="text-sm text-gray-600">To start a film, solve this: what is 8 × 4?</Text>
          <Input>
            <InputField
              value={gateAnswer}
              onChangeText={setGateAnswer}
              keyboardType="number-pad"
              placeholder="Answer"
              accessibilityLabel="Parental gate answer"
            />
          </Input>
          {gateError ? <Text className="text-sm text-red-600">{gateError}</Text> : null}
          <HStack space="sm">
            <Button variant="outline" className="min-h-11 flex-1" onPress={() => setStep("compose")}>
              <ButtonText className="text-gray-700">Cancel</ButtonText>
            </Button>
            <Button
              className="min-h-11 flex-1"
              onPress={() => {
                if (gateAnswer.trim() === "32") {
                  setStageIndex(0)
                  setStep("progress")
                } else {
                  setGateError("That is not right — try again.")
                }
              }}
            >
              <ButtonText>Confirm</ButtonText>
            </Button>
          </HStack>
        </VStack>
      </Box>
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
    return (
      <Box className="flex-1 justify-center bg-white p-6">
        <VStack space="lg">
          <HStack space="sm">
            <Spinner />
            <Text className="text-lg font-bold">Making "{topic.trim() || "your film"}"</Text>
          </HStack>
          <Text className="text-xs text-gray-500">
            {stageIndex + 1} of {STAGE_ORDER.length} · safe to leave this screen, the film keeps going
          </Text>
          <VStack space="sm">
            {STAGE_ORDER.map((stage, i) => {
              const done = i < stageIndex
              const active = i === stageIndex
              return (
                <HStack key={stage} space="sm" className="rounded-lg px-3 py-2" style={active ? { backgroundColor: "#fffbeb" } : undefined}>
                  <Box className={`h-2.5 w-2.5 rounded-full ${done ? "bg-emerald-500" : active ? "bg-amber-500" : "bg-gray-200"}`} />
                  <Text className={done ? "text-sm text-gray-400" : active ? "text-sm font-semibold text-amber-700" : "text-sm text-gray-400"}>
                    {STAGE_LABELS[stage]}
                    {done ? "  ✓" : active ? "  …" : ""}
                  </Text>
                </HStack>
              )
            })}
          </VStack>
        </VStack>
      </Box>
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
    <Box className="flex-1 justify-center bg-white p-6">
      <VStack space="lg">
        <Box className="items-center rounded-2xl bg-gray-900 p-8">
          <Play size={40} color="#f59e0b" />
          <Text className="mt-3 text-center text-lg font-bold text-white">{topic.trim() || "Your first story"}</Text>
          <Text className="text-xs text-gray-300">
            {narrator.name} · {look} · {minutes} min
          </Text>
        </Box>
        <HStack className="justify-between">
          <Badge action="success">
            <BadgeText action="success">Film ready</BadgeText>
          </Badge>
          <Text className="text-sm text-gray-600">Spent {cost} credits</Text>
        </HStack>
        <Button onPress={() => setStep("compose")} className="min-h-11">
          <ButtonText>Watch now</ButtonText>
        </Button>
        <Button variant="outline" className="min-h-11" onPress={() => setStep("compose")}>
          <ButtonText className="text-gray-700">Make another</ButtonText>
        </Button>
      </VStack>
    </Box>
  )
}
