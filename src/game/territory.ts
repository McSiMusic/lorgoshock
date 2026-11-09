import type { Base, GameState } from "./model";

const EDGE_NEIGHBORS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

export function claimCityTerritory(state: Pick<GameState, "tiles">, base: Base): void {
  for (const tile of state.tiles) {
    if (tile.territoryBaseId === undefined
      && Math.max(Math.abs(base.x - tile.x), Math.abs(base.y - tile.y)) <= Math.floor(base.resourceRange / 2)) {
      tile.territoryBaseId = base.id;
    }
  }
}

export type TerritoryEdge = { x: number; y: number; edge: number };

export function territoryEdges(game: Pick<GameState, "tiles" | "size">, selected: Base): TerritoryEdge[] {
  const edges: TerritoryEdge[] = [];
  for (const tile of game.tiles) {
    if (tile.territoryBaseId !== selected.id) continue;
    EDGE_NEIGHBORS.forEach(([dx, dy], edge) => {
      const x = tile.x + dx, y = tile.y + dy;
      if (x < 0 || y < 0 || x >= game.size || y >= game.size
        || game.tiles[y * game.size + x].territoryBaseId !== selected.id) {
        edges.push({ x: tile.x, y: tile.y, edge });
      }
    });
  }
  return edges;
}
