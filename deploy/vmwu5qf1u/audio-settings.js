export const DEFAULT_MUSIC_VOLUME=25;
export const DEFAULT_EFFECTS_VOLUME=100;

export function normalizeVolume(value,fallback){
  return typeof value==='number'&&Number.isFinite(value)?Math.round(Math.max(0,Math.min(100,value))):fallback;
}
