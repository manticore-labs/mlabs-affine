import { useCallback, useState } from 'react';

import type { MapPaintClient } from './map-paint-api';
import type { MapPaintState } from './map-paint-types';

export type MapPaintBannerProps = {
  mapId: string;
  client: MapPaintClient;
  initial?: MapPaintState;
};

/**
 * Banner pintado vs actual + CTA Pintar (gate I1 / map_revision).
 * needs_paint / versions_behind solo desde API — no recalcular hash/seq acá.
 */
export function MapPaintBanner({ mapId, client, initial }: MapPaintBannerProps) {
  const [state, setState] = useState<MapPaintState | null>(initial ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await client.getPaintState(mapId);
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setLoading(false);
    }
  }, [client, mapId]);

  const onPaint = useCallback(async () => {
    if (!state) return;
    setLoading(true);
    setError(null);
    const result = await client.paint(mapId, state.map_revision);
    if (!result.ok) {
      setError(result.code);
      if (result.code === 'PAINT_STALE') {
        try {
          setState(await client.getPaintState(mapId));
        } catch {
          /* keep previous */
        }
      }
      setLoading(false);
      return;
    }
    setState(result.state);
    setLoading(false);
  }, [client, mapId, state]);

  if (!state) {
    return (
      <div data-testid="map-paint-empty">
        <button type="button" disabled={loading} onClick={() => void refresh()}>
          Cargar estado de pintura
        </button>
        {error ? <p data-testid="map-paint-error">{error}</p> : null}
      </div>
    );
  }

  if (!state.needs_paint && state.versions_behind === 0) {
    return <div data-testid="map-paint-uptodate">Mapa al día</div>;
  }

  const firstPaint = state.painted_at == null && state.painted_revision == null;
  return (
    <div data-testid="map-paint-banner" role="status">
      <p>
        {firstPaint
          ? 'Este mapa aún no fue pintado.'
          : `${state.versions_behind} versión(es) atrás.`}
      </p>
      <p data-testid="map-paint-compare">
        Pintado: {state.painted_revision_at ?? '—'} · Actual:{' '}
        {state.map_revision_at ?? '—'}
      </p>
      <button
        type="button"
        data-testid="map-paint-button"
        disabled={loading}
        onClick={() => void onPaint()}
      >
        {firstPaint ? 'Pintar por primera vez' : 'Pintar'}
      </button>
      {error ? <p data-testid="map-paint-error">{error}</p> : null}
    </div>
  );
}
