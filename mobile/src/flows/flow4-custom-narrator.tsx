import { useEffect, useState } from "react"
import { Image, Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated"
import { router } from "expo-router"
import { Camera, Check, RefreshCw, Sparkles, Ticket, UserRound } from "lucide-react-native"
import { VStack } from "@/components/ui/vstack"
import { HStack } from "@/components/ui/hstack"
import { Text } from "@/components/ui/text"
import { Button, ButtonText } from "@/components/ui/button"
import { InputField } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { NARRATORS } from "@/src/flows/shared/mock-data"

type Step = "compose" | "generating" | "review"
type Mode = "invent" | "upload"

const EYEBROW = "font-body-semibold text-[10px] uppercase tracking-[2.5px]"
const NOCTURNE: readonly [string, string] = ["#2A3BC0", "#131A4E"]
const CARD_SHADOW = {
  shadowColor: "#1B1330",
  shadowOpacity: 0.14,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 14 },
  elevation: 7,
} as const

const TRAITS = ["curious", "gentle", "funny", "wise", "bold", "cozy"]

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

/* ================================================
   FLOW: Create a Narrator
   SCREENS 1-3: Compose → Generating → Review
   PLATFORM: React Native (Expo + NativeWind + local Gluestack-style components)
   ENTRY:  Create tab cast row "+ New"
   EXIT:   ✅ saved to cast (back to composer) · ❌ retry, no ticket charged · ↩ nothing saved
   ================================================ */
export default function CustomNarratorFlow() {
  const [step, setStep] = useState<Step>("compose")
  const [mode, setMode] = useState<Mode>("invent")
  const [name, setName] = useState("")
  const [traits, setTraits] = useState<string[]>(["curious"])
  const [uploaded, setUploaded] = useState(false)
  const [sheetReady, setSheetReady] = useState(false)
  const [heroReady, setHeroReady] = useState(false)

  useEffect(() => {
    if (step !== "generating") return
    const a = setTimeout(() => setSheetReady(true), 1300)
    const b = setTimeout(() => setHeroReady(true), 2400)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [step])

  useEffect(() => {
    if (step === "generating" && sheetReady && heroReady) {
      const t = setTimeout(() => setStep("review"), 500)
      return () => clearTimeout(t)
    }
  }, [step, sheetReady, heroReady])

  const canCreate = mode === "upload" ? uploaded : name.trim().length > 1

  /* SCREEN 1 — Compose */
  if (step === "compose") {
    return (
      <View className="flex-1 bg-paper">
        <ScrollView contentContainerClassName="pb-12">
          <LinearGradient colors={NOCTURNE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 44, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
            <View className="absolute -right-10 top-6 h-40 w-40 rounded-full border border-marigold/20" />
            <HStack className="justify-between">
              <VStack space="xs">
                <Text className={`${EYEBROW} text-marigold`}>New cast member</Text>
                <Text className="font-display text-[34px] leading-[40px] text-ticket">
                  Invent a <Text className="font-display-italic text-marigold">narrator.</Text>
                </Text>
              </VStack>
              <View className="-rotate-2 self-start rounded-md bg-coral px-2 py-1">
                <Text className={`${EYEBROW} text-ticket`}>Family</Text>
              </View>
            </HStack>
            <Text className="mt-2 max-w-[82%] text-sm leading-5 text-ticket/70">
              We draw a model sheet and a portrait, then keep them for every future film.
            </Text>
          </LinearGradient>

          <Animated.View entering={FadeInDown.duration(420)}>
            <VStack space="lg" className="-mt-6 px-5">
              <View className="flex-row rounded-full bg-ticket p-1" style={CARD_SHADOW}>
                {[
                  { key: "invent" as Mode, label: "Invent one" },
                  { key: "upload" as Mode, label: "From a photo" },
                ].map((o) => (
                  <Pressable
                    key={o.key}
                    onPress={() => setMode(o.key)}
                    className={`min-h-11 flex-1 items-center justify-center rounded-full ${mode === o.key ? "bg-royal" : ""}`}
                  >
                    <Text className={`text-xs font-body-bold ${mode === o.key ? "text-ticket" : "text-ink-soft"}`}>{o.label}</Text>
                  </Pressable>
                ))}
              </View>

              {mode === "invent" ? (
                <View className="rounded-3xl bg-ticket p-5" style={CARD_SHADOW}>
                  <Text className={`${EYEBROW} text-ink-soft`}>Name</Text>
                  <View className="mt-3 rounded-2xl bg-paper px-4">
                    <InputField value={name} onChangeText={setName} placeholder="e.g. Momo the red panda" accessibilityLabel="Narrator name" />
                  </View>
                  <Text className={`${EYEBROW} mt-4 text-ink-soft`}>Personality</Text>
                  <HStack space="sm" className="mt-2 flex-wrap">
                    {TRAITS.map((t) => {
                      const on = traits.includes(t)
                      return (
                        <Pressable
                          key={t}
                          onPress={() => setTraits((prev) => (on ? prev.filter((x) => x !== t) : [...prev, t]))}
                          className={`min-h-11 justify-center rounded-full px-3.5 ${on ? "bg-royal" : "border border-ink/10 bg-paper"}`}
                        >
                          <Text className={`text-xs ${on ? "font-body-semibold text-ticket" : "text-ink"}`}>{t}</Text>
                        </Pressable>
                      )
                    })}
                  </HStack>
                  <Text className="mt-3 text-xs leading-4 text-ink-soft">
                    {traits.length ? `A ${traits.join(", ")} character.` : "Pick at least one trait."} Voice is matched to the personality.
                  </Text>
                </View>
              ) : (
                <Pressable onPress={() => setUploaded(true)} className="rounded-3xl" accessibilityRole="button">
                  <View className={`items-center justify-center rounded-3xl border-2 border-dashed bg-ticket px-5 py-10 ${uploaded ? "border-marigold" : "border-ink/20"}`} style={CARD_SHADOW}>
                    {uploaded ? (
                      <VStack space="sm" className="items-center">
                        <Image source={NARRATORS[3].photo} className="h-24 w-24 rounded-2xl" resizeMode="cover" />
                        <HStack space="xs" className="items-center">
                          <Check size={13} stroke="#2E7D6B" />
                          <Text className="text-xs text-ink-soft">Photo added · we redraw it in the film's look</Text>
                        </HStack>
                      </VStack>
                    ) : (
                      <VStack space="sm" className="items-center">
                        <View className="h-12 w-12 items-center justify-center rounded-full bg-paper">
                          <Camera size={20} stroke="#22319B" />
                        </View>
                        <Text className="font-body-semibold text-sm text-ink">Choose a photo</Text>
                        <Text className="text-xs text-ink-soft">A clear face works best · PNG or JPG</Text>
                      </VStack>
                    )}
                  </View>
                </Pressable>
              )}

              <View className="rounded-3xl bg-ticket p-5" style={CARD_SHADOW}>
                <HStack className="items-center justify-between">
                  <Text className={`${EYEBROW} text-ink-soft`}>What it costs</Text>
                  <HStack space="xs" className="items-center">
                    <Ticket size={13} stroke="#22319B" />
                    <Text className="text-xs font-body-bold text-ink">Included on Family</Text>
                  </HStack>
                </HStack>
                <Text className="mt-2 text-xs leading-4 text-ink-soft">
                  Two images are drawn for your narrator. No ticket is charged; film tickets are charged when you make a film.
                </Text>
              </View>
            </VStack>
          </Animated.View>
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink/10 bg-paper px-5 pb-8 pt-3">
          <GoldButton
            label="Create narrator"
            disabled={!canCreate}
            onPress={() => {
              setSheetReady(false)
              setHeroReady(false)
              setStep("generating")
            }}
            icon={<Sparkles size={15} stroke="#1B1330" />}
          />
        </View>
      </View>
    )
  }

  /* SCREEN 2 — Generating */
  if (step === "generating") {
    return (
      <LinearGradient colors={NOCTURNE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <View className="flex-1 justify-center px-6">
          <Animated.View entering={FadeIn.duration(300)}>
            <VStack space="lg">
              <VStack space="xs">
                <Text className={`${EYEBROW} text-marigold`}>In the atelier</Text>
                <Text className="font-display text-[30px] leading-9 text-ticket">
                  Drawing {mode === "invent" ? name.trim() || "your narrator" : "your photo"}
                </Text>
              </VStack>
              <HStack space="sm">
                {[
                  { label: "Model sheet", ready: sheetReady, photo: NARRATORS[0].photo },
                  { label: "Hero portrait", ready: heroReady, photo: NARRATORS[4].photo },
                ].map((slot) => (
                  <View key={slot.label} className="flex-1 rounded-2xl bg-ticket/10 p-3">
                    <View className="h-32 items-center justify-center overflow-hidden rounded-xl bg-ticket/10">
                      {slot.ready ? <Image source={slot.photo} className="h-full w-full" resizeMode="cover" /> : <Spinner />}
                    </View>
                    <Text className="mt-2 text-center text-xs text-ticket/70">{slot.label}</Text>
                  </View>
                ))}
              </HStack>
              <Text className="text-xs leading-4 text-ticket/50">
                Keeping the same design across both drawings so the character stays consistent in every shot.
              </Text>
            </VStack>
          </Animated.View>
        </View>
      </LinearGradient>
    )
  }

  /* SCREEN 3 — Review */
  return (
    <ScrollView className="flex-1 bg-paper" contentContainerClassName="px-5 pb-10 pt-14">
      <Animated.View entering={FadeInDown.duration(420)}>
        <VStack space="lg">
          <HStack className="items-center justify-between">
            <VStack space="xs">
              <Text className={`${EYEBROW} text-ink-soft`}>Ready for the cast</Text>
              <Text className="font-display text-[30px] leading-9 text-ink">{mode === "invent" ? name.trim() || "New narrator" : "From your photo"}</Text>
            </VStack>
            <View className="-rotate-2 rounded-md bg-marigold px-2 py-1">
              <Text className={`${EYEBROW} text-ink`}>Saved</Text>
            </View>
          </HStack>

          <View className="rounded-3xl bg-ticket p-3" style={CARD_SHADOW}>
            <HStack space="sm">
              <Image source={NARRATORS[0].photo} className="h-36 flex-1 rounded-2xl" resizeMode="cover" />
              <Image source={NARRATORS[4].photo} className="h-36 flex-1 rounded-2xl" resizeMode="cover" />
            </HStack>
            <HStack className="mt-2 justify-between px-1">
              <Text className="text-[11px] text-ink-soft">Model sheet</Text>
              <Text className="text-[11px] text-ink-soft">Hero portrait</Text>
            </HStack>
          </View>

          <View className="rounded-3xl bg-ticket p-5" style={CARD_SHADOW}>
            <Text className={`${EYEBROW} text-ink-soft`}>Personality</Text>
            <Text className="mt-2 text-sm text-ink">{traits.length ? `${traits.join(", ")}` : "From your photo"}</Text>
            <Text className="mt-1 text-xs text-ink-soft">Appears in the cast row on the Create screen.</Text>
          </View>

          <VStack space="sm">
            <GoldButton
              label="Use in this film"
              onPress={() => router.back()}
              icon={<UserRound size={15} stroke="#1B1330" />}
            />
            <Button variant="outline" className="min-h-[54px] rounded-2xl" onPress={() => router.back()}>
              <ButtonText>Save to cast</ButtonText>
            </Button>
            <Pressable
              onPress={() => {
                setSheetReady(false)
                setHeroReady(false)
                setStep("generating")
              }}
              className="min-h-11 flex-row items-center justify-center gap-2"
            >
              <RefreshCw size={13} stroke="#6F6480" />
              <Text className="text-xs text-ink-soft">Draw it again</Text>
            </Pressable>
          </VStack>
        </VStack>
      </Animated.View>
    </ScrollView>
  )
}
