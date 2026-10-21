import {
  ActionPlacement,
  type ToolbarModuleConfig,
} from '@blocksuite/affine/shared/services';
import { html } from 'lit';

import { openDifySourcesPanel } from './panel';
import { readSelectedExternalId } from './toolbar-attrs';

/**
 * Sticky id across toolbar re-renders. On mobile, tapping the button clears
 * selection and re-runs content() with an empty selection before click fires —
 * a per-render capturedId is wiped; this module-level latch is not.
 */
let stickyFeedbackId: string | undefined;

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
          const selectedId = readSelectedExternalId(ctx.getSurfaceModels());
          if (selectedId) stickyFeedbackId = selectedId;
          const store = ctx.host.store;
          const latchId = () => {
            const now = readSelectedExternalId(ctx.getSurfaceModels());
            if (now) stickyFeedbackId = now;
          };
          const onClick = () => {
            try {
              latchId();
              const liveId = readSelectedExternalId(ctx.getSurfaceModels());
              openDifySourcesPanel({
                pageId: store.id,
                pageUrl: globalThis.location?.href,
                doc: store.spaceDoc,
                store,
                initialTab: 'pintar',
                focusFeedback: true,
                // Prefer sticky: live is often empty after mobile tap clears selection.
                initialFeedbackId: liveId || stickyFeedbackId,
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
              @pointerdown=${latchId}
              @touchstart=${latchId}
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
