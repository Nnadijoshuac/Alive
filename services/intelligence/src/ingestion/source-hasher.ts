import { hashCanonical } from "@alive/shared";

/**
 * Every downstream fact/citation binds to this hash, not to the raw text
 * itself — so two ingestions of byte-identical normalized text always
 * produce the same source identity, and any edit is detectable.
 */
export function hashSourceText(normalizedText: string): `0x${string}` {
  return hashCanonical({ sourceTextVersion: 1, text: normalizedText });
}
