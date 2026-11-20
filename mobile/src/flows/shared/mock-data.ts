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



export const TOPIC_CHIPS = ["Why is the sky blue?", "How do bees make honey?", "The first photograph", "How do volcanoes work?"]

export const LOOKS = ["Stick figure", "Whiteboard doodle", "Watercolor anime", "Claymation", "Papercraft diorama"]

export const FILMS: Film[] = [
  { id: "10a4f1dd", title: "Nib", subtitle: "and the stick inside the pencil", narrator: "Nib", styleLabel: "Claymation", durationSec: 63, created: "2 days ago", watched: false, category: "machines", poster: require("../../../assets/posters/10a4f1dd.jpg") },
  { id: "18d77a9d", title: "Kiko", subtitle: "and the secret life of lightning", narrator: "Kiko", styleLabel: "Watercolor anime", durationSec: 58, created: "2 days ago", watched: false, category: "science", poster: require("../../../assets/posters/18d77a9d.jpg") },
  { id: "0067bf73", title: "Rex", subtitle: "and the bone that turned to stone", narrator: "Rex", styleLabel: "Kid's crayon", durationSec: 55, created: "4 days ago", watched: true, category: "history", poster: require("../../../assets/posters/0067bf73.jpg") },
  { id: "14189a27", title: "Momo", subtitle: "and the chocolate tree", narrator: "Momo", styleLabel: "Claymation", durationSec: 61, created: "5 days ago", watched: false, category: "nature", poster: require("../../../assets/posters/14189a27.jpg") },
  { id: "18572ab5", title: "Bea", subtitle: "and the great swarm vote", narrator: "Bea", styleLabel: "Colored-pencil picture book", durationSec: 57, created: "1 week ago", watched: true, category: "nature", poster: require("../../../assets/posters/18572ab5.jpg") },
  { id: "0d581496", title: "Ada", subtitle: "and the secret of the spinning coil", narrator: "Ada", styleLabel: "Pencil sketch", durationSec: 66, created: "1 week ago", watched: false, category: "science", poster: require("../../../assets/posters/0d581496.jpg") },
  { id: "0de626de", title: "Hazel", subtitle: "and the living soup", narrator: "Hazel", styleLabel: "Ink & watercolor", durationSec: 71, created: "2 weeks ago", watched: true, category: "nature", poster: require("../../../assets/posters/0de626de.jpg") },
  { id: "0e5f30c6", title: "Gus", subtitle: "and the secret of staying warm", narrator: "Gus", styleLabel: "Papercraft diorama", durationSec: 59, created: "2 weeks ago", watched: false, category: "science", poster: require("../../../assets/posters/0e5f30c6.jpg") },
  { id: "19a4ccab", title: "Lumi", subtitle: "and the invisible roads of the sky", narrator: "Lumi", styleLabel: "Brush ink", durationSec: 62, created: "3 weeks ago", watched: true, category: "history", poster: require("../../../assets/posters/19a4ccab.jpg") },
  { id: "1b1d5e2e", title: "Wren", subtitle: "ve yerin altındaki gizli şehirler", narrator: "Wren", styleLabel: "Gouache storybook", durationSec: 68, created: "3 weeks ago", watched: false, category: "history", poster: require("../../../assets/posters/1b1d5e2e.jpg") },
  { id: "19def244", title: "Rio", subtitle: "y el tango del puerto", narrator: "Rio", styleLabel: "Marker sketch", durationSec: 60, created: "1 month ago", watched: true, category: "machines", poster: require("../../../assets/posters/19def244.jpg") },
  { id: "0ff2664d", title: "Bo", subtitle: "and the wiggly tooth", narrator: "Bo", styleLabel: "Kid's crayon", durationSec: 54, created: "1 month ago", watched: true, category: "nature", poster: require("../../../assets/posters/0ff2664d.jpg") },
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
