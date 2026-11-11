/**
 * PR8 contract tests vs Mateo SDE-2117 MapStore GET shape.
 * node --experimental-strip-types or tsx from this folder.
 */
import assert from 'node:assert/strict';

import type { MapPaintClient } from './map-paint-api';
import type { MapPaintState, PaintResult } from './map-paint-types';
import uptodate from './fixtures/map-paint.uptodate.json';
import needsPaint from './fixtures/map-paint.needs_paint.json';
import first from './fixtures/map-paint.first.json';

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

const SHA = /^[0-9a-f]{64}$/;

// FE-AC1 uptodate
{
  const s = uptodate as MapPaintState;
  assert.equal(s.needs_paint, false);
  assert.equal(s.versions_behind, 0);
  assert.match(s.map_revision, SHA);
  assert.equal(s.map_revision, s.painted_revision);
}

// FE-AC2 needs_paint (Mateo get.behind shape)
{
  const s = needsPaint as MapPaintState;
  assert.equal(s.needs_paint, true);
  assert.ok(s.versions_behind > 0);
  assert.ok(s.painted_revision_at);
  assert.ok(s.map_revision_at);
  assert.match(s.map_revision, SHA);
}

// FE-AC first paint: painted_* omitted
{
  const s = first as MapPaintState;
  assert.equal(s.needs_paint, true);
  assert.equal(s.painted_revision, undefined);
  assert.equal(s.painted_at, undefined);
}

// FE-AC5 PAINT_STALE → no marcar OK local
{
  const client = mockClient(needsPaint as MapPaintState, {
    ok: false,
    code: 'PAINT_STALE',
  });
  void client.paint('map:demo', (needsPaint as MapPaintState).map_revision).then(result => {
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'PAINT_STALE');
  });
}

// FE-AC3: FE no inventa seq — solo lee API
{
  const s = needsPaint as MapPaintState;
  assert.equal(typeof s.map_revision_seq, 'number');
  assert.ok(s.map_id.length > 0);
}

console.log('map-paint contract checks OK (aligned SDE-2117)');
