import { beforeEach, describe, expect, it } from "vitest";
import { FILMS } from "@/src/flows/shared/mock-data";
import { generatedFilms, recordToFilm } from "./generated";
import { configureStore, saveRecord, type FilmRecord } from "./studio/store";

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

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  configureStore({ getItem: async (k) => memory.get(k) ?? null, setItem: async (k, v) => void memory.set(k, v) });
});

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

  it("carries the topic and language through", () => {
    const film = recordToFilm({ ...base, topic: "Why is the sky blue?", lang: "tr" } as FilmRecord)!;
    expect(film.topic).toBe("Why is the sky blue?");
    expect(film.lang).toBe("tr");
  });

  it("defaults the language to English when the record has none", () => {
    const film = recordToFilm({ ...base, topic: "How do bees make honey?" } as FilmRecord)!;
    expect(film.lang).toBe("en");
  });

  it("uses the film's own end-card still as the poster", () => {
    const film = recordToFilm({ ...base, result: { ...base.result, poster: "https://fal.media/end-card.jpg" } } as FilmRecord)!;
    expect(film.poster).toEqual({ uri: "https://fal.media/end-card.jpg" });
  });

  it("falls back to the seed poster when the record has no still", () => {
    expect(recordToFilm(base)!.poster).toBe(FILMS[0].poster);
  });
});

describe("generatedFilms", () => {
  it("lists finished films newest first and skips running records", async () => {
    const done = (id: string, created: number) =>
      ({ ...base, id, created, status: "done", result: { ...base.result } }) as unknown as FilmRecord;

    await saveRecord(done("older", 1));
    await saveRecord(done("newer", 3));
    await saveRecord({ ...done("inflight", 5), status: "running", result: {} } as FilmRecord);

    expect((await generatedFilms()).map((f) => f.id)).toEqual(["newer", "older"]);
  });
});
