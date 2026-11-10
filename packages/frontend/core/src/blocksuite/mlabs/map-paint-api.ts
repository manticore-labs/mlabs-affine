import type { MapPaintState, PaintResult } from './map-paint-types';

export type MapPaintClient = {
  getPaintState: (mapId: string) => Promise<MapPaintState>;
  paint: (mapId: string) => Promise<PaintResult>;
};

/** Cliente real: apuntar al bridge PR6. En tests se inyecta un mock. */
export function createBridgeMapPaintClient(baseUrl: string): MapPaintClient {
  return {
    async getPaintState(mapId: string) {
      const res = await fetch(`${baseUrl}/maps/${encodeURIComponent(mapId)}/paint_state`);
      if (!res.ok) throw new Error(`paint_state HTTP ${res.status}`);
      return (await res.json()) as MapPaintState;
    },
    async paint(mapId: string) {
      try {
        const res = await fetch(`${baseUrl}/maps/${encodeURIComponent(mapId)}/paint`, {
          method: 'POST',
        });
        if (res.status === 409) {
          return { ok: false, code: 'paint_stale' as const };
        }
        if (res.status === 401 || res.status === 403) {
          return { ok: false, code: 'PAINT_UNAUTHORIZED' as const };
        }
        if (!res.ok) {
          return { ok: false, code: 'network' as const, message: `HTTP ${res.status}` };
        }
        const state = (await res.json()) as MapPaintState;
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
