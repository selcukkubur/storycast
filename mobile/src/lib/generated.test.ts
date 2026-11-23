import { describe, expect, it } from "vitest";
import { recordToFilm } from "./generated";
import type { FilmRecord } from "./studio/store";

const base = {
  id: "abc123",
  created: 1_760_000_000,
  status: "done",
  title: "Nib",
  subtitle: "",
  style: "stick-figure",
  style_label: "Stick figure",
  narrator: { name: "Pip" },
  result: { video: "https://fal.media/film.mp4", clean: "https://fal.media/clean.mp4", duration: 63.2 },
} as unknown as FilmRecord;

describe("recordToFilm", () => {
  it("maps a finished record to a library film", () => {
    const film = recordToFilm(base)!;
    expect(film.id).toBe("abc123");
    expect(film.video).toBe("https://fal.media/film.mp4");
    expect(film.durationSec).toBe(63);
    expect(film.generated).toBe(true);
    expect(film.poster).toBeTruthy();
  });

  it("returns null for unfinished or empty records", () => {
    expect(recordToFilm({ ...base, status: "running" } as FilmRecord)).toBeNull();
    expect(recordToFilm({ ...base, result: {} } as FilmRecord)).toBeNull();
  });
});
