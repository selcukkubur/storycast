import { useEffect, useMemo, useRef, useState } from "react"
import { AppState, FlatList, Image, Modal, Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated"
import { useVideoPlayer, VideoView } from "expo-video"
import { BellRing, Check, ChevronRight, Clapperboard, Clock, Image as ImageIcon, Lock, Mic, Music, PenLine, Play, Plus, Scissors, Subtitles, Ticket, UserRound, X } from "lucide-react-native"
import { VStack } from "@/components/ui/vstack"
import { HStack } from "@/components/ui/hstack"
import { Text } from "@/components/ui/text"
import { Button, ButtonText } from "@/components/ui/button"
import { InputField } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { router } from "expo-router"
import { NARRATORS, TOPIC_CHIPS, FILMS } from "@/src/flows/shared/mock-data"
import { LANGUAGES, languageOf } from "@/src/flows/shared/languages"
import { VOICES, voiceOf } from "@/src/flows/shared/voices"
import { creditsFor, type Resolution } from "@/src/flows/shared/types"
import { adoptJob, ensureDevice, ensureDeviceId, initBilling, settleFilm, settleJobById, startFilm, BillingError } from "@/src/lib/billing"
import { newRecord, runFilm } from "@/src/lib/studio/pipeline"
import { allRecords, saveRecord, type FilmRecord } from "@/src/lib/studio/store"
import { useWallet } from "@/src/lib/wallet-store"
import { studioData } from "@/src/lib/studio/data"
import { UI_STAGES, mapEventStage, stageProgress, type UiStage } from "@/src/lib/stage-map"
import type { JobEvent } from "@/src/lib/studio/types"

type Phase = "compose" | "gate" | "progress" | "result" | "error"

const EYEBROW = "font-body-bold text-[11px] uppercase tracking-[1px]"
const NOCTURNE: readonly [string, string] = ["#2A3BC0", "#131A4E"]
/** Settle is best-effort per spec §6: 3 attempts, then keep the film and flag the ticket as pending. */
const SETTLE_TRIES = 3

const STAGE_META: Record<UiStage, { Icon: typeof Play; label: string; line: string }> = {
  script: { Icon: PenLine, label: "Script", line: "Writing tonight's story" },
  character: { Icon: UserRound, label: "Character", line: "Designing the narrator" },
  voice: { Icon: Mic, label: "Voice", line: "Recording the narration" },
  keyframes: { Icon: ImageIcon, label: "Keyframes", line: "Painting the keyframes" },
  shots: { Icon: Clapperboard, label: "Shots", line: "Filming the shots" },
  score: { Icon: Music, label: "Score", line: "Composing the score" },
  edit: { Icon: Scissors, label: "Edit", line: "Cutting the picture" },
  subtitles: { Icon: Subtitles, label: "Subtitles", line: "Adding word-by-word subtitles" },
}

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

/**
 * Recovery pass for records whose settle never landed: an errored film holding an open job, and
 * a finished film whose settle failed (the job is still open even though the video is safe).
 * `settle_pending === false` marks a record an earlier pass already closed. Any 4xx (409 closed,
 * 404 unknown, 401/400 refusal) is permanent — the server will answer the same way on every
 * launch — so it closes the record too and never retries. Settles by explicit id and never
 * adopts the job, so a film started while this runs keeps its own id and debit.
 */
async function settleStale(records: FilmRecord[]): Promise<void> {
  const stale = records
    .filter(
      (r) =>
        r.job_id &&
        r.settle_pending !== false &&
        (r.status === "error" || (r.status === "done" && Boolean(r.result?.video))),
    )
    .slice(0, 3)
  for (const r of stale) {
    try {
      const s =
        r.status === "done"
          ? await settleJobById(r.job_id!, "done", r.result.video)
          : await settleJobById(r.job_id!, "error")
      if (s.ok) await saveRecord({ ...r, refund: r.refund ?? s.refund ?? 0, settle_pending: false })
      else if (s.status >= 400 && s.status < 500) await saveRecord({ ...r, settle_pending: false })
      else await saveRecord({ ...r, settle_pending: true }).catch(() => {})
    } catch {
      await saveRecord({ ...r, settle_pending: true }).catch(() => {})
    }
  }
}

function ResumePrompt({ visible, onContinue, onCancel }: { visible: boolean; onContinue: () => void; onCancel: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onContinue}>
      <View className="flex-1 items-center justify-center bg-black/60 px-6">
        <View className="w-full rounded-3xl bg-ticket p-6">
          <Text className="font-display text-xl text-ink">Welcome back</Text>
          <Text className="mt-2 text-[13px] leading-5 text-ink-soft">
            Production may have paused while Storycast was in the background. Back to production picks the stages up again; keep the app
            open until the film is ready.
          </Text>
          <View className="mt-5">
            <GoldButton label="Back to production" onPress={onContinue} />
          </View>
          <Button variant="link" className="mt-1 min-h-12" onPress={onCancel}>
            <ButtonText className="text-[15px] text-red-700">Cancel &amp; refund</ButtonText>
          </Button>
        </View>
      </View>
    </Modal>
  )
}

export default function MakeAFilmFlow() {
  const [phase, setPhase] = useState<Phase>("compose")
  const [topic, setTopic] = useState("")
  const [narratorId, setNarratorId] = useState(NARRATORS[0].id)
  const [castStyle, setCastStyle] = useState("")
  const [minutes, setMinutes] = useState(1)
  const [resolution, setResolution] = useState<Resolution>("480P")
  const [langCode, setLangCode] = useState("en")
  const [langOpen, setLangOpen] = useState(false)
  const [langQuery, setLangQuery] = useState("")
  const [voiceId, setVoiceId] = useState(VOICES[0].id)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [gateAnswer, setGateAnswer] = useState("")
  const [gateError, setGateError] = useState("")
  const [activeStage, setActiveStage] = useState<UiStage>("script")
  const [lastEvent, setLastEvent] = useState("")
  const [record, setRecord] = useState<FilmRecord | null>(null)
  const [errorText, setErrorText] = useState("")
  const [refund, setRefund] = useState<number | null>(null)
  const { credits, maxMinutes, loading: walletLoading, error: walletError, refresh } = useWallet()
  const [resumable, setResumable] = useState<FilmRecord | null>(null)
  const [away, setAway] = useState(false)
  const [showResumePrompt, setShowResumePrompt] = useState(false)
  const [settlePending, setSettlePending] = useState(false)
  /** Server-side refusal (402/422) copy shown in the composer's upsell note. */
  const [notice, setNotice] = useState("")
  // One server debit per gate: produce() keeps the gate visible until startFilm answers.
  const [starting, setStarting] = useState(false)
  // Resume can be tapped twice from the compose card; only one finish may run.
  const resumingRef = useRef(false)
  // Cancel can be tapped twice (progress button, resume prompt); only one refund may run.
  const cancellingRef = useRef(false)
  // A cancelled film's pipeline may still fail or finish: its result must not overwrite the refund screen.
  const cancelledRef = useRef(false)

  const cost = creditsFor(minutes, resolution)
  // While the first /wallet answer is in flight (or after a failed fetch) the ticket book is
  // unknown: the fallback 0 must never read as "you are out of tickets".
  const walletReady = !walletLoading && !walletError
  const canAfford = walletReady && cost <= credits && minutes <= maxMinutes
  const BILLING_DOWN = "Can't reach the billing service — check the tunnel and reopen this tab."
  const stubNote = walletError
    ? BILLING_DOWN
    : walletLoading
      ? "Checking your ticket book…"
      : canAfford
        ? `${credits - cost} ticket${credits - cost === 1 ? "" : "s"} stay in your book after the show.`
        : minutes > maxMinutes
          ? "Longer shows need a Family ticket book."
          : "Your book is short a ticket — top it up to start."
  // A billing outage outranks a stale server refusal; an unknown book never claims "0 tickets".
  const admissionNote = walletLoading || walletError ? stubNote : notice || stubNote
  const narrator = useMemo(() => NARRATORS.find((n) => n.id === narratorId) ?? NARRATORS[0], [narratorId])

  // The pipeline forces `cast.style`, so the composer's look is whatever the narrator wears.
  useEffect(() => {
    void studioData()
      .then((d) => setCastStyle(d.characters.find((c) => c.id === narratorId)?.style_label ?? ""))
      .catch(() => {})
  }, [narratorId])

  // Hooks must run on every render, so the player is hoisted above the phase returns.
  const videoUrl: string = record?.result?.video ?? FILMS[0].video
  const resultPlayer = useVideoPlayer(videoUrl)

  // useVideoPlayer only takes an initial source; point it at the finished film when one lands.
  useEffect(() => {
    resultPlayer.replace(videoUrl)
  }, [videoUrl])

  useEffect(() => {
    (async () => {
      try {
        await initBilling()
        const { device, idfv } = await ensureDeviceId()
        await ensureDevice(device, idfv)
        const records = await allRecords()
        const running = records.find((r) => r.status === "running" && r.job_id && r.state?.plan)
        setResumable(running ?? null)
        // A film whose settle never landed may still hold an open job: close it once, silently, so
        // the ticket book matches the server on the next launch (both errored and done-but-unsettled).
        await settleStale(records)
        await refresh()
      } catch {
        /* composer keeps the last known ticket count; a setup/network failure surfaces on the error screen */
      }
    })()
  }, [])

  // Leaving production always drops the background prompt, whatever the reason.
  useEffect(() => {
    if (phase === "progress") return
    setShowResumePrompt(false)
    setAway(false)
  }, [phase])

  useEffect(() => {
    if (phase !== "progress") return
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") setAway(true)
      else if (away) {
        setAway(false)
        setShowResumePrompt(true)
      }
    })
    return () => sub.remove()
  }, [phase, away])

  async function produce() {
    // Never let a failed attempt fall back to the previous film's resume/refund state.
    setRecord(null)
    setNotice("")
    cancelledRef.current = false
    try {
      const data = await studioData()
      const cast = data.characters.find((c) => c.id === narratorId)
      if (!cast) throw new Error("narrator unavailable")
      // The pipeline forces `cast.style`, so the look is the narrator's style — never a free pick.
      const style = data.styles.find((s) => s.id === cast.style) ?? data.styles[0]
      let job: Awaited<ReturnType<typeof startFilm>>
      try {
        job = await startFilm(minutes, resolution)
      } catch (e) {
        if (!(e instanceof BillingError) || e.status !== 409) throw e
        // 409 = a job of ours is still open (a crashed run kept its debit). Close stale records
        // once, then retry a single time before surfacing the refusal.
        await settleStale(await allRecords())
        job = await startFilm(minutes, resolution)
      }
      const rec = newRecord({
        topic: topic.trim(),
        style: style.id,
        minutes,
        lang: langCode,
        style_url: style.ref,
        character_url: "",
        character_name: "",
        character_id: cast.id,
        // The curated pick overrides the cast voice; the pipeline honours a provided voice_id.
        voice: { ...cast.voice, voice_id: voiceId, name: voiceOf(voiceId).name },
        resolution,
      })
      rec.style_label = style.label
      rec.watermark = job.watermark
      rec.job_id = job.jobId
      setRecord(rec)
      setLastEvent("")
      setActiveStage("script")
      setSettlePending(false)
      setRefund(null)
      setErrorText("")
      setPhase("progress")
      await finish(rec)
    } catch (e) {
      if (e instanceof BillingError && (e.status === 402 || e.status === 422)) {
        setPhase("compose")
        setNotice(
          e.status === 422
            ? "This length or picture needs a bigger plan — see Family."
            : "Not enough tickets — top up or upgrade.",
        )
        // The server is authoritative: re-read the wallet so the composer's upsell copy matches.
        await refresh()
        return
      }
      setErrorText(String((e as Error).message ?? e))
      setRefund(null)
      setPhase("error")
    }
  }

  /** Settle is idempotent on failure (billing keeps the job id), so retry silently before giving up. */
  async function settleWithRetry(outcome: "done" | "error", videoUrl?: string) {
    type Settled = Awaited<ReturnType<typeof settleFilm>>
    const failed = (): Settled => ({ ok: false, status: 0, refund: 0, creditsLeft: undefined })
    // A 4xx (409 closed job, 401, 4xx refusal) will never succeed on retry: only a dropped
    // connection (status 0), a rate limit (429) or a 5xx is worth another attempt.
    const retryable = (s: Settled) => s.status === 0 || s.status === 429 || s.status >= 500
    let s = await settleFilm(outcome, videoUrl).catch(failed)
    for (let i = 1; i < SETTLE_TRIES && retryable(s); i++) {
      await new Promise((res) => setTimeout(res, 400 * i))
      s = await settleFilm(outcome, videoUrl).catch(failed)
    }
    return s
  }

  /** Stage rings only move forward; a late event from a slower branch must not rewind the UI. */
  function advance(next: UiStage) {
    setActiveStage((cur) => (UI_STAGES.indexOf(next) > UI_STAGES.indexOf(cur) ? next : cur))
  }

  async function finish(rec: FilmRecord) {
    try {
      const done = await runFilm(rec, (e: JobEvent) => {
        setLastEvent(e.msg)
        const ui = mapEventStage(e.stage)
        if (ui && ui !== "done" && ui !== "error") advance(ui)
      })
      if (cancelledRef.current) return
      if (done.status !== "done" || !done.result.video) throw new Error(done.error || "the film could not be finished")
      const s = await settleWithRetry("done", done.result.video)
      // A cancel that landed while the pipeline or the settle was in flight owns the screen (it
      // already settled the job as an error and set the refund): never flip to the premiere.
      if (cancelledRef.current) return
      const settled: FilmRecord = { ...done, settle_pending: !s.ok, refund: s.ok ? (s.refund ?? 0) : done.refund }
      if (s.ok) {
        // Persist the close so the next launch does not re-settle a film that is already paid for.
        await saveRecord(settled).catch(() => {})
      }
      setRecord(settled)
      if (!s.ok) setSettlePending(true)
      // The server is authoritative for the ticket book: re-read it after every settle attempt.
      await refresh()
      setPhase("result")
    } catch (e) {
      if (cancelledRef.current) return
      const s = await settleWithRetry("error")
      setRefund(s.ok ? s.refund ?? 0 : null)
      setErrorText(String((e as Error).message ?? e))
      await refresh()
      setPhase("error")
    }
  }

  /** Cancel from the progress screen: refund the open job, then let the error copy render it. */
  async function cancelFilm() {
    if (cancellingRef.current) return
    cancellingRef.current = true
    cancelledRef.current = true
    setShowResumePrompt(false)
    setRefund(null)
    setErrorText("You stopped this film before it finished.")
    try {
      const s = await settleWithRetry("error")
      setRefund(s.ok ? s.refund ?? 0 : null)
      await refresh()
      setPhase("error")
    } finally {
      cancellingRef.current = false
    }
  }

  async function resume(rec: FilmRecord) {
    if (resumingRef.current) return
    resumingRef.current = true
    try {
      cancelledRef.current = false
      if (rec.job_id) adoptJob(rec.job_id)
      setRecord(rec)
      setResumable(null)
      setSettlePending(false)
      setRefund(null)
      setErrorText("")
      setLastEvent("")
      setActiveStage("script")
      setPhase("progress")
      await finish(rec)
    } finally {
      resumingRef.current = false
    }
  }

  const title = topic.trim() || record?.topic || "Your first story"

  /* ================================================
     FLOW: Make a Film
     SCREEN 1 of 4: Composer
     PLATFORM: React Native (Expo + NativeWind + local Gluestack-style components)
     ------------------------------------------------
     ENTRY:  Create tab / Home hero "Start a story"
     EXIT:   "Make the film" → Parental gate
     BRANCH: cost > tickets → upsell note (Flow B)
     ================================================ */
  if (phase === "compose") {
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
                <Text className={`${EYEBROW} text-ink`}>
                  {walletLoading ? "Checking tickets…" : walletError ? "—" : `${credits} tickets`}
                </Text>
              </HStack>
            </View>
          </LinearGradient>

          <Animated.View entering={FadeInDown.duration(450)}>
            <VStack space="lg" className="-mt-14 px-5">
              {resumable ? (
                <View className="rounded-3xl bg-ticket p-5" style={CARD_SHADOW}>
                  <Eyebrow tone="soft">Unfinished film</Eyebrow>
                  <Text className="mt-2 font-display text-xl leading-6 text-ink" numberOfLines={2}>
                    {resumable.topic || resumable.title || "Last night's story"}
                  </Text>
                  <Text className="mt-1.5 text-[13px] leading-5 text-ink-soft">
                    Production stopped before the film was finished. Pick up where it left off — no new ticket is used.
                  </Text>
                  <View className="mt-4">
                    <GoldButton label="Resume film" onPress={() => void resume(resumable)} icon={<Play size={15} stroke="#1B1330" fill="#1B1330" />} />
                  </View>
                  <Button variant="outline" className="mt-2 min-h-12 rounded-2xl" onPress={() => setResumable(null)}>
                    <ButtonText>Not now</ButtonText>
                  </Button>
                </View>
              ) : null}

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
                          onPress={() => setNarratorId(n.id)}
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
                  {narrator.personality} · voice: {voiceOf(voiceId).name}
                </Text>
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
                  <View className="h-px bg-ink/10" />
                  <View className="p-4">
                    <HStack className="items-center justify-between">
                      <Text className="text-[15px] font-body-bold text-ink">Look</Text>
                      <Text className="text-[15px] font-body-semibold text-ink">{castStyle || narrator.look}</Text>
                    </HStack>
                    <Text className="mt-1 text-xs leading-4 text-ink-soft">
                      Styles follow the narrator — pick another narrator for a different look.
                    </Text>
                  </View>
                </View>
              </VStack>

              <View className="rounded-3xl bg-ticket p-5" style={CARD_SHADOW}>
                <Eyebrow tone="soft">Show settings</Eyebrow>
                <HStack className="mt-3 justify-between">
                  <Text className="text-[15px] font-body-bold text-ink">Length</Text>
                  <Text className="text-xs text-ink-soft">
                    {walletReady ? `up to ${maxMinutes} min on your plan` : "checking your plan"}
                  </Text>
                </HStack>
                <HStack space="xs" className="mt-2">
                  {[1, 2, 3, 4, 5].map((m) => {
                    const disabled = m > maxMinutes
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
                  <Text className={`text-xs ${walletReady && credits < creditsFor(minutes, "768P") ? "font-body-bold text-coral" : "text-ink-soft"}`}>
                    Sharper costs 2 tickets
                  </Text>
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
                    <Text className={`mt-1.5 text-[13px] leading-5 ${notice || walletError ? "font-body-bold text-marigold" : "text-ticket/85"}`}>
                      {admissionNote}
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
              if (walletLoading || walletError) return
              setGateError("")
              setGateAnswer("")
              setPhase("gate")
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
  if (phase === "gate") {
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
                <Button variant="outline" className="min-h-12 flex-1 rounded-2xl" onPress={() => setPhase("compose")}>
                  <ButtonText>Cancel</ButtonText>
                </Button>
                <View className="flex-1">
                  <GoldButton
                    label="Start"
                    disabled={starting}
                    onPress={() => {
                      if (gateAnswer.trim() !== "32") {
                        setGateError("That's not it — try again.")
                        return
                      }
                      if (starting) return
                      // produce() owns the progress phase so a startFilm failure stays in the composer.
                      setStarting(true)
                      void produce().finally(() => setStarting(false))
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
     SCREEN 3 of 5: Production
     PLATFORM: React Native
     ------------------------------------------------
     ENTRY:  Parental gate solved / Resume
     EXIT:   All stages done → Result
     BRANCH: keep the app open (AppState guard); failure → error screen
     ================================================ */
  if (phase === "progress") {
    const pct = stageProgress(activeStage)
    const idx = UI_STAGES.indexOf(activeStage)
    const meta = STAGE_META[activeStage]
    return (
      <LinearGradient colors={NOCTURNE} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <View className="absolute -left-16 top-24 h-56 w-56 rounded-full border border-marigold/15" />
        <View className="absolute -right-10 top-1/2 h-48 w-48 rounded-full border border-coral/20" />
        <View className="absolute left-10 top-40 h-1.5 w-1.5 rounded-full bg-marigold/70" />
        <View className="absolute right-16 top-32 h-1 w-1 rounded-full bg-coral/60" />

        <ScrollView contentContainerClassName="pb-10" showsVerticalScrollIndicator={false}>
          <View className="px-6 pt-16">
            <HStack className="items-center justify-between">
              <VStack space="xs">
                <Eyebrow tone="marigold">In production</Eyebrow>
                <Text className="font-display text-2xl leading-7 text-ticket">Tonight's show</Text>
              </VStack>
              <View className="flex-row items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5">
                <Clock size={12} stroke="#FFB627" />
                <Text className="text-[11px] font-body-bold text-ticket/80">keep open</Text>
              </View>
            </HStack>

            <View className="mt-8 items-center">
              <View className="absolute h-52 w-52 rounded-full" style={{ backgroundColor: "rgba(255,182,39,0.08)" }} />
              <View className="absolute h-40 w-40 rounded-full border border-white/10" />
              <View className="relative">
                <Image source={narrator.photo} className="h-32 w-32 rounded-full border-2 border-marigold" resizeMode="cover" />
                <View className="-rotate-2 absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md bg-coral px-2 py-0.5">
                  <Text className={`${EYEBROW} text-ticket`}>On air</Text>
                </View>
              </View>
              <Text className="mt-5 font-display text-[64px] leading-[68px] text-marigold">{pct}%</Text>
              <Text className="text-[13px] text-ticket/60">
                {title}
              </Text>
              <View className="mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-white/15">
                <View className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "#FFB627" }} />
              </View>
            </View>

            <View className="mt-8 flex-row items-center gap-3 rounded-2xl border border-marigold/30 bg-marigold/10 p-4">
              <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: "#FFB627" }}>
                <meta.Icon size={19} stroke="#1B1330" />
              </View>
              <VStack space="xs" className="flex-1">
                <Text className={`${EYEBROW} text-marigold`}>Now: {meta.label}</Text>
                <Text className="text-sm font-body-semibold text-ticket" numberOfLines={2}>{lastEvent || meta.line}</Text>
              </VStack>
              <Spinner size="small" />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 22, paddingBottom: 6 }}>
              {UI_STAGES.map((st, i) => {
                const done = i < idx
                const active = i === idx
                const Icon = STAGE_META[st].Icon
                return (
                  <VStack key={st} space="xs" className="w-16 items-center">
                    <View
                      className={`h-11 w-11 items-center justify-center rounded-full border ${done ? "border-marigold/50 bg-marigold/15" : active ? "border-marigold" : "border-white/10 bg-white/5"}`}
                      style={active ? { backgroundColor: "#FFB627" } : undefined}
                    >
                      <Icon size={17} stroke={active ? "#1B1330" : done ? "#FFB627" : "#FFF9F040"} />
                    </View>
                    <Text className={`text-[10px] uppercase tracking-[0.5px] ${active ? "font-body-bold text-marigold" : done ? "text-ticket/60" : "text-ticket/30"}`}>
                      {STAGE_META[st].label}
                    </Text>
                  </VStack>
                )
              })}
            </ScrollView>

            <View className="mt-6 flex-row items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-white/10">
                <BellRing size={15} stroke="#FFB627" />
              </View>
              <Text className="flex-1 text-[13px] leading-5 text-ticket/70">
                Keep Storycast open — production pauses if the app goes to the background.
              </Text>
            </View>

            <Button variant="link" className="mt-4 min-h-12" onPress={() => void cancelFilm()}>
              <ButtonText className="text-[15px] text-ticket/70">Cancel film</ButtonText>
            </Button>
          </View>
        </ScrollView>

        <ResumePrompt
          visible={showResumePrompt}
          onContinue={() => {
            // Back to production: the modal closes and the running job stays adopted.
            if (record?.job_id) adoptJob(record.job_id)
            setShowResumePrompt(false)
          }}
          onCancel={() => void cancelFilm()}
        />
      </LinearGradient>
    )
  }

  /* ================================================
     FLOW: Make a Film
     SCREEN 4 of 5: Stopped
     PLATFORM: React Native
     ------------------------------------------------
     ENTRY:  startFilm/pipeline/settle failure
     EXIT:   Try again → Composer; Resume → same job
     ================================================ */
  if (phase === "error") {
    // The refund tells us which half of the lifecycle we are in: no answer from settle means the
    // job may still be open (resume it); a settled refund means the job is closed (start over).
    const canResume = refund === null && Boolean(record?.job_id)
    return (
      <View className="flex-1 justify-center bg-paper px-6">
        <View className="rounded-3xl bg-ticket p-6" style={CARD_SHADOW}>
          <Eyebrow tone="soft">Production stopped</Eyebrow>
          <Text className="mt-2 font-display text-2xl text-ink">That film didn't finish</Text>
          <Text className="mt-2 text-[13px] leading-5 text-ink-soft">{errorText}</Text>
          {refund !== null ? (
            <Text className="mt-2 text-[13px] font-body-bold text-mint">
              {refund > 0
                ? `${refund} ticket${refund === 1 ? "" : "s"} refunded`
                : "This film was already closed — no tickets were charged twice."}
            </Text>
          ) : null}
          <View className="mt-5">
            {canResume ? (
              <GoldButton
                label="Resume film"
                onPress={() => record && void resume(record)}
                icon={<Play size={15} stroke="#1B1330" fill="#1B1330" />}
              />
            ) : (
              <GoldButton label="Try again" onPress={() => setPhase("compose")} />
            )}
          </View>
        </View>
      </View>
    );
  }

  /* ================================================
     FLOW: Make a Film
     SCREEN 5 of 5: Result
     PLATFORM: React Native
     ------------------------------------------------
     ENTRY:  Production completed
     EXIT:   Watch → player (Flow C); Make another → Composer
     ================================================ */
  // A resumed or background-completed film may not match the composer's current settings.
  const usedCost = creditsFor(record?.minutes ?? minutes, (record?.resolution as Resolution) ?? resolution)
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

          <View className="overflow-hidden rounded-3xl bg-black" style={CARD_SHADOW}>
            <VideoView player={resultPlayer} style={{ width: "100%", aspectRatio: 16 / 9 }} contentFit="contain" nativeControls />
          </View>

          <VStack space="xs">
            <Text className="font-display text-2xl leading-7 text-ink" numberOfLines={2}>
              {record?.result?.title || title}
            </Text>
            <Text className="text-xs text-ink-soft">
              {record?.style_label ?? (castStyle || narrator.look)} · {record?.minutes ?? minutes} min
            </Text>
          </VStack>

          <View className="flex-row overflow-hidden rounded-2xl border border-ink/10 bg-ticket" style={CARD_SHADOW}>
            <View className="flex-1 p-4">
              <Eyebrow tone="soft">Ticket used</Eyebrow>
              <Text className="mt-1.5 font-body-bold text-base text-ink">
                {usedCost > 0 ? `${usedCost} ticket${usedCost === 1 ? "" : "s"} · ` : ""}
                {credits} left in your book
              </Text>
              {settlePending ? (
                <Text className="mt-1 text-xs font-body-bold text-coral">Ticket update pending — the film is safe in your library.</Text>
              ) : null}
            </View>
          </View>

          <VStack space="sm">
            <GoldButton
              label="Watch now"
              onPress={() => router.push({ pathname: "/watch", params: { id: record?.id } })}
              icon={<Play size={15} stroke="#1B1330" fill="#1B1330" />}
            />
            <Button variant="outline" className="min-h-[54px] rounded-2xl" onPress={() => setPhase("compose")}>
              <ButtonText>Make another</ButtonText>
            </Button>
          </VStack>
        </VStack>
      </Animated.View>
    </ScrollView>
  )
}
