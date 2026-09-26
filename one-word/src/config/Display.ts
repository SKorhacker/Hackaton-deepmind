// Keep gameplay coordinates stable while rendering a high-density backing canvas.
export const VIEW_W = 960;
export const VIEW_H = 540;
export const RENDER_SCALE = Math.min(3, Math.max(2,
  Math.ceil(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H) * (window.devicePixelRatio || 1)),
));
