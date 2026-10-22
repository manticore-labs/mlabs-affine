import { Button, Input, Loading, Modal, notify, Tabs } from '@affine/component';
import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Y from 'yjs';

import { isDocSyncNoteId, syncFrameworkDocNote } from './doc-sync';
import * as styles from './panel.css';
import {
  buildFeedbackNodes,
  type CanvasNode,
  changeLabel,
  engagementExternalId,
  foreignMinX,
  humanBridgeError,
  indexingNotice,
  isOwnNode,
  matchFeedbackExternalId,
  MAX_FEEDBACK_FILES,
  openRequestBody,
  type PageDoc,
  paintPlanFromTree,
  readDatasetId,
  type RegistryTree,
  runOnStore,
  type SourceDocument,
  statusLabel,
  syncSummaryLabel,
  uploadRejection,
  writeDatasetId,
} from './panel-model';

const FRAMEWORK = '/mlabs/framework';
const REGISTRY = '/mlabs/registry';

type FetchLike = typeof fetch;

type OpenResponse = {
  dataset_id: string;
  name: string;
  description: string;
  documents: SourceDocument[];
  engagement_external_id?: string;
};

type AskSource = {
  document_name: string;
  content_preview: string;
};

type SurfaceElement = {
  id: string;
  yMap?: {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
  };
  text?: unknown;
};

type SurfaceModel = {
  elementModels?: SurfaceElement[];
  elements?: {
    getValue?: () => {
      forEach: (
        fn: (el: { get?: (key: string) => unknown }, id: string) => void
      ) => void;
      delete?: (id: string) => void;
      has?: (id: string) => boolean;
    };
  };
  hasElementById?: (id: string) => boolean;
  deleteElement?: (id: string) => void;
  addElement?: (props: { type: string } & Record<string, unknown>) => string;
  getElementById?: (id: string) => SurfaceElement | null;
  store?: { transact?: (fn: () => void) => void };
};

type PaintStore = {
  id?: string;
  root?: { id: string } | null;
  spaceDoc?: PageDoc;
  getModelsByFlavour?: (flavour: string) => unknown[];
  addBlock?: (
    flavour: string,
    props: Record<string, unknown>,
    parentId?: string
  ) => string;
  deleteBlock?: (model: unknown) => void;
};

export type DifySourcesPanelProps = {
  pageId: string;
  pageUrl?: string;
  doc?: PageDoc;
  store?: PaintStore;
  fetchImpl?: FetchLike;
  /** Legacy `why` is ignored — WHY comes from docs→LangGraph only (SG2-R0). */
  initialTab?: 'fuentes' | 'preguntar' | 'why' | 'pintar';
  focusFeedback?: boolean;
  /** Pre-select this registry external_id in the 💬 feedback form. */
  initialFeedbackId?: string;
  onClose: () => void;
};

export function openDifySourcesPanel(input: {
  pageId: string;
  pageUrl?: string;
  doc?: PageDoc;
  store?: PaintStore;
  fetchImpl?: FetchLike;
  initialTab?: 'fuentes' | 'preguntar' | 'why' | 'pintar';
  focusFeedback?: boolean;
  initialFeedbackId?: string;
}) {
  const host = globalThis.document?.createElement('div');
  if (!host || !globalThis.document?.body) return;
  host.id = 'mlabs-dify-panel-root';
  globalThis.document.getElementById(host.id)?.remove();
  globalThis.document.body.append(host);
  const root = createRoot(host);
  const close = () => {
    root.unmount();
    host.remove();
  };
  root.render(
    <DifySourcesPanel
      pageId={input.pageId}
      pageUrl={input.pageUrl}
      doc={input.doc}
      store={input.store}
      fetchImpl={input.fetchImpl}
      initialTab={input.initialTab}
      focusFeedback={input.focusFeedback}
      initialFeedbackId={input.initialFeedbackId}
      onClose={close}
    />
  );
}

function readText(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw;
  if (
    raw &&
    typeof (raw as { toString?: () => string }).toString === 'function'
  ) {
    const text = (raw as { toString: () => string }).toString();
    if (text && text !== '[object Object]') return text;
  }
  return undefined;
}

function readAttrs(raw: unknown): { role?: string; externalId?: string } {
  if (!raw || typeof raw !== 'object') return {};
  const map = raw as {
    get?: (key: string) => unknown;
    role?: string;
    externalId?: string;
  };
  if (typeof map.get === 'function') {
    return {
      role:
        typeof map.get('role') === 'string'
          ? (map.get('role') as string)
          : undefined,
      externalId:
        typeof map.get('externalId') === 'string'
          ? (map.get('externalId') as string)
          : undefined,
    };
  }
  return {
    role: typeof map.role === 'string' ? map.role : undefined,
    externalId: typeof map.externalId === 'string' ? map.externalId : undefined,
  };
}

function collectNodes(surface: SurfaceModel): CanvasNode[] {
  const nodes: CanvasNode[] = [];
  const seen = new Set<string>();
  for (const model of surface.elementModels ?? []) {
    const attrs = readAttrs(model.yMap?.get('mlabsAttrs'));
    nodes.push({
      id: model.id,
      ...attrs,
      text: readText(model.yMap?.get('text') ?? model.text),
    });
    seen.add(model.id);
  }
  surface.elements?.getValue?.().forEach((element, id) => {
    if (seen.has(id)) return;
    nodes.push({
      id,
      ...readAttrs(element.get?.('mlabsAttrs')),
      text: readText(element.get?.('text')),
    });
  });
  return nodes;
}

export async function fetchRegistryTree(
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  engagementExtId?: string
): Promise<RegistryTree | null> {
  const key = (engagementExtId || '').trim();
  if (!key || key === 'poc-s1') {
    // R0: refuse silent demo seed — caller must pass page engagement.
    return null;
  }
  try {
    const response = await fetchImpl(
      `${REGISTRY}/tree?engagement_external_id=${encodeURIComponent(key)}`,
      {
        credentials: 'include',
        cache: 'no-store',
      }
    );
    if (!response.ok) return null;
    return (await response.json()) as RegistryTree;
  } catch {
    return null;
  }
}

export async function paintPeople(
  store: PaintStore | undefined,
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  engagementExtId?: string
): Promise<number> {
  const surfaces = (store?.getModelsByFlavour?.('affine:surface') ??
    []) as Array<SurfaceModel & { xywh?: string }>;
  if (surfaces.length !== 1 || !surfaces[0].addElement) {
    throw new Error('Esta página no tiene un lienzo.');
  }
  const surface = surfaces[0];
  const pageDoc = store?.spaceDoc;
  const notes = (store?.getModelsByFlavour?.('affine:note') ?? []) as Array<{
    id: string;
    xywh?: string;
    children?: Array<{
      id: string;
      flavour?: string;
      props?: { type?: string; text?: { toString?: () => string } };
    }>;
  }>;
  // Foreign = notes + surface elements that are not ours (images, embeds, hand shapes).
  // Skip the Pintar doc-sync note so it never shoves the canvas layout.
  const foreignXywhs: Array<string | undefined> = notes
    .filter(note => !isDocSyncNoteId(note.id, pageDoc, notes))
    .map(note => note.xywh);
  const pushForeignXywh = (raw: unknown) => {
    if (typeof raw === 'string') foreignXywhs.push(raw);
  };
  for (const model of surface.elementModels ?? []) {
    const attrs = readAttrs(model.yMap?.get('mlabsAttrs'));
    const node: CanvasNode = {
      id: model.id,
      ...attrs,
      text: readText(model.yMap?.get('text') ?? model.text),
    };
    if (isOwnNode(node) || node.role === 'connector') continue;
    pushForeignXywh(model.yMap?.get('xywh'));
    pushForeignXywh((model as { xywh?: unknown }).xywh);
  }
  surface.elements?.getValue?.().forEach((element, id) => {
    const attrs = readAttrs(element.get?.('mlabsAttrs'));
    const node: CanvasNode = {
      id,
      ...attrs,
      text: readText(element.get?.('text')),
    };
    if (isOwnNode(node) || node.role === 'connector') return;
    pushForeignXywh(element.get?.('xywh'));
  });
  const tree = await fetchRegistryTree(fetchImpl, engagementExtId);
  const { shapes, connectors } = paintPlanFromTree(
    tree,
    foreignMinX(foreignXywhs)
  );
  const elements = surface.elements?.getValue?.();
  for (const node of collectNodes(surface)) {
    if (!isOwnNode(node) && node.role !== 'connector') continue;
    if (surface.hasElementById?.(node.id)) surface.deleteElement?.(node.id);
    if (elements?.has?.(node.id)) {
      runOnStore(surface.store, () => elements.delete?.(node.id));
    }
  }

  const idByExternal = new Map<string, string>();
  shapes.forEach((shape, index) => {
    const id = surface.addElement({
      type: 'shape',
      index: `a${index}`,
      xywh: shape.xywh,
      filled: true,
      fillColor: shape.fillColor,
      color: shape.color,
      padding: shape.padding,
      strokeColor: '#000000',
      strokeWidth: 4,
      strokeStyle: shape.strokeStyle,
      shapeStyle: 'General',
      shapeType: 'rect',
      text: shape.text || shape.name,
    });
    idByExternal.set(shape.externalId, id);
    const model = surface.getElementById?.(id);
    if (!model?.yMap) {
      throw new Error('El lienzo creó el shape sin mapa para marcarlo.');
    }
    const yMap = model.yMap;
    runOnStore(surface.store, () => {
      yMap.set('xywh', shape.xywh);
      yMap.set('index', `a${index}`);
      const attrs = new Y.Map<string>();
      yMap.set('mlabsAttrs', attrs);
      attrs.set('role', shape.role);
      attrs.set('externalId', shape.externalId);
      for (const [key, value] of Object.entries(shape.attrs)) {
        attrs.set(key, String(value));
      }
    });
  });

  let cIndex = shapes.length;
  for (const link of connectors) {
    const sourceId = idByExternal.get(link.fromExternalId);
    const targetId = idByExternal.get(link.toExternalId);
    if (!sourceId || !targetId) continue;
    const id = surface.addElement({
      type: 'connector',
      index: `a${cIndex++}`,
      mode: 0,
      stroke: '#888888',
      strokeWidth: 2,
      source: { id: sourceId },
      target: { id: targetId },
    });
    const model = surface.getElementById?.(id);
    const connectorMap = model?.yMap;
    if (connectorMap) {
      runOnStore(surface.store, () => {
        const attrs = new Y.Map<string>();
        connectorMap.set('mlabsAttrs', attrs);
        attrs.set('role', 'connector');
        attrs.set('externalId', `${link.fromExternalId}->${link.toExternalId}`);
      });
    }
  }

  // Page note with methodology outline — Affine Export → Markdown includes it.
  try {
    syncFrameworkDocNote(store, tree, pageDoc);
  } catch (err) {
    console.error('mlabs doc-sync note', err);
  }

  return shapes.length;
}

export function DifySourcesPanel({
  pageId,
  pageUrl,
  doc,
  store,
  fetchImpl = globalThis.fetch.bind(globalThis),
  initialTab = 'fuentes',
  focusFeedback = false,
  initialFeedbackId,
  onClose,
}: DifySourcesPanelProps) {
  const [tab, setTab] = useState<'fuentes' | 'preguntar' | 'pintar'>(
    initialTab === 'why'
      ? 'fuentes'
      : initialTab === 'preguntar' || initialTab === 'pintar'
        ? initialTab
        : 'fuentes'
  );
  const [busy, setBusy] = useState(true);
  const [engagementId, setEngagementId] = useState(() =>
    engagementExternalId(pageId, pageUrl)
  );
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<string | undefined>(
    readDatasetId(doc)
  );
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SourceDocument | null>(
    null
  );
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [askSources, setAskSources] = useState<AskSource[]>([]);
  const [feedbackNodes, setFeedbackNodes] = useState<
    Array<{
      externalId: string;
      kind: string;
      label: string;
      statement: string;
    }>
  >([]);
  const [feedbackPick, setFeedbackPick] = useState(initialFeedbackId ?? '');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [feedbackFiles, setFeedbackFiles] = useState<File[]>([]);

  const remember = useCallback(
    (id: string) => {
      setDatasetId(id);
      if (doc) writeDatasetId(doc, id);
    },
    [doc]
  );

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchImpl(FRAMEWORK, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: openRequestBody({
          pageId,
          pageUrl,
          datasetId: readDatasetId(doc) ?? datasetId,
        }),
      });
      if (!response.ok) throw new Error(await readBridgeError(response));
      const body = (await response.json()) as OpenResponse;
      remember(body.dataset_id);
      if (body.engagement_external_id) {
        setEngagementId(body.engagement_external_id);
      } else {
        setEngagementId(engagementExternalId(pageId, pageUrl));
      }
      setName(body.name);
      setDescription(body.description ?? '');
      setDocuments(body.documents ?? []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No pude abrir el dataset.';
      setError(message);
      notify.error({ title: 'Mlabs Framework', message });
    } finally {
      setBusy(false);
    }
  }, [datasetId, doc, fetchImpl, pageId, pageUrl, remember]);

  useEffect(() => {
    load().catch(() => {
      /* load already surfaces errors via notify */
    });
    // Open once when the panel mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!focusFeedback) return;
    const loadFeedbackNodes = async () => {
      try {
        const tree = await fetchRegistryTree(fetchImpl, engagementId);
        const nodes = buildFeedbackNodes(tree);
        setFeedbackNodes(nodes);
        // Prefer the card selected on the canvas; never invent the first person.
        const preferred = matchFeedbackExternalId(nodes, initialFeedbackId);
        if (preferred) setFeedbackPick(preferred);
        else setFeedbackPick('');
      } catch {
        /* feedback list is best-effort; user can retry via select focus */
      }
    };
    loadFeedbackNodes().catch(() => {
      /* swallowed above */
    });
  }, [engagementId, fetchImpl, focusFeedback, initialFeedbackId]);

  const run = async (fallback: string, action: () => Promise<void>) => {
    setActionBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      const message = err instanceof Error ? err.message : fallback;
      setError(message);
      notify.error({ title: 'Mlabs Framework', message });
    } finally {
      setActionBusy(false);
    }
  };

  const refresh = async (id: string) => {
    const response = await fetchImpl(
      `${FRAMEWORK}/documents?dataset_id=${encodeURIComponent(id)}`
    );
    if (!response.ok) throw new Error(await readBridgeError(response));
    const body = (await response.json()) as { documents: SourceDocument[] };
    setDocuments(body.documents ?? []);
  };

  const ready = Boolean(datasetId) && !busy;
  const askIndexingHint = indexingNotice(documents);

  return (
    <Modal
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
      title="Mlabs Framework"
      description="Fuentes del dataset de esta página y preguntas con recuperación en Dify. Las claves no salen del servidor."
      width={560}
      contentOptions={{ style: { paddingBottom: 20 } }}
    >
      <div className={styles.body}>
        {busy ? (
          <div className={styles.loading}>
            <Loading />
            Abriendo dataset…
          </div>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {!busy && !datasetId ? (
          <p className={styles.lead}>
            No hay dataset cargado. Cerrá y volvé a ejecutar /mlabs-framework.
          </p>
        ) : null}

        <Tabs.Root
          value={tab}
          onValueChange={value => {
            const next = value as typeof tab;
            setTab(next);
            if (next === 'preguntar' && datasetId) {
              void refresh(datasetId).catch(() => {
                /* keep last known list if refresh fails */
              });
            }
          }}
        >
          <Tabs.List className={styles.tabList}>
            <Tabs.Trigger value="fuentes" className={styles.tabTrigger}>
              Fuentes
            </Tabs.Trigger>
            <Tabs.Trigger
              value="preguntar"
              className={styles.tabTrigger}
              disabled={!ready}
            >
              Preguntar
            </Tabs.Trigger>
            <Tabs.Trigger value="pintar" className={styles.tabTrigger}>
              {focusFeedback ? '💬 Comentario' : 'Pintar'}
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="fuentes">
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Dataset</h3>
              <label className={styles.field}>
                <span>Id</span>
                <Input value={datasetId ?? ''} disabled />
              </label>
              <label className={styles.field}>
                <span>Nombre</span>
                <Input
                  value={name}
                  onChange={setName}
                  disabled={!ready || actionBusy}
                  maxLength={40}
                />
              </label>
              <label className={styles.field}>
                <span>Descripción</span>
                <Input
                  value={description}
                  onChange={setDescription}
                  disabled={!ready || actionBusy}
                />
              </label>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  disabled={!ready || actionBusy || name.trim().length === 0}
                  loading={actionBusy}
                  onClick={() =>
                    void run('No pude guardar.', async () => {
                      const response = await fetchImpl(`${FRAMEWORK}/meta`, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                          dataset_id: datasetId,
                          name,
                          description,
                        }),
                      });
                      if (!response.ok) {
                        throw new Error(await readBridgeError(response));
                      }
                      notify.success({
                        title: 'Mlabs Framework',
                        message: 'Datos guardados.',
                      });
                    })
                  }
                >
                  Guardar
                </Button>
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Archivos</h3>
              {documents.length === 0 ? (
                <p className={styles.empty}>Todavía no hay archivos.</p>
              ) : (
                <ul className={styles.list}>
                  {documents.map(item => (
                    <li key={item.id} className={styles.item}>
                      <div className={styles.itemMeta}>
                        <span className={styles.itemName}>{item.name}</span>
                        <span className={styles.itemStatus}>
                          {statusLabel(item.indexing_status)}
                          {changeLabel(item.change)
                            ? ` · ${changeLabel(item.change)}`
                            : ''}
                          {item.error ? ` · ${item.error}` : ''}
                        </span>
                      </div>
                      <div className={styles.itemActions}>
                        <Button
                          variant="secondary"
                          disabled={!ready || actionBusy}
                          onClick={() =>
                            void run('No pude bajar el archivo.', async () => {
                              const response = await fetchImpl(
                                `${FRAMEWORK}/documents/file?dataset_id=${encodeURIComponent(datasetId ?? '')}&document_id=${encodeURIComponent(item.id)}`
                              );
                              if (!response.ok) {
                                throw new Error(
                                  await readBridgeError(response)
                                );
                              }
                              const blob = await response.blob();
                              const link =
                                globalThis.document.createElement('a');
                              link.href = URL.createObjectURL(blob);
                              link.download = item.name;
                              link.click();
                              URL.revokeObjectURL(link.href);
                            })
                          }
                        >
                          Bajar
                        </Button>
                        <Button
                          variant="error"
                          disabled={!ready || actionBusy}
                          onClick={() => setPendingDelete(item)}
                        >
                          Quitar
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className={styles.uploadRow}>
                <Button
                  variant="secondary"
                  disabled={!ready || actionBusy}
                  onClick={() =>
                    void run('No pude sincronizar.', async () => {
                      if (!datasetId) return;
                      const response = await fetchImpl(`${FRAMEWORK}/sync`, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ dataset_id: datasetId }),
                      });
                      if (!response.ok) {
                        throw new Error(await readBridgeError(response));
                      }
                      const body = (await response.json()) as {
                        documents: SourceDocument[];
                        summary: {
                          ready: number;
                          indexing: number;
                          error: number;
                          total: number;
                          new?: number;
                          modified?: number;
                          unchanged?: number;
                          removed?: number;
                        };
                      };
                      setDocuments(body.documents ?? []);
                      notify.success({
                        title: 'Sincronizar',
                        message: syncSummaryLabel(body.summary),
                      });
                    })
                  }
                >
                  Sincronizar
                </Button>
                <Button
                  variant="secondary"
                  disabled={!ready || actionBusy}
                  onClick={() => {
                    const input = globalThis.document.createElement('input');
                    input.type = 'file';
                    input.accept =
                      '.pdf,.md,.markdown,.txt,.doc,.docx,.csv,.html,.htm,.pptx,.xls,.xlsx,.vtt,.mdx';
                    input.onchange = () => {
                      setFile(input.files?.[0] ?? null);
                    };
                    input.click();
                  }}
                >
                  Elegir archivo
                </Button>
                <span className={styles.fileName}>
                  {file ? file.name : 'Ningún archivo elegido'}
                </span>
                <Button
                  variant="primary"
                  disabled={!ready || actionBusy || !file}
                  loading={actionBusy}
                  onClick={() =>
                    void run('No pude subir el archivo.', async () => {
                      if (!file || !datasetId) {
                        throw new Error(
                          'Abrí de nuevo /mlabs-framework antes de subir.'
                        );
                      }
                      const rejection = uploadRejection(file.name, file.size);
                      if (rejection) throw new Error(rejection);
                      const response = await fetchImpl(
                        `${FRAMEWORK}/documents`,
                        {
                          method: 'POST',
                          headers: {
                            'content-type': 'application/octet-stream',
                            'x-mlabs-dataset-id': datasetId,
                            'x-mlabs-file-name': encodeURIComponent(file.name),
                          },
                          body: file,
                        }
                      );
                      if (!response.ok) {
                        throw new Error(await readBridgeError(response));
                      }
                      setFile(null);
                      await refresh(datasetId);
                      notify.success({
                        title: 'Mlabs Framework',
                        message: 'Archivo subido. Dify lo indexa entero.',
                      });
                    })
                  }
                >
                  Subir
                </Button>
              </div>
              <p className={styles.lead}>
                pdf, md, txt, docx y similares. Hasta 15 MB. Mismo nombre =
                reemplazo.
              </p>
            </section>
          </Tabs.Content>

          <Tabs.Content value="pintar">
            <section className={styles.section}>
              {focusFeedback ? (
                <>
                  <p className={styles.lead} id="mlabs-feedback-anchor">
                    💬 Comentario Mlabs → Dify: elegí nodo y nota opcional. El
                    doc queda en Fuentes como <code>mlabs-feedback-….md</code>.
                  </p>
                  <label className={styles.field}>
                    <span>Nodo</span>
                    <select
                      className={styles.textarea}
                      value={feedbackPick}
                      disabled={actionBusy || feedbackNodes.length === 0}
                      onChange={event => setFeedbackPick(event.target.value)}
                      onFocus={() => {
                        if (feedbackNodes.length > 0) return;
                        run('No pude cargar nodos.', async () => {
                          const tree = await fetchRegistryTree(
                            fetchImpl,
                            engagementId
                          );
                          const nodes = buildFeedbackNodes(tree);
                          setFeedbackNodes(nodes);
                          const preferred =
                            matchFeedbackExternalId(nodes, initialFeedbackId) ||
                            matchFeedbackExternalId(nodes, feedbackPick);
                          if (preferred) setFeedbackPick(preferred);
                          else setFeedbackPick('');
                        }).catch(() => {
                          /* run() already notifies */
                        });
                      }}
                    >
                      <option value="">
                        {feedbackNodes.length === 0
                          ? 'Cargá el listado (click aquí)'
                          : '— elegí nodo —'}
                      </option>
                      {feedbackNodes.map(node => (
                        <option key={node.externalId} value={node.externalId}>
                          [{node.kind}] {node.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Nota (opcional)</span>
                    <textarea
                      className={styles.textarea}
                      value={feedbackNote}
                      onChange={event => setFeedbackNote(event.target.value)}
                      disabled={actionBusy}
                      rows={3}
                      placeholder="Contexto para RAG / HITL…"
                    />
                  </label>
                  <div className={styles.uploadRow}>
                    <Button
                      variant="secondary"
                      disabled={
                        !ready ||
                        actionBusy ||
                        feedbackFiles.length >= MAX_FEEDBACK_FILES
                      }
                      onClick={() => {
                        const input =
                          globalThis.document.createElement('input');
                        input.type = 'file';
                        input.multiple = true;
                        input.accept =
                          '.pdf,.md,.markdown,.txt,.doc,.docx,.csv,.html,.htm,.pptx,.xls,.xlsx,.vtt,.mdx';
                        input.onchange = () => {
                          const picked = Array.from(input.files ?? []);
                          setFeedbackFiles(prev => {
                            const room = MAX_FEEDBACK_FILES - prev.length;
                            if (room <= 0) return prev;
                            const next = [...prev];
                            for (const f of picked) {
                              if (next.length >= MAX_FEEDBACK_FILES) break;
                              if (
                                next.some(
                                  x =>
                                    x.name === f.name &&
                                    x.size === f.size &&
                                    x.lastModified === f.lastModified
                                )
                              ) {
                                continue;
                              }
                              next.push(f);
                            }
                            return next;
                          });
                        };
                        input.click();
                      }}
                    >
                      Adjuntar archivos
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={actionBusy || feedbackFiles.length === 0}
                      onClick={() => setFeedbackFiles([])}
                    >
                      Quitar adjuntos
                    </Button>
                    <span className={styles.fileName}>
                      {feedbackFiles.length === 0
                        ? `Sin adjuntos (máx ${MAX_FEEDBACK_FILES})`
                        : feedbackFiles.map(f => f.name).join(', ')}
                    </span>
                  </div>
                  <p className={styles.lead}>
                    Hasta {MAX_FEEDBACK_FILES} archivos · pdf/md/txt/docx… · 15
                    MB c/u. Se indexan en Fuentes y quedan en el feedback.
                  </p>
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      disabled={
                        !ready ||
                        actionBusy ||
                        !feedbackPick ||
                        feedbackNodes.length === 0
                      }
                      loading={actionBusy}
                      onClick={() =>
                        void run(
                          'No pude enviar el feedback a Dify.',
                          async () => {
                            if (!datasetId) return;
                            const node = feedbackNodes.find(
                              n => n.externalId === feedbackPick
                            );
                            if (!node)
                              throw new Error('Elegí un nodo del árbol.');
                            if (feedbackFiles.length > MAX_FEEDBACK_FILES) {
                              throw new Error(
                                `Máximo ${MAX_FEEDBACK_FILES} archivos por comentario.`
                              );
                            }
                            const attachmentNames: string[] = [];
                            for (const file of feedbackFiles) {
                              const rejection = uploadRejection(
                                file.name,
                                file.size
                              );
                              if (rejection) throw new Error(rejection);
                              const up = await fetchImpl(
                                `${FRAMEWORK}/documents`,
                                {
                                  method: 'POST',
                                  headers: {
                                    'content-type': 'application/octet-stream',
                                    'x-mlabs-dataset-id': datasetId,
                                    'x-mlabs-file-name': encodeURIComponent(
                                      file.name
                                    ),
                                  },
                                  body: file,
                                }
                              );
                              if (!up.ok) {
                                throw new Error(await readBridgeError(up));
                              }
                              attachmentNames.push(file.name);
                            }
                            const response = await fetchImpl(
                              `${FRAMEWORK}/feedback`,
                              {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({
                                  dataset_id: datasetId,
                                  page_id: pageId,
                                  external_id: node.externalId,
                                  kind: node.kind,
                                  label: node.label,
                                  statement: node.statement,
                                  note: feedbackNote.trim(),
                                  attachment:
                                    attachmentNames.length === 1
                                      ? attachmentNames[0]
                                      : undefined,
                                  attachments: attachmentNames,
                                  engagement_id: engagementId,
                                  request_id: crypto.randomUUID(),
                                }),
                              }
                            );
                            if (!response.ok) {
                              throw new Error(await readBridgeError(response));
                            }
                            const body = (await response.json()) as {
                              document?: { name?: string };
                            };
                            notify.success({
                              title: 'Mlabs Framework',
                              message:
                                attachmentNames.length > 0
                                  ? `Enviado + ${attachmentNames.length} adjunto(s): ${body.document?.name ?? node.label}`
                                  : `Enviado a Dify: ${body.document?.name ?? node.label}`,
                            });
                            setFeedbackNote('');
                            setFeedbackFiles([]);
                            if (attachmentNames.length > 0)
                              await refresh(datasetId);
                          }
                        )
                      }
                    >
                      💬 Enviar comentario a Dify
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className={styles.lead}>
                    Pinta el caso desde el registry (equipos + bandas
                    WHY→WHO→HOW→WHAT→SCENARIOS). También escribe/actualiza la
                    nota de página <code>Mlabs Framework</code> (modo documento)
                    para Export → Markdown. Comentario a Dify: carta → toolbar{' '}
                    <code>💬 mlabs</code>, o slash{' '}
                    <code>💬 Comentario Mlabs</code>.
                  </p>
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      disabled={actionBusy}
                      loading={actionBusy}
                      onClick={() =>
                        void run('No pude pintar el lienzo.', async () => {
                          const count = await paintPeople(
                            store,
                            fetchImpl,
                            engagementId
                          );
                          notify.success({
                            title: 'Mlabs Framework',
                            message: `Pintados ${count} nodos + nota documento sincronizada.`,
                          });
                        })
                      }
                    >
                      Pintar
                    </Button>
                  </div>
                </>
              )}
            </section>
          </Tabs.Content>

          <Tabs.Content value="preguntar">
            <section className={styles.section}>
              <p className={styles.lead}>
                La respuesta usa fragmentos recuperados del dataset vía Dify y
                FreeLLMAPI en el servidor.
              </p>
              {askIndexingHint ? (
                <p className={styles.notice}>{askIndexingHint}</p>
              ) : null}
              <label className={styles.field}>
                <span>Pregunta</span>
                <textarea
                  className={styles.textarea}
                  value={question}
                  onChange={event => setQuestion(event.target.value)}
                  disabled={!ready || actionBusy}
                  rows={4}
                  placeholder="¿Qué dice el material sobre…?"
                />
              </label>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  disabled={
                    !ready || actionBusy || question.trim().length === 0
                  }
                  loading={actionBusy}
                  onClick={() =>
                    void run('No pude obtener la respuesta.', async () => {
                      if (!datasetId) return;
                      const response = await fetchImpl(`${FRAMEWORK}/ask`, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                          dataset_id: datasetId,
                          question: question.trim(),
                        }),
                      });
                      if (!response.ok) {
                        throw new Error(await readBridgeError(response));
                      }
                      const body = (await response.json()) as {
                        answer: string;
                        sources: AskSource[];
                      };
                      setAnswer(body.answer);
                      setAskSources(body.sources ?? []);
                    })
                  }
                >
                  Enviar
                </Button>
              </div>
              {answer ? (
                <div className={styles.answerBox}>
                  <h3 className={styles.sectionTitle}>Respuesta</h3>
                  <p className={styles.answerText}>{answer}</p>
                  {askSources.length > 0 ? (
                    <>
                      <h3 className={styles.sectionTitle}>Fragmentos usados</h3>
                      <ul className={styles.list}>
                        {askSources.map((source, index) => (
                          <li
                            key={`${source.document_name}-${index}`}
                            className={styles.item}
                          >
                            <div className={styles.itemMeta}>
                              <span className={styles.itemName}>
                                {source.document_name}
                              </span>
                              <span className={styles.itemStatus}>
                                {source.content_preview}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : null}
            </section>
          </Tabs.Content>
        </Tabs.Root>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>

      <Modal
        open={pendingDelete !== null}
        onOpenChange={open => {
          if (!open) setPendingDelete(null);
        }}
        title="Quitar archivo"
        description={
          pendingDelete
            ? `¿Sacar “${pendingDelete.name}” del dataset? También sale del índice de Dify.`
            : undefined
        }
        width={420}
      >
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setPendingDelete(null)}>
            Cancelar
          </Button>
          <Button
            variant="error"
            loading={actionBusy}
            onClick={() =>
              void run('No pude quitar el archivo.', async () => {
                if (!pendingDelete || !datasetId) return;
                const response = await fetchImpl(
                  `${FRAMEWORK}/documents?dataset_id=${encodeURIComponent(datasetId)}&document_id=${encodeURIComponent(pendingDelete.id)}`,
                  { method: 'DELETE' }
                );
                if (!response.ok) {
                  throw new Error(await readBridgeError(response));
                }
                setPendingDelete(null);
                await refresh(datasetId);
                notify.success({
                  title: 'Mlabs Framework',
                  message: 'Archivo quitado.',
                });
              })
            }
          >
            Quitar
          </Button>
        </div>
      </Modal>
    </Modal>
  );
}

async function readBridgeError(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: string;
      detail?: string;
    };
    if (body.error) return humanBridgeError(body.error, body.detail);
    return `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
