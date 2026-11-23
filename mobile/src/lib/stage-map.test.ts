import { describe, expect, it } from "vitest";
import { UI_STAGES, mapEventStage, stageProgress } from "./stage-map";

describe("stage map", () => {
  it("maps every pipeline event stage to a UI stage", () => {
    const pairs: [string, string][] = [
      ["director", "script"],
      ["character", "character"],
      ["voice", "voice"],
      ["keyframes", "keyframes"],
      ["shots", "shots"],
      ["music", "score"],
      ["assemble", "edit"],
      ["subtitles", "subtitles"],
      ["done", "done"],
      ["error", "error"],
    ];
    for (const [event, ui] of pairs) expect(mapEventStage(event)).toBe(ui);
  });

  it("treats unknown or bookkeeping stages as null", () => {
    expect(mapEventStage("queued")).toBeNull();
    expect(mapEventStage("render")).toBeNull();
    expect(mapEventStage("nonsense")).toBeNull();
  });

  it("computes progress from the stage position", () => {
    expect(stageProgress("script")).toBe(13);
    expect(stageProgress("subtitles")).toBe(100);
    expect(stageProgress("done")).toBe(100);
    expect(stageProgress(null)).toBe(0);
    expect(UI_STAGES).toHaveLength(8);
  });
});
