/** PR8 — freeze GET map_revision (SDE-2117 / Mateo's pack_wire_store.get_map_state). */

export type MapPaintState = {
  map_id: string;
  map_revision: string;
  map_revision_seq: number;
  map_revision_at: string;
  painted_revision?: string;
  painted_revision_seq?: number;
  painted_revision_at?: string;
  painted_at?: string;
  needs_paint: boolean;
  versions_behind: number;
};

/** confirm_paint response (map_paint_state.schema.json). */
export type MapPaintConfirm = {
  map_id: string;
  painted_revision: string;
  painted_revision_seq: number;
  painted_revision_at: string;
  painted_at: string;
};

export type PaintFailCode =
  | 'PAINT_STALE'
  | 'PAINT_UNAUTHORIZED'
  | 'PAINT_NOT_READY'
  | 'MAP_REGISTRY_UNAVAILABLE'
  | 'network';

export type PaintResult =
  | { ok: true; state: MapPaintState }
  | { ok: false; code: PaintFailCode; message?: string };
