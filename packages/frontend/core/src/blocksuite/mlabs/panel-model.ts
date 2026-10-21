export const PAGE_FILE_NAME = 'mlabs-page.txt';
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Strip mlabs: so canvas short ids and registry full ids compare equal. */
export function normalizeExtId(id: string): string {
  return id.replace(/^mlabs:/, '');
}

export type FeedbackNode = {
  externalId: string;
  kind: string;
  label: string;
  statement: string;
};

/** Pick the option value that matches a canvas/toolbar external id. */
export function matchFeedbackExternalId(
  nodes: Array<{ externalId: string }>,
  wanted: string | undefined
): string | undefined {
  if (!wanted) return undefined;
  const want = normalizeExtId(wanted);
  const hit = nodes.find(
    n =>
      n.externalId === wanted ||
      normalizeExtId(n.externalId) === want ||
      n.externalId === want ||
      `mlabs:${normalizeExtId(n.externalId)}` === wanted
  );
  if (hit) return hit.externalId;
  // Canvas HITL cards use q-<parentExt>; fall back to the parent artifact/actor.
  if (want.startsWith('q-')) {
    const parent = want.slice(2);
    if (parent) {
      return matchFeedbackExternalId(nodes, parent);
    }
  }
  return undefined;
}

/**
 * Dropdown options for 💬 feedback: actors + artifacts + HITL question cards
 * (canvas paints those as q-<parentExt> — they must appear in the select).
 */
export function buildFeedbackNodes(tree: RegistryTree | null): FeedbackNode[] {
  const nodes: FeedbackNode[] = [];
  const seen = new Set<string>();
  const push = (node: FeedbackNode) => {
    const id = normalizeExtId(node.externalId);
    if (!id || seen.has(id) || id.includes('smoke')) return;
    seen.add(id);
    nodes.push({ ...node, externalId: id });
  };

  for (const a of tree?.actors ?? []) {
    push({
      externalId: a.external_id,
      kind: a.kind,
      label: a.name,
      statement: '',
    });
  }
  for (const art of tree?.artifacts ?? []) {
    const ext = art.external_id;
    push({
      externalId: ext,
      kind: art.kind,
      label: art.body?.label || art.kind.toUpperCase(),
      statement: String(art.body?.statement ?? ''),
    });
    if (art.body?.needs_human && art.body?.question) {
      const q = String(art.body.question);
      push({
        externalId: `q-${normalizeExtId(ext)}`,
        kind: 'question',
        label: q,
        statement: q,
      });
    }
  }
  return nodes;
}

const ALLOWED_EXTENSIONS = new Set([
  'csv',
  'doc',
  'docx',
  'htm',
  'html',
  'md',
  'markdown',
  'mdx',
  'pdf',
  'pptx',
  'txt',
  'vtt',
  'xls',
  'xlsx',
]);

const DATASET_LINK = 'mlabs';
const DATASET_KEY = 'dify_dataset_id';
const WHY_KEY = 'why';
const DOC_SYNC_NOTE_KEY = 'doc_sync_note_id';

/** H1 title of the Pintar-synced page note (export MD). */
export const DOC_SYNC_TITLE = 'Mlabs Framework';

export type WhyIndicator = 'leading' | 'lagging';

export type WhyDraft = {
  statement: string;
  indicator_type: WhyIndicator;
  from: string;
  to: string;
  unit: string;
  okr_alignment: string;
};

type PageMap = {
  get: (key: string) => unknown;
  set: (key: string, value: string) => void;
};

export type PageDoc = {
  getMap: (name: string) => PageMap;
  transact?: (fn: () => void) => void;
};

export type SourceDocument = {
  id: string;
  name: string;
  indexing_status: string;
  error: string | null;
  change?: 'new' | 'modified' | 'unchanged';
};

export function readDatasetId(doc: PageDoc | undefined): string | undefined {
  if (!doc) return undefined;
  const value = doc.getMap(DATASET_LINK).get(DATASET_KEY);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function writeDatasetId(doc: PageDoc, datasetId: string) {
  const apply = () => doc.getMap(DATASET_LINK).set(DATASET_KEY, datasetId);
  if (doc.transact) doc.transact(apply);
  else apply();
}

export function emptyWhy(): WhyDraft {
  return {
    statement: '',
    indicator_type: 'leading',
    from: '',
    to: '',
    unit: '',
    okr_alignment: '',
  };
}

export function readWhy(doc: PageDoc | undefined): WhyDraft {
  const blank = emptyWhy();
  if (!doc) return blank;
  const raw = doc.getMap(DATASET_LINK).get(WHY_KEY);
  if (typeof raw !== 'string' || raw.length === 0) return blank;
  try {
    const body = JSON.parse(raw) as Partial<WhyDraft>;
    const indicator = body.indicator_type === 'lagging' ? 'lagging' : 'leading';
    return {
      statement: typeof body.statement === 'string' ? body.statement : '',
      indicator_type: indicator,
      from: typeof body.from === 'string' ? body.from : '',
      to: typeof body.to === 'string' ? body.to : '',
      unit: typeof body.unit === 'string' ? body.unit : '',
      okr_alignment:
        typeof body.okr_alignment === 'string' ? body.okr_alignment : '',
    };
  } catch {
    return blank;
  }
}

export function writeWhy(doc: PageDoc, draft: WhyDraft) {
  const payload = JSON.stringify({
    statement: draft.statement.trim(),
    indicator_type: draft.indicator_type,
    from: draft.from.trim(),
    to: draft.to.trim(),
    unit: draft.unit.trim(),
    okr_alignment: draft.okr_alignment.trim(),
  });
  const apply = () => doc.getMap(DATASET_LINK).set(WHY_KEY, payload);
  if (doc.transact) doc.transact(apply);
  else apply();
}

export function readDocSyncNoteId(
  doc: PageDoc | undefined
): string | undefined {
  if (!doc) return undefined;
  const value = doc.getMap(DATASET_LINK).get(DOC_SYNC_NOTE_KEY);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function writeDocSyncNoteId(doc: PageDoc, noteId: string) {
  const apply = () => doc.getMap(DATASET_LINK).set(DOC_SYNC_NOTE_KEY, noteId);
  if (doc.transact) doc.transact(apply);
  else apply();
}

function stripLanePrefix(label: string, kind: string): string {
  const re = new RegExp(`^(${kind})\\s*[·.•\\-–:]?\\s*`, 'i');
  return label.replace(re, '').trim() || label;
}

/**
 * Markdown outline for the page note synced on Pintar.
 * Impact Mapping + BDD Z4 — same lanes as the canvas; exportable via Affine MD.
 */
export function frameworkMarkdownFromTree(
  tree: RegistryTree | null,
  opts?: { generatedAt?: string }
): string {
  const actors = (tree?.actors ?? []).filter(
    a => !a.external_id.includes('smoke')
  );
  const edges = tree?.edges ?? [];
  const artifacts = (tree?.artifacts ?? []).filter(Boolean);
  const byUuid = new Map(actors.filter(a => a.id).map(a => [String(a.id), a]));
  const artifactById = new Map(
    artifacts.filter(a => a.id).map(a => [String(a.id), a])
  );

  const memberOf = new Map<string, string[]>();
  const playsRole = new Map<string, string>();
  for (const e of edges) {
    const from = e.from_id ? byUuid.get(String(e.from_id)) : undefined;
    const to = e.to_id ? byUuid.get(String(e.to_id)) : undefined;
    if (!from || !to) continue;
    const fe = shortId(from.external_id);
    const te = shortId(to.external_id);
    if (e.rel === 'member_of' && to.kind === 'team' && from.kind === 'person') {
      const list = memberOf.get(te) ?? [];
      list.push(fe);
      memberOf.set(te, list);
    }
    if (
      e.rel === 'plays_role' &&
      to.kind === 'role' &&
      from.kind === 'person'
    ) {
      playsRole.set(fe, to.name);
    }
  }

  const teams = actors
    .filter(a => a.kind === 'team')
    .sort((a, b) => {
      const ha = Number(a.attrs?.hierarchy ?? 99);
      const hb = Number(b.attrs?.hierarchy ?? 99);
      return ha - hb || a.name.localeCompare(b.name, 'es');
    });

  const memberPersonExts = new Set<string>();
  for (const list of memberOf.values()) {
    for (const ext of list) memberPersonExts.add(ext);
  }
  const orphans = actors.filter(
    a => a.kind === 'person' && !memberPersonExts.has(shortId(a.external_id))
  );

  const whys = artifacts.filter(a => a.kind === 'why');
  const byParent = new Map<string, typeof artifacts>();
  for (const a of artifacts) {
    if (!a.parent_id) continue;
    const list = byParent.get(String(a.parent_id)) ?? [];
    list.push(a);
    byParent.set(String(a.parent_id), list);
  }
  const scenarios = artifacts.filter(a => a.kind === 'scenario');
  const scenByParent = new Map<string, typeof scenarios>();
  for (const sc of scenarios) {
    const parent = sc.parent_id
      ? artifactById.get(String(sc.parent_id))
      : undefined;
    const key = parent?.external_id ?? '';
    if (!key) continue;
    const list = scenByParent.get(key) ?? [];
    list.push(sc);
    scenByParent.set(key, list);
  }

  const lines: string[] = [];
  const stamp = opts?.generatedAt ?? new Date().toISOString();
  lines.push(`# ${DOC_SYNC_TITLE}`);
  lines.push('');
  lines.push(`_Generado por Pintar · ${stamp}_`);
  lines.push('');
  lines.push('## EQUIPOS');
  lines.push('');

  const personLine = (ext: string) => {
    const person = actors.find(a => shortId(a.external_id) === ext);
    if (!person) return;
    const role =
      playsRole.get(ext) ||
      (typeof person.attrs?.title === 'string' ? person.attrs.title : '') ||
      'sin rol';
    const bits = [`${person.name} — ${role}`];
    if (typeof person.attrs?.email === 'string' && person.attrs.email) {
      bits.push(String(person.attrs.email));
    }
    lines.push(`- ${bits.join(' · ')}`);
  };

  if (teams.length === 0 && orphans.length === 0) {
    lines.push('_Sin equipos en el registry._');
    lines.push('');
  }
  for (const team of teams) {
    const te = shortId(team.external_id);
    lines.push(`### ${team.name}`);
    lines.push('');
    const members = memberOf.get(te) ?? [];
    if (members.length === 0) {
      lines.push('- _(sin miembros)_');
    } else {
      for (const ext of members) personLine(ext);
    }
    lines.push('');
  }
  if (orphans.length > 0) {
    lines.push('### Sin equipo');
    lines.push('');
    for (const p of orphans) personLine(shortId(p.external_id));
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## Impact map');
  lines.push('');

  const pushHitl = (body?: { needs_human?: boolean; question?: string }) => {
    if (body?.needs_human && body?.question) {
      lines.push(`- HITL: ${String(body.question)}`);
      lines.push('');
    }
  };

  const pushArtifact = (
    art: NonNullable<RegistryTree['artifacts']>[number],
    heading: string,
    kind: string
  ) => {
    const label = stripLanePrefix(art.body?.label || kind.toUpperCase(), kind);
    lines.push(`${heading} ${kind.toUpperCase()} — ${label}`);
    lines.push('');
    const statement = String(art.body?.statement ?? '').trim();
    if (statement) {
      lines.push(statement);
      lines.push('');
    }
    pushHitl(art.body);
  };

  const whyList = whys.length > 0 ? whys : [];
  if (whyList.length === 0) {
    lines.push('_Sin artefactos WHY en el registry._');
    lines.push('');
  }

  for (const why of whyList) {
    pushArtifact(why, '###', 'why');
    const children = why.id ? (byParent.get(String(why.id)) ?? []) : [];
    for (const who of children.filter(c => c.kind === 'who')) {
      pushArtifact(who, '####', 'who');
    }
    for (const how of children.filter(c => c.kind === 'how')) {
      pushArtifact(how, '#####', 'how');
    }
    for (const what of children.filter(c => c.kind === 'what')) {
      pushArtifact(what, '######', 'what');
      const scens = scenByParent.get(what.external_id) ?? [];
      for (const sc of scens) {
        const scLabel = sc.body?.label || sc.external_id;
        lines.push(`**Scenario — ${scLabel}**`);
        lines.push('');
        const body = String(sc.body?.statement ?? '').trim();
        if (body) {
          lines.push('```gherkin');
          lines.push(body);
          lines.push('```');
          lines.push('');
        }
      }
    }
  }

  // Orphan scenarios (parent missing / not a what)
  const linked = new Set(
    [...scenByParent.values()].flat().map(s => s.external_id)
  );
  const orphanScens = scenarios.filter(s => !linked.has(s.external_id));
  if (orphanScens.length > 0) {
    lines.push('### SCENARIOS (sin WHAT padre)');
    lines.push('');
    for (const sc of orphanScens) {
      const scLabel = sc.body?.label || sc.external_id;
      lines.push(`**Scenario — ${scLabel}**`);
      lines.push('');
      const body = String(sc.body?.statement ?? '').trim();
      if (body) {
        lines.push('```gherkin');
        lines.push(body);
        lines.push('```');
        lines.push('');
      }
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Intermediate blocks for the doc-sync note (no BlockSuite Text dependency). */
export type NoteSeed =
  | { flavour: 'affine:paragraph'; type: string; text: string }
  | { flavour: 'affine:list'; type: string; text: string }
  | { flavour: 'affine:divider' }
  | { flavour: 'affine:code'; language: string; text: string };

/** Parse framework markdown into note seeds (h1–h6, list, hr, fenced code). */
export function noteSeedsFromMarkdown(markdown: string): NoteSeed[] {
  const seeds: NoteSeed[] = [];
  const lines = markdown.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.startsWith('```')) {
      const language = line.slice(3).trim() || 'text';
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        body.push(lines[i] ?? '');
        i += 1;
      }
      seeds.push({
        flavour: 'affine:code',
        language,
        text: body.join('\n'),
      });
      i += 1;
      continue;
    }
    if (line.trim() === '---') {
      seeds.push({ flavour: 'affine:divider' });
      i += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      seeds.push({
        flavour: 'affine:paragraph',
        type: `h${heading[1].length}`,
        text: heading[2],
      });
      i += 1;
      continue;
    }
    if (line.startsWith('- ')) {
      seeds.push({
        flavour: 'affine:list',
        type: 'bulleted',
        text: line.slice(2),
      });
      i += 1;
      continue;
    }
    if (line.trim().length === 0) {
      i += 1;
      continue;
    }
    const cleaned = line.replace(/^\*\*(.*)\*\*$/, '$1');
    seeds.push({
      flavour: 'affine:paragraph',
      type: 'text',
      text: cleaned,
    });
    i += 1;
  }
  return seeds;
}

/** Business goal only. People/teams/roles stay in WHO (not this slice). */
export function whyRejection(draft: WhyDraft): string | null {
  const statement = draft.statement.trim();
  if (statement.length === 0) return 'Escribí el objetivo de negocio.';
  if (statement.length > 400) return 'El objetivo supera 400 caracteres.';
  if (
    draft.indicator_type !== 'leading' &&
    draft.indicator_type !== 'lagging'
  ) {
    return 'Elegí leading o lagging.';
  }
  const from = Number(draft.from);
  const to = Number(draft.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return 'From y To tienen que ser números.';
  }
  const unit = draft.unit.trim();
  if (unit.length === 0 || unit.length > 40)
    return 'Indicá la unidad (máx. 40).';
  const okr = draft.okr_alignment.trim();
  if (okr.length > 200) return 'La alineación OKR supera 200 caracteres.';
  return null;
}

export function canonicalPageUrl(
  value: string | undefined
): string | undefined {
  if (!value || value.length > 500 || !/^https:\/\/\S+$/.test(value))
    return undefined;
  return value;
}

export function openRequestBody(input: {
  pageId: string;
  pageUrl?: string;
  datasetId?: string;
}) {
  const body: Record<string, string> = {
    command: 'mlabs-framework',
    page_id: input.pageId,
  };
  const pageUrl = canonicalPageUrl(input.pageUrl);
  if (pageUrl) body.page_url = pageUrl;
  if (input.datasetId) body.dataset_id = input.datasetId;
  return JSON.stringify(body);
}

export function uploadRejection(name: string, size: number): string | null {
  if (!name || name.length > 200 || name.includes('/') || name.includes('\\')) {
    return 'Nombre de archivo inválido.';
  }
  if (
    name === PAGE_FILE_NAME ||
    name === 'mlabs-page.json' ||
    name === 'mlabs-sync-state.txt'
  ) {
    return 'Ese archivo lo reserva el vínculo de la página.';
  }
  const extension = name.includes('.')
    ? name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    : '';
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return 'Dify no acepta ese tipo. Sirve pdf, md, txt, docx y formatos de texto parecidos.';
  }
  if (size <= 0) return 'El archivo está vacío.';
  if (size > MAX_FILE_BYTES) return 'Supera el tope de 15 MB.';
  return null;
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: 'Listo',
    error: 'Error',
    indexing: 'Indexando',
    waiting: 'En espera',
    parsing: 'Leyendo',
    splitting: 'Partiendo',
    cleaning: 'Limpiando',
  };
  return labels[status] ?? status;
}

/** True while Dify has not finished indexing (or failed). */
export function isDocumentIndexing(status: string): boolean {
  return status !== 'completed' && status !== 'error';
}

export function indexingNotice(documents: SourceDocument[]): string | null {
  const pending = documents.filter(doc =>
    isDocumentIndexing(doc.indexing_status)
  );
  if (pending.length === 0) return null;
  if (pending.length === 1) {
    return `“${pending[0].name}” todavía se indexa. Esperá a Listo para que Preguntar lo use entero.`;
  }
  return `${pending.length} archivos todavía se indexan. Esperá a Listo para que Preguntar los use enteros.`;
}

export function syncSummaryLabel(summary: {
  ready: number;
  indexing: number;
  error: number;
  total: number;
  new?: number;
  modified?: number;
  unchanged?: number;
  removed?: number;
}): string {
  const hasChanges =
    summary.new != null ||
    summary.modified != null ||
    summary.unchanged != null ||
    summary.removed != null;
  if (!hasChanges) {
    return `Listo ${summary.ready} · Indexando ${summary.indexing} · Error ${summary.error} (total ${summary.total}).`;
  }
  return (
    `Nuevas ${summary.new ?? 0} · Modificadas ${summary.modified ?? 0} · ` +
    `Iguales ${summary.unchanged ?? 0} · Quitadas ${summary.removed ?? 0} · ` +
    `Listo ${summary.ready} · Indexando ${summary.indexing} · Error ${summary.error}.`
  );
}

export function changeLabel(change: SourceDocument['change']): string {
  if (change === 'new') return 'Nueva';
  if (change === 'modified') return 'Modificada';
  if (change === 'unchanged') return 'Igual';
  return '';
}

export const SHAPE_W = 200;
export const MEMBER_W = 280;
export const MEMBER_H = 168;
export const TEAM_W = 160;
export const LANE_CHILD_W = 220;
export const LANE_CHILD_H = 128;
export const TITLE_H = 44;
export const SHAPE_GAP_Y = 20;
export const SHAPE_GAP_X = 28;
export const SECTION_GAP = 56;
export const COL_GAP = 28;
/** Gap = ~3 node widths so foreign content (images/notes) stays clearly clear. */
export const FOREIGN_GAP = LANE_CHILD_W * 3;
export const WHY_COL_W = 240;
export const METH_COL_W = 260;
export const EQUIPOS_W = TEAM_W + SHAPE_GAP_X + MEMBER_W;
/** [vertical, horizontal] text padding inside shapes */
export const SHAPE_PAD: [number, number] = [22, 28];
export const COLOR_TEXT_LIGHT = '#f5f5f5';
export const COLOR_TEXT_DARK = '#141414';
/**
 * Affine shape default is Inter 16 with lineGap — DOM wrap is wider/taller than
 * a naive monospace guess. CHAR_W≈9.5–10px avg; LINE_H covers ascent+gap.
 * Underestimating either → text overflows the painted xywh (recurrent).
 */
export const LINE_H = 24;
export const CHAR_W = 10;

export type CanvasNode = {
  id: string;
  role?: string;
  externalId?: string;
  text?: string;
};

export type PaintRole =
  | 'title'
  | 'team'
  | 'person'
  | 'role'
  | 'why'
  | 'who'
  | 'how'
  | 'what'
  | 'scenario'
  | 'question';

export type PaintShape = {
  role: PaintRole;
  externalId: string;
  name: string;
  text: string;
  xywh: string;
  fillColor: string;
  color: string;
  padding: [number, number];
  strokeStyle: 'solid' | 'dash';
  attrs: Record<string, string>;
};

export type PaintConnector = {
  fromExternalId: string;
  toExternalId: string;
};

export type PaintPlan = {
  shapes: PaintShape[];
  connectors: PaintConnector[];
};

export type RegistryTree = {
  actors?: Array<{
    id?: string;
    external_id: string;
    kind: string;
    name: string;
    status?: string;
    attrs?: Record<string, unknown>;
  }>;
  artifacts?: Array<{
    id?: string;
    external_id: string;
    kind: string;
    parent_id?: string | null;
    body?: {
      label?: string;
      statement?: string;
      needs_human?: boolean;
      question?: string;
    };
    verification?: string;
  }>;
  edges?: Array<{
    from_id?: string;
    to_id?: string;
    rel?: string;
  }>;
};

/** Person cards in EQUIPOS — cool indigo (Teams-adjacent), not neon green. */
const COLOR_PERSON = '#5b6bc0';
const COLOR_TITLE = '#2a2a2a';
/** Default team fill; real trees cycle TEAM_PALETTE by hierarchy index. */
const COLOR_TEAM = '#1f6f4a';
/**
 * Distinct team fills (Teams-style): one hue per squad so EQUIPOS reads as
 * separate groups, not one green slab. Cycles if more teams than slots.
 */
const TEAM_PALETTE = [
  '#1f6f4a', // forest
  '#2b6cb0', // blue
  '#2f855a', // emerald
  '#553c9a', // indigo
  '#b7791f', // amber
  '#2c7a7b', // teal
] as const;
/** HITL accent (alerts only). */
const COLOR_Q = '#c45c26';
/**
 * Lane palette (professional, readable on light canvas):
 * HOW/WHAT kept (teal family — approved). WHY/WHO retinted away from lime.
 * SCENARIOS = distinct violet (BDD Z4, not another teal).
 */
const COLOR_WHY = '#6b9bd1'; // sky — goals / vision
const COLOR_WHO = '#4a7fb5'; // steel blue — actors
const COLOR_HOW = '#4fa892'; // teal-green (activities) — kept
const COLOR_WHAT = '#3d8f9a'; // blue-teal (deliverables) — kept
const COLOR_SCENARIO = '#6b4c9a'; // violet — Gherkin / Z4 (distinct)
/** @deprecated alias — use laneFill('why') */
const COLOR_PROPOSED = COLOR_WHY;

export function shapeCaption(label: string, statement?: string): string {
  const body = (statement ?? '').trim();
  if (!body) return label;
  const clipped = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  return `${label}\n${clipped}`;
}

/** Strip redundant WHY/WHO/HOW/WHAT prefix — section title already names the kind. */
export function methodologyCardText(
  label: string,
  statement?: string,
  kind?: string
): string {
  const kindRe = kind
    ? new RegExp(`^${kind}\\s*[·.•\\-–:]?\\s*`, 'i')
    : /^(WHY|WHO|HOW|WHAT|SCENARIO)\s*[·.•\-–:]?\s*/i;
  const clean = (label || '').replace(kindRe, '').trim() || label;
  const body = (statement ?? '').trim();
  if (!body) return clean;
  if (body === clean) return clean;
  return `${clean}\n${body}`;
}

/**
 * Visual length for wrap estimates: emoji / wide glyphs ≈ 2× Latin.
 * JS string.length undercounts ❓/emoji vs Affine Inter metrics.
 */
export function visualLen(text: string): number {
  let n = 0;
  for (const ch of text || '') {
    const cp = ch.codePointAt(0) ?? 0;
    // BMP Latin/punct ≈ 1; emoji, symbols, CJK ≈ 2
    n += cp > 0xff || ch === '❓' ? 2 : 1;
  }
  return Math.max(1, n);
}

/** Height so text + padding fits; never smaller than minH. */
export function cardHeightForText(
  text: string,
  width: number,
  minH: number
): number {
  const innerW = Math.max(40, width - SHAPE_PAD[1] * 2);
  const charsPerLine = Math.max(8, Math.floor(innerW / CHAR_W));
  let lines = 0;
  for (const line of (text || ' ').split('\n')) {
    lines += Math.max(1, Math.ceil(visualLen(line) / charsPerLine));
  }
  return Math.max(minH, SHAPE_PAD[0] * 2 + lines * LINE_H + 8);
}

/** Width from longest line; clamped so short labels stay compact. */
export function cardWidthForText(
  text: string,
  minW: number,
  maxW: number
): number {
  let longest = 1;
  for (const line of (text || ' ').split('\n')) {
    longest = Math.max(longest, visualLen(line));
  }
  const ideal = SHAPE_PAD[1] * 2 + longest * CHAR_W;
  return Math.min(maxW, Math.max(minW, ideal));
}

export function teamFill(index: number): string {
  const i =
    ((index % TEAM_PALETTE.length) + TEAM_PALETTE.length) % TEAM_PALETTE.length;
  return TEAM_PALETTE[i] ?? COLOR_TEAM;
}

function stackHeight(
  kids: Array<{ text: string; q?: string; w: number }>,
  fallbackW: number
): number {
  if (kids.length === 0) return LANE_CHILD_H;
  let h = 0;
  for (const kid of kids) {
    const w = kid.w || fallbackW;
    h += cardHeightForText(kid.text, w, LANE_CHILD_H) + SHAPE_GAP_Y;
    if (kid.q) {
      h += cardHeightForText(`❓ ${kid.q}`, w, LANE_CHILD_H) + SHAPE_GAP_Y;
    }
  }
  return Math.max(LANE_CHILD_H, h - SHAPE_GAP_Y);
}

export function laneFill(kind: 'why' | 'who' | 'how' | 'what'): string {
  if (kind === 'why') return COLOR_WHY;
  if (kind === 'who') return COLOR_WHO;
  if (kind === 'how') return COLOR_HOW;
  return COLOR_WHAT;
}

function textOn(fill: string): string {
  const darkFills = new Set<string>([
    COLOR_TITLE,
    COLOR_TEAM,
    COLOR_PERSON,
    COLOR_Q,
    COLOR_WHY,
    COLOR_WHO,
    COLOR_HOW,
    COLOR_WHAT,
    COLOR_SCENARIO,
    ...TEAM_PALETTE,
  ]);
  return darkFills.has(fill) ? COLOR_TEXT_LIGHT : COLOR_TEXT_DARK;
}

function shortId(externalId: string): string {
  return externalId.replace(/^mlabs:/, '') || externalId;
}

function attrStr(
  attrs: Record<string, unknown> | undefined,
  key: string
): string {
  const v = attrs?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

export function personCardText(
  name: string,
  attrs: Record<string, unknown> | undefined,
  roleName?: string
): string {
  const title = attrStr(attrs, 'title') || roleName || '';
  const email = attrStr(attrs, 'email');
  const affine = attrStr(attrs, 'affine_user_id');
  const plane = attrStr(attrs, 'plane_user_id');
  const given = attrStr(attrs, 'given_name');
  const family = attrStr(attrs, 'family_name');
  const lines = [
    name,
    title ? `Rol: ${title}` : '',
    given || family
      ? `Nombre: ${[given, family].filter(Boolean).join(' ')}`
      : '',
    email ? `📧 ${email}` : '📧 —',
    `Affine: ${affine || '—'}`,
    `Plane: ${plane || '—'}`,
  ].filter(Boolean);
  return lines.join('\n');
}

const OWN_ROLES = new Set<string>([
  'title',
  'person',
  'team',
  'role',
  'why',
  'who',
  'how',
  'what',
  'scenario',
  'question',
  'connector',
]);
const OWN_TEXT = new Set<string>([
  'EQUIPOS',
  'WHY',
  'WHO',
  'HOW',
  'WHAT',
  'SIN EQUIPO',
  'SCENARIOS',
]);
const OWN_EXTERNAL = new Set<string>([
  'title-equipos',
  'title-why',
  'title-who',
  'title-how',
  'title-what',
  'title-orphans',
  'title-scenarios',
]);

export function isOwnNode(node: CanvasNode): boolean {
  return (
    (typeof node.role === 'string' && OWN_ROLES.has(node.role)) ||
    (typeof node.externalId === 'string' &&
      OWN_EXTERNAL.has(node.externalId)) ||
    node.id.startsWith('mlabs:') ||
    (typeof node.text === 'string' &&
      (OWN_TEXT.has(node.text) || node.text.startsWith('❓')))
  );
}

export function runOnStore(
  store: { transact?: (fn: () => void) => void } | undefined,
  fn: () => void
) {
  if (store?.transact) store.transact(fn);
  else fn();
}

export function parseXywh(
  xywh: string | undefined
): [number, number, number, number] | null {
  if (!xywh) return null;
  try {
    const parsed = JSON.parse(xywh) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 4 &&
      parsed.every(part => typeof part === 'number' && Number.isFinite(part))
    ) {
      return parsed as [number, number, number, number];
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Leftmost X among foreign (non-mlabs) elements — notes, images, shapes. */
export function foreignMinX(xywhs: Array<string | undefined>): number | null {
  const xs: number[] = [];
  for (const xywh of xywhs) {
    const box = parseXywh(xywh);
    if (box) xs.push(box[0]);
  }
  if (xs.length === 0) return null;
  return Math.min(...xs);
}

export function planBounds(shapes: PaintShape[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    const b = parseXywh(s.xywh);
    if (!b) continue;
    const [x, y, w, h] = b;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function shiftShapes(shapes: PaintShape[], dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  for (const s of shapes) {
    const b = parseXywh(s.xywh);
    if (!b) continue;
    s.xywh = `[${b[0] + dx},${b[1] + dy},${b[2]},${b[3]}]`;
  }
}

function box(
  row: Omit<PaintShape, 'xywh' | 'color' | 'padding'> &
    Partial<Pick<PaintShape, 'color' | 'padding'>>,
  x: number,
  y: number,
  w: number,
  h: number
): PaintShape {
  const fill = row.fillColor;
  return {
    ...row,
    color: row.color ?? textOn(fill),
    padding: row.padding ?? SHAPE_PAD,
    xywh: `[${x},${y},${w},${h}]`,
  };
}

/** Default / fallback + real tree lane layout. */
export function paintPlan(foreignLeft: number | null): PaintPlan {
  return paintPlanFromTree(null, foreignLeft);
}

export function paintPlanFromTree(
  tree: RegistryTree | null,
  foreignLeft: number | null
): PaintPlan {
  // Bands left→right: EQUIPOS | WHY | WHO | HOW | WHAT. Rows = one WHY + kids.
  // Layout at (0,0); shift left of foreign content after measuring width.
  const shapes: PaintShape[] = [];
  const connectors: PaintConnector[] = [];

  const actors = (tree?.actors ?? []).filter(
    a => !a.external_id.includes('smoke')
  );
  const edges = tree?.edges ?? [];
  const artifacts = (tree?.artifacts ?? []).filter(Boolean);
  const byUuid = new Map(actors.filter(a => a.id).map(a => [String(a.id), a]));

  const memberOf = new Map<string, string[]>();
  const playsRole = new Map<string, string>();
  for (const e of edges) {
    const from = e.from_id ? byUuid.get(String(e.from_id)) : undefined;
    const to = e.to_id ? byUuid.get(String(e.to_id)) : undefined;
    if (!from || !to) continue;
    const fe = shortId(from.external_id);
    const te = shortId(to.external_id);
    if (e.rel === 'member_of' && to.kind === 'team' && from.kind === 'person') {
      const list = memberOf.get(te) ?? [];
      list.push(fe);
      memberOf.set(te, list);
    }
    if (
      e.rel === 'plays_role' &&
      to.kind === 'role' &&
      from.kind === 'person'
    ) {
      playsRole.set(fe, to.name);
    }
    if (e.rel === 'reports_to') {
      connectors.push({ fromExternalId: fe, toExternalId: te });
    }
  }

  const teams = actors
    .filter(a => a.kind === 'team')
    .sort((a, b) => {
      const ha = Number(a.attrs?.hierarchy ?? 99);
      const hb = Number(b.attrs?.hierarchy ?? 99);
      return ha - hb || a.name.localeCompare(b.name, 'es');
    });

  const memberPersonExts = new Set<string>();
  for (const list of memberOf.values()) {
    for (const ext of list) memberPersonExts.add(ext);
  }
  const orphans = actors.filter(
    a => a.kind === 'person' && !memberPersonExts.has(shortId(a.external_id))
  );

  const whys = artifacts.filter(a => a.kind === 'why');
  const byParent = new Map<string, typeof artifacts>();
  for (const a of artifacts) {
    if (!a.parent_id) continue;
    const list = byParent.get(String(a.parent_id)) ?? [];
    list.push(a);
    byParent.set(String(a.parent_id), list);
  }
  const whyList =
    whys.length > 0
      ? whys
      : [
          {
            id: 'fallback-why',
            external_id: 'why-tiempo',
            kind: 'why',
            body: {
              label: 'Tiempo',
              statement: 'Reducir tiempo de decisión.',
              needs_human: true,
              question: '¿SLA objetivo en horas?',
            },
          },
        ];
  const scenarios = artifacts.filter(a => a.kind === 'scenario');
  const artifactById = new Map(
    artifacts.filter(a => a.id).map(a => [String(a.id), a])
  );

  // —— Left: EQUIPOS ——
  let leftY = 0;
  shapes.push(
    box(
      {
        role: 'title',
        externalId: 'title-equipos',
        name: 'EQUIPOS',
        text: 'EQUIPOS',
        fillColor: COLOR_TITLE,
        strokeStyle: 'solid',
        attrs: { section: 'equipos' },
      },
      0,
      leftY,
      EQUIPOS_W,
      TITLE_H
    )
  );
  leftY += TITLE_H + SHAPE_GAP_Y;

  if (teams.length === 0) {
    const teamExt = 'gestion-admin';
    const people = [
      {
        ext: 'adrian-eguez',
        name: 'Adrian Eguez',
        attrs: {
          title: 'CEO',
          email: 'adrian@manticore-labs.cc',
          affine_user_id: '58eefc79-b154-4202-a83c-9cfe6930c165',
        } as Record<string, unknown>,
      },
      {
        ext: 'mac-adrian',
        name: 'Mac Adrian',
        attrs: { title: 'CTO', email: 'mac@manticore-labs.cc' } as Record<
          string,
          unknown
        >,
      },
    ];
    const memberHeights = people.map(p =>
      cardHeightForText(personCardText(p.name, p.attrs), MEMBER_W, MEMBER_H)
    );
    const teamH =
      memberHeights.reduce((a, b) => a + b, 0) +
      Math.max(0, people.length - 1) * SHAPE_GAP_Y;
    shapes.push(
      box(
        {
          role: 'team',
          externalId: teamExt,
          name: 'Gestión y Administración',
          text: 'Gestión y\nAdministración',
          fillColor: teamFill(0),
          strokeStyle: 'solid',
          attrs: {},
        },
        0,
        leftY,
        TEAM_W,
        teamH
      )
    );
    let py = leftY;
    people.forEach((p, i) => {
      const ph = memberHeights[i] ?? MEMBER_H;
      shapes.push(
        box(
          {
            role: 'person',
            externalId: p.ext,
            name: p.name,
            text: personCardText(p.name, p.attrs),
            fillColor: COLOR_PERSON,
            strokeStyle: 'solid',
            attrs: {},
          },
          TEAM_W + SHAPE_GAP_X,
          py,
          MEMBER_W,
          ph
        )
      );
      connectors.push({ fromExternalId: teamExt, toExternalId: p.ext });
      py += ph + SHAPE_GAP_Y;
    });
    leftY += teamH + SECTION_GAP;
  } else {
    teams.forEach((team, teamIdx) => {
      const teamExt = shortId(team.external_id);
      const teamColor = teamFill(teamIdx);
      const memberExts = memberOf.get(teamExt) ?? [];
      const members = memberExts
        .map(ext => actors.find(a => shortId(a.external_id) === ext))
        .filter(Boolean) as NonNullable<(typeof actors)[number]>[];
      if (members.length === 0) {
        const vacantText = '(sin miembros cargados)';
        const ph = cardHeightForText(vacantText, MEMBER_W, MEMBER_H);
        shapes.push(
          box(
            {
              role: 'team',
              externalId: teamExt,
              name: team.name,
              text: team.name.replace(/ y /g, '\ny '),
              fillColor: teamColor,
              strokeStyle: 'solid',
              attrs: { hierarchy: String(team.attrs?.hierarchy ?? '') },
            },
            0,
            leftY,
            TEAM_W,
            ph
          )
        );
        shapes.push(
          box(
            {
              role: 'person',
              externalId: `${teamExt}-vacant`,
              name: '(sin miembros)',
              text: vacantText,
              fillColor: COLOR_PROPOSED,
              strokeStyle: 'dash',
              attrs: {},
            },
            TEAM_W + SHAPE_GAP_X,
            leftY,
            MEMBER_W,
            ph
          )
        );
        leftY += ph + SECTION_GAP;
      } else {
        const texts = members.map(person => {
          const pe = shortId(person.external_id);
          return personCardText(person.name, person.attrs, playsRole.get(pe));
        });
        const heights = texts.map(t =>
          cardHeightForText(t, MEMBER_W, MEMBER_H)
        );
        const teamH =
          heights.reduce((a, b) => a + b, 0) +
          Math.max(0, members.length - 1) * SHAPE_GAP_Y;
        shapes.push(
          box(
            {
              role: 'team',
              externalId: teamExt,
              name: team.name,
              text: team.name.replace(/ y /g, '\ny '),
              fillColor: teamColor,
              strokeStyle: 'solid',
              attrs: { hierarchy: String(team.attrs?.hierarchy ?? '') },
            },
            0,
            leftY,
            TEAM_W,
            teamH
          )
        );
        let py = leftY;
        members.forEach((person, i) => {
          const pe = shortId(person.external_id);
          const ph = heights[i] ?? MEMBER_H;
          shapes.push(
            box(
              {
                role: 'person',
                externalId: pe,
                name: person.name,
                text: texts[i] ?? person.name,
                fillColor: COLOR_PERSON,
                strokeStyle: 'solid',
                attrs: {
                  email: attrStr(person.attrs, 'email'),
                  affine_user_id: attrStr(person.attrs, 'affine_user_id'),
                  plane_user_id: attrStr(person.attrs, 'plane_user_id'),
                  external_id: person.external_id,
                },
              },
              TEAM_W + SHAPE_GAP_X,
              py,
              MEMBER_W,
              ph
            )
          );
          connectors.push({ fromExternalId: teamExt, toExternalId: pe });
          py += ph + SHAPE_GAP_Y;
        });
        leftY += teamH + SECTION_GAP;
      }
    });
  }

  if (orphans.length > 0) {
    shapes.push(
      box(
        {
          role: 'title',
          externalId: 'title-orphans',
          name: 'SIN EQUIPO',
          text: 'SIN EQUIPO',
          fillColor: COLOR_TITLE,
          strokeStyle: 'solid',
          attrs: { section: 'orphans' },
        },
        0,
        leftY,
        EQUIPOS_W,
        TITLE_H
      )
    );
    leftY += TITLE_H + SHAPE_GAP_Y;
    for (const person of orphans) {
      const pe = shortId(person.external_id);
      const text = personCardText(person.name, person.attrs, playsRole.get(pe));
      const ph = cardHeightForText(text, MEMBER_W, MEMBER_H);
      shapes.push(
        box(
          {
            role: 'person',
            externalId: pe,
            name: person.name,
            text,
            fillColor: COLOR_PERSON,
            strokeStyle: 'dash',
            attrs: {
              email: attrStr(person.attrs, 'email'),
              affine_user_id: attrStr(person.attrs, 'affine_user_id'),
              plane_user_id: attrStr(person.attrs, 'plane_user_id'),
              external_id: person.external_id,
            },
          },
          TEAM_W + SHAPE_GAP_X,
          leftY,
          MEMBER_W,
          ph
        )
      );
      leftY += ph + SHAPE_GAP_Y;
    }
    leftY += SECTION_GAP - SHAPE_GAP_Y;
  }

  // —— Methodology bands: WHY | WHO | HOW | WHAT (Impact Mapping) ——
  // Precompute card sizes so columns grow with content (not one fixed square).
  type KidPack = {
    ext: string;
    label: string;
    text: string;
    w: number;
    h: number;
    q?: string;
    qw?: number;
    qh?: number;
  };

  const METH_MIN = 200;
  const METH_MAX = 420;
  const WHY_MIN = 200;
  const WHY_MAX = 380;

  const rows = whyList.map(why => {
    const whyExt = why.external_id;
    const children = why.id
      ? (byParent.get(String(why.id)) ?? [])
      : artifacts.filter(
          a =>
            a.kind !== 'why' &&
            a.kind !== 'scenario' &&
            a.external_id.includes(whyExt.replace('why-', ''))
        );
    const packKids = (kids: typeof artifacts, kind: PaintRole): KidPack[] =>
      kids.map(c => {
        const label = c.body?.label || kind.toUpperCase();
        const text = methodologyCardText(label, c.body?.statement, kind);
        const w = cardWidthForText(text, METH_MIN, METH_MAX);
        const h = cardHeightForText(text, w, LANE_CHILD_H);
        const q =
          c.body?.needs_human && c.body?.question
            ? String(c.body.question)
            : undefined;
        const qText = q ? `❓ ${q}` : undefined;
        const qw = qText
          ? cardWidthForText(qText, METH_MIN, METH_MAX)
          : undefined;
        const qh = qText
          ? cardHeightForText(qText, qw ?? METH_MIN, LANE_CHILD_H)
          : undefined;
        return {
          ext: c.external_id,
          label,
          text,
          w: Math.max(w, qw ?? 0),
          h,
          q,
          qw,
          qh,
        };
      });

    const whyLabel = why.body?.label || 'Sin título';
    const whyText = methodologyCardText(whyLabel, why.body?.statement, 'why');
    const whyW = cardWidthForText(whyText, WHY_MIN, WHY_MAX);
    const whyH = cardHeightForText(whyText, whyW, LANE_CHILD_H);
    let whyQW: number | undefined;
    let whyQH: number | undefined;
    let whyQ: string | undefined;
    if (why.body?.needs_human && why.body?.question) {
      whyQ = String(why.body.question);
      const qText = `❓ ${whyQ}`;
      whyQW = cardWidthForText(qText, WHY_MIN, WHY_MAX);
      whyQH = cardHeightForText(qText, whyQW, LANE_CHILD_H);
    }

    return {
      why,
      whyExt,
      whyLabel,
      whyText,
      whyW: Math.max(whyW, whyQW ?? 0),
      whyH,
      whyQ,
      whyQW,
      whyQH,
      who: packKids(
        children.filter(c => c.kind === 'who'),
        'who'
      ),
      how: packKids(
        children.filter(c => c.kind === 'how'),
        'how'
      ),
      what: packKids(
        children.filter(c => c.kind === 'what'),
        'what'
      ),
    };
  });

  // Pack scenarios for column (keyed by parent external_id)
  type ScenPack = {
    ext: string;
    label: string;
    text: string;
    w: number;
    h: number;
    parentExt: string;
  };
  const scenByParent = new Map<string, ScenPack[]>();
  const allScenPacks: ScenPack[] = [];
  for (const sc of scenarios) {
    const parent = sc.parent_id
      ? artifactById.get(String(sc.parent_id))
      : undefined;
    const parentExt = parent?.external_id ?? '';
    const parentKind = parent?.kind?.toUpperCase() ?? '?';
    const parentLabel =
      parent?.body?.label || parent?.external_id || 'sin padre';
    const label = sc.body?.label || sc.external_id;
    const text = `${methodologyCardText(label, sc.body?.statement, 'scenario')}\n↳ ${parentKind}: ${parentLabel}`;
    const w = cardWidthForText(text, METH_MIN, METH_MAX);
    const h = cardHeightForText(text, w, LANE_CHILD_H);
    const pack: ScenPack = {
      ext: sc.external_id,
      label,
      text,
      w,
      h,
      parentExt,
    };
    allScenPacks.push(pack);
    if (!parentExt) continue;
    const list = scenByParent.get(parentExt) ?? [];
    list.push(pack);
    scenByParent.set(parentExt, list);
  }

  const whyColW = Math.max(
    WHY_COL_W,
    ...rows.map(r => r.whyW),
    ...rows.flatMap(r => (r.whyQW ? [r.whyQW] : []))
  );
  const whoColW = Math.max(
    METH_COL_W,
    METH_MIN,
    ...rows.flatMap(r => r.who.map(k => k.w))
  );
  const howColW = Math.max(
    METH_COL_W,
    METH_MIN,
    ...rows.flatMap(r => r.how.map(k => k.w))
  );
  const whatColW = Math.max(
    METH_COL_W,
    METH_MIN,
    ...rows.flatMap(r => r.what.map(k => k.w))
  );
  const scenColW = Math.max(
    METH_COL_W,
    METH_MIN,
    ...allScenPacks.map(s => s.w),
    0
  );

  const whyX = EQUIPOS_W + SECTION_GAP;
  const whoX = whyX + whyColW + COL_GAP;
  const howX = whoX + whoColW + COL_GAP;
  const whatX = howX + howColW + COL_GAP;
  const scenX = whatX + whatColW + COL_GAP;

  for (const [ext, name, x, w] of [
    ['title-why', 'WHY', whyX, whyColW],
    ['title-who', 'WHO', whoX, whoColW],
    ['title-how', 'HOW', howX, howColW],
    ['title-what', 'WHAT', whatX, whatColW],
    ['title-scenarios', 'SCENARIOS', scenX, scenColW],
  ] as const) {
    shapes.push(
      box(
        {
          role: 'title',
          externalId: ext,
          name,
          text: name,
          fillColor: COLOR_TITLE,
          strokeStyle: 'solid',
          attrs: { section: name.toLowerCase() },
        },
        x,
        0,
        w,
        TITLE_H
      )
    );
  }

  const placeKidStack = (
    kids: KidPack[],
    kind: 'who' | 'how' | 'what',
    colX: number,
    topY: number,
    colW: number
  ): string[] => {
    const ids: string[] = [];
    let cy = topY;
    const fill = laneFill(kind);
    for (const kid of kids) {
      const cardW = Math.min(colW, Math.max(kid.w, METH_MIN));
      shapes.push(
        box(
          {
            role: kind,
            externalId: kid.ext,
            name: kid.label,
            text: kid.text,
            fillColor: fill,
            strokeStyle: 'dash',
            attrs: { statement: kid.text },
          },
          colX,
          cy,
          cardW,
          kid.h
        )
      );
      ids.push(kid.ext);
      cy += kid.h + SHAPE_GAP_Y;
      if (kid.q && kid.qh) {
        const qExt = `q-${kid.ext}`;
        const qW = Math.min(colW, kid.qw ?? cardW);
        shapes.push(
          box(
            {
              role: 'question',
              externalId: qExt,
              name: 'Pregunta HITL',
              text: `❓ ${kid.q}`,
              fillColor: COLOR_Q,
              strokeStyle: 'solid',
              attrs: { question: kid.q },
            },
            colX,
            cy,
            qW,
            kid.qh
          )
        );
        connectors.push({ fromExternalId: kid.ext, toExternalId: qExt });
        cy += kid.qh + SHAPE_GAP_Y;
      }
    }
    return ids;
  };

  const placedScen = new Set<string>();
  let rowY = TITLE_H + SHAPE_GAP_Y;
  for (const row of rows) {
    const whoH = stackHeight(
      row.who.map(k => ({ text: k.text, q: k.q, w: k.w })),
      whoColW
    );
    const howH = stackHeight(
      row.how.map(k => ({ text: k.text, q: k.q, w: k.w })),
      howColW
    );
    const whatH = stackHeight(
      row.what.map(k => ({ text: k.text, q: k.q, w: k.w })),
      whatColW
    );

    const rowParentExts = [
      ...row.what.map(k => k.ext),
      ...row.how.map(k => k.ext),
    ];
    const rowScens = rowParentExts.flatMap(ext => scenByParent.get(ext) ?? []);
    const scenH =
      rowScens.length === 0
        ? 0
        : rowScens.reduce((a, s) => a + s.h, 0) +
          Math.max(0, rowScens.length - 1) * SHAPE_GAP_Y;

    let rowH = Math.max(row.whyH, whoH, howH, whatH, scenH || LANE_CHILD_H);
    if (row.whyQ && row.whyQH) {
      rowH = Math.max(rowH, row.whyH + SHAPE_GAP_Y + row.whyQH);
    }

    shapes.push(
      box(
        {
          role: 'why',
          externalId: row.whyExt,
          name: row.whyLabel,
          text: row.whyText,
          fillColor: laneFill('why'),
          strokeStyle: 'dash',
          attrs: { statement: String(row.why.body?.statement ?? '') },
        },
        whyX,
        rowY,
        Math.min(whyColW, Math.max(row.whyW, WHY_MIN)),
        row.whyH
      )
    );
    if (row.whyQ && row.whyQH && row.whyQW) {
      const qExt = `q-${row.whyExt}`;
      shapes.push(
        box(
          {
            role: 'question',
            externalId: qExt,
            name: 'Pregunta HITL',
            text: `❓ ${row.whyQ}`,
            fillColor: COLOR_Q,
            strokeStyle: 'solid',
            attrs: { question: row.whyQ },
          },
          whyX,
          rowY + row.whyH + SHAPE_GAP_Y,
          Math.min(whyColW, row.whyQW),
          row.whyQH
        )
      );
      connectors.push({ fromExternalId: row.whyExt, toExternalId: qExt });
    }

    const whoIds = placeKidStack(row.who, 'who', whoX, rowY, whoColW);
    const howIds = placeKidStack(row.how, 'how', howX, rowY, howColW);
    const whatIds = placeKidStack(row.what, 'what', whatX, rowY, whatColW);

    // Impact Mapping: WHY→WHO→HOW→WHAT
    for (const wid of whoIds) {
      connectors.push({ fromExternalId: row.whyExt, toExternalId: wid });
    }
    howIds.forEach((hid, i) => {
      if (whoIds.length === 0) return;
      const src = whoIds[Math.min(i, whoIds.length - 1)];
      if (src) connectors.push({ fromExternalId: src, toExternalId: hid });
    });
    whatIds.forEach((tid, i) => {
      if (howIds.length === 0) return;
      const src = howIds[Math.min(i, howIds.length - 1)];
      if (src) connectors.push({ fromExternalId: src, toExternalId: tid });
    });

    // SCENARIOS column — right of WHAT, same row as parent
    let sy = rowY;
    for (const sc of rowScens) {
      if (placedScen.has(sc.ext)) continue;
      const cardW = Math.min(scenColW, Math.max(sc.w, METH_MIN));
      shapes.push(
        box(
          {
            role: 'scenario',
            externalId: sc.ext,
            name: sc.label,
            text: sc.text,
            fillColor: COLOR_SCENARIO,
            strokeStyle: 'solid',
            attrs: { parent: sc.parentExt },
          },
          scenX,
          sy,
          cardW,
          sc.h
        )
      );
      if (sc.parentExt) {
        connectors.push({
          fromExternalId: sc.parentExt,
          toExternalId: sc.ext,
        });
      }
      placedScen.add(sc.ext);
      sy += sc.h + SHAPE_GAP_Y;
    }

    rowY += rowH + SECTION_GAP;
  }

  // Leftover scenarios (parent not in any row) stack at bottom of SCENARIOS col
  const leftovers = allScenPacks.filter(s => !placedScen.has(s.ext));
  if (leftovers.length > 0) {
    let sy = rowY;
    for (const sc of leftovers) {
      const cardW = Math.min(scenColW, Math.max(sc.w, METH_MIN));
      shapes.push(
        box(
          {
            role: 'scenario',
            externalId: sc.ext,
            name: sc.label,
            text: sc.text,
            fillColor: COLOR_SCENARIO,
            strokeStyle: 'solid',
            attrs: { parent: sc.parentExt },
          },
          scenX,
          sy,
          cardW,
          sc.h
        )
      );
      if (sc.parentExt) {
        connectors.push({
          fromExternalId: sc.parentExt,
          toExternalId: sc.ext,
        });
      }
      sy += sc.h + SHAPE_GAP_Y;
    }
  }

  if (foreignLeft != null) {
    const bounds = planBounds(shapes);
    const dx = foreignLeft - FOREIGN_GAP - bounds.maxX;
    shiftShapes(shapes, dx, 0);
  }

  for (const s of shapes) {
    OWN_TEXT.add(s.name);
    OWN_TEXT.add(s.text);
    OWN_EXTERNAL.add(s.externalId);
  }

  return { shapes, connectors };
}

export function humanBridgeError(code: string, detail?: string): string {
  const messages: Record<string, string> = {
    bad_request:
      'Falta el dataset de esta página. Cerrá el panel y volvé a abrir /mlabs-framework.',
    bad_question: 'Escribí una pregunta antes de enviar.',
    freellm_unconfigured: 'FreeLLMAPI no está configurado en el puente.',
    freellm_unavailable:
      'FreeLLMAPI no respondió. Probá de nuevo en un momento.',
    bad_json: 'La petición no es válida.',
    bad_name: 'El nombre no es válido (máx. 40 caracteres).',
    bad_description: 'La descripción es demasiado larga.',
    bad_type: 'Dify no acepta ese tipo de archivo.',
    empty_file: 'El archivo está vacío.',
    too_large: 'El archivo supera 15 MB.',
    dataset_missing: 'No encontramos ese dataset en Dify.',
    document_missing: 'Ese archivo ya no está en el dataset.',
    page_file_protected:
      'Ese archivo es el vínculo de la página y no se puede tocar aquí.',
    name_taken: 'Ya hay otro dataset con ese nombre.',
    dify_unconfigured: 'El puente a Dify no está configurado.',
    dify_unavailable: 'Dify no respondió. Probá de nuevo en un momento.',
    dify_rejected: 'Dify rechazó la operación.',
    method_not_allowed: 'Método no permitido.',
    not_found: 'Ruta no encontrada en el puente.',
  };
  const base = messages[code] ?? code;
  return detail ? `${base} (${detail})` : base;
}
