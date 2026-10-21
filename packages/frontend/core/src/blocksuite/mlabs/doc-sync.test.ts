/* oxlint-disable typescript/no-floating-promises -- node:test callbacks are sync */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assignMethodologyRefs,
  DOC_SYNC_TITLE,
  frameworkMarkdownFromTree,
  noteSeedsFromMarkdown,
  type RegistryTree,
  whyLaneCode,
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
    {
      id: 'p2',
      external_id: 'mlabs:mac-adrian',
      kind: 'person',
      name: 'Mac Adrian',
      attrs: { title: 'CTO' },
    },
  ],
  edges: [
    { from_id: 'p1', to_id: 't1', rel: 'member_of' },
    { from_id: 'p2', to_id: 't1', rel: 'member_of' },
    { from_id: 'p2', to_id: 'p1', rel: 'reports_to' },
  ],
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
  assert.match(md, /reporta a → _\(raíz \/ sin manager\)_/);
  assert.match(md, /Mac Adrian — CTO · reporta a → Valentina Morales/);
  assert.match(md, /## Impact map/);
  assert.match(md, /### WHY — KBP · KB partner/);
  assert.match(md, /HITL \(KBP\.Q\): ¿TOC filtrada/);
  assert.match(md, /#### WHO — KBP\.A · Partner ops/);
  assert.match(md, /##### HOW — KBP\.A\.1 · Portal/);
  assert.match(md, /###### WHAT — KBP\.A\.1\.a · Vista KB/);
  assert.match(md, /Scenario — KBP\.A\.1\.a\.S1 · Buscar artículo/);
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

test('assignMethodologyRefs nests WHO/HOW/WHAT/scenario', () => {
  const refs = assignMethodologyRefs(sampleTree);
  assert.equal(refs.get('why-kb'), 'KBP');
  assert.equal(refs.get('who-kb'), 'KBP.A');
  assert.equal(refs.get('how-kb'), 'KBP.A.1');
  assert.equal(refs.get('what-kb'), 'KBP.A.1.a');
  assert.equal(refs.get('scenario-kb'), 'KBP.A.1.a.S1');
  assert.equal(refs.get('q-why-kb'), 'KBP.Q');
});

test('whyLaneCode is stable 3 letters', () => {
  const used = new Set<string>();
  assert.equal(whyLaneCode('WHY · Tiempo de resolución', used), 'TDR');
  assert.equal(whyLaneCode('Tiempo', used), 'TIE');
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
