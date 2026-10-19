import { MlabsSlashMenuConfigExtension } from '@affine/core/blocksuite/mlabs/slash-menu';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { z } from 'zod';

const optionsSchema = z.object({});

export class MlabsViewExtension extends ViewExtensionProvider {
  override name = 'mlabs-view-extension';

  override schema = optionsSchema;

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    if (context.scope !== 'page' && context.scope !== 'edgeless') return;

    context.register(MlabsSlashMenuConfigExtension());
  }
}
