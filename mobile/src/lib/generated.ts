import { FILMS } from "@/src/flows/shared/mock-data";
import type { Film } from "@/src/flows/shared/types";
import { allRecords, type FilmRecord } from "./studio/store";

export function recordToFilm(rec: FilmRecord): Film | null {
  const r = rec.result ?? {};
  if (rec.status !== "done" || !r.video) return null;
  return {
    id: rec.id,
    title: rec.title || "Untitled film",
    subtitle: rec.subtitle ?? "",
    narrator: rec.narrator?.name ?? "Narrator",
    styleLabel: rec.style_label || rec.style,
    durationSec: Math.round(r.duration ?? 0),
    created: new Date(rec.created * 1000).toLocaleDateString(),
    watched: false,
    generated: true,
    poster: r.poster ? { uri: r.poster } : FILMS[0].poster,
    video: r.video,
    topic: rec.topic ?? "",
    lang: rec.lang ?? "en",
    resolution: rec.resolution === "768P" ? "768P" : "480P",
  };
}

export async function generatedFilms(): Promise<Film[]> {
  return (await allRecords()).map(recordToFilm).filter((f): f is Film => Boolean(f));
}
