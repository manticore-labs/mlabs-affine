import { Button, Input, Loading, Modal, notify, Tabs } from '@affine/component';
import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import * as styles from './panel.css';
import {
  humanBridgeError,
  openRequestBody,
  readDatasetId,
  statusLabel,
  uploadRejection,
  writeDatasetId,
  type PageDoc,
  type SourceDocument,
} from './panel-model';

const FRAMEWORK = '/mlabs/framework';

type FetchLike = typeof fetch;

type OpenResponse = {
  dataset_id: string;
  name: string;
  description: string;
  documents: SourceDocument[];
};

type AskSource = {
  document_name: string;
  content_preview: string;
};

export type DifySourcesPanelProps = {
  pageId: string;
  pageUrl?: string;
  doc?: PageDoc;
  fetchImpl?: FetchLike;
  onClose: () => void;
};

export function openDifySourcesPanel(input: {
  pageId: string;
  pageUrl?: string;
  doc?: PageDoc;
  fetchImpl?: FetchLike;
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
      fetchImpl={input.fetchImpl}
      onClose={close}
    />
  );
}

export function DifySourcesPanel({
  pageId,
  pageUrl,
  doc,
  fetchImpl = globalThis.fetch.bind(globalThis),
  onClose,
}: DifySourcesPanelProps) {
  const [tab, setTab] = useState<'fuentes' | 'preguntar'>('fuentes');
  const [busy, setBusy] = useState(true);
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
    void load();
    // Open once when the panel mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        <Tabs.Root value={tab} onValueChange={value => setTab(value as typeof tab)}>
          <Tabs.List className={styles.tabList}>
            <Tabs.Trigger value="fuentes" className={styles.tabTrigger}>
              Fuentes
            </Tabs.Trigger>
            <Tabs.Trigger value="preguntar" className={styles.tabTrigger} disabled={!ready}>
              Preguntar
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
                                throw new Error(await readBridgeError(response));
                              }
                              const blob = await response.blob();
                              const link = globalThis.document.createElement('a');
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
                      const response = await fetchImpl(`${FRAMEWORK}/documents`, {
                        method: 'POST',
                        headers: {
                          'content-type': 'application/octet-stream',
                          'x-mlabs-dataset-id': datasetId,
                          'x-mlabs-file-name': encodeURIComponent(file.name),
                        },
                        body: file,
                      });
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
                pdf, md, txt, docx y similares. Hasta 15 MB. Mismo nombre = reemplazo.
              </p>
            </section>
          </Tabs.Content>

          <Tabs.Content value="preguntar">
            <section className={styles.section}>
              <p className={styles.lead}>
                La respuesta usa fragmentos recuperados del dataset vía Dify y FreeLLMAPI en el
                servidor.
              </p>
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
                  disabled={!ready || actionBusy || question.trim().length === 0}
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
                          <li key={`${source.document_name}-${index}`} className={styles.item}>
                            <div className={styles.itemMeta}>
                              <span className={styles.itemName}>{source.document_name}</span>
                              <span className={styles.itemStatus}>{source.content_preview}</span>
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
