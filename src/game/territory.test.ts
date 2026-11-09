import { describe, expect, it } from "vitest";
import type { Base, GameState } from "./model";
import { canHarvest, createGame, expandResourceArea, healingAmount, resourceCity, transferBase } from "./rules";
import { savedGameSchema } from "./save";
import { claimCityTerritory, territoryEdges } from "./territory";

function rectangleEdges(minX: number, minY: number, maxX: number, maxY: number): string[] {
  const edges: string[] = [];
  for (let x = minX; x <= maxX; x++) edges.push(`${x},${minY},0`, `${x},${maxY},2`);
  for (let y = minY; y <= maxY; y++) edges.push(`${maxX},${y},1`, `${minX},${y},3`);
  return edges.sort();
}

function edgeKeys(game: GameState, base: Base): string[] {
  return territoryEdges(game, base).map(({ x, y, edge }) => `${x},${y},${edge}`).sort();
}

function clearTerritory(game: GameState): void {
  for (const tile of game.tiles) delete tile.territoryBaseId;
}

describe("company territories", () => {
  it("assigns only free tiles on neutral capture and keeps separate borders and harvesting", () => {
    const game = createGame("territory-takeover", 16, "lorgoshki");
    const [first, captured] = game.bases;
    Object.assign(first, { x: 5, y: 5, resourceRange: 5 });
    Object.assign(captured, { x: 8, y: 5, owner: null, resourceRange: 3 });
    game.bases = [first, captured];
    clearTerritory(game);
    claimCityTerritory(game, first);
    transferBase(game, captured, game.playerFaction, game.units[0]);
    expect(edgeKeys(game, first)).toEqual(rectangleEdges(3, 3, 7, 7));
    expect(edgeKeys(game, captured)).toEqual(rectangleEdges(8, 4, 9, 6));
    expect(game.tiles.filter((tile) => tile.territoryBaseId === captured.id)).toHaveLength(6);

    const overlap = game.tiles[5 * game.size + 7];
    Object.assign(overlap, { terrain: "forest", poi: null, poiClaimed: false, geese: false, visible: true });
    game.units = [];
    game.tokens[game.playerFaction] = 10;
    expect(resourceCity(game, overlap, captured.id)?.id).toBe(first.id);
    expect(canHarvest(game, first, overlap)).toBe(true);
    expect(canHarvest(game, captured, overlap)).toBe(false);
  });

  it("claims all free expansion tiles without taking friendly or rival territory", () => {
    const game = createGame("territory-expansion", 16, "lorgoshki");
    const [first, rival, friendly] = game.bases;
    Object.assign(first, { x: 5, y: 5, resourceRange: 3 });
    Object.assign(friendly, { x: 8, y: 5, owner: game.playerFaction, resourceRange: 3 });
    Object.assign(rival, { x: 5, y: 8, owner: game.botFaction, resourceRange: 3 });
    game.bases = [first, friendly, rival];
    clearTerritory(game);
    for (const base of game.bases) claimCityTerritory(game, base);
    const friendlyEdges = edgeKeys(game, friendly);
    const rivalEdges = edgeKeys(game, rival);
    game.tokens[game.playerFaction] = 10;
    expect(expandResourceArea(game, first.id)).toBe(true);
    expect(game.tiles.filter((tile) => tile.territoryBaseId === first.id)).toHaveLength(19);
    expect(edgeKeys(game, friendly)).toEqual(friendlyEdges);
    expect(edgeKeys(game, rival)).toEqual(rivalEdges);
    expect(edgeKeys(game, first)).toEqual([
      "3,3,0", "3,3,3", "4,3,0", "5,3,0", "6,3,0", "7,3,0", "7,3,1", "7,3,2",
      "3,4,3", "6,4,1", "3,5,3", "6,5,1", "3,6,3", "6,6,1",
      "3,7,3", "3,7,2", "3,7,1", "4,6,2", "5,6,2", "6,6,2",
      "7,7,0", "7,7,1", "7,7,2", "7,7,3",
    ].sort());
  });

  it("transfers only the captured company's original territory", () => {
    const game = createGame("territory-enemy-capture", 16, "lorgoshki");
    const [own, rival, neutral] = game.bases;
    Object.assign(own, { x: 5, y: 5, resourceRange: 5 });
    Object.assign(rival, { x: 8, y: 5, resourceRange: 3 });
    Object.assign(neutral, { x: 10, y: 5, owner: null });
    game.bases = [own, rival, neutral];
    clearTerritory(game);
    claimCityTerritory(game, own);
    claimCityTerritory(game, rival);
    const before = edgeKeys(game, rival);
    transferBase(game, rival, game.playerFaction, game.units[0]);
    expect(edgeKeys(game, rival)).toEqual(before);
    expect(game.tiles[5 * game.size + 7].territoryBaseId).toBe(own.id);
    expect(game.tiles[5 * game.size + 8].territoryBaseId).toBe(rival.id);
  });

  it("draws map edges, holes and disconnected pieces even if the city center was already claimed", () => {
    const game = createGame("territory-shapes", 16, "lorgoshki");
    const [base] = game.bases;
    clearTerritory(game);
    Object.assign(base, { x: 0, y: 0, resourceRange: 5 });
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]]) {
      game.tiles[y * game.size + x].territoryBaseId = base.id;
    }
    expect(edgeKeys(game, base)).toEqual([...rectangleEdges(0, 0, 2, 2), "1,0,2", "2,1,3", "1,2,0", "0,1,1"].sort());
    clearTerritory(game);
    game.tiles[1].territoryBaseId = base.id;
    game.tiles[2 * game.size + 2].territoryBaseId = base.id;
    expect(edgeKeys(game, base)).toEqual([...rectangleEdges(1, 0, 1, 0), ...rectangleEdges(2, 2, 2, 2)].sort());
  });

  it("migrates legacy saves deterministically and preserves claims after serialization", () => {
    const game = createGame("territory-save", 16, "lorgoshki");
    const [first, second] = game.bases;
    Object.assign(first, { x: 5, y: 5, resourceRange: 5 });
    Object.assign(second, { x: 8, y: 5, owner: game.botFaction, resourceRange: 3 });
    game.bases = [first, second, ...game.bases.slice(2)];
    const { territoryVersion: _version, ...legacy } = game;
    const restored = savedGameSchema.parse(JSON.parse(JSON.stringify(legacy)));
    expect(restored.tiles[5 * game.size + 7].territoryBaseId).toBe(first.id);
    expect(restored.tiles[5 * game.size + 8].territoryBaseId).toBe(second.id);
    expect(savedGameSchema.parse(JSON.parse(JSON.stringify(restored)))).toEqual(restored);
    restored.tiles[0].territoryBaseId = "missing";
    expect(savedGameSchema.safeParse(restored).success).toBe(false);
  });

  it("uses actual territorial ownership when healing", () => {
    const game = createGame("territory-healing", 16, "lorgoshki");
    const [home, enemy] = game.bases;
    Object.assign(home, { x: 5, y: 5, resourceRange: 5 });
    Object.assign(enemy, { x: 8, y: 5, resourceRange: 3 });
    clearTerritory(game);
    claimCityTerritory(game, home);
    claimCityTerritory(game, enemy);
    const unit = game.units[0];
    Object.assign(unit, { x: 7, y: 5, hp: 1, kind: "middle" });
    expect(healingAmount(game, unit)).toBe(4);
    unit.x = 8;
    expect(healingAmount(game, unit)).toBe(3);
  });
});
