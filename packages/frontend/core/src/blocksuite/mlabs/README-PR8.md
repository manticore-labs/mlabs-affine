# PR8 — FE Pintar Affine (SDE-2140)

**Depende** de Mateo **SDE-2117** (contrato `map_revision`) + HTTP bridge en `mlabs-affine-compose`.

## Estado

- Tipos/fixtures alineados a `map_revision.schema.json`.
- `MapPaintBanner` en tab **Pintar** (`panel.tsx`).
- Cliente:
  - `GET {base}/maps/{mapId}/paint_state`
  - `POST {base}/maps/{mapId}/paint` + header `x-mlabs-bridge-token` (lab default `bridge-token`)
  - Wire seed: `POST {base}/maps/{mapId}/revision` `{ map_revision, paint_ready }` (bridge)

## Errores tipados

`PAINT_STALE` · `PAINT_UNAUTHORIZED` · `PAINT_NOT_READY` · `MAP_REGISTRY_UNAVAILABLE`

## No hacer

- No materializar snapshot / sha256 en el cliente.
- No merge/reconcile (PR7).
