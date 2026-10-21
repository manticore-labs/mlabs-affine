import { MlabsSlashMenuConfigExtension } from '@affine/core/blocksuite/mlabs/slash-menu';
import { mlabsSurfaceToolbarConfig } from '@affine/core/blocksuite/mlabs/toolbar';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { ToolbarModuleExtension } from '@blocksuite/affine/shared/services';
import { BlockFlavourIdentifier } from '@blocksuite/affine/std';
import { z } from 'zod';

const optionsSchema = z.object({});

export class MlabsViewExtension extends ViewExtensionProvider {
  override name = 'mlabs-view-extension';

  override schema = optionsSchema;

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    if (context.scope !== 'page' && context.scope !== 'edgeless') return;

    context.register(MlabsSlashMenuConfigExtension());

    if (context.scope === 'edgeless') {
      const feedbackToolbar = mlabsSurfaceToolbarConfig();
      context.register([
        ToolbarModuleExtension({
          id: BlockFlavourIdentifier('custom:affine:surface:*'),
          config: feedbackToolbar,
        }),
        // Explicit shape flavour so 💬 shows when a rect/card is selected.
        ToolbarModuleExtension({
          id: BlockFlavourIdentifier('custom:affine:surface:shape'),
          config: feedbackToolbar,
        }),
      ]);
    }
  }
}
