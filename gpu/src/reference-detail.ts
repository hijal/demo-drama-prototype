/** Keep full reference sheets available; essential mode needs just the approved front. */
export function referenceViews(detail: string | undefined) {
  if (detail === "essential") return [];
  if (detail === undefined || detail === "full")
    return ["face", "left", "right", "back"];
  throw new Error("Invalid reference detail; choose essential or full");
}
