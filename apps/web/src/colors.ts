// Player colours, chosen to read well on both the 3D scene and the UI panels.
export const PLAYER_COLORS = [
  '#e4202e', '#0b6ee8', '#00a651', '#ffc20e', '#9b4dff', '#ff7a1a',
  '#1ec8c8', '#ff4fa3', '#8bd13a', '#c8a27a', '#f5f5f5', '#5b5f7a',
];
export const playerColor = (i: number) => PLAYER_COLORS[i % PLAYER_COLORS.length]!;
