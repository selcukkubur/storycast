export type FilmRecord = Record<string, any> & { id: string; watermark?: boolean; job_id?: string };

export type KeyValueStore = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };

let storage: KeyValueStore | null = null;
export function configureStore(next: KeyValueStore) {
  storage = next;
}
async function kv(): Promise<KeyValueStore> {
  if (!storage) storage = (await import("@react-native-async-storage/async-storage")).default as KeyValueStore;
  return storage;
}

const KEY = "storycast.films.v1";

async function readAll(): Promise<FilmRecord[]> {
  try {
    return JSON.parse((await (await kv()).getItem(KEY)) ?? "[]") as FilmRecord[];
  } catch {
    return [];
  }
}

export async function saveRecord(rec: FilmRecord): Promise<void> {
  const all = await readAll();
  const next = [rec, ...all.filter((r) => r.id !== rec.id)].sort((a, b) => b.created - a.created);
  await (await kv()).setItem(KEY, JSON.stringify(next));
}

export async function loadRecord(id: string): Promise<FilmRecord | null> {
  return (await readAll()).find((r) => r.id === id) ?? null;
}

export async function allRecords(): Promise<FilmRecord[]> {
  return readAll();
}
