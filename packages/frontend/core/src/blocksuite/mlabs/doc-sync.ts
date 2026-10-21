import { NoteDisplayMode } from '@blocksuite/affine/model';
import { Text } from '@blocksuite/affine/store';

import {
  DOC_SYNC_TITLE,
  frameworkMarkdownFromTree,
  noteSeedsFromMarkdown,
  type PageDoc,
  readDocSyncNoteId,
  type RegistryTree,
  writeDocSyncNoteId,
} from './panel-model';

type BlockChild = {
  id: string;
  flavour?: string;
  props?: {
    type?: string;
    text?: { toString?: () => string };
  };
};

type NoteModel = {
  id: string;
  children?: BlockChild[];
  xywh?: string;
  props?: { displayMode?: string };
};

export type DocSyncStore = {
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

function textOf(child: BlockChild | undefined): string {
  return child?.props?.text?.toString?.() ?? '';
}

function isDocSyncNote(note: NoteModel): boolean {
  const first = note.children?.[0];
  return (
    first?.flavour === 'affine:paragraph' &&
    first.props?.type === 'h1' &&
    textOf(first).trim() === DOC_SYNC_TITLE
  );
}

function plainText(content: string): Text {
  return new Text([{ insert: content }]);
}

/** Apply markdown outline as BlockSuite children under `noteId`. */
export function fillNoteFromMarkdown(
  store: DocSyncStore,
  noteId: string,
  markdown: string
): number {
  if (!store.addBlock) return 0;
  let count = 0;
  for (const seed of noteSeedsFromMarkdown(markdown)) {
    if (seed.flavour === 'affine:divider') {
      store.addBlock('affine:divider', {}, noteId);
    } else if (seed.flavour === 'affine:code') {
      store.addBlock(
        'affine:code',
        { language: seed.language, text: plainText(seed.text) },
        noteId
      );
    } else if (seed.flavour === 'affine:list') {
      store.addBlock(
        'affine:list',
        { type: seed.type, text: plainText(seed.text) },
        noteId
      );
    } else {
      store.addBlock(
        'affine:paragraph',
        { type: seed.type, text: plainText(seed.text) },
        noteId
      );
    }
    count += 1;
  }
  return count;
}

/** Create/replace the DocOnly note with the methodology outline (export MD). */
export function syncFrameworkDocNote(
  store: DocSyncStore | undefined,
  tree: RegistryTree | null,
  doc?: PageDoc
): { noteId: string; blocks: number } | null {
  if (!store?.addBlock || !store.deleteBlock || !store.getModelsByFlavour) {
    return null;
  }
  const pages = store.getModelsByFlavour('affine:page') as Array<{
    id: string;
  }>;
  const pageId = pages[0]?.id ?? store.root?.id;
  if (!pageId) return null;

  const notes = store.getModelsByFlavour('affine:note') as NoteModel[];
  const remembered = readDocSyncNoteId(doc ?? store.spaceDoc);
  let note = notes.find(n => n.id === remembered) ?? notes.find(isDocSyncNote);

  if (!note) {
    const noteId = store.addBlock(
      'affine:note',
      {
        displayMode: NoteDisplayMode.DocOnly,
        // Far below canvas so even if counted as foreign it won't shove X layout.
        xywh: '[0, 120000, 800, 600]',
      },
      pageId
    );
    const pageDoc = doc ?? store.spaceDoc;
    if (pageDoc) writeDocSyncNoteId(pageDoc, noteId);
    note = { id: noteId, children: [] };
  } else {
    const kids = [...(note.children ?? [])];
    for (const child of kids) {
      store.deleteBlock(child);
    }
    const pageDoc = doc ?? store.spaceDoc;
    if (pageDoc) writeDocSyncNoteId(pageDoc, note.id);
  }

  const markdown = frameworkMarkdownFromTree(tree);
  const blocks = fillNoteFromMarkdown(store, note.id, markdown);
  return { noteId: note.id, blocks };
}

/** Notes to ignore when measuring foreign canvas content. */
export function isDocSyncNoteId(
  noteId: string,
  doc?: PageDoc,
  notes?: NoteModel[]
): boolean {
  if (readDocSyncNoteId(doc) === noteId) return true;
  const hit = notes?.find(n => n.id === noteId);
  return hit ? isDocSyncNote(hit) : false;
}
