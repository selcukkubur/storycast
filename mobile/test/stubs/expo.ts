/**
 * Shared node-side stand-ins for the native expo modules the studio code pulls in
 * (`billing` -> `expo-secure-store`, `expo-application`, `expo-crypto`).
 * `vitest.config.ts` aliases all three packages to this file, so native-only
 * modules never load under node; tests can read/write the same memory store.
 */
const secure = new Map<string, string>();

export const memory = secure;

export async function getItemAsync(key: string): Promise<string | null> {
  return secure.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  void secure.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  void secure.delete(key);
}

export async function getIosIdForVendorAsync(): Promise<string> {
  return "idfv-test";
}

export function randomUUID(): string {
  return "device-uuid-test";
}
