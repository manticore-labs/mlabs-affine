/** PR8 — campos freeze GET map_revision / paint_state (PR6). */

export type MapPaintState = {
  map_revision: string | null;
  map_revision_seq: number | null;
  map_revision_at: string | null;
  painted_revision: string | null;
  painted_revision_seq: number | null;
  painted_revision_at: string | null;
  painted_at: string | null;
  needs_paint: boolean;
  versions_behind: number;
};

export type PaintResult =
  | { ok: true; state: MapPaintState }
  | { ok: false; code: 'paint_stale' | 'PAINT_UNAUTHORIZED' | 'network'; message?: string };
