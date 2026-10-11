// Small helpers shared by the host session readers.

/** A non-negative whole token count, or 0 for anything else. */
export function count(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/**
 * Yields each JSON object line of a JSONL text. `prefilter` is a cheap string
 * test run before parsing: a session line can carry megabytes of tool output,
 * and a reader that needs only counters should not parse those. A line that is
 * not JSON (a torn last line, for example) is skipped, never fatal.
 */
export function* jsonLines(text, prefilter) {
  for (const line of String(text).split(/\r?\n/)) {
    if (line.length === 0) continue;
    if (prefilter !== undefined && !prefilter(line)) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry !== null && typeof entry === "object") yield entry;
  }
}
