import { describe, expect, it } from "vitest";
import { createGame, damage, incomeForRank, progressToNextRank, revealAround, shortestPath } from "./rules";

describe("game rules", () => {
  it("creates the same balanced world for the same seed", () => {
    const first = createGame("test-seed", 16, "lorgoshki");
    const second = createGame("test-seed", 16, "lorgoshki");

    expect(first.tiles).toEqual(second.tiles);
    expect(first.bases.filter((base) => base.owner === null)).toHaveLength(4);
    expect(first.units).toHaveLength(2);
    expect(first.units[0].x).toBe(2);
    expect(first.units[1].x).toBe(13);
  });

  it("assigns the chosen faction the matching opponent", () => {
    const game = createGame("robots", 16, "robots");
    expect(game.playerFaction).toBe("robots");
    expect(game.botFaction).toBe("lorgoshki");
    expect(game.tokens.robots).toBe(7);
  });

  it("uses the rank income and progress thresholds", () => {
    expect([1, 2, 3, 4].map(incomeForRank)).toEqual([2, 3, 4, 5]);
    expect([1, 2, 3, 4].map(progressToNextRank)).toEqual([2, 3, 4, 4]);
  });

  it("calculates damage from remaining health and combat upgrades", () => {
    const game = createGame("combat", 16, "lorgoshki");
    const junior = game.units[0];
    const robot = game.units[1];
    expect(damage(junior, robot, game)).toBe(4);

    game.tech.lorgoshki[1] = 2;
    expect(damage(junior, robot, game)).toBe(5);
  });

  it("finds paths and rejects water and unreachable destinations", () => {
    const game = createGame("path", 16, "lorgoshki");
    game.tiles = game.tiles.map((tile) => ({ ...tile, terrain: "plain" }));
    game.tiles[1].terrain = "water";
    expect(shortestPath(game, { x: 0, y: 0 }, { x: 2, y: 0 })).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 0 },
    ]);

    game.tiles.forEach((tile, index) => {
      if (index % game.size === 1) tile.terrain = "water";
    });
    expect(shortestPath(game, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });

  it("keeps explored fog and only reveals the player's units", () => {
    const game = createGame("fog", 16, "lorgoshki");
    const start = game.units[0];
    const hidden = game.tiles.find((tile) => tile.x === 12 && tile.y === 2);

    expect(game.tiles[start.y * game.size + start.x].visible).toBe(true);
    expect(hidden?.visible).toBe(false);
    if (hidden) hidden.explored = true;
    revealAround(game);
    expect(hidden?.visible).toBe(false);
    expect(hidden?.explored).toBe(true);
  });

  it("does not reveal a tile from the opposite edge of the map", () => {
    const game = createGame("edge-fog", 16, "lorgoshki");
    const unit = game.units[0];
    unit.x = 0;
    unit.y = 0;
    game.units = [unit];
    game.tiles.forEach((tile) => { tile.explored = false; });

    revealAround(game);

    expect(game.tiles[15].visible).toBe(false);
    expect(game.tiles[0].visible).toBe(true);
  });
});
