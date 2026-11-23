import { beforeEach, describe, expect, it } from "vitest";
import { allRecords, configureStore, loadRecord, saveRecord, type FilmRecord } from "./store";

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  configureStore({ getItem: async (k) => memory.get(k) ?? null, setItem: async (k, v) => void memory.set(k, v) });
});

const rec = (id: string, created: number): FilmRecord =>
  ({ id, created, status: "running", stage: "queued", result: {}, error: "", events: [], state: {} }) as unknown as FilmRecord;

describe("store", () => {
  it("saves, loads and upserts records", async () => {
    await saveRecord(rec("a", 1));
    expect((await loadRecord("a"))?.id).toBe("a");
    await saveRecord({ ...rec("a", 1), stage: "shots" });
    expect((await loadRecord("a"))?.stage).toBe("shots");
    expect(await loadRecord("missing")).toBeNull();
  });

  it("lists records newest first", async () => {
    await saveRecord(rec("old", 1));
    await saveRecord(rec("new", 3));
    expect((await allRecords()).map((r) => r.id)).toEqual(["new", "old"]);
  });
});
