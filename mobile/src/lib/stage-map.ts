export type UiStage =
  | "script"
  | "character"
  | "voice"
  | "keyframes"
  | "shots"
  | "score"
  | "edit"
  | "subtitles";

export const UI_STAGES: UiStage[] = [
  "script",
  "character",
  "voice",
  "keyframes",
  "shots",
  "score",
  "edit",
  "subtitles",
];

const EVENT_TO_UI: Record<string, UiStage> = {
  director: "script",
  character: "character",
  voice: "voice",
  keyframes: "keyframes",
  shots: "shots",
  music: "score",
  assemble: "edit",
  subtitles: "subtitles",
};

export function mapEventStage(stage: string): UiStage | "done" | "error" | null {
  if (stage === "done" || stage === "error") return stage;
  return EVENT_TO_UI[stage] ?? null;
}

export function stageProgress(stage: UiStage | "done" | "error" | null): number {
  if (stage === "done") return 100;
  if (!stage || stage === "error") return 0;
  return Math.round(((UI_STAGES.indexOf(stage) + 1) / UI_STAGES.length) * 100);
}
