import { SlashMenuConfigExtension } from '@blocksuite/affine/widgets/slash-menu';

import { mlabsCommands } from './loader';
import { openDifySourcesPanel } from './panel';

export function MlabsSlashMenuConfigExtension() {
  return SlashMenuConfigExtension('mlabs', {
    items: () =>
      mlabsCommands().map((spec, index) => ({
        name: spec.name,
        description: spec.description,
        group: `8_Mlabs@${index}` as `${number}_${string}@${number}`,
        action: ({ std }) => {
          if (spec.name !== 'dify-sources') return;
          openDifySourcesPanel({
            pageId: std.store.id,
            pageUrl: globalThis.location?.href,
            doc: std.store.spaceDoc,
          });
        },
      })),
  });
}
