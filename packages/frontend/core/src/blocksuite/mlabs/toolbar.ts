import {
  ActionPlacement,
  type ToolbarModuleConfig,
} from '@blocksuite/affine/shared/services';
import { html } from 'lit';

import { openDifySourcesPanel } from './panel';

function readSelectedExternalId(
  models: Array<{
    yMap?: { get?: (key: string) => unknown };
    mlabsAttrs?: unknown;
  }>
): string | undefined {
  for (const model of models) {
    const raw =
      model.yMap?.get?.('mlabsAttrs') ??
      (model as { mlabsAttrs?: unknown }).mlabsAttrs;
    if (!raw || typeof raw !== 'object') continue;
    const map = raw as {
      get?: (key: string) => unknown;
      externalId?: string;
    };
    const fromGet =
      typeof map.get === 'function' ? map.get('externalId') : undefined;
    if (typeof fromGet === 'string' && fromGet.length > 0) return fromGet;
    if (typeof map.externalId === 'string' && map.externalId.length > 0) {
      return map.externalId;
    }
  }
  return undefined;
}

/** Edgeless surface toolbar: 💬 Comentario on selected shape. */
export function mlabsSurfaceToolbarConfig(): ToolbarModuleConfig {
  return {
    actions: [
      {
        placement: ActionPlacement.Start,
        id: 'A.mlabs.feedback',
        score: -2,
        when(ctx) {
          const models = ctx.getSurfaceModels();
          return models.length > 0 && !models.some(m => m.isLocked?.());
        },
        content: ctx => {
          const onClick = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            const models = ctx.getSurfaceModels();
            const initialFeedbackId = readSelectedExternalId(models);
            const store = ctx.host.store;
            openDifySourcesPanel({
              pageId: store.id,
              pageUrl: globalThis.location?.href,
              doc: store.spaceDoc,
              store,
              initialTab: 'pintar',
              focusFeedback: true,
              initialFeedbackId,
            });
          };
          return html`
            <icon-button
              size="28px"
              data-testid="mlabs-feedback-toolbar"
              title="💬 Comentario Mlabs — enviar nodo a Dify"
              style="min-width:110px;padding:0 8px;gap:4px"
              @click=${onClick}
            >
              <span style="font-size:15px;line-height:1">💬</span>
              <span style="font-size:12px;font-weight:600">Comentario</span>
            </icon-button>
          `;
        },
      },
    ],
  };
}
