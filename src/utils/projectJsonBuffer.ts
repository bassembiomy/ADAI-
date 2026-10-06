const yieldToInput = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** Desktop IPC still accepts a JSON object. Keep its unavoidable decode/parse
 * work in separate tasks from worker delivery and subsequent save bookkeeping. */
export async function parseProjectJsonBuffer(buffer: ArrayBuffer): Promise<any> {
  await yieldToInput();
  const text = new TextDecoder().decode(buffer);
  await yieldToInput();
  const payload = JSON.parse(text);
  await yieldToInput();
  return payload;
}
