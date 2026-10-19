import { notify } from '@affine/component';

import {
  openRequestBody,
  readDatasetId,
  statusLabel,
  uploadRejection,
  writeDatasetId,
  type PageDoc,
  type SourceDocument,
} from './panel-model';

const OPEN = '/mlabs/dify-sources';

type FetchLike = typeof fetch;

type OpenResponse = {
  dataset_id: string;
  name: string;
  description: string;
  documents: SourceDocument[];
};

export function openDifySourcesPanel(input: {
  pageId: string;
  pageUrl?: string;
  doc?: PageDoc;
  fetchImpl?: FetchLike;
  documentRef?: Document;
}) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const documentRef = input.documentRef ?? globalThis.document;
  if (!documentRef?.body) return;
  documentRef.getElementById('mlabs-dify-panel')?.remove();

  const root = documentRef.createElement('div');
  root.id = 'mlabs-dify-panel';
  root.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;padding:48px 16px;font:14px/1.4 sans-serif;color:#1a1a1a;';
  const dialog = documentRef.createElement('div');
  dialog.style.cssText =
    'width:min(560px,100%);background:#fff;border-radius:12px;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,.2);';
  root.append(dialog);
  documentRef.body.append(root);

  const title = documentRef.createElement('h2');
  title.textContent = 'Fuentes Dify';
  title.style.margin = '0 0 12px';
  const status = documentRef.createElement('p');
  status.style.margin = '0 0 12px';
  const idLine = field(documentRef, 'Id', true);
  const name = field(documentRef, 'Nombre', false);
  const description = area(documentRef, 'Descripción');
  const save = button(documentRef, 'Guardar datos');
  const list = documentRef.createElement('ul');
  list.style.cssText = 'list-style:none;padding:0;margin:12px 0;';
  const file = documentRef.createElement('input');
  file.type = 'file';
  const upload = button(documentRef, 'Subir');
  const close = button(documentRef, 'Cerrar');
  dialog.append(
    title,
    status,
    idLine.wrap,
    name.wrap,
    description.wrap,
    save,
    list,
    file,
    upload,
    close
  );

  let currentId = readDatasetId(input.doc);
  const remember = (datasetId: string) => {
    currentId = datasetId;
    if (input.doc) writeDatasetId(input.doc, datasetId);
  };

  const renderDocuments = (documents: SourceDocument[]) => {
    list.replaceChildren();
    if (documents.length === 0) {
      const empty = documentRef.createElement('li');
      empty.textContent = 'Todavía no hay archivos.';
      list.append(empty);
      return;
    }
    for (const doc of documents) {
      const item = documentRef.createElement('li');
      item.style.cssText =
        'display:flex;gap:8px;align-items:center;justify-content:space-between;padding:6px 0;border-top:1px solid #eee;';
      const label = documentRef.createElement('span');
      label.textContent = `${doc.name} — ${statusLabel(doc.indexing_status)}`;
      if (doc.error) label.textContent += ` (${doc.error})`;
      const actions = documentRef.createElement('span');
      const download = button(documentRef, 'Bajar');
      const remove = button(documentRef, 'Quitar');
      download.onclick = () =>
        void run('No pude bajar el archivo.', async () => {
          const response = await fetchImpl(
            `${OPEN}/documents/file?dataset_id=${encodeURIComponent(currentId ?? '')}&document_id=${encodeURIComponent(doc.id)}`
          );
          if (!response.ok) throw new Error(await errorText(response));
          const blob = await response.blob();
          const link = documentRef.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = doc.name;
          link.click();
          URL.revokeObjectURL(link.href);
        });
      remove.onclick = () =>
        void run('No pude quitar el archivo.', async () => {
          const response = await fetchImpl(
            `${OPEN}/documents?dataset_id=${encodeURIComponent(currentId ?? '')}&document_id=${encodeURIComponent(doc.id)}`,
            { method: 'DELETE' }
          );
          if (!response.ok) throw new Error(await errorText(response));
          await refresh();
        });
      actions.append(download, remove);
      item.append(label, actions);
      list.append(item);
    }
  };

  const applyOpen = (body: OpenResponse) => {
    remember(body.dataset_id);
    idLine.input.value = body.dataset_id;
    name.input.value = body.name;
    description.input.value = body.description ?? '';
    renderDocuments(body.documents ?? []);
    status.textContent = 'Dataset de esta página.';
  };

  const refresh = async () => {
    const response = await fetchImpl(
      `${OPEN}/documents?dataset_id=${encodeURIComponent(currentId ?? '')}`
    );
    if (!response.ok) throw new Error(await errorText(response));
    const body = (await response.json()) as { documents: SourceDocument[] };
    renderDocuments(body.documents ?? []);
  };

  const run = async (fallback: string, action: () => Promise<void>) => {
    status.textContent = 'Trabajando…';
    try {
      await action();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : fallback;
    }
  };

  close.onclick = () => root.remove();
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') root.remove();
  });
  save.onclick = () =>
    void run('No pude guardar.', async () => {
      const response = await fetchImpl(`${OPEN}/meta`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dataset_id: currentId,
          name: name.input.value,
          description: description.input.value,
        }),
      });
      if (!response.ok) throw new Error(await errorText(response));
      status.textContent = 'Datos guardados.';
    });
  upload.onclick = () =>
    void run('No pude subir el archivo.', async () => {
      const picked = file.files?.[0];
      if (!picked) throw new Error('Elegí un archivo.');
      const rejection = uploadRejection(picked.name, picked.size);
      if (rejection) throw new Error(rejection);
      const response = await fetchImpl(`${OPEN}/documents`, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-mlabs-dataset-id': currentId ?? '',
          'x-mlabs-file-name': encodeURIComponent(picked.name),
        },
        body: picked,
      });
      if (!response.ok) throw new Error(await errorText(response));
      file.value = '';
      await refresh();
      status.textContent = 'Archivo subido. Dify lo indexa entero.';
    });

  void run('No pude abrir el dataset.', async () => {
    const response = await fetchImpl(OPEN, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: openRequestBody({
        pageId: input.pageId,
        pageUrl: input.pageUrl,
        datasetId: currentId,
      }),
    });
    if (!response.ok) throw new Error(await errorText(response));
    applyOpen((await response.json()) as OpenResponse);
  }).catch(() => {
    notify({ title: 'dify-sources', message: 'request failed', theme: 'error' });
  });
}

async function errorText(response: Response) {
  try {
    const body = (await response.json()) as { error?: string; detail?: string };
    return [body.error, body.detail].filter(Boolean).join(': ') || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function field(documentRef: Document, label: string, readOnly: boolean) {
  const wrap = documentRef.createElement('label');
  wrap.style.cssText = 'display:block;margin:0 0 8px;';
  wrap.textContent = label;
  const input = documentRef.createElement('input');
  input.readOnly = readOnly;
  input.style.cssText =
    'display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:6px 8px;';
  wrap.append(input);
  return { wrap, input };
}

function area(documentRef: Document, label: string) {
  const wrap = documentRef.createElement('label');
  wrap.style.cssText = 'display:block;margin:0 0 8px;';
  wrap.textContent = label;
  const input = documentRef.createElement('textarea');
  input.rows = 3;
  input.style.cssText =
    'display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:6px 8px;';
  wrap.append(input);
  return { wrap, input };
}

function button(documentRef: Document, label: string) {
  const control = documentRef.createElement('button');
  control.type = 'button';
  control.textContent = label;
  control.style.cssText = 'margin:0 8px 8px 0;padding:6px 10px;';
  return control;
}
