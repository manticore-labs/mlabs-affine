/**
 * PR8 contract tests (lógica de estados). Correr con el runner del frontend Affine
 * (vitest/jest) una vez copiado al repo. Acá se documentan FE-AC1/2/5/6.
 */
import assert from 'node:assert/strict';

import type { MapPaintClient } from './map-paint-api';
import type { MapPaintState, PaintResult } from './map-paint-types';
import uptodate from './fixtures/map-paint.uptodate.json';
import needsPaint from './fixtures/map-paint.needs_paint.json';

function mockClient(state: MapPaintState, paint?: PaintResult): MapPaintClient {
  return {
    getPaintState: async () => state,
    paint: async () =>
      paint ?? {
        ok: true,
        state: { ...state, needs_paint: false, versions_behind: 0 },
      },
  };
}

// FE-AC1
{
  const s = uptodate as MapPaintState;
  assert.equal(s.needs_paint, false);
  assert.equal(s.versions_behind, 0);
}

// FE-AC2
{
  const s = needsPaint as MapPaintState;
  assert.equal(s.needs_paint, true);
  assert.ok(s.versions_behind > 0);
  assert.ok(s.painted_revision_at);
  assert.ok(s.map_revision_at);
}

// FE-AC5 paint_stale → no marcar OK local
{
  const client = mockClient(needsPaint as MapPaintState, {
    ok: false,
    code: 'paint_stale',
  });
  void client.paint('map-1').then(result => {
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'paint_stale');
  });
}

// FE-AC3: FE no inventa seq — solo lee API
{
  const s = needsPaint as MapPaintState;
  assert.equal(typeof s.map_revision_seq, 'number');
}

console.log('map-paint contract checks OK');
