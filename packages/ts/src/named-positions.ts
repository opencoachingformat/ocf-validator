// Canonical OCF named positions come from the spec catalog (language-neutral data
// in shared/named-positions.json), NOT from the JSON schema — the schema's
// coordinate_named.named is a free-form string with no enum. The Python mirror
// loads the same JSON file. Document-declared custom positions (named_positions.custom)
// are merged in at runtime.
import catalog from "../../../shared/named-positions.json" with { type: "json" };

export const CANONICAL_NAMED: Set<string> = new Set(
  (catalog as { positions: string[] }).positions,
);

export function knownNamed(doc: Record<string, unknown>): Set<string> {
  const set = new Set(CANONICAL_NAMED);
  const np = (doc.named_positions ?? {}) as Record<string, unknown>;
  const custom = (np.custom ?? {}) as Record<string, unknown>;
  for (const name of Object.keys(custom)) set.add(name);
  return set;
}
