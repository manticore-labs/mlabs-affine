type SurfaceLike = {
  yMap?: { get?: (key: string) => unknown; toJSON?: () => unknown };
  mlabsAttrs?: unknown;
  serialize?: () => Record<string, unknown>;
};

function readAttrsExternalId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const map = raw as {
    get?: (key: string) => unknown;
    externalId?: string;
  };
  if (typeof map.get === 'function') {
    const fromGet = map.get('externalId');
    if (typeof fromGet === 'string' && fromGet.length > 0) return fromGet;
  }
  if (typeof map.externalId === 'string' && map.externalId.length > 0) {
    return map.externalId;
  }
  return undefined;
}

/** Read mlabs externalId from a selected surface model (Y.Map / plain / serialize). */
export function readSelectedExternalId(
  models: SurfaceLike[]
): string | undefined {
  for (const model of models) {
    const fromY = readAttrsExternalId(model.yMap?.get?.('mlabsAttrs'));
    if (fromY) return fromY;

    const fromProp = readAttrsExternalId(model.mlabsAttrs);
    if (fromProp) return fromProp;

    try {
      const json = model.yMap?.toJSON?.() as
        | { mlabsAttrs?: unknown }
        | undefined;
      const fromJson = readAttrsExternalId(json?.mlabsAttrs);
      if (fromJson) return fromJson;
    } catch {
      /* ignore */
    }

    try {
      const ser = model.serialize?.();
      const fromSer = readAttrsExternalId(ser?.mlabsAttrs);
      if (fromSer) return fromSer;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}
