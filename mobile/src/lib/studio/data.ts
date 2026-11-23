import config from "../../../assets/data/config.json";

export type Voice = {
  voice_id: string;
  name: string;
  gender: string;
  age: string;
  accent: string;
  description: string;
};

export type CastFull = {
  id: string;
  name: string;
  traits: string;
  pronoun: string;
  personality: string;
  style: string;
  style_label: string;
  hero: string;
  sheet: string;
  thumb?: string;
  group?: string;
  voice: Voice;
};

export type StyleFull = {
  id: string;
  label: string;
  ref: string;
  anchor: string;
  motion: string;
  palette?: { bg?: string; text?: string; accent?: string };
  character_hint?: string;
  blurb?: string;
  category?: string;
  thumb?: string;
};

export type Language = { code: string; name: string; native: string; font: string };

export type StudioData = {
  characters: CastFull[];
  styles: StyleFull[];
  languages: Language[];
  curated_voices: Record<string, string>;
  cameras: string[];
  max_minutes: number;
};

let cached: StudioData | null = null;

export async function studioData(): Promise<StudioData> {
  if (!cached) {
    const c = config as unknown as StudioData;
    cached = {
      characters: c.characters,
      // the director does `d.palette ??= {...}` in place, so every style gets its own palette copy
      styles: c.styles.map((s) => (s.palette ? { ...s, palette: { ...s.palette } } : { ...s })),
      languages: c.languages,
      curated_voices: c.curated_voices,
      cameras: c.cameras,
      max_minutes: c.max_minutes,
    };
  }
  return cached;
}
