import type { ImageSourcePropType } from "react-native"

export type Plan = "trial" | "starter" | "family"
export type Resolution = "480P" | "768P"

export type Narrator = {
  id: string
  name: string
  personality: string
  look: string
  photo: ImageSourcePropType
  voice: string
}

export type FilmCategory = "nature" | "science" | "history" | "machines"

export type Film = {
  id: string
  title: string
  subtitle: string
  narrator: string
  styleLabel: string
  durationSec: number
  created: string
  watched: boolean
  category: FilmCategory
  poster: ImageSourcePropType
  video: string
  topic: string
  lang: string
}

export type Wallet = {
  plan: Plan
  credits: number
  maxMinutes: number
  rolloverNote: string
}

export type PlanOffer = {
  id: "starter" | "family"
  name: string
  monthly: number
  yearly: number
  creditsPerMonth: number
  maxMinutes: number
  perks: string[]
}

export type CreditTx = {
  id: string
  kind: "grant" | "debit" | "refund" | "topup"
  credits: number
  label: string
  when: string
}

export const creditsFor = (minutes: number, resolution: Resolution) =>
  Math.ceil(minutes * (resolution === "768P" ? 2 : 1))
