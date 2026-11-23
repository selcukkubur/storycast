import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { app: string; input: any }[] = [];

vi.mock("./fal", () => ({
  FalError: class extends Error {},
  isKeyError: () => false,
  duration: vi.fn(async () => 3),
  upload: vi.fn(async () => "https://fal.media/wm.png"),
  run: vi.fn(async (app: string, input: any) => {
    calls.push({ app, input });
    if (app.includes("images-to-video")) return { video: { url: `https://fal.media/still-${calls.length}.mp4` } };
    if (app.includes("metadata")) return { media: { duration: 3 } };
    if (app.startsWith("openai/gpt-image")) return { images: [{ url: "https://fal.media/img.png" }] };
    if (app.includes("tts")) return { audio: { url: "https://fal.media/a.mp3" } };
    if (app.includes("music")) return { audio: { url: "https://fal.media/m.mp3" } };
    if (app.includes("reference-to-video") || app.includes("lip-sync")) return { video: { url: "https://fal.media/clip.mp4" }, duration: 3 };
    if (app.includes("trim-video")) return { video: { url: "https://fal.media/trim.mp4" } };
    if (app.includes("merge-videos")) return { video: { url: "https://fal.media/merged.mp4" } };
    if (app.includes("compose")) return { video_url: "https://fal.media/composed.mp4" };
    if (app.includes("loudnorm")) return { audio: { url: "https://fal.media/mix.mp3" } };
    if (app.includes("merge-audio-video")) return { video: { url: "https://fal.media/clean.mp4" } };
    if (app.includes("auto-subtitle")) return { video: { url: "https://fal.media/film.mp4" } };
    if (app.includes("extract-frame")) return { images: [{ url: "https://fal.media/f.png" }] };
    return {};
  }),
}));

vi.mock("./director", () => ({
  plan: vi.fn(async () => ({
    title: "T",
    subtitle: "S",
    slug: "t",
    character: { name: "Pip", traits: "small mouse", pronoun: "its" },
    voice_id: "v1",
    blocks: [{ kind: "V", text: "Hello world, this is a test story.", scene: "a room", action: "waves", shot: "S01", id: "B01" }],
    tail: { scene: "end card", shot: "S02", action: "" },
    music_prompt: "soft",
    continuity: {},
  })),
  describeStyle: vi.fn(),
  describeCharacter: vi.fn(),
  resizeLine: vi.fn(async (t: string) => t),
  rephraseScene: vi.fn(async (s: string) => s),
  translate: vi.fn(async (t: string) => t),
}));

import { newRecord, runFilm } from "./pipeline";
import { upload } from "./fal";
import { configureStore } from "./store";

const memory = new Map<string, string>();
configureStore({ getItem: async (k) => memory.get(k) ?? null, setItem: async (k, v) => void memory.set(k, v) });

const input = {
  topic: "test",
  style: "stick-figure",
  minutes: 1,
  lang: "en",
  style_url: "https://fal.media/style.png",
  character_url: "",
  character_name: "",
  character_id: "pip",
  voice: { voice_id: "v1" },
  resolution: "480P" as const,
};

beforeEach(() => {
  calls.length = 0;
  memory.clear();
  vi.mocked(upload).mockClear();
});

describe("pipeline", () => {
  it("runs a one-block film to done and reports events", async () => {
    const rec = newRecord(input);
    const events: string[] = [];
    const done = await runFilm(rec, (e) => events.push(e.stage));
    expect(done.status).toBe("done");
    expect(done.result.video).toMatch(/^https:\/\/fal\.media\//);
    expect(events).toContain("shots");
    expect(events).toContain("subtitles");
    const merge = calls.filter((c) => c.app.includes("merge-videos")).at(-1)!;
    expect(done.state.watermark_clip).toBeUndefined();
    expect(merge.input.video_urls.at(-1)).toBe(done.state.card_clip);
    expect(calls.filter((c) => c.app.includes("images-to-video"))).toHaveLength(1);
    expect(upload).not.toHaveBeenCalled();
  });

  it("appends the watermark clip before the end card only for trial jobs", async () => {
    const rec = newRecord(input);
    rec.watermark = true;
    const done = await runFilm(rec, () => {});
    const merge = calls.filter((c) => c.app.includes("merge-videos")).at(-1)!;
    const stills = calls.filter((c) => c.app.includes("images-to-video"));
    expect(stills.length).toBe(2); // end card + watermark seal
    expect(merge.input.video_urls.length).toBeGreaterThanOrEqual(3); // cut + seal + card
    const urls = merge.input.video_urls;
    expect(urls.slice(-2)).toEqual([done.state.watermark_clip, done.state.card_clip]);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith({ uri: "file:///wm.png", name: "watermark.png", type: "image/png" });
  });
});
