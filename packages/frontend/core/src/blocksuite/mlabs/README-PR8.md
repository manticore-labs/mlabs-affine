# PR8 — FE Pintar Affine (pack Alejo)

**Depende** del contrato GET/paint de PR6 (o mocks de este pack).

## Qué hacer

1. Copiá estos archivos al repo `modules/affine/...` (mismas rutas relativas).
2. Cableá `MapPaintBanner` dentro del panel Mlabs (`panel.tsx`) cuando el mapa exista — **sin inventar hashes/seq en el FE**.
3. Corré tests del mock (Vitest/node del paquete frontend, según el repo).

## Archivos

| Relativo al repo | Rol |
|---|---|
| `.../mlabs/map-paint-types.ts` | Tipos freeze PR6 |
| `.../mlabs/map-paint-api.ts` | Cliente GET + paint (inyectable) |
| `.../mlabs/map-paint-banner.tsx` | Banner + botón Pintar |
| `.../mlabs/map-paint-banner.test.ts` | FE-AC1/2/5/6 con mock |
| `.../mlabs/fixtures/map-paint.*.json` | Respuestas mock |

## No hacer

- No materializar snapshot / sha256 en el cliente.
- No merge/reconcile (PR7).
- No paint optimista final sin confirmación del API.
