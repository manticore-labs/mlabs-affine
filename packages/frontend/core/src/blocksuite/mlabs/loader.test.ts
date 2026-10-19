import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  mlabsCommandBody,
  mlabsCommands,
  mlabsSlashCommands,
  registerMlabsCommand,
  runMlabsCommand,
} from './loader.ts';

test('mlabs-framework is the primary builtin command', () => {
  const spec = mlabsCommands().find(command => command.name === 'mlabs-framework');
  assert.ok(spec);
  assert.equal(spec.endpoint, '/mlabs/framework');
});

test('dify-sources stays registered as a hidden alias', () => {
  const spec = mlabsCommands().find(command => command.name === 'dify-sources');
  assert.ok(spec);
  assert.equal(spec.endpoint, '/mlabs/framework');
  assert.equal(spec.showInSlashMenu, false);
  assert.ok(mlabsSlashCommands().every(command => command.name !== 'dify-sources'));
});

test('the request body carries the page id', () => {
  const spec = mlabsCommands().find(command => command.name === 'mlabs-framework');
  assert.ok(spec);
  assert.equal(
    mlabsCommandBody(spec, 'page-1'),
    '{"page_id":"page-1","command":"mlabs-framework"}'
  );
});

test('running the command posts to its endpoint', async () => {
  const spec = mlabsCommands().find(command => command.name === 'mlabs-framework');
  assert.ok(spec);
  let url = '';
  let method = '';
  const result = await runMlabsCommand(spec, 'page-1', async (input, init) => {
    url = String(input);
    method = init?.method ?? '';
    return new Response('{}', { status: 201 });
  });
  assert.equal(url, '/mlabs/framework');
  assert.equal(method, 'POST');
  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
});

test('a later command can register without a new menu widget', () => {
  registerMlabsCommand({
    name: 'extra',
    description: 'later command',
    endpoint: '/mlabs/extra',
  });
  assert.ok(mlabsCommands().some(command => command.name === 'extra'));
});
