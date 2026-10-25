type Item = { kind: "ok" | "warn" | "muted"; text: string };

export function analyze(prompt: string, refsCount: number): Item[] {
  const items: Item[] = [];
  const trimmed = prompt.trim();
  if (!trimmed) return items;

  // ── Reference tags ──
  const tags = [...trimmed.matchAll(/<(Picture|Video|Audio) (\d+)>/g)];
  if (tags.length === 0) {
    if (refsCount > 0) {
      items.push({
        kind: "warn",
        text: `References are not linked - enter @ in the prompt (${refsCount} loaded)`,
      });
    }
  } else {
    // Уникальные теги: повторное использование того же референса
    // (например, два раза <Picture 1>) — это ОДИН тег.
    const unique = new Set(tags.map((t) => t[0]));
    const maxNum = Math.max(...tags.map((t) => parseInt(t[2], 10)));
    if (maxNum > refsCount) {
      items.push({
        kind: "warn",
        text: `Tag no.${maxNum} indicates a non-existent reference (loaded ${refsCount})`,
      });
    } else {
      const repeated = tags.length - unique.size;
      items.push({
        kind: "ok",
        text: `References: ${unique.size} tag(s)${repeated > 0 ? ` · repetitions: ${repeated}` : ""}`,
      });
    }
  }

  // ── Dialogue balance ──
  const dOpen = (trimmed.match(/<d>/g) || []).length;
  const dClose = (trimmed.match(/<\/d>/g) || []).length;
  if (dOpen !== dClose) {
    items.push({
      kind: "warn",
      text: `Unclosed <d> - opening ${dOpen}, closing ${dClose}`,
    });
  }
  const longLine = [...trimmed.matchAll(/<d>(.*?)<\/d>/g)].find(
    (m) => m[1].trim().split(/\s+/).length > 12,
  );
  if (longLine) {
    items.push({
      kind: "warn",
      text: "Long line (>12 words) - voice acting likes short phrases",
    });
  }

  // ── Size ──
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const sentences = Math.max(1, (trimmed.match(/[.!?]+(\s|$)/g) || []).length);
  if (sentences < 3 || sentences > 6) {
    items.push({
      kind: "muted",
      text: `${words} words · ${sentences} sentence — optimally 3–6 sentences`,
    });
  } else {
    items.push({
      kind: "muted",
      text: `${words} words · ${sentences} sentence`,
    });
  }

  return items;
}
