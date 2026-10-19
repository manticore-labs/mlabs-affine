import { SlashMenuConfigExtension } from '@blocksuite/affine/widgets/slash-menu';

import { mlabsSlashCommands } from './loader';
import { openDifySourcesPanel } from './panel';

const PANEL_COMMANDS = new Set(['mlabs-framework', 'dify-sources']);

export function MlabsSlashMenuConfigExtension() {
  return SlashMenuConfigExtension('mlabs', {
    items: () =>
      mlabsSlashCommands().map((spec, index) => ({
        name: spec.name,
        description: spec.description,
        group: `8_Mlabs@${index}` as `${number}_${string}@${number}`,
        action: ({ std }) => {
          if (!PANEL_COMMANDS.has(spec.name)) return;
          openDifySourcesPanel({
            pageId: std.store.id,
            pageUrl: globalThis.location?.href,
            doc: std.store.spaceDoc,
          });
        },
      })),
  });
}
