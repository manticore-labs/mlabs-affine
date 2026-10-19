import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const body = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '4px 2px 8px',
  color: cssVarV2('text/primary'),
});

export const lead = style({
  margin: 0,
  fontSize: 13,
  lineHeight: '20px',
  color: cssVarV2('text/secondary'),
});

export const error = style({
  margin: 0,
  padding: '8px 10px',
  borderRadius: 8,
  fontSize: 13,
  lineHeight: '20px',
  color: cssVarV2('status/error'),
  background: cssVarV2('layer/background/error'),
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
});

export const sectionTitle = style({
  margin: 0,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  color: cssVarV2('text/secondary'),
});

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
});

export const actions = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  justifyContent: 'flex-end',
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

export const empty = style({
  margin: 0,
  fontSize: 13,
  color: cssVarV2('text/secondary'),
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 10,
  background: cssVarV2('layer/background/secondary'),
});

export const itemMeta = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
});

export const itemName = style({
  fontSize: 13,
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const itemStatus = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
});

export const itemActions = style({
  display: 'flex',
  gap: 6,
  flexShrink: 0,
});

export const uploadRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
});

export const fileName = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 220,
});

export const loading = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  color: cssVarV2('text/secondary'),
});
