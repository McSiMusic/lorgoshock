export type Point = { x: number; y: number };
export type IsometricGrid = {
  width: number;
  height: number;
  size: number;
  tileWidth: number;
  tileHeight: number;
};

export function createIsometricGrid(width: number, height: number, size: number): IsometricGrid {
  const tileWidth = Math.max(1, Math.min(
    (width - 32) / (size * 2),
    (height - 46) / (size * 1.04),
  ));
  return {
    width,
    height,
    size,
    tileWidth,
    tileHeight: tileWidth * 0.52,
  };
}

export function tileCenter(grid: IsometricGrid, x: number, y: number): Point {
  return {
    x: grid.width / 2 + (x - y) * grid.tileWidth,
    y: grid.height / 2 + (x + y - (grid.size - 1)) * grid.tileHeight,
  };
}

export function screenToTile(
  grid: IsometricGrid,
  point: Point,
): { x: number; y: number } | null {
  const diagonalX = (point.x - grid.width / 2) / grid.tileWidth;
  const diagonalY = (point.y - grid.height / 2) / grid.tileHeight + grid.size - 1;
  const x = Math.max(0, Math.round((diagonalX + diagonalY) / 2));
  const y = Math.max(0, Math.round((diagonalY - diagonalX) / 2));

  if (x < 0 || y < 0 || x >= grid.size || y >= grid.size) return null;
  const center = tileCenter(grid, x, y);
  const withinTile = Math.abs(point.x - center.x) / grid.tileWidth
    + Math.abs(point.y - center.y) / grid.tileHeight <= 1;
  return withinTile ? { x, y } : null;
}
