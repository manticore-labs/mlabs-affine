/* oxlint-disable typescript/no-floating-promises -- node:test callbacks are sync */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DOC_SYNC_TITLE,
  frameworkMarkdownFromTree,
  noteSeedsFromMarkdown,
  type RegistryTree,
} from './panel-model';

const sampleTree: RegistryTree = {
  actors: [
    {
      id: 't1',
      external_id: 'mlabs:gestion-admin',
      kind: 'team',
      name: 'Gestión y Administración',
      attrs: { hierarchy: 1 },
    },
    {
      id: 'p1',
      external_id: 'mlabs:valentina-morales',
      kind: 'person',
      name: 'Valentina Morales',
      attrs: { title: 'CEO', email: 'valentina@example.com' },
    },
  ],
  edges: [{ from_id: 'p1', to_id: 't1', rel: 'member_of' }],
  artifacts: [
    {
      id: 'w1',
      external_id: 'why-kb',
      kind: 'why',
      body: {
        label: 'WHY · KB partner',
        statement: 'Partners resuelven solos.',
        needs_human: true,
        question: '¿TOC filtrada o lista curada?',
      },
    },
    {
      id: 'who1',
      external_id: 'who-kb',
      kind: 'who',
      parent_id: 'w1',
      body: { label: 'Partner ops', statement: 'Owner partner' },
    },
    {
      id: 'how1',
      external_id: 'how-kb',
      kind: 'how',
      parent_id: 'w1',
      body: { label: 'Portal', statement: 'Full-text search' },
    },
    {
      id: 'what1',
      external_id: 'what-kb',
      kind: 'what',
      parent_id: 'w1',
      body: { label: 'Vista KB', statement: 'Artículos versionados' },
    },
    {
      id: 'sc1',
      external_id: 'scenario-kb',
      kind: 'scenario',
      parent_id: 'what1',
      body: {
        label: 'Buscar artículo',
        statement: 'Scenario: search\nGiven portal\nWhen query\nThen hit',
      },
    },
  ],
};

test('frameworkMarkdownFromTree follows Impact Mapping outline', () => {
  const md = frameworkMarkdownFromTree(sampleTree, {
    generatedAt: '2026-10-21T00:00:00.000Z',
  });
  assert.match(md, new RegExp(`^# ${DOC_SYNC_TITLE}`, 'm'));
  assert.match(md, /## EQUIPOS/);
  assert.match(md, /### Gestión y Administración/);
  assert.match(md, /Valentina Morales — CEO/);
  assert.match(md, /## Impact map/);
  assert.match(md, /### WHY — KB partner/);
  assert.match(md, /HITL: ¿TOC filtrada/);
  assert.match(md, /#### WHO — Partner ops/);
  assert.match(md, /##### HOW — Portal/);
  assert.match(md, /###### WHAT — Vista KB/);
  assert.match(md, /```gherkin/);
  assert.match(md, /Scenario: search/);
  assert.match(md, /---/);
});

test('frameworkMarkdownFromTree empty tree stays readable', () => {
  const md = frameworkMarkdownFromTree(null, {
    generatedAt: '2026-10-21T00:00:00.000Z',
  });
  assert.match(md, /Sin equipos/);
  assert.match(md, /Sin artefactos WHY/);
});

test('noteSeedsFromMarkdown maps outline to Affine flavours', () => {
  const md = [
    `# ${DOC_SYNC_TITLE}`,
    '',
    '## EQUIPOS',
    '',
    '- Ada — CEO',
    '',
    '---',
    '',
    '### WHY — Tiempo',
    '',
    'Reducir latencia',
    '',
    '```gherkin',
    'Scenario: x',
    '```',
  ].join('\n');
  const seeds = noteSeedsFromMarkdown(md);
  assert.equal(seeds[0]?.flavour, 'affine:paragraph');
  if (seeds[0]?.flavour === 'affine:paragraph') {
    assert.equal(seeds[0].type, 'h1');
  }
  assert.ok(seeds.some(s => s.flavour === 'affine:list'));
  assert.ok(seeds.some(s => s.flavour === 'affine:divider'));
  assert.ok(seeds.some(s => s.flavour === 'affine:code'));
});
