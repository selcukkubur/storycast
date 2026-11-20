export type Voice = { id: string; name: string; description: string }

export const VOICES: Voice[] = [
  {
    "id": "ZF6FPAbjXT4488VcRRnw",
    "name": "Amelia",
    "description": "young British female, enthusiastic, clear"
  },
  {
    "id": "bIHbv24MWmeRgasZH58o",
    "name": "Will",
    "description": "young US male, relaxed optimist"
  },
  {
    "id": "TumdjBNWanlT3ysvclWh",
    "name": "Peter",
    "description": "youthful, casual, easygoing"
  },
  {
    "id": "pPdl9cQBQq4p6mRkZy2Z",
    "name": "Emma",
    "description": "adorable, animation / kids"
  },
  {
    "id": "4u5cJuSmHP9d6YRolsOu",
    "name": "Jonathan",
    "description": "youthful UK, audiobook"
  },
  {
    "id": "8JVbfL6oEdmuxKn5DK2C",
    "name": "Johnny Kid",
    "description": "young British male, calm, serious"
  },
  {
    "id": "wJqPPQ618aTW29mptyoc",
    "name": "Ana Rita",
    "description": "young British female, smooth narration"
  },
  {
    "id": "7S3KNdLDL7aRgBVRQb1z",
    "name": "Nathaniel",
    "description": "deep, rich, mature British, documentary"
  },
  {
    "id": "fCxG8OHm4STbIsWe4aT9",
    "name": "Harrison Gale",
    "description": "deep velvety baritone, documentary"
  },
  {
    "id": "XjLkpWUlnhS8i7gGz3lZ",
    "name": "David Castlemore",
    "description": "crisp middle-aged US, long-form"
  },
  {
    "id": "0rEo3eAjssGDUCXHYENf",
    "name": "Grandma Rachel",
    "description": "warm senior Southern storyteller"
  },
  {
    "id": "JBFqnCBsd6RMkjVDRZzb",
    "name": "George",
    "description": "warm, captivating British storyteller"
  }
]

export const voiceOf = (id: string): Voice => VOICES.find((v) => v.id === id) ?? VOICES[0]
