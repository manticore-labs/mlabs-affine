export type MlabsCommandSpec = {
  name: string;
  description: string;
  endpoint: string;
};

const extra: MlabsCommandSpec[] = [];

const builtins: MlabsCommandSpec[] = [
  {
    name: 'dify-sources',
    description: 'Create the Dify dataset for this page',
    endpoint: '/mlabs/dify-sources',
  },
];

export function registerMlabsCommand(spec: MlabsCommandSpec) {
  extra.push(spec);
}

export function mlabsCommands(): MlabsCommandSpec[] {
  return [...builtins, ...extra];
}

export function mlabsCommandBody(spec: MlabsCommandSpec, pageId: string) {
  return JSON.stringify({ page_id: pageId, command: spec.name });
}

export async function runMlabsCommand(
  spec: MlabsCommandSpec,
  pageId: string,
  fetchImpl: typeof fetch
): Promise<{ ok: boolean; status: number }> {
  const response = await fetchImpl(spec.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: mlabsCommandBody(spec, pageId),
  });
  return { ok: response.ok, status: response.status };
}
