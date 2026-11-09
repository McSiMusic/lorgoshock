import { describe, expect, it } from "vitest";
import { createIsometricGrid, fleePosition, initialMapZoom, screenToTile, tileCenter } from "./isometric";
import { MAP_SIZES, type Unit } from "./model";
import { makeIdentity } from "./names";
import { unitArtKey, unitPortraitPath } from "./unitArt";
import {
  canHarvestWithinCity,
  canAttack,
  canBuildBridge,
  bridgeAxis,
  canMoveTo,
  cityCapacity,
  cityOccupancy,
  createGame,
  damage,
  effectiveAttack,
  expandResourceArea,
  incomeForRank,
  gridDistance,
  hasUnitAction,
  hasCover,
  logEvent,
  progressToNextRank,
  revealAround,
  resourceCity,
  shortestPath,
} from "./rules";

describe("game rules", () => {
  it("assigns courier names matching their stable male or female appearance", () => {
    const men = ["Мирон", "Адам", "Теодор", "Серафим", "Платон", "Тихон", "Прохор", "Марсель"];
    const women = ["Мия", "Мирослава", "Агата", "Аврора", "Афина", "Злата", "Адель", "Есения"];
    const names = Array.from({ length: 32 }, (_, i) => makeIdentity("names", `courier-${i}`, "lorgoshki", "courier", []));
    expect(names.some((identity) => identity.gender === "male")).toBe(true);
    expect(names.some((identity) => identity.gender === "female")).toBe(true);
    for (const identity of names) expect(identity.gender === "male" ? men : women).toContain(identity.name.ru);
    expect(makeIdentity("names", "courier-1", "lorgoshki", "courier", [])).toEqual(names[1]);
  });

  it("uses a unit's gender for its portrait and keeps portrait URLs under the app path", () => {
    const makeUnit = (gender: Unit["gender"]): Unit => ({
      id: "lorgoshki-1",
      name: { en: "Miroslava", ru: "Мирослава" },
      gender,
      x: 0,
      y: 0,
      faction: "lorgoshki",
      kind: "junior",
      homeBaseId: null,
      hp: 5,
      moved: false,
      attacked: false,
    });

    const miroslava = makeUnit("female");
    expect(unitArtKey(miroslava)).toBe("hipsterWoman");
    expect(unitPortraitPath(miroslava)).toBe("game-art/units/mobile-hipster-woman.png");
    expect(unitArtKey(makeUnit("male"))).toBe("hipsterMan");
  });
  it("creates the same balanced world for the same seed", () => {
    const first = createGame("test-seed", 16, "lorgoshki");
    const second = createGame("test-seed", 16, "lorgoshki");

    expect(first.tiles).toEqual(second.tiles);
    expect(first.bases).toHaveLength(8);
    expect(first.bases.filter((base) => base.owner === null)).toHaveLength(6);
    expect(first.units).toHaveLength(2);
    expect(first.units[0].x + first.units[1].x).toBe(15);
    expect(first.units[0].y + first.units[1].y).toBe(15);
  });

  it("uses all four starting corners across seeds", () => {
    const corners = new Set(Array.from({ length: 60 }, (_, i) => {
      const { x, y } = createGame(`corner-${i}`, 16, "lorgoshki").units[0];
      return `${x},${y}`;
    }));
    expect(corners).toEqual(new Set(["2,2", "2,13", "13,2", "13,13"]));
  });

  it("keeps a noticeably larger share of water after placing connected locations", () => {
    const games = Array.from({ length: 60 }, (_, i) => createGame(`water-${i}`, 16, "lorgoshki"));
    const fraction = games.reduce((sum, game) => sum + game.tiles.filter((tile) => tile.terrain === "water").length / game.tiles.length, 0) / games.length;
    expect(fraction).toBeGreaterThan(0.12);
  });

  it("retains the complete game log", () => {
    const game = createGame("full-log", 16, "lorgoshki");
    for (let i = 0; i < 120; i++) logEvent(game, `событие ${i}`, `event ${i}`);
    expect(game.logs).toHaveLength(120);
    expect(game.logs[119].en).toBe("event 0");
  });

  it.each(MAP_SIZES)("generates connected, spaced worlds of size %i across many seeds", (size) => {
    const scale = size * size / 256;
    for (let seed = 0; seed < 300; seed++) {
      const game = createGame(`world-${seed}`, size, "lorgoshki");
      const neutral = game.bases.filter((base) => base.owner === null);
      const coffee = game.tiles.filter((tile) => tile.poi === "coffee");
      expect(neutral.length).toBe(Math.round(6 * scale));
      expect(coffee.length).toBeGreaterThanOrEqual(Math.round(4 * scale));
      expect(coffee.length).toBeLessThanOrEqual(Math.round(5 * scale));
      for (const [index, shop] of coffee.entries()) {
        expect(shop.x).toBeGreaterThan(0);
        expect(shop.y).toBeGreaterThan(0);
        expect(shop.x).toBeLessThan(size - 1);
        expect(shop.y).toBeLessThan(size - 1);
        for (const other of coffee.slice(index + 1)) expect(gridDistance(shop, other)).toBeGreaterThanOrEqual(3);
        for (const base of game.bases) expect(gridDistance(shop, base)).toBeGreaterThanOrEqual(2);
      }
      for (const [index, base] of game.bases.entries()) {
        expect(base.x).toBeGreaterThan(0);
        expect(base.y).toBeGreaterThan(0);
        expect(base.x).toBeLessThan(size - 1);
        expect(base.y).toBeLessThan(size - 1);
        for (const other of game.bases.slice(index + 1)) expect(gridDistance(base, other)).toBeGreaterThanOrEqual(3);
      }
      const visited = new Set([`${game.bases[0].x},${game.bases[0].y}`]);
      const queue = [{ x: game.bases[0].x, y: game.bases[0].y }];
      for (let i = 0; i < queue.length; i++) {
        const { x, y } = queue[i];
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size || visited.has(key) || game.tiles[ny * size + nx].terrain === "water") continue;
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
      for (const object of [...game.bases, ...coffee]) expect(visited.has(`${object.x},${object.y}`)).toBe(true);
    }
    expect(createGame("different-a", size, "lorgoshki").tiles).not.toEqual(createGame("different-b", size, "lorgoshki").tiles);
  });

  it("limits map generation to supported sizes", () => {
    expect(MAP_SIZES).toEqual([8, 16, 24]);
    expect(() => createGame("oversized", 64, "lorgoshki")).toThrow(/8, 16, 24/);
    expect(() => createGame("unsupported", 32, "lorgoshki")).toThrow(/8, 16, 24/);
    expect(createGame("smallest", 8, "lorgoshki").size).toBe(8);
    expect(createGame("largest", 24, "lorgoshki").size).toBe(24);
  });

  it("keeps neutral and enemy bases hidden until their tiles are explored", () => {
    const game = createGame("hidden-startups", 16, "lorgoshki");
    const playerBase = game.bases.find((base) => base.owner === game.playerFaction);
    const hiddenBases = game.bases.filter((base) => base.owner !== game.playerFaction);

    expect(playerBase).toBeDefined();
    expect(game.tiles[playerBase!.y * game.size + playerBase!.x].visible).toBe(true);
    expect(hiddenBases.length).toBeGreaterThan(0);
    expect(hiddenBases.every((base) => !game.tiles[base.y * game.size + base.x].explored)).toBe(true);
  });

  it("keeps an owned city visible after its garrison leaves", () => {
    const game = createGame("city-vision", 16, "lorgoshki");
    const playerBase = game.bases.find((base) => base.owner === game.playerFaction)!;
    game.units[0].x = 0;
    game.units[0].y = 0;

    revealAround(game);

    expect(game.tiles[playerBase.y * game.size + playerBase.x].visible).toBe(true);
  });

  it("reveals square areas and keeps explored cells permanently explored", () => {
    const game = createGame("square-fog", 16, "lorgoshki");
    const base = game.bases[0];
    const diagonal = game.tiles[(base.y + (base.y < 8 ? 2 : -2)) * game.size + base.x + (base.x < 8 ? 2 : -2)];
    expect(diagonal.visible).toBe(true);

    diagonal.visible = false;
    diagonal.explored = true;
    game.units = [];
    game.bases = game.bases.filter((base) => base.owner !== game.playerFaction);
    revealAround(game);
    expect(diagonal.visible).toBe(false);
    expect(diagonal.explored).toBe(true);
  });

  it("reveals only the neighboring 3x3 area around units, independent of combat range", () => {
    const game = createGame("unit-vision", 16, "lorgoshki");
    const unit = game.units[0];
    Object.assign(unit, { x: 8, y: 8, kind: "courier" });
    game.tech.lorgoshki[1] = 3;
    revealAround(game);
    expect(game.tiles[9 * game.size + 9].visible).toBe(true);
    expect(game.tiles[10 * game.size + 8].visible).toBe(false);
    const base = game.bases[0];
    expect(game.tiles[base.y * game.size + base.x].visible).toBe(true);
  });

  it("reveals a radius of three from mountains and retains exploration after leaving", () => {
    const game = createGame("mountain-vision", 16, "lorgoshki");
    const unit = game.units[0];
    Object.assign(unit, { x: 8, y: 8 });
    game.tiles[8 * game.size + 8].terrain = "mountain";
    revealAround(game);
    const distant = game.tiles[11 * game.size + 11];
    expect(distant.visible).toBe(true);
    expect(game.tiles[12 * game.size + 12].visible).toBe(false);
    Object.assign(unit, { x: 7, y: 7 });
    game.tiles[7 * game.size + 7].terrain = "plain";
    revealAround(game);
    expect(distant.visible).toBe(false);
    expect(distant.explored).toBe(true);
  });

  it("identifies only visible unclaimed resources inside an uncontested owned city", () => {
    const game = createGame("resource-glow", 16, "lorgoshki");
    const base = game.bases[0];
    const tile = game.tiles[base.y * game.size + base.x + 1];
    Object.assign(tile, { terrain: "forest", poi: null, poiClaimed: false, geese: false, visible: true });
    game.tokens.lorgoshki = 0;
    expect(resourceCity(game, tile)?.id).toBe(base.id);
    base.resourceRange = 3;
    const outside = game.tiles[base.y * game.size + base.x + 2];
    Object.assign(outside, { terrain: "forest", poi: null, poiClaimed: false, visible: true });
    expect(resourceCity(game, outside)).toBeUndefined();
    base.resourceRange = 5;
    expect(resourceCity(game, outside)?.id).toBe(base.id);
    tile.visible = false;
    expect(resourceCity(game, tile)).toBeUndefined();
    tile.visible = true;
    tile.poiClaimed = true;
    expect(resourceCity(game, tile)).toBeUndefined();
    base.capture = { unitId: "enemy", faction: game.botFaction, readyTurn: 2 };
    expect(resourceCity(game, outside)).toBeUndefined();
  });

  it("limits resource collection to a city 3x3 area until a 10-token expansion", () => {
    const game = createGame("resource-range", 16, "lorgoshki");
    const base = game.bases.find((candidate) => candidate.owner === game.playerFaction)!;
    expect(canHarvestWithinCity(base, { x: base.x + 1, y: base.y + 1 })).toBe(true);
    expect(canHarvestWithinCity(base, { x: base.x + 2, y: base.y })).toBe(false);
    expect(expandResourceArea(game, base.id)).toBe(false);
    game.tokens[game.playerFaction] = 10;
    expect(expandResourceArea(game, base.id)).toBe(true);
    expect(game.tokens[game.playerFaction]).toBe(0);
    expect(base.resourceRange).toBe(5);
    expect(canHarvestWithinCity(base, { x: base.x + 2, y: base.y + 2 })).toBe(true);
    expect(expandResourceArea(game, base.id)).toBe(false);
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
    Object.assign(robot, { x: 8, y: 8 });
    game.tiles[8 * game.size + 8].terrain = "plain";
    expect(damage(junior, robot, game)).toBe(4);

    game.tech.lorgoshki[1] = 2;
    expect(damage(junior, robot, game)).toBe(5);
  });

  it("scales attack with health and applies 25% terrain cover after rounding", () => {
    const game = createGame("cover-combat", 16, "lorgoshki");
    const [attacker, defender] = game.units;
    attacker.kind = "senior";
    attacker.hp = 15;
    defender.kind = "vacuum";
    defender.hp = 14;
    Object.assign(defender, { x: 8, y: 8 });
    game.bases = game.bases.filter((base) => base.x !== 8 || base.y !== 8);
    const tile = game.tiles[defender.y * game.size + defender.x];
    tile.terrain = "plain";
    const fullDamage = damage(attacker, defender, game);
    expect(fullDamage).toBe(8);
    for (const terrain of ["forest", "mountain"] as const) {
      tile.terrain = terrain;
      expect(damage(attacker, defender, game)).toBe(Math.round(7.5 * 0.75));
    }
    tile.terrain = "plain";
    attacker.hp = 5;
    expect(effectiveAttack(game, attacker)).toBe(1.5);
    expect(damage(attacker, defender, game)).toBe(3);
    tile.terrain = "forest";
    expect(damage(attacker, defender, game)).toBe(2);
    tile.poi = null;
    tile.poiClaimed = true;
    expect(damage(attacker, defender, game)).toBe(3);
  });

  it("protects only a company's owner, not a unit capturing it", () => {
    const game = createGame("city-cover", 16, "lorgoshki");
    const base = game.bases[1];
    const [attacker, defender] = game.units;
    expect(hasCover(game, defender)).toBe(true);
    const defendedDamage = damage(attacker, defender, game);
    base.owner = null;
    const unprotectedDamage = damage(attacker, defender, game);
    expect(defendedDamage).toBeLessThan(unprotectedDamage);
    base.owner = defender.faction;
    base.capture = { unitId: attacker.id, faction: attacker.faction, readyTurn: game.turn + 1 };
    Object.assign(attacker, { x: base.x, y: base.y });
    expect(hasCover(game, attacker)).toBe(false);
    delete base.capture;
    base.owner = attacker.faction;
    expect(hasCover(game, attacker)).toBe(true);
  });

  it("makes defensive research reduce, not increase, damage received", () => {
    const game = createGame("defensive-research", 16, "lorgoshki");
    const [attacker, defender] = game.units;
    Object.assign(defender, { x: 8, y: 8 });
    game.bases = game.bases.filter((base) => base.x !== 8 || base.y !== 8);
    game.tiles[8 * game.size + 8].terrain = "plain";
    const before = damage(attacker, defender, game);
    game.tech[defender.faction][0] = 1;
    expect(damage(attacker, defender, game)).toBeLessThan(before);
  });

  it("keeps a moved ranged unit active only while a target is in range", () => {
    const game = createGame("remaining-actions", 16, "lorgoshki");
    const [unit, enemy] = game.units;
    Object.assign(unit, { kind: "courier", hp: 4, x: 5, y: 5, moved: true, attacked: false });
    Object.assign(enemy, { x: 7, y: 7 });
    game.tiles[7 * game.size + 7].explored = true;
    expect(canAttack(game, unit, enemy)).toBe(true);
    expect(hasUnitAction(game, unit)).toBe(true);
    enemy.x = 8;
    expect(hasUnitAction(game, unit)).toBe(false);
    unit.attacked = true;
    enemy.x = 7;
    expect(hasUnitAction(game, unit)).toBe(false);
  });

  it("measures city capacity per city, not across the whole faction", () => {
    const game = createGame("capacity", 16, "robots");
    const base = game.bases[0];
    expect(cityCapacity(base)).toBe(2);
    expect(cityOccupancy(game, base)).toBe(1);
    game.units.push({ ...game.units[0], id: "another" });
    expect(cityOccupancy(game, base)).toBe(2);
    base.rank = 3;
    expect(cityCapacity(base)).toBe(4);
    game.units[0].x++;
    expect(cityOccupancy(game, base)).toBe(2);
    game.units[0].homeBaseId = null;
    expect(cityOccupancy(game, base)).toBe(1);
  });

  it("identifies targets for the selected attacker, both factions, range and attack state", () => {
    for (const faction of ["robots", "lorgoshki"] as const) {
      const game = createGame("attack-target", 16, faction);
      const [attacker, defender] = game.units;
      defender.x = attacker.x + 1;
      defender.y = attacker.y + 1;
      revealAround(game);
      expect(canAttack(game, attacker, defender)).toBe(true);
      attacker.attacked = true;
      expect(canAttack(game, attacker, defender)).toBe(false);
      attacker.attacked = false;
      defender.x += 1;
      expect(canAttack(game, attacker, defender)).toBe(false);
      game.tech[faction][1] = 2;
      revealAround(game);
      expect(canAttack(game, attacker, defender)).toBe(true);
      game.tiles[defender.y * game.size + defender.x].visible = false;
      expect(canAttack(game, attacker, defender)).toBe(true);
      game.tiles[defender.y * game.size + defender.x].explored = false;
      expect(canAttack(game, attacker, defender)).toBe(false);
      game.tiles[defender.y * game.size + defender.x].visible = true;
      game.tiles[defender.y * game.size + defender.x].explored = true;
      attacker.kind = faction === "robots" ? "drone" : "junior";
      if (faction === "robots") expect(canAttack(game, attacker, defender)).toBe(true);
    }
  });

  it("finds paths and rejects water and unreachable destinations", () => {
    const game = createGame("path", 16, "lorgoshki");
    game.tiles = game.tiles.map((tile) => ({ ...tile, terrain: "plain" }));
    game.tiles[1].terrain = "water";
    expect(shortestPath(game, { x: 0, y: 0 }, { x: 2, y: 0 })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ]);

    game.tiles.forEach((tile, index) => {
      if (index % game.size === 1) tile.terrain = "water";
    });
    expect(shortestPath(game, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });

  it("allows bridges only between opposite shores and restricts travel to their axis", () => {
      const game = createGame("bridge-rules", 16, "lorgoshki");
      const base = game.bases[0];
      Object.assign(base, { x: 5, y: 5 });
      game.tiles = game.tiles.map((tile) => ({ ...tile, terrain: "plain", poi: null, explored: true }));
      game.units.forEach((unit) => { unit.x = 10; unit.y = 10; });
      const tile = game.tiles[5 * game.size + 5 + 1];
      tile.terrain = "water";
      game.tokens.lorgoshki = 5;
      expect(canBuildBridge(game, base, tile, "x")).toBe(true);
      expect(canBuildBridge(game, base, tile, "y")).toBe(true);
      expect(bridgeAxis(game, base, tile)).toBe("x");
      game.tiles[5 * game.size + 7].terrain = "water";
      expect(bridgeAxis(game, base, tile)).toBe("y");
      game.tiles[5 * game.size + 7].terrain = "plain";
      game.tiles[4 * game.size + 6].terrain = "water";
      expect(canBuildBridge(game, base, tile, "y")).toBe(false);
      const outsideCity = game.tiles[8 * game.size + 8];
      outsideCity.terrain = "water";
      expect(canBuildBridge(game, base, outsideCity, "x")).toBe(true);
      game.tiles[5 * game.size + 7].terrain = "water";
      expect(bridgeAxis(game, base, tile)).toBeUndefined();
      game.tiles[5 * game.size + 7].terrain = "plain";
      tile.bridge = { axis: "x", faction: "robots" };
      expect(shortestPath(game, { x: 5, y: 5 }, tile, 1)).toEqual([{ x: 6, y: 5 }]);
      expect(shortestPath(game, { x: 5, y: 4 }, tile, 1)).toBeNull();
      expect(shortestPath(game, tile, { x: 6, y: 6 }, 1)).toBeNull();
      expect(shortestPath(game, tile, { x: 7, y: 5 }, 1)).toEqual([{ x: 7, y: 5 }]);
  });

  it("allows three land steps around water including diagonal steps", () => {
    const game = createGame("diagonal-path", 16, "lorgoshki");
    game.tiles = game.tiles.map((tile) => ({ ...tile, terrain: "plain" }));
    const courier = game.units[0];
    Object.assign(courier, { kind: "courier", x: 2, y: 2 });
    game.tiles[2 * game.size + 3].terrain = "water";
    game.tiles.forEach((tile) => { tile.explored = true; });
    const path = shortestPath(game, courier, { x: 5, y: 4 }, 3);
    expect(path).toHaveLength(3);
    expect(path?.every((step) => game.tiles[step.y * game.size + step.x].terrain !== "water")).toBe(true);
    expect(canMoveTo(game, courier, { x: 5, y: 4 })).toBe(true);
    expect(canMoveTo(game, courier, { x: 3, y: 2 })).toBe(false);
    expect(canMoveTo(game, courier, { x: 6, y: 4 })).toBe(false);
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
    game.bases = [];
    game.tiles.forEach((tile) => { tile.explored = false; });

    revealAround(game);

    expect(game.tiles[15].visible).toBe(false);
    expect(game.tiles[0].visible).toBe(true);
  });

  it("maps screen clicks back to isometric grid coordinates", () => {
    for (const [width, height, size] of [[504, 430, 16], [355, 320, 24], [880, 600, 32]]) {
      const grid = createIsometricGrid(width, height, size);
      expect(grid.tileHeight / grid.tileWidth).toBe(0.5);
      expect(tileCenter(grid, 0, 0).x).toBe(width / 2);
      expect(tileCenter(grid, size - 1, size - 1).x).toBe(width / 2);
      for (const x of [0, Math.floor(size / 2), size - 1]) {
        for (const y of [0, Math.floor(size / 2), size - 1]) {
          expect(screenToTile(grid, tileCenter(grid, x, y))).toEqual({ x, y });
        }
      }
    }

    const grid = createIsometricGrid(504, 430, 16);
    expect(screenToTile(grid, { x: 0, y: 0 })).toBeNull();
  });

  it("uses a larger, tile-sized starting zoom on mobile while preserving desktop scale", () => {
    const grid = createIsometricGrid(360, 500, 16);
    const zoom = initialMapZoom(grid, true);
    expect(grid.tileWidth * 2 * zoom).toBeCloseTo(120);
    const largeGrid = createIsometricGrid(390, 600, 32);
    expect(largeGrid.tileWidth * 2 * initialMapZoom(largeGrid, true)).toBeCloseTo(120);
    expect(initialMapZoom(grid, false)).toBe(1.35);
  });

  it("makes a defeated unit flee away from the attacker and off the map", () => {
    expect(fleePosition({ x: 2, y: 4 }, { x: 4, y: 4 }, 8, 0.5)).toEqual({ x: 6, y: 4 });
    expect(fleePosition({ x: 2, y: 4 }, { x: 4, y: 4 }, 8, 1)).toEqual({ x: 8, y: 4 });
    expect(fleePosition({ x: 4, y: 4 }, { x: 3, y: 3 }, 8, 1)).toEqual({ x: -1, y: -1 });
  });
});
