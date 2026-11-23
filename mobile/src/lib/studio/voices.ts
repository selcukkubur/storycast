export async function checkVoice(_input: { id: string }, _lang: string): Promise<{ speaks: boolean }> {
  return { speaks: true };
}
