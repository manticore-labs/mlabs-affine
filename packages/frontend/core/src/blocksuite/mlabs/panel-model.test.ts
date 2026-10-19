import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canonicalPageUrl,
  openRequestBody,
  readDatasetId,
  statusLabel,
  uploadRejection,
  writeDatasetId,
  type PageDoc,
} from './panel-model.ts';

test('the dataset id is stored on the page document', () => {
  const doc = memoryDoc();
  assert.equal(readDatasetId(doc), undefined);
  let transacted = false;
  doc.transact = fn => {
    transacted = true;
    fn();
  };
  writeDatasetId(doc, '68080011-1111-4111-8111-111111111111');
  assert.equal(transacted, true);
  assert.equal(readDatasetId(doc), '68080011-1111-4111-8111-111111111111');
});

test('the open body carries the page, the url and the stored id', () => {
  assert.equal(
    openRequestBody({
      pageId: 'page-1',
      pageUrl: 'https://affine-pampa.manticore-labs.cc/workspace/w/page-1',
      datasetId: '68080011-1111-4111-8111-111111111111',
    }),
    '{"command":"dify-sources","page_id":"page-1","page_url":"https://affine-pampa.manticore-labs.cc/workspace/w/page-1","dataset_id":"68080011-1111-4111-8111-111111111111"}'
  );
  assert.equal(canonicalPageUrl('javascript:alert(1)'), undefined);
});

test('upload checks match the bridge rules', () => {
  assert.equal(uploadRejection('nota.txt', 4), null);
  assert.equal(uploadRejection('mlabs-page.json', 4), 'Ese archivo lo reserva el vínculo de la página.');
  assert.match(uploadRejection('paquete.zip', 4) ?? '', /no acepta/);
  assert.match(uploadRejection('grande.pdf', 15 * 1024 * 1024 + 1) ?? '', /15 MB/);
});

test('indexing status is shown in Spanish when we know it', () => {
  assert.equal(statusLabel('completed'), 'listo');
  assert.equal(statusLabel('indexing'), 'indexando');
  assert.equal(statusLabel('paused'), 'paused');
});

function memoryDoc(): PageDoc {
  const values = new Map<string, string>();
  return {
    getMap: () => ({
      get: key => values.get(key),
      set: (key, value) => values.set(key, value),
    }),
  };
}
