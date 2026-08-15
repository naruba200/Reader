import type { DictionaryEntry } from "../types";
import { parsePackLine } from "./pack";

export interface StreamCallbacks {
  /** Called once per successfully parsed entry. Awaiting it pauses the stream. */
  onEntry?: (entry: DictionaryEntry, index: number) => void | Promise<void>;
  /** Called after each chunk is read. */
  onProgress?: (receivedBytes: number) => void;
}

export interface StreamResult {
  bytes: number;
  count: number;
}

/**
 * Consume a ReadableStream of NDJSON, parsing one entry per line. Lines are
 * processed as the bytes stream in, so large packs (tens of MB) are never held
 * in memory as a single parsed JSON object.
 */
export async function consumeNdJsonStream(
  stream: ReadableStream<Uint8Array>,
  callbacks: StreamCallbacks = {},
): Promise<StreamResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;
  let count = 0;

  const processLine = async (line: string) => {
    const entry = parsePackLine(line);
    if (!entry) return;
    count += 1;
    if (callbacks.onEntry) await callbacks.onEntry(entry, count - 1);
  };

  const flushCompleteLines = async () => {
    let idx = buffer.indexOf("\n");
    while (idx !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      await processLine(line);
      idx = buffer.indexOf("\n");
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    buffer += decoder.decode(value, { stream: true });
    await flushCompleteLines();
    if (callbacks.onProgress) callbacks.onProgress(bytes);
  }
  buffer += decoder.decode();
  await flushCompleteLines();
  // Process a final line that does not end with a newline.
  if (buffer.trim()) {
    await processLine(buffer);
    buffer = "";
  }
  return { bytes, count };
}