import {
  ActionPlacement,
  type ToolbarModuleConfig,
} from '@blocksuite/affine/shared/services';
import { html } from 'lit';

import { openDifySourcesPanel } from './panel';
import { readSelectedExternalId } from './toolbar-attrs';

/** Edgeless surface toolbar: 💬 mlabs on selected shape (mid-toolbar). */
export function mlabsSurfaceToolbarConfig(): ToolbarModuleConfig {
  return {
    actions: [
      {
        // Normal + id between color (e.*) and text (f.*) → middle of shape toolbar
        placement: ActionPlacement.Normal,
        id: 'e2.mlabs.feedback',
        score: 0,
        when(ctx) {
          try {
            return ctx.getSurfaceModels().length > 0;
          } catch {
            return false;
          }
        },
        content: ctx => {
          // Capture at render time — on mobile the tap clears selection before click.
          const capturedId = readSelectedExternalId(ctx.getSurfaceModels());
          const store = ctx.host.store;
          const onClick = () => {
            try {
              const liveId = readSelectedExternalId(ctx.getSurfaceModels());
              openDifySourcesPanel({
                pageId: store.id,
                pageUrl: globalThis.location?.href,
                doc: store.spaceDoc,
                store,
                initialTab: 'pintar',
                focusFeedback: true,
                initialFeedbackId: liveId || capturedId,
              });
            } catch (err) {
              console.error('mlabs feedback toolbar', err);
            }
          };
          return html`
            <icon-button
              size="28px"
              data-testid="mlabs-feedback-toolbar"
              title="💬 mlabs"
              style="min-width:72px;padding:0 8px;gap:4px"
              @click=${onClick}
            >
              <span style="font-size:15px;line-height:1">💬</span>
              <span style="font-size:12px;font-weight:600">mlabs</span>
            </icon-button>
          `;
        },
      },
    ],
  };
}
