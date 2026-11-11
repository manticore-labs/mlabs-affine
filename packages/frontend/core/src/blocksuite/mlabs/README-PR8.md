# PR8 — FE Pintar Affine (SDE-2140)

**Depende** de Mateo **SDE-2117 / PR #11** (`map_revision` + `MapStore.get_map_state` / `confirm_paint`).

## Estado

- Tipos/fixtures alineados a `contracts/map_revision.schema.json` (sha256 64 hex, `map_id`, `needs_paint`, `versions_behind`).
- `MapPaintBanner` cableado en tab **Pintar** del panel (`panel.tsx`).
- Cliente `createBridgeMapPaintClient(FRAMEWORK)` espera:
  - `GET {base}/maps/{mapId}/paint_state` → Map GET state
  - `POST {base}/maps/{mapId}/paint` body `{ map_revision }` → paint_state; luego re-GET
- **HTTP del bridge aún residual** en PR #11 (Mateo lo marcó P1). Hasta que exista ruta, el banner falla al cargar / se usa mock en tests.

## Errores tipados (Mateo)

`PAINT_STALE` · `PAINT_UNAUTHORIZED` · `PAINT_NOT_READY` · `MAP_REGISTRY_UNAVAILABLE`

## No hacer

- No materializar snapshot / sha256 en el cliente.
- No merge/reconcile (PR7).
- No paint optimista final sin confirmación del API.
