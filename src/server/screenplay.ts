export type ParsedScene = {
  heading: string;
  screenplay: string;
  summary: string;
};
/** Fountain-compatible scene headings; preserve dialogue/action verbatim for editing. */
export function parseScreenplay(text: string): {
  preamble: string;
  scenes: ParsedScene[];
} {
  const scenes: ParsedScene[] = [];
  const before: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = line.trim();
    if (
      /^(?:\.?INT\.?\/EXT\.?|\.?EXT\.?\/INT\.?|\.?INT\.?|\.?EXT\.?|I\/E\.)(?:\s|$)/i.test(
        heading,
      )
    )
      scenes.push({
        heading: heading.replace(/^\./, ""),
        screenplay: "",
        summary: "",
      });
    else if (scenes.length) scenes[scenes.length - 1].screenplay += line + "\n";
    else before.push(line);
  }
  for (const scene of scenes) {
    scene.screenplay = scene.screenplay.trim();
    scene.summary =
      scene.screenplay
        .split("\n")
        .find((s) => s.trim())
        ?.slice(0, 500) || "";
  }
  return { preamble: before.join("\n").trim(), scenes };
}
