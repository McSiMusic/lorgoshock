import { afterEach, describe, expect, it, vi } from "vitest";
import type { CombatEvent, GameCommand, GameState, IncomeEvent, ResourceEvent } from "./model";
import { movementRange, revealAround } from "./rules";
import { savedGameSchema } from "./save";

type WorkerMessage = { type: string; state?: GameState; message?: string; combatEvents?: CombatEvent[]; resourceEvents?: ResourceEvent[]; incomeEvents?: IncomeEvent[]; events?: Array<{ en: string; ru: string }> };

async function createWorker() {
  const messages: WorkerMessage[] = [];
  const context: {
    onmessage: ((event: MessageEvent<GameCommand>) => void) | null;
    postMessage: (message: WorkerMessage) => void;
  } = {
    onmessage: null,
    postMessage: (message) => messages.push(message),
  };
  vi.resetModules();
  vi.stubGlobal("self", context);
  await import("./worker");
  const send = (command: GameCommand) => {
    if (!context.onmessage) throw new Error("Worker did not initialize");
    context.onmessage({ data: command } as MessageEvent<GameCommand>);
    return messages[messages.length - 1];
  };
  return { send };
}

afterEach(() => vi.unstubAllGlobals());

describe("game worker commands", () => {
  it("restores the full saved state and continues without replaying old notifications", async () => {
    const worker = await createWorker();
    const started = worker.send({ type: "START", seed: "save-test", size: 16, faction: "lorgoshki" });
    const game = started.state!;
    expect(started.events).toEqual([]);
    game.tokens.lorgoshki = 31;
    game.units[0].moved = true;
    game.tiles[15].explored = true;
    const snapshot: GameState = JSON.parse(JSON.stringify(game));
    const restoredWorker = await createWorker();
    const response = restoredWorker.send({ type: "RESUME", state: snapshot });
    expect(response.state).toEqual(snapshot);
    expect(response.events).toEqual([]);
    expect(restoredWorker.send({ type: "END_TURN" }).state?.turn).toBe(snapshot.turn + 1);
    expect(restoredWorker.send({ type: "RESUME", state: { ...snapshot, tiles: [] } }).type).toBe("ERROR");
  });

  it("accepts older saves with inspector data and removes it on restore", async () => {
    const worker = await createWorker();
    const snapshot = worker.send({ type: "START", seed: "legacy-inspector", size: 16, faction: "lorgoshki" }).state!;
    const legacy = { ...snapshot, inspector: { phases: ["old"], elapsedMs: 1, top: [] } };
    const parsed = savedGameSchema.parse(legacy);
    expect(parsed).not.toHaveProperty("inspector");
    const response = worker.send({ type: "RESUME", state: legacy });
    expect(response.state).toEqual(parsed);
    expect(response.events).toEqual([]);
  });

  it("restores saves from before coin visits were introduced", async () => {
    const worker = await createWorker();
    const state = worker.send({ type: "START", seed: "legacy-coins", size: 16, faction: "lorgoshki" }).state!;
    const { coinVisits: _coinVisits, ...legacy } = state;
    expect(savedGameSchema.parse(legacy).coinVisits).toEqual([]);
  });

  it("announces discoveries only once and does not announce ordinary moves", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "discovery-events", size: 16, faction: "lorgoshki" }).state!;
    const [unit] = game.units;
    const neutral = game.bases.find((base) => base.owner === null)!;
    game.bases = [game.bases[0], game.bases[1], neutral];
    game.tiles.forEach((tile) => { tile.poi = null; tile.explored = false; });
    Object.assign(unit, { x: 8, y: 8 });
    Object.assign(neutral, { x: 10, y: 8 });
    Object.assign(game.tiles[8 * game.size + 9], { terrain: "plain" });
    Object.assign(game.tiles[9 * game.size + 10], { terrain: "plain", poi: "coffee" });
    revealAround(game);
    const discovery = worker.send({ type: "MOVE", unitId: unit.id, x: 9, y: 8 });
    expect(discovery.events?.some((event) => event.en.includes("Discovered"))).toBe(true);
    expect(discovery.events?.some((event) => event.en.includes("Coffee shop discovered"))).toBe(true);
    unit.moved = false;
    expect(worker.send({ type: "MOVE", unitId: unit.id, x: 8, y: 8 }).events).toEqual([]);
    unit.moved = false;
    expect(worker.send({ type: "MOVE", unitId: unit.id, x: 9, y: 8 }).events).toEqual([]);
  });

  it("upgrades cities at progress thresholds 2, 3 and 4 without resource token rewards", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "progress-thresholds", size: 16, faction: "lorgoshki" }).state!;
    const base = game.bases[0];
    game.tokens.lorgoshki = 30;
    const resources = [
      { x: base.x + 1, y: base.y, terrain: "plain", geese: true },
      { x: base.x - 1, y: base.y, terrain: "mountain", geese: false },
      { x: base.x, y: base.y + 1, terrain: "mountain", geese: false },
      { x: base.x, y: base.y - 1, terrain: "forest", geese: false },
    ] as const;
    for (const [index, resource] of resources.entries()) {
      const tile = game.tiles[resource.y * game.size + resource.x];
      Object.assign(tile, resource, { poi: null, poiClaimed: false, visible: true });
      expect(worker.send({ type: "HARVEST", baseId: base.id, x: tile.x, y: tile.y }).type).toBe("STATE");
      expect(base.rank).toBe([2, 3, 3, 4][index]);
      expect(base.progress).toBe([0, 0, 3, 0][index]);
    }
    expect(game.tokens.lorgoshki).toBe(15);
  });

  it("announces deaths but not ordinary damage", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "death-notices", size: 16, faction: "lorgoshki" }).state!;
    const [attacker, defender] = game.units;
    Object.assign(defender, { x: attacker.x + 1, y: attacker.y, hp: 8, kind: "drone" });
    revealAround(game);
    const hit = worker.send({ type: "ATTACK", unitId: attacker.id, x: defender.x, y: defender.y });
    expect(hit.events).toEqual([]);
    Object.assign(attacker, { attacked: false, moved: false, hp: 10 });
    defender.hp = 1;
    const kill = worker.send({ type: "ATTACK", unitId: attacker.id, x: defender.x, y: defender.y });
    expect(kill.events?.some((event) => event.en.includes(defender.name.en) && event.en.includes("unplugged"))).toBe(true);
  });

  it.each(["lorgoshki", "robots"] as const)("wins as %s when the opponent loses their last city", async (faction) => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "last-city", size: 16, faction }).state!;
    const base = game.bases[1];
    const [unit, enemy] = game.units;
    Object.assign(unit, { x: base.x, y: base.y });
    Object.assign(enemy, { x: 0, y: 0 });
    base.capture = { unitId: unit.id, faction, readyTurn: game.turn };
    expect(worker.send({ type: "CAPTURE", baseId: base.id, unitId: unit.id }).type).toBe("STATE");
    expect(game.status).toBe("won");
    expect(game.bases.some((city) => city.owner === null)).toBe(true);
    expect(game.units).toContain(enemy);
  });

  it("does not win by claiming a neutral city while the opponent has a city", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "neutral-victory", size: 16, faction: "lorgoshki" }).state!;
    const base = game.bases.find((city) => city.owner === null)!;
    const unit = game.units[0];
    Object.assign(unit, { x: base.x, y: base.y });
    base.capture = { unitId: unit.id, faction: unit.faction, readyTurn: game.turn };
    worker.send({ type: "CAPTURE", baseId: base.id, unitId: unit.id });
    expect(game.status).toBe("running");
  });

  it("loses when the AI captures the player's last city", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "last-player-city", size: 16, faction: "lorgoshki" }).state!;
    const base = game.bases[0];
    const [player, bot] = game.units;
    Object.assign(player, { x: 0, y: 0 });
    Object.assign(bot, { x: base.x, y: base.y, moved: false, attacked: false });
    base.capture = { unitId: bot.id, faction: bot.faction, readyTurn: game.turn };
    expect(worker.send({ type: "END_TURN" }).type).toBe("STATE");
    expect(game.status).toBe("lost");
    expect(game.bases.some((city) => city.owner === null)).toBe(true);
  });

  it("keeps a courier in place after a ranged lethal attack", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "ranged-kill", size: 16, faction: "lorgoshki" }).state!;
    const [attacker, defender] = game.units;
    Object.assign(attacker, { kind: "courier" });
    Object.assign(defender, { x: attacker.x + 2, y: attacker.y, hp: 1 });
    game.tech.lorgoshki[1] = 1;
    revealAround(game);
    game.tiles[defender.y * game.size + defender.x].visible = true;
    const position = { x: attacker.x, y: attacker.y };
    expect(worker.send({ type: "ATTACK", unitId: attacker.id, x: defender.x, y: defender.y }).type).toBe("STATE");
    expect({ x: attacker.x, y: attacker.y }).toEqual(position);
    expect(game.units).not.toContain(defender);
  });

  it("requires level 2 for middle and level 3 for senior", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "unit-level", size: 16, faction: "lorgoshki" }).state!;
    const base = game.bases[0];
    game.units[0].x += 1;
    game.tokens.lorgoshki = 30;
    expect(worker.send({ type: "HIRE", baseId: base.id, kind: "middle" }).type).toBe("ERROR");
    expect(worker.send({ type: "HIRE", baseId: base.id, kind: "senior" }).type).toBe("ERROR");
    expect(worker.send({ type: "HIRE", baseId: base.id, kind: "workerBot" }).type).toBe("ERROR");
    base.rank = 2;
    expect(worker.send({ type: "HIRE", baseId: base.id, kind: "senior" }).type).toBe("ERROR");
    expect(worker.send({ type: "HIRE", baseId: base.id, kind: "middle" }).type).toBe("STATE");
    const middle = game.units.find((unit) => unit.kind === "middle")!;
    middle.x += 2;
    base.rank = 3;
    expect(worker.send({ type: "HIRE", baseId: base.id, kind: "senior" }).type).toBe("STATE");
  });

  it.each(["lorgoshki", "robots"] as const)("limits %s recruitment by city occupancy", async (faction) => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "hire-test", size: 16, faction }).state!;
    const base = game.bases[0];
    const kind = faction === "robots" ? "workerBot" : "junior";
    const tokens = game.tokens[faction];
    expect(worker.send({ type: "HIRE", baseId: base.id, kind }).type).toBe("ERROR");
    expect(game.tokens[faction]).toBe(tokens);
    const departingUnit = game.units[0];
    const destination = { x: base.x + 1, y: base.y };
    game.tiles[destination.y * game.size + destination.x].terrain = "plain";
    expect(worker.send({ type: "MOVE", unitId: departingUnit.id, ...destination }).type).toBe("STATE");
    expect({ x: departingUnit.x, y: departingUnit.y }).toEqual(destination);
    expect(worker.send({ type: "HIRE", baseId: base.id, kind }).type).toBe("STATE");
    expect(worker.send({ type: "HIRE", baseId: base.id, kind }).type).toBe("ERROR");
    const recruit = game.units.find((unit) => unit.x === base.x && unit.y === base.y)!;
    Object.assign(recruit, { x: base.x, y: base.y + 1 });
    expect(worker.send({ type: "HIRE", baseId: base.id, kind }).type).toBe("ERROR");
    departingUnit.homeBaseId = null;
    expect(worker.send({ type: "HIRE", baseId: base.id, kind }).type).toBe("STATE");
    expect(new Set(game.units.map((unit) => unit.id)).size).toBe(game.units.length);
  });

  it.each(["lorgoshki", "robots"] as const)("lets a selected %s unit attack a visible opponent", async (faction) => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "attack-test", size: 16, faction }).state!;
    const [attacker, defender] = game.units;
    defender.x = attacker.x + 1;
    defender.y = attacker.y + 1;
    revealAround(game);
    const hp = defender.hp;
    const result = worker.send({ type: "ATTACK", unitId: attacker.id, x: defender.x, y: defender.y });
    expect(result.type).toBe("STATE");
    expect(result.combatEvents?.map(({ attacker: source, defender: target }) => [source.id, target.id]))
      .toEqual([[attacker.id, defender.id], [defender.id, attacker.id]]);
    expect(result.combatEvents?.map((event) => event.counterattack)).toEqual([false, true]);
    expect(result.combatEvents?.[0].defender.hp).toBe(hp);
    expect(result.combatEvents?.[1].attacker.hp).toBe(defender.hp);
    expect(defender.hp).toBeLessThan(hp);
    expect(attacker.attacked).toBe(true);
    expect(worker.send({ type: "ATTACK", unitId: attacker.id, x: defender.x, y: defender.y }).type).toBe("ERROR");
  });

  it("allows a drone to attack at range without advancing after a kill", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "drone-ranged", size: 16, faction: "robots" }).state!;
    const [drone, enemy] = game.units;
    Object.assign(drone, { kind: "drone" });
    Object.assign(enemy, { x: drone.x + 2, y: drone.y, hp: 1 });
    game.tiles[enemy.y * game.size + enemy.x].visible = true;
    const origin = { x: drone.x, y: drone.y };
    const result = worker.send({ type: "ATTACK", unitId: drone.id, x: enemy.x, y: enemy.y });
    expect(result.type).toBe("STATE");
    expect(game.units).not.toContain(enemy);
    expect({ x: drone.x, y: drone.y }).toEqual(origin);
  });

  it.each(["robots", "lorgoshki"] as const)("AI %s moves toward and captures a nearby startup instead of camping its company", async (botFaction) => {
    const worker = await createWorker();
    const playerFaction = botFaction === "robots" ? "lorgoshki" : "robots";
    const game = worker.send({ type: "START", seed: "ai-expansion", size: 16, faction: playerFaction }).state!;
    const [player, bot] = game.units;
    const home = game.bases[1];
    const target = game.bases.find((base) => base.owner === null)!;
    game.bases = [game.bases[0], home, target];
    Object.assign(target, { x: home.x - 3, y: home.y });
    Object.assign(player, { x: 0, y: 0 });
    for (const tile of game.tiles) Object.assign(tile, { terrain: "plain", poi: null });
    for (let turn = 0; turn < 8 && target.owner !== botFaction; turn++) worker.send({ type: "END_TURN" });
    expect(target.owner).toBe(botFaction);
    expect({ x: bot.x, y: bot.y }).not.toEqual({ x: home.x, y: home.y });
  });

  it.each(["robots", "lorgoshki"] as const)("AI %s develops its company and hires more than two units", async (botFaction) => {
    const worker = await createWorker();
    const playerFaction = botFaction === "robots" ? "lorgoshki" : "robots";
    const game = worker.send({ type: "START", seed: "ai-economy", size: 16, faction: playerFaction }).state!;
    const home = game.bases[1];
    game.bases = game.bases.slice(0, 2);
    game.tokens[botFaction] = 50;
    for (const tile of game.tiles) Object.assign(tile, { terrain: "plain", poi: null, geese: false, poiClaimed: false });
    for (const [dx, dy] of [[-1, 0], [0, -1], [-1, -1]]) {
      Object.assign(game.tiles[(home.y + dy) * game.size + home.x + dx], { terrain: "forest" });
    }
    for (let turn = 0; turn < 5; turn++) worker.send({ type: "END_TURN" });
    const bots = game.units.filter((unit) => unit.faction === botFaction);
    expect(home.rank).toBeGreaterThanOrEqual(2);
    expect(bots.length).toBeGreaterThanOrEqual(3);
    expect(new Set(bots.map((unit) => unit.id)).size).toBe(bots.length);
    expect(bots.filter((unit) => unit.homeBaseId === home.id).length).toBeLessThanOrEqual(home.rank + 1);
    expect(game.tokens[botFaction]).toBeGreaterThanOrEqual(0);
    expect(game.tiles.some((tile) => tile.harvestedBy === botFaction)).toBe(true);
  });

  it("recruits in multiple available bot companies with distinct IDs in one turn", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "ai-multiple-companies", size: 16, faction: "lorgoshki" }).state!;
    const home = game.bases[1];
    const second = game.bases[2];
    Object.assign(second, { owner: game.botFaction, x: 10, y: 12 });
    Object.assign(game.units[1], { x: 12, y: 13 });
    game.bases = [game.bases[0], home, second];
    game.tokens.robots = 100;
    for (const tile of game.tiles) Object.assign(tile, { terrain: "plain", poi: null, geese: false });
    worker.send({ type: "END_TURN" });
    const hired = game.units.filter((unit) => unit.faction === "robots" && unit.id !== "robots-1");
    expect(hired).toHaveLength(2);
    expect(new Set(hired.map((unit) => unit.homeBaseId))).toEqual(new Set([home.id, second.id]));
    expect(new Set(hired.map((unit) => unit.id)).size).toBe(2);
  });

  it("emits separate income sources on turn end without replaying them", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "income-events", size: 16, faction: "lorgoshki" }).state!;
    const home = game.bases[0];
    const result = worker.send({ type: "END_TURN" });
    expect(result.incomeEvents).toEqual([expect.objectContaining({ x: home.x, y: home.y, amount: 2 })]);
    expect(worker.send({ type: "RESEARCH", branch: 0 }).incomeEvents).toEqual([]);
  });

  it("allows attacking after moving but rejects movement after attacking", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "move-attack", size: 16, faction: "lorgoshki" }).state!;
    const [attacker, defender] = game.units;
    for (const tile of game.tiles) Object.assign(tile, { terrain: "plain", poi: null });
    Object.assign(defender, { x: 4, y: 2, hp: 8 });
    revealAround(game);
    expect(worker.send({ type: "MOVE", unitId: attacker.id, x: 3, y: 2 }).type).toBe("STATE");
    expect(worker.send({ type: "ATTACK", unitId: attacker.id, x: 4, y: 2 }).type).toBe("STATE");
    expect(worker.send({ type: "MOVE", unitId: attacker.id, x: 3, y: 3 }).type).toBe("ERROR");
    attacker.moved = false;
    expect(worker.send({ type: "MOVE", unitId: attacker.id, x: 3, y: 3 }).type).toBe("ERROR");
  });

  it("blocks movement immediately after attacking without moving first", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "attack-move", size: 16, faction: "robots" }).state!;
    const [attacker, defender] = game.units;
    Object.assign(defender, { x: attacker.x + 1, y: attacker.y, hp: 8 });
    revealAround(game);
    expect(worker.send({ type: "ATTACK", unitId: attacker.id, x: defender.x, y: defender.y }).type).toBe("STATE");
    expect(attacker.moved).toBe(true);
    expect(worker.send({ type: "MOVE", unitId: attacker.id, x: attacker.x, y: attacker.y + 1 }).type).toBe("ERROR");
  });

  it("reports visible AI attacks and keeps events separate from later commands", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "bot-attack", size: 16, faction: "lorgoshki" }).state!;
    const [player, bot] = game.units;
    bot.x = player.x + 1;
    bot.y = player.y + 1;
    revealAround(game);
    const result = worker.send({ type: "END_TURN" });
    expect(result.combatEvents?.[0]).toMatchObject({ attacker: { id: bot.id }, defender: { id: player.id } });
    expect(worker.send({ type: "RESEARCH", branch: 0 }).combatEvents).toEqual([]);
  });

  it("allows attacks and combat animations on explored tiles outside current vision", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "explored-attack", size: 16, faction: "lorgoshki" }).state!;
    const [attacker, defender] = game.units;
    Object.assign(defender, { x: attacker.x + 1, y: attacker.y });
    Object.assign(game.tiles[defender.y * game.size + defender.x], { visible: false, explored: true });
    const result = worker.send({ type: "ATTACK", unitId: attacker.id, x: defender.x, y: defender.y });
    expect(result.type).toBe("STATE");
    expect(result.combatEvents?.[0]).toMatchObject({ attacker: { id: attacker.id }, defender: { id: defender.id } });
  });

  it("retains a snapshot when a target is defeated", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "defeat", size: 16, faction: "robots" }).state!;
    const [attacker, defender] = game.units;
    defender.x = attacker.x + 1;
    defender.y = attacker.y + 1;
    defender.hp = 1;
    revealAround(game);
    const result = worker.send({ type: "ATTACK", unitId: attacker.id, x: defender.x, y: defender.y });
    expect(result.combatEvents).toHaveLength(1);
    expect(result.combatEvents?.[0].defender).toMatchObject({ id: defender.id, hp: 1 });
    expect(game.units.some((unit) => unit.id === defender.id)).toBe(false);
  });

  it("does not reveal a hidden AI attacker through combat events", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "hidden-attack", size: 16, faction: "lorgoshki" }).state!;
    const [player, bot] = game.units;
    bot.x = player.x + 1;
    bot.y = player.y + 1;
    game.tiles[bot.y * game.size + bot.x].visible = false;
    game.tiles[bot.y * game.size + bot.x].explored = false;
    const hp = player.hp;
    const result = worker.send({ type: "END_TURN" });
    expect(player.hp).toBeLessThan(hp);
    expect(result.combatEvents).toEqual([]);
  });

  it("collects only affordable resources inside the chosen city without using a unit", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "harvest", size: 16, faction: "lorgoshki" }).state!;
    const base = game.bases[0];
    const unit = game.units[0];
    const tile = game.tiles[base.y * game.size + base.x + 1];
    Object.assign(tile, { terrain: "forest", poi: null, poiClaimed: false, geese: false, visible: true });
    unit.moved = true;
    const tokens = game.tokens.lorgoshki;
    expect(worker.send({ type: "HARVEST", baseId: base.id, x: tile.x, y: tile.y }).type).toBe("STATE");
    expect(game.tokens.lorgoshki).toBe(tokens - 2);
    expect(base.progress).toBe(1);
    expect(unit.moved).toBe(true);
    expect(worker.send({ type: "HARVEST", baseId: base.id, x: tile.x, y: tile.y }).type).toBe("ERROR");
    const outside = game.tiles[base.y * game.size + base.x + 2];
    Object.assign(outside, { terrain: "water", poi: null, poiClaimed: false, visible: true });
    expect(worker.send({ type: "HARVEST", baseId: base.id, x: outside.x, y: outside.y }).type).toBe("ERROR");
    base.resourceRange = 5;
    game.tokens.lorgoshki = 4;
    expect(worker.send({ type: "HARVEST", baseId: base.id, x: outside.x, y: outside.y }).type).toBe("ERROR");
    expect(game.tokens.lorgoshki).toBe(4);
    game.tokens.lorgoshki = 5;
    expect(worker.send({ type: "HARVEST", baseId: base.id, x: outside.x, y: outside.y }).type).toBe("STATE");
    expect(worker.send({ type: "HARVEST", baseId: game.bases[1].id, x: outside.x, y: outside.y }).type).toBe("ERROR");
  });

  it.each([
    ["lorgoshki", "plain", true, 3, 2],
    ["robots", "forest", false, 2, 1],
    ["lorgoshki", "water", false, 5, 3],
    ["robots", "mountain", false, 5, 3],
  ] as const)("grants only city progress for %s resources", async (faction, terrain, geese, cost, progress) => {
    for (const reward of ["progress"] as const) {
      const worker = await createWorker();
      const game = worker.send({ type: "START", seed: `resource-${faction}-${reward}`, size: 16, faction }).state!;
      const base = game.bases[0];
      const tile = game.tiles[base.y * game.size + base.x + 1];
      Object.assign(tile, { terrain, geese, poi: null, poiClaimed: false, visible: true });
      game.tokens[faction] = 10;
      const harvested = worker.send({ type: "HARVEST", baseId: base.id, x: tile.x, y: tile.y, reward });
      expect(harvested.type).toBe("STATE");
      expect(harvested.resourceEvents).toEqual([expect.objectContaining({ x: tile.x, y: tile.y, cost, progress, baseId: base.id })]);
      expect(game.tokens[faction]).toBe(10 - cost);
      expect(tile.harvestedBy).toBe(faction);
      expect(base.rank).toBe(progress >= 2 ? 2 : 1);
      expect(base.progress).toBe(progress >= 2 ? progress - 2 : progress);
    }
  });

  it("rejects an unsupported token reward without spending or consuming the resource", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "resource-invalid-reward", size: 16, faction: "lorgoshki" }).state!;
    const base = game.bases[0];
    const tile = game.tiles[base.y * game.size + base.x + 1];
    Object.assign(tile, { terrain: "mountain", geese: false, poi: null, poiClaimed: false, visible: true });
    expect(worker.send({ type: "HARVEST", baseId: base.id, x: tile.x, y: tile.y, reward: "tokens" }).type).toBe("ERROR");
    expect(game.tokens.lorgoshki).toBe(7);
    expect(tile.poiClaimed).toBe(false);
  });

  it.each([
    ["lorgoshki", "neutral"], ["robots", "neutral"], ["lorgoshki", "enemy"], ["robots", "enemy"],
  ] as const)("completes %s capture of a %s city on the next player turn", async (faction, ownership) => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "capture", size: 16, faction }).state!;
    const base = game.bases.find((candidate) => ownership === "neutral" ? candidate.owner === null : candidate.owner === game.botFaction)!;
    const previousOwner = base.owner;
    const [unit, bot] = game.units;
    Object.assign(unit, { x: base.x - 1, y: base.y, moved: false });
    Object.assign(bot, { x: 0, y: 0, moved: true, attacked: true });
    game.tiles[unit.y * game.size + unit.x].terrain = "plain";
    game.tiles[base.y * game.size + base.x].terrain = "plain";
    revealAround(game);
    const interview = worker.send({ type: "MOVE", unitId: unit.id, x: base.x, y: base.y });
    expect(interview.type).toBe("STATE");
    expect(interview.events?.some((event) => event.en.includes("starts negotiations"))).toBe(true);
    expect(base.owner).toBe(previousOwner);
    expect(base.capture).toEqual({ unitId: unit.id, faction, readyTurn: game.turn + 1 });
    expect(worker.send({ type: "CAPTURE", baseId: base.id, unitId: unit.id }).type).toBe("ERROR");
    expect(worker.send({ type: "END_TURN" }).type).toBe("STATE");
    expect(base.owner).toBe(previousOwner);
    const offer = worker.send({ type: "CAPTURE", baseId: base.id, unitId: unit.id });
    expect(offer.type).toBe("STATE");
    expect(offer.events?.some((event) => event.en.includes(faction === "robots" ? "layoff" : "received an offer"))).toBe(true);
    expect(base.owner).toBe(faction);
    expect(base.capture).toBeUndefined();
    expect(unit.homeBaseId).toBe(base.id);
    if (previousOwner !== null) expect(bot.homeBaseId).toBeNull();
    expect(base.captureResult?.faction).toBe(faction);
    expect(unit.moved).toBe(true);
    expect(unit.attacked).toBe(true);
  });

  it("prevents resource gathering and recruitment in a contested city", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "contested", size: 16, faction: "lorgoshki" }).state!;
    const [base] = game.bases;
    const enemy = game.units[1];
    Object.assign(enemy, { x: base.x, y: base.y });
    base.capture = { unitId: enemy.id, faction: enemy.faction, readyTurn: game.turn + 1 };
    const tile = game.tiles[base.y * game.size + base.x + 1];
    Object.assign(tile, { terrain: "forest", poi: null, poiClaimed: false, geese: false, visible: true });
    expect(worker.send({ type: "HARVEST", baseId: base.id, x: tile.x, y: tile.y }).type).toBe("ERROR");
    expect(worker.send({ type: "HIRE", baseId: base.id, kind: "junior" }).type).toBe("ERROR");
  });

  it("cancels a capture if its unit leaves", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "capture-leave", size: 16, faction: "robots" }).state!;
    const base = game.bases.find((candidate) => candidate.owner === null)!;
    const [unit, bot] = game.units;
    Object.assign(unit, { x: base.x - 1, y: base.y, moved: false });
    Object.assign(bot, { x: 0, y: 0, moved: true, attacked: true });
    game.tiles[unit.y * game.size + unit.x].terrain = "plain";
    game.tiles[base.y * game.size + base.x].terrain = "plain";
    worker.send({ type: "MOVE", unitId: unit.id, x: base.x, y: base.y });
    unit.moved = false;
    worker.send({ type: "MOVE", unitId: unit.id, x: base.x - 1, y: base.y });
    expect(base.capture).toBeUndefined();
    worker.send({ type: "END_TURN" });
    expect(base.owner).toBeNull();
  });

  it("requires an unused action to accept an offer after negotiations", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "capture-action", size: 16, faction: "lorgoshki" }).state!;
    const base = game.bases.find((candidate) => candidate.owner === null)!;
    const [unit, bot] = game.units;
    Object.assign(unit, { x: base.x, y: base.y, moved: true, attacked: false });
    Object.assign(bot, { x: 0, y: 0 });
    base.capture = { unitId: unit.id, faction: unit.faction, readyTurn: game.turn };
    expect(worker.send({ type: "CAPTURE", baseId: base.id, unitId: unit.id }).type).toBe("ERROR");
    expect(base.owner).toBeNull();
    unit.moved = false;
    expect(worker.send({ type: "CAPTURE", baseId: base.id, unitId: unit.id }).type).toBe("STATE");
    expect(worker.send({ type: "MOVE", unitId: unit.id, x: base.x - 1, y: base.y }).type).toBe("ERROR");
  });

  it("cancels a capture when the attacker is defeated before its next turn", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "capture-defeat", size: 16, faction: "lorgoshki" }).state!;
    const base = game.bases.find((candidate) => candidate.owner === null)!;
    const [unit, bot] = game.units;
    Object.assign(unit, { x: base.x - 1, y: base.y, moved: false, hp: 1 });
    Object.assign(bot, { x: base.x + 1, y: base.y, moved: true, attacked: false });
    for (const tile of game.tiles) tile.terrain = "plain";
    revealAround(game);
    expect(worker.send({ type: "MOVE", unitId: unit.id, x: base.x, y: base.y }).type).toBe("STATE");
    expect(base.capture?.unitId).toBe(unit.id);
    worker.send({ type: "END_TURN" });
    expect(game.units.some((candidate) => candidate.id === unit.id)).toBe(false);
    expect(base.capture?.unitId).toBe(bot.id);
    expect(base.owner).toBeNull();
  });

  it("keeps an AI unit in a city until the AI's next turn", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "bot-capture", size: 16, faction: "lorgoshki" }).state!;
    const base = game.bases.find((candidate) => candidate.owner === null)!;
    const [player, bot] = game.units;
    Object.assign(player, { x: 0, y: 0 });
    Object.assign(bot, { x: base.x - 1, y: base.y, moved: false, attacked: false });
    for (const tile of game.tiles) tile.terrain = "plain";
    worker.send({ type: "END_TURN" });
    expect({ x: bot.x, y: bot.y }).toEqual({ x: base.x, y: base.y });
    expect(base.owner).toBeNull();
    expect(base.capture?.unitId).toBe(bot.id);
    worker.send({ type: "END_TURN" });
    expect(base.owner).toBe(game.botFaction);
    expect(base.capture).toBeUndefined();
  });

  it("keeps trained units inactive and bound after they leave their city", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "training", size: 16, faction: "lorgoshki" }).state!;
    const base = game.bases[0];
    Object.assign(game.units[0], { x: base.x + 1, y: base.y });
    expect(worker.send({ type: "HIRE", baseId: base.id, kind: "courier" }).type).toBe("STATE");
    const recruit = game.units.find((unit) => unit.kind === "courier")!;
    expect(recruit.homeBaseId).toBe(base.id);
    expect(recruit.moved).toBe(true);
    expect(recruit.attacked).toBe(true);
    expect(worker.send({ type: "MOVE", unitId: recruit.id, x: base.x + 1, y: base.y }).type).toBe("ERROR");
    const enemy = game.units.find((unit) => unit.faction !== game.playerFaction)!;
    Object.assign(enemy, { x: base.x + 1, y: base.y, hp: 1 });
    revealAround(game);
    expect(worker.send({ type: "ATTACK", unitId: recruit.id, x: enemy.x, y: enemy.y }).type).toBe("ERROR");
  });

  it("moves an attacker onto a defeated opponent's city and starts capture", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "advance", size: 16, faction: "lorgoshki" }).state!;
    const [attacker, defender] = game.units;
    const base = game.bases[1];
    Object.assign(attacker, { x: base.x - 1, y: base.y });
    Object.assign(defender, { x: base.x, y: base.y, hp: 1 });
    revealAround(game);
    expect(worker.send({ type: "ATTACK", unitId: attacker.id, x: base.x, y: base.y }).type).toBe("STATE");
    expect({ x: attacker.x, y: attacker.y }).toEqual({ x: base.x, y: base.y });
    expect(attacker.moved).toBe(true);
    expect(base.capture?.unitId).toBe(attacker.id);
  });

  it("keeps a defender in place after a lethal counterattack", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "counter-advance", size: 16, faction: "lorgoshki" }).state!;
    const [attacker, defender] = game.units;
    Object.assign(attacker, { hp: 1 });
    Object.assign(defender, { x: attacker.x + 1, y: attacker.y, hp: 8 });
    const original = { x: defender.x, y: defender.y };
    revealAround(game);
    expect(worker.send({ type: "ATTACK", unitId: attacker.id, x: defender.x, y: defender.y }).type).toBe("STATE");
    expect(game.units.some((unit) => unit.id === attacker.id)).toBe(false);
    expect({ x: defender.x, y: defender.y }).toEqual(original);
  });

  it("requires a unit to stay at a coffee break until the next turn", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "coffee", size: 16, faction: "lorgoshki" }).state!;
    const [unit, bot] = game.units;
    const x = unit.x + 1;
    const y = unit.y;
    const tile = game.tiles[y * game.size + x];
    Object.assign(tile, { terrain: "plain", poi: "coffee", poiClaimed: false });
    Object.assign(bot, { x: 12, y: 12, moved: true, attacked: true });
    expect(worker.send({ type: "MOVE", unitId: unit.id, x, y }).type).toBe("STATE");
    expect(game.coffeeBreaks[0]).toMatchObject({ unitId: unit.id, x, y, readyTurn: game.turn + 1 });
    expect(worker.send({ type: "COFFEE", unitId: unit.id, reward: "tokens" }).type).toBe("ERROR");
    expect(worker.send({ type: "END_TURN" }).type).toBe("STATE");
    const before = game.tokens.lorgoshki;
    const reward = worker.send({ type: "COFFEE", unitId: unit.id, reward: "tokens" });
    expect(reward.type).toBe("STATE");
    expect(reward.incomeEvents).toEqual([expect.objectContaining({ x, y, amount: 8 })]);
    expect(game.tokens.lorgoshki).toBe(before + 8);
    expect(game.coffeeBreaks).toHaveLength(0);
    expect(tile.poiClaimed).toBe(true);
    expect(worker.send({ type: "COFFEE", unitId: unit.id, reward: "tokens" }).type).toBe("ERROR");
  });

  it("cancels a coffee break when the visitor leaves", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "coffee-leave", size: 16, faction: "lorgoshki" }).state!;
    const [unit, bot] = game.units;
    const x = unit.x + 1;
    const y = unit.y;
    const tile = game.tiles[y * game.size + x];
    Object.assign(tile, { terrain: "plain", poi: "coffee", poiClaimed: false });
    Object.assign(bot, { x: 12, y: 12, moved: true, attacked: true });
    worker.send({ type: "MOVE", unitId: unit.id, x, y });
    worker.send({ type: "END_TURN" });
    const destination = game.tiles[(y + 1) * game.size + x];
    Object.assign(destination, { terrain: "plain", poi: null });
    expect(worker.send({ type: "MOVE", unitId: unit.id, x, y: y + 1 }).type).toBe("STATE");
    expect(game.coffeeBreaks).toHaveLength(0);
    expect(tile.poiClaimed).toBe(false);
  });

  it.each(["lorgoshki", "robots"] as const)("doubles %s movement for this turn without recruiting", async (faction) => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "coffee-speed", size: 16, faction }).state!;
    const [visitor, bot] = game.units;
    Object.assign(visitor, { x: 5, y: 5 });
    Object.assign(bot, { x: 12, y: 12, moved: true, attacked: true });
    game.turn = 2;
    for (const tile of game.tiles) Object.assign(tile, { terrain: "plain", poi: null });
    Object.assign(game.tiles[5 * game.size + 5], { poi: "coffee", poiClaimed: false });
    game.coffeeBreaks.push({ x: 5, y: 5, unitId: visitor.id, readyTurn: 2 });
    const originalRange = movementRange(game, visitor);
    expect(worker.send({ type: "COFFEE", unitId: visitor.id, reward: "movement" }).type).toBe("STATE");
    expect(game.units).toHaveLength(2);
    expect(movementRange(game, visitor)).toBe(originalRange * 2);
    expect(worker.send({ type: "MOVE", unitId: visitor.id, x: 5 + originalRange * 2, y: 5 }).type).toBe("STATE");
    expect(visitor.x).toBe(5 + originalRange * 2);
    worker.send({ type: "END_TURN" });
    expect(movementRange(game, visitor)).toBe(originalRange);
  });

  it("requires a turn and consumes the action to collect coins, or lets the unit leave", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "coins", size: 16, faction: "lorgoshki" }).state!;
    const [visitor, bot] = game.units;
    Object.assign(visitor, { x: 5, y: 5 });
    Object.assign(bot, { x: 12, y: 12, moved: true, attacked: true });
    for (const tile of game.tiles) Object.assign(tile, { terrain: "plain", poi: null });
    const tile = game.tiles[5 * game.size + 6];
    Object.assign(tile, { poi: "treasury", poiClaimed: false });
    expect(worker.send({ type: "MOVE", unitId: visitor.id, x: 6, y: 5 }).type).toBe("STATE");
    expect(worker.send({ type: "COLLECT_COINS", unitId: visitor.id }).type).toBe("ERROR");
    worker.send({ type: "END_TURN" });
    const before = game.tokens.lorgoshki;
    expect(worker.send({ type: "COLLECT_COINS", unitId: visitor.id }).type).toBe("STATE");
    expect(game.tokens.lorgoshki).toBe(before + 7);
    expect(tile.poiClaimed).toBe(true);
    expect(worker.send({ type: "COLLECT_COINS", unitId: visitor.id }).type).toBe("ERROR");
    expect(worker.send({ type: "MOVE", unitId: visitor.id, x: 7, y: 5 }).type).toBe("ERROR");
  });

  it("leaves coins unclaimed if the visitor moves away", async () => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "coins-leave", size: 16, faction: "robots" }).state!;
    const [visitor, bot] = game.units;
    Object.assign(visitor, { x: 5, y: 5 });
    Object.assign(bot, { x: 12, y: 12, moved: true, attacked: true });
    for (const tile of game.tiles) Object.assign(tile, { terrain: "plain", poi: null });
    const tile = game.tiles[5 * game.size + 6];
    Object.assign(tile, { poi: "treasury", poiClaimed: false });
    worker.send({ type: "MOVE", unitId: visitor.id, x: 6, y: 5 });
    worker.send({ type: "END_TURN" });
    expect(worker.send({ type: "MOVE", unitId: visitor.id, x: 7, y: 5 }).type).toBe("STATE");
    expect(tile.poiClaimed).toBe(false);
    expect(game.coinVisits).toHaveLength(0);
    expect(worker.send({ type: "COLLECT_COINS", unitId: visitor.id }).type).toBe("ERROR");
  });

  it.each(["lorgoshki", "robots"] as const)("heals the %s team without hiring from coffee", async (faction) => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: "coffee-heal", size: 16, faction }).state!;
    const [visitor] = game.units;
    visitor.hp = 1;
    Object.assign(game.tiles[visitor.y * game.size + visitor.x], { poi: "coffee", poiClaimed: false });
    game.coffeeBreaks.push({ x: visitor.x, y: visitor.y, unitId: visitor.id, readyTurn: game.turn });
    expect(worker.send({ type: "COFFEE", unitId: visitor.id, reward: "confidence" }).type).toBe("STATE");
    expect(visitor.hp).toBe(5);
    expect(game.units).toHaveLength(2);
  });

  it.each(["coffee", "treasury"] as const)("lets the bot collect a visited %s on its following turn", async (poi) => {
    const worker = await createWorker();
    const game = worker.send({ type: "START", seed: `bot-${poi}`, size: 16, faction: "lorgoshki" }).state!;
    const [, bot] = game.units;
    Object.assign(bot, { x: 8, y: 8, moved: false, attacked: false });
    for (const tile of game.tiles) Object.assign(tile, { terrain: "plain", poi: null });
    const tile = game.tiles[8 * game.size + 8];
    Object.assign(tile, { poi, poiClaimed: false });
    const visit = { x: 8, y: 8, unitId: bot.id, readyTurn: game.turn + 1 };
    if (poi === "coffee") game.coffeeBreaks.push(visit);
    else game.coinVisits.push(visit);
    worker.send({ type: "END_TURN" });
    expect(tile.poiClaimed).toBe(false);
    worker.send({ type: "END_TURN" });
    expect(tile.poiClaimed).toBe(true);
    expect(game.coffeeBreaks).toHaveLength(0);
    expect(game.coinVisits).toHaveLength(0);
  });
});
