/**
 * Shared text helpers for the web app.
 */

// Display-side cap for long AI-metadata strings (John's Tier 1 #1): the API
// accepts up to 32KB prompts/notes; the UI should never render that raw into
// a disclosure panel or the player (layout + local-engine hygiene). Truncate
// with an ellipsis and a title tooltip carrying the full text.
export function clampText(value: string | null | undefined, max = 200): string {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}
