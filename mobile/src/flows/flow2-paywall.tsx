import { useState } from "react"
import { Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated"
import { router } from "expo-router"
import { Check, ChevronLeft, RotateCcw, Ticket, X } from "lucide-react-native"
import { VStack } from "@/components/ui/vstack"
import { HStack } from "@/components/ui/hstack"
import { Text } from "@/components/ui/text"
import { Button, ButtonText } from "@/components/ui/button"
import { InputField } from "@/components/ui/input"
import { PLAN_OFFERS, LEDGER, WALLET } from "@/src/flows/shared/mock-data"

type Step = "plans" | "gate" | "confirm" | "wallet"

const EYEBROW = "font-body-semibold text-[10px] uppercase tracking-[2.5px]"
const NOCTURNE: readonly [string, string] = ["#2A3BC0", "#131A4E"]
const CARD_SHADOW = {
  shadowColor: "#1B1330",
  shadowOpacity: 0.14,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 14 },
  elevation: 7,
} as const

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
   FLOW: Buy Tickets
   SCREENS 1-4: Plans → Parental gate → StoreKit confirm → Wallet
   PLATFORM: React Native (Expo + NativeWind + local Gluestack-style components)
   ENTRY:  Composer upsell · Account tab · trial end
   EXIT:   ✅ plan active → Wallet · ↩ close → sender
   ================================================ */
export default function PaywallFlow({ onClose }: { onClose?: () => void }) {
  const [step, setStep] = useState<Step>("plans")
  const [annual, setAnnual] = useState(false)
  const [selected, setSelected] = useState<"starter" | "family">("starter")
  const [answer, setAnswer] = useState("")
  const [error, setError] = useState("")
  const [bought, setBought] = useState(false)

  const offer = PLAN_OFFERS.find((o) => o.id === selected) ?? PLAN_OFFERS[0]
  const price = annual ? offer.yearly : offer.monthly

  /* SCREEN 1 — Plans */
  if (step === "plans") {
    return (
      <View className="flex-1 bg-paper">
        <ScrollView contentContainerClassName="pb-40">
          <LinearGradient colors={NOCTURNE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
            <View className="absolute -right-10 top-6 h-40 w-40 rounded-full border border-marigold/20" />
            <HStack className="justify-between">
              <VStack space="xs">
                <Text className={`${EYEBROW} text-marigold`}>Ticket book</Text>
                <Text className="font-display text-[36px] leading-[42px] text-ticket">
                  Choose your <Text className="font-display-italic text-marigold">seat.</Text>
                </Text>
              </VStack>
              <Pressable onPress={onClose} className="h-10 w-10 items-center justify-center rounded-full bg-ticket/10 active:bg-ticket/20" accessibilityLabel="Close">
                <X size={18} stroke="#FFF9F0" />
              </Pressable>
            </HStack>
            <Text className="mt-2 max-w-[80%] text-sm leading-5 text-ticket/70">
              Every film is one ticket per minute. Family books share one wallet.
            </Text>
          </LinearGradient>

          <Animated.View entering={FadeInDown.duration(420)}>
            <VStack space="md" className="-mt-6 px-5">
              <View className="flex-row rounded-full bg-ticket p-1" style={CARD_SHADOW}>
                {[
                  { key: false, label: "Monthly" },
                  { key: true, label: "Yearly · save 30%" },
                ].map((o) => (
                  <Pressable
                    key={String(o.key)}
                    onPress={() => setAnnual(o.key)}
                    className={`min-h-11 flex-1 items-center justify-center rounded-full ${annual === o.key ? "bg-royal" : ""}`}
                  >
                    <Text className={`text-xs font-body-bold ${annual === o.key ? "text-ticket" : "text-ink-soft"}`}>{o.label}</Text>
                  </Pressable>
                ))}
              </View>

              {PLAN_OFFERS.map((o) => {
                const active = o.id === selected
                const family = o.id === "family"
                return (
                  <Pressable key={o.id} onPress={() => setSelected(o.id)} accessibilityState={{ selected: active }}>
                    <LinearGradient
                      colors={family ? NOCTURNE : ["#FFF9F0", "#FFF9F0"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ borderRadius: 24, padding: 20, borderWidth: active ? 2 : 1, borderColor: active ? "#FFB627" : "rgba(27,19,48,0.08)", ...(active ? CARD_SHADOW : {}) }}
                    >
                      {family ? (
                        <View className="absolute -top-2.5 right-4 -rotate-2 rounded-md bg-coral px-2 py-0.5">
                          <Text className={`${EYEBROW} text-ticket`}>Most loved</Text>
                        </View>
                      ) : null}
                      <HStack className="items-center justify-between">
                        <VStack space="xs">
                          <Text className={`${EYEBROW} ${family ? "text-marigold" : "text-ink-soft"}`}>{o.name}</Text>
                          <HStack space="xs" className="items-baseline">
                            <Text className={`font-display text-4xl ${family ? "text-ticket" : "text-ink"}`}>${annual ? o.yearly : o.monthly}</Text>
                            <Text className={`text-xs ${family ? "text-ticket/60" : "text-ink-soft"}`}>/{annual ? "yr" : "mo"}</Text>
                          </HStack>
                        </VStack>
                        <View
                          className={`h-7 w-7 items-center justify-center rounded-full border-2 ${active ? "border-marigold bg-marigold" : family ? "border-ticket/40" : "border-ink/20"}`}
                        >
                          {active ? <Check size={14} stroke="#1B1330" /> : null}
                        </View>
                      </HStack>
                      <View className={`my-4 h-px ${family ? "bg-ticket/15" : "bg-ink/10"}`} />
                      <VStack space="xs">
                        <Text className={`text-xs ${family ? "text-ticket/80" : "text-ink-soft"}`}>
                          {o.creditsPerMonth} tickets every month · films up to {o.maxMinutes} min
                        </Text>
                        {o.perks.map((perk) => (
                          <HStack key={perk} space="xs" className="items-center">
                            <View className={`h-1.5 w-1.5 rounded-full ${family ? "bg-marigold" : "bg-royal"}`} />
                            <Text className={`text-xs ${family ? "text-ticket/75" : "text-ink-soft"}`}>{perk}</Text>
                          </HStack>
                        ))}
                      </VStack>
                    </LinearGradient>
                  </Pressable>
                )
              })}

              <Pressable className="mt-1 items-center py-3" accessibilityRole="button">
                <HStack space="xs" className="items-center">
                  <RotateCcw size={13} stroke="#6F6480" />
                  <Text className="text-xs text-ink-soft">Restore purchases</Text>
                </HStack>
              </Pressable>
            </VStack>
          </Animated.View>
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 border-t border-ink/10 bg-paper px-5 pb-8 pt-3">
          <GoldButton
            label={`Continue · $${price}/${annual ? "yr" : "mo"}`}
            onPress={() => {
              setError("")
              setAnswer("")
              setStep("gate")
            }}
            icon={<Ticket size={16} stroke="#1B1330" />}
          />
          <Text className="mt-2 text-center text-[11px] text-ink-soft">Prices from the App Store. Cancel any time.</Text>
        </View>
      </View>
    )
  }

  /* SCREEN 2 — Parental gate */
  if (step === "gate") {
    return (
      <LinearGradient colors={NOCTURNE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <View className="flex-1 justify-center p-6">
          <Animated.View entering={FadeIn.duration(320)}>
            <View className="rounded-3xl bg-ticket p-6" style={CARD_SHADOW}>
              <View className="-rotate-2 self-start rounded-md bg-coral px-2 py-1">
                <Text className={`${EYEBROW} text-ticket`}>For grown-ups</Text>
              </View>
              <Text className="mt-4 font-display text-[28px] leading-8 text-ink">Before we charge</Text>
              <Text className="mt-2 text-sm leading-5 text-ink-soft">
                What is <Text className="font-body-bold text-ink">9 × 6</Text>?
              </Text>
              <View className="mt-4 rounded-2xl border border-ink/10 bg-paper px-4">
                <InputField value={answer} onChangeText={setAnswer} keyboardType="number-pad" placeholder="Answer" accessibilityLabel="Parental gate answer" />
              </View>
              {error ? <Text className="mt-2 text-sm text-red-700">{error}</Text> : null}
              <HStack space="sm" className="mt-5">
                <Button variant="outline" className="min-h-12 flex-1 rounded-2xl" onPress={() => setStep("plans")}>
                  <ButtonText>Back</ButtonText>
                </Button>
                <View className="flex-1">
                  <GoldButton
                    label="Continue"
                    onPress={() => {
                      if (answer.trim() === "54") setStep("confirm")
                      else setError("That's not it — try again.")
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

  /* SCREEN 3 — StoreKit confirm (system sheet stand-in) */
  if (step === "confirm") {
    return (
      <LinearGradient colors={NOCTURNE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <View className="flex-1 justify-end p-4">
          <Animated.View entering={FadeInDown.duration(300)}>
            <View className="rounded-3xl bg-ticket p-5" style={CARD_SHADOW}>
              <HStack className="items-center justify-between">
                <Text className={`${EYEBROW} text-ink-soft`}>App Store</Text>
                <Text className={`${EYEBROW} text-ink-soft`}>Sandbox</Text>
              </HStack>
              <View className="my-4 h-px bg-ink/10" />
              <VStack space="xs">
                <Text className="font-body-semibold text-sm text-ink">Storycast · {offer.name} ticket book</Text>
                <HStack className="justify-between">
                  <Text className="text-xs text-ink-soft">{annual ? "Yearly" : "Monthly"}</Text>
                  <Text className="font-body-bold text-sm text-ink">${price}.00</Text>
                </HStack>
                <Text className="text-xs text-ink-soft">
                  {offer.creditsPerMonth} tickets/month · up to {offer.maxMinutes} min per film
                </Text>
              </VStack>
              <View className="mt-5">
                <GoldButton
                  label={`Subscribe · $${price}`}
                  onPress={() => {
                    setBought(true)
                    setStep("wallet")
                  }}
                />
              </View>
              <Pressable className="mt-3 items-center py-2" onPress={() => setStep("plans")}>
                <Text className="text-xs text-ink-soft">Not now</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </LinearGradient>
    )
  }

  /* SCREEN 4 — Wallet */
  return (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerClassName="pb-10">
        <LinearGradient colors={NOCTURNE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
          <HStack className="justify-between">
            <Pressable
              onPress={() => (onClose ? onClose() : router.back())}
              className="h-10 w-10 items-center justify-center rounded-full bg-ticket/10 active:bg-ticket/20"
              accessibilityLabel="Back"
            >
              <ChevronLeft size={18} stroke="#FFF9F0" />
            </Pressable>
            {bought ? (
              <View className="-rotate-2 rounded-md bg-marigold px-2 py-1">
                <Text className={`${EYEBROW} text-ink`}>Plan active</Text>
              </View>
            ) : null}
          </HStack>
          <Text className={`${EYEBROW} mt-4 text-marigold`}>Your ticket book</Text>
          <HStack space="sm" className="mt-1 items-baseline">
            <Text className="font-display text-[56px] leading-[60px] text-ticket">{WALLET.credits + (bought ? offer.creditsPerMonth : 0)}</Text>
            <Text className="text-sm text-ticket/60">tickets left</Text>
          </HStack>
          <Text className="mt-1 text-xs leading-4 text-ticket/60">{WALLET.rolloverNote}</Text>
        </LinearGradient>

        <Animated.View entering={FadeInDown.duration(420)}>
          <VStack space="lg" className="-mt-6 px-5">
            <View className="rounded-3xl bg-ticket p-5" style={CARD_SHADOW}>
              <Text className={`${EYEBROW} text-ink-soft`}>Top up</Text>
              <HStack space="sm" className="mt-3">
                {[
                  { credits: 1, price: "$4.99" },
                  { credits: 3, price: "$12.99" },
                ].map((pack) => (
                  <Pressable key={pack.credits} className="min-h-11 flex-1 rounded-2xl bg-paper p-3 active:bg-paper/70">
                    <HStack space="xs" className="items-center">
                      <Ticket size={13} stroke="#22319B" />
                      <Text className="font-body-bold text-sm text-ink">
                        {pack.credits} ticket{pack.credits === 1 ? "" : "s"}
                      </Text>
                    </HStack>
                    <Text className="mt-1 text-xs text-ink-soft">{pack.price} · never expires</Text>
                  </Pressable>
                ))}
              </HStack>
            </View>

            <View className="rounded-3xl bg-ticket p-5" style={CARD_SHADOW}>
              <Text className={`${EYEBROW} text-ink-soft`}>Recent activity</Text>
              <VStack space="sm" className="mt-3">
                {LEDGER.map((tx) => (
                  <HStack key={tx.id} className="items-center justify-between">
                    <VStack space="xs" className="flex-1 pr-3">
                      <Text className="text-sm text-ink" numberOfLines={1}>
                        {tx.label}
                      </Text>
                      <Text className="text-[11px] text-ink-soft">{tx.when}</Text>
                    </VStack>
                    <Text
                      className={`font-body-bold text-sm ${tx.credits > 0 ? (tx.kind === "debit" ? "text-red-600" : "text-mint") : "text-red-600"}`}
                    >
                      {tx.credits > 0 ? `+${tx.credits}` : tx.credits}
                    </Text>
                  </HStack>
                ))}
              </VStack>
            </View>
          </VStack>
        </Animated.View>
      </ScrollView>
    </View>
  )
}
