import type { CreditTx, Film, Narrator, PlanOffer, Wallet } from "./types"

export const NARRATORS: Narrator[] = [
  {
    id: "pip",
    name: "Pip",
    personality: "A curious little explainer who asks why about everything",
    look: "Stick figure",
    photo: require("../../../assets/characters/pip.jpg"),
    voice: "Cody",
  },
  {
    id: "mo",
    name: "Mo",
    personality: "An upbeat whiteboard teacher who draws ideas as he talks",
    look: "Whiteboard doodle",
    photo: require("../../../assets/characters/mo.jpg"),
    voice: "Arthur",
  },
  {
    id: "lulu",
    name: "Lulu",
    personality: "A daydreamer who doodles her way through big questions",
    look: "Notebook doodle",
    photo: require("../../../assets/characters/lulu.jpg"),
    voice: "Aerisita",
  },
  {
    id: "hazel",
    name: "Hazel",
    personality: "A gentle naturalist who knows every leaf, bird and bug",
    look: "Ink & watercolor",
    photo: require("../../../assets/characters/hazel.jpg"),
    voice: "Emma Taylor",
  },
  {
    id: "otto",
    name: "Otto",
    personality: "A tidy robot who loves explaining how things work, step by step",
    look: "Flat vector",
    photo: require("../../../assets/characters/otto.jpg"),
    voice: "John",
  },
  {
    id: "rose",
    name: "Grandma Rose",
    personality: "A cozy storyteller who has a story for every question",
    look: "Colored-pencil picture book",
    photo: require("../../../assets/characters/rose.jpg"),
    voice: "Grandma Rachel",
  },
]

const posterFiles = [
  require("../../../assets/posters/0067bf73.jpg"),
  require("../../../assets/posters/0d581496.jpg"),
  require("../../../assets/posters/0de626de.jpg"),
  require("../../../assets/posters/0e5f30c6.jpg"),
]

export const TOPIC_CHIPS = ["Why is the sky blue?", "How do bees make honey?", "The first photograph", "How do volcanoes work?"]

export const LOOKS = ["Stick figure", "Whiteboard doodle", "Watercolor anime", "Claymation", "Papercraft diorama"]

export const FILMS: Film[] = [
  { id: "kai-wind", title: "Kai and the secret of the wind", narratorId: "pip", durationSec: 63, created: "2 days ago", watched: true, poster: posterFiles[0] },
  { id: "stella-cable", title: "Stella and the cable under the sea", narratorId: "rose", durationSec: 62, created: "4 days ago", watched: false, poster: posterFiles[1] },
  { id: "bruno-mine", title: "Bruno und der bergmannsgruß", narratorId: "otto", durationSec: 59, created: "6 days ago", watched: true, poster: posterFiles[2] },
  { id: "mei-kites", title: "Granny Mei and the first kites in the wind", narratorId: "rose", durationSec: 56, created: "1 week ago", watched: true, poster: posterFiles[3] },
]

export const WALLET: Wallet = { plan: "starter", credits: 3, maxMinutes: 2, rolloverNote: "Unused tickets roll over one month, up to 6." }

export const PLAN_OFFERS: PlanOffer[] = [
  {
    id: "starter",
    name: "Starter",
    monthly: 12.99,
    yearly: 89.99,
    creditsPerMonth: 3,
    maxMinutes: 2,
    perks: ["3 film-minutes a month", "Films up to 2 minutes", "No watermark", "Download and share"],
  },
  {
    id: "family",
    name: "Family",
    monthly: 19.99,
    yearly: 139.99,
    creditsPerMonth: 5,
    maxMinutes: 5,
    perks: ["5 shared film-minutes a month", "Films up to 5 minutes", "Custom narrators", "Priority queue", "Family Sharing"],
  },
]

export const LEDGER: CreditTx[] = [
  { id: "tx1", kind: "grant", credits: 3, label: "Starter monthly allowance", when: "Nov 1" },
  { id: "tx2", kind: "debit", credits: -2, label: "Brown bear cave story, 2 min 480P", when: "Nov 8" },
  { id: "tx3", kind: "refund", credits: 1, label: "Refund: finished film was shorter than planned", when: "Nov 8" },
  { id: "tx4", kind: "topup", credits: 1, label: "Top-up pack", when: "Nov 12" },
]
