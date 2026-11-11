import type { MapPaintConfirm, MapPaintState, PaintFailCode, PaintResult } from './map-paint-types';

export type MapPaintClient = {
  getPaintState: (mapId: string) => Promise<MapPaintState>;
  /** Confirm paint for the revision the banner is showing (compare-and-set). */
  paint: (mapId: string, mapRevision: string) => Promise<PaintResult>;
};

const FAIL_CODES = new Set<PaintFailCode>([
  'PAINT_STALE',
  'PAINT_UNAUTHORIZED',
  'PAINT_NOT_READY',
  'MAP_REGISTRY_UNAVAILABLE',
]);

function failCodeFromBody(body: unknown, httpStatus: number): PaintFailCode {
  const code =
    body && typeof body === 'object' && 'code' in body
      ? String((body as { code: unknown }).code)
      : '';
  if (FAIL_CODES.has(code as PaintFailCode)) return code as PaintFailCode;
  if (httpStatus === 409) return 'PAINT_STALE';
  if (httpStatus === 401 || httpStatus === 403) return 'PAINT_UNAUTHORIZED';
  if (httpStatus === 503) return 'MAP_REGISTRY_UNAVAILABLE';
  return 'network';
}

/**
 * Cliente bridge → contrato Mateo's MapStore (HTTP aún residual en PR #11).
 * Paths esperados cuando el bridge exponga GET/POST.
 */
export function createBridgeMapPaintClient(baseUrl: string): MapPaintClient {
  const root = baseUrl.replace(/\/$/, '');

  async function getPaintState(mapId: string): Promise<MapPaintState> {
    const res = await fetch(
      `${root}/maps/${encodeURIComponent(mapId)}/paint_state`
    );
    if (!res.ok) throw new Error(`paint_state HTTP ${res.status}`);
    return (await res.json()) as MapPaintState;
  }

  return {
    getPaintState,
    async paint(mapId: string, mapRevision: string) {
      try {
        const res = await fetch(
          `${root}/maps/${encodeURIComponent(mapId)}/paint`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ map_revision: mapRevision }),
          }
        );
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        if (!res.ok) {
          return {
            ok: false,
            code: failCodeFromBody(body, res.status),
            message: `HTTP ${res.status}`,
          };
        }
        // confirm returns paint_state only — re-GET full map state.
        const confirm = body as MapPaintConfirm;
        const state = await getPaintState(mapId);
        if (
          confirm?.painted_revision &&
          state.painted_revision !== confirm.painted_revision
        ) {
          return {
            ok: true,
            state: {
              ...state,
              painted_revision: confirm.painted_revision,
              painted_revision_seq: confirm.painted_revision_seq,
              painted_revision_at: confirm.painted_revision_at,
              painted_at: confirm.painted_at,
              needs_paint: state.map_revision !== confirm.painted_revision,
              versions_behind:
                state.map_revision === confirm.painted_revision
                  ? 0
                  : state.versions_behind,
            },
          };
        }
        return { ok: true, state };
      } catch (err) {
        return {
          ok: false,
          code: 'network',
          message: err instanceof Error ? err.message : 'network',
        };
      }
    },
  };
}
