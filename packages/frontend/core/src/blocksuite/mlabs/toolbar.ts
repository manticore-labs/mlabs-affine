import {
  ActionPlacement,
  type ToolbarModuleConfig,
} from '@blocksuite/affine/shared/services';
import { html } from 'lit';

import { openDifySourcesPanel } from './panel';

/** Edgeless surface toolbar: visible 💬 entry (S3 feedback). */
export function mlabsSurfaceToolbarConfig(): ToolbarModuleConfig {
  return {
    actions: [
      {
        placement: ActionPlacement.Start,
        id: 'A.mlabs.feedback',
        score: -2,
        when() {
          // Visible whenever the surface selection toolbar is mounted
          // (edgeless + at least one shape/connector selected).
          return true;
        },
        content: ({ host }) => {
          const onClick = () => {
            const store = host.store;
            openDifySourcesPanel({
              pageId: store.id,
              pageUrl: globalThis.location?.href,
              doc: store.spaceDoc,
              store,
              initialTab: 'pintar',
              focusFeedback: true,
            });
          };
          return html`
            <icon-button
              size="24px"
              data-testid="mlabs-feedback-toolbar"
              title="💬 Comentario Mlabs"
              @click=${onClick}
            >
              <span style="font-size:16px;line-height:1">💬</span>
            </icon-button>
          `;
        },
      },
    ],
  };
}
