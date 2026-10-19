import { notify } from '@affine/component';
import { SlashMenuConfigExtension } from '@blocksuite/affine/widgets/slash-menu';

import { mlabsCommands, runMlabsCommand } from './loader';

export function MlabsSlashMenuConfigExtension() {
  return SlashMenuConfigExtension('mlabs', {
    items: () =>
      mlabsCommands().map((spec, index) => ({
        name: spec.name,
        description: spec.description,
        group: `8_Mlabs@${index}` as `${number}_${string}@${number}`,
        action: ({ std }) => {
          const pageId = std.store.id;
          void runMlabsCommand(spec, pageId, globalThis.fetch)
            .then(result => {
              notify({
                title: spec.name,
                message: result.ok
                  ? `page ${pageId}`
                  : `HTTP ${result.status}`,
                theme: result.ok ? 'success' : 'error',
              });
            })
            .catch(() => {
              notify({
                title: spec.name,
                message: 'request failed',
                theme: 'error',
              });
            });
        },
      })),
  });
}
