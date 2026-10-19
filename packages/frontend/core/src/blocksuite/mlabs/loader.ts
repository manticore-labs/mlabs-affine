export type MlabsCommandSpec = {
  name: string;
  description: string;
  endpoint: string;
  /** When false, slash menu hides the command but it stays registered. */
  showInSlashMenu?: boolean;
};

const extra: MlabsCommandSpec[] = [];

const FRAMEWORK_ENDPOINT = '/mlabs/framework';

const builtins: MlabsCommandSpec[] = [
  {
    name: 'mlabs-framework',
    description: 'Fuentes y preguntas sobre el dataset de esta página',
    endpoint: FRAMEWORK_ENDPOINT,
    showInSlashMenu: true,
  },
  {
    name: 'dify-sources',
    description: 'Alias legacy del panel Mlabs Framework',
    endpoint: FRAMEWORK_ENDPOINT,
    showInSlashMenu: false,
  },
];

export function registerMlabsCommand(spec: MlabsCommandSpec) {
  extra.push(spec);
}

export function mlabsCommands(): MlabsCommandSpec[] {
  return [...builtins, ...extra];
}

export function mlabsSlashCommands(): MlabsCommandSpec[] {
  return mlabsCommands().filter(spec => spec.showInSlashMenu !== false);
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
