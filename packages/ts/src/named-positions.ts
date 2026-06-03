/**
 * Named-position registry.
 *
 * The schema's coordinate_named.properties.named is a free-form string
 * (no enum), so CANONICAL_NAMED is empty. Custom positions are declared
 * under named_positions.custom as an object whose keys are the position
 * names (not an array).
 */

export const CANONICAL_NAMED: Set<string> = new Set();

/**
 * Returns the union of canonical names and any document-declared custom
 * named positions. Custom positions live at doc.named_positions.custom
 * and the position name is the object key.
 */
export function knownNamed(doc: Record<string, unknown>): Set<string> {
  const set = new Set(CANONICAL_NAMED);
  const namedPositions = doc.named_positions as Record<string, unknown> | undefined;
  if (namedPositions && typeof namedPositions === "object") {
    const custom = namedPositions.custom as Record<string, unknown> | undefined;
    if (custom && typeof custom === "object") {
      for (const name of Object.keys(custom)) {
        set.add(name);
      }
    }
  }
  return set;
}
