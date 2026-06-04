import type { OcfDoc } from "./types.js";
import { getFrames } from "./context.js";

export interface FrameState {
  carrierOf(ballId: string): string | null;
  looseAt(ballId: string): { x?: number; y?: number; named?: string } | null;
  ballCount: number;
}

interface BallState {
  carried_by?: string;
  at?: { x?: number; y?: number; named?: string };
  dead?: boolean;
}

function makeFrameState(map: Map<string, BallState>): FrameState {
  return {
    ballCount: [...map.values()].filter((b) => !b.dead).length,
    carrierOf: (id) => map.get(id)?.carried_by ?? null,
    looseAt: (id) => map.get(id)?.at ?? null,
  };
}

export function possessionByFrame(doc: OcfDoc): FrameState[] {
  const current = new Map<string, BallState>();
  for (const b of (((doc as { balls?: unknown[] }).balls ?? []) as Record<string, unknown>[])) {
    if (typeof b.id === "string") {
      current.set(b.id, {
        carried_by: b.carried_by as string | undefined,
        at: b.at as BallState["at"],
        dead: b.dead as boolean | undefined,
      });
    }
  }

  const frames = getFrames(doc);
  const states: FrameState[] = [];
  for (const frame of frames) {
    // Snapshot current state (entering this frame) — deep copy so later mutations don't backfill
    states.push(makeFrameState(new Map([...current].map(([k, v]) => [k, { ...v }]))));
    // Apply end_state.balls to current for next frame
    const endBalls = ((frame.end_state ?? {}) as Record<string, unknown>).balls as
      Record<string, BallState> | undefined;
    if (endBalls) {
      for (const [id, st] of Object.entries(endBalls)) current.set(id, { ...st });
    }
  }
  return states;
}
