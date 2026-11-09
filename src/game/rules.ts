import {
  MAP_SIZES,
  UNIT_DEFINITIONS,
  type Base,
  type Faction,
  type GameState,
  type Terrain,
  type Tile,
  type Unit,
  type UnitKind,
} from "./model";
import { makeCityName, makeIdentity } from "./names";

export function seededRandom(seed: string): () => number {
  let state = 0x811c9dc5;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 0x01000193);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function effectiveAttack(state: GameState, attacker: Unit): number {
  return (UNIT_DEFINITIONS[attacker.kind].attack + (attacker.faction === "lorgoshki" && state.tech.lorgoshki[1] >= 1 ? 1 : 0))
    * attacker.hp / UNIT_DEFINITIONS[attacker.kind].maxHp;
}

export function attackRange(state: GameState, unit: Unit): number {
  return UNIT_DEFINITIONS[unit.kind].range + (state.tech[unit.faction][1] >= 2 ? 1 : 0);
}

export function hireCost(state: GameState, faction: Faction, kind: UnitKind): number {
  return Math.max(1, UNIT_DEFINITIONS[kind].cost - (faction === "lorgoshki" && state.tech.lorgoshki[0] >= 2 ? 1 : 0));
}

export function availableTechnologyLevels(faction: Faction, branch: number): number {
  return (faction === "lorgoshki" ? [3, 2, 0] : [1, 0, 0])[branch] ?? 0;
}

export function damage(attacker: Unit, defender: Unit, state: GameState): number {
  const defense = Math.max(0, UNIT_DEFINITIONS[defender.kind].defense
    - (defender.faction === "robots" && state.tech.robots[0] >= 1 ? 1 : 0));
  const defenseForce = defense * (defender.hp / UNIT_DEFINITIONS[defender.kind].maxHp);
  const attackForce = effectiveAttack(state, attacker) + defenseForce * attacker.hp / UNIT_DEFINITIONS[attacker.kind].maxHp;
  const cover = hasCover(state, defender) ? 0.75 : 1;
  return Math.max(1, Math.min(defender.hp, Math.round(attackForce * cover)));
}

export function hasTerrainCover(state: Pick<GameState, "size" | "tiles">, unit: Unit): boolean {
  const tile = state.tiles[unit.y * state.size + unit.x];
  return Boolean(tile && (tile.terrain === "mountain"
    || (tile.terrain === "forest" && (!tile.poiClaimed || tile.poi))));
}

export function hasCover(state: Pick<GameState, "size" | "tiles" | "bases">, unit: Unit): boolean {
  const base = state.bases.find((entry) => entry.x === unit.x && entry.y === unit.y);
  return base ? base.owner === unit.faction && !base.capture : hasTerrainCover(state, unit);
}

export function incomeForRank(rank: number): number {
  return [0, 2, 3, 4, 5][Math.min(4, Math.max(1, Math.floor(rank)))] ?? 2;
}

export function progressToNextRank(rank: number): number {
  return rank >= 4 ? 4 : rank + 1;
}

export function gridDistance(first: { x: number; y: number }, second: { x: number; y: number }): number {
  return Math.max(Math.abs(first.x - second.x), Math.abs(first.y - second.y));
}

export function movementRange(state: Pick<GameState, "turn">, unit: Unit): number {
  return UNIT_DEFINITIONS[unit.kind].move * (unit.coffeeMovementBoost || unit.coffeeBoostTurn === state.turn ? 2 : 1);
}

export function cityCapacity(base: Base): number {
  return base.rank + 1;
}

export function cityOccupancy(state: Pick<GameState, "units">, base: Base): number {
  return state.units.filter((unit) => unit.homeBaseId === base.id && unit.faction === base.owner).length;
}

export function canAttack(state: GameState, attacker: Unit, defender: Unit): boolean {
  const tile = state.tiles[defender.y * state.size + defender.x];
  return state.status === "running"
    && attacker.faction !== defender.faction && !attacker.attacked
    && UNIT_DEFINITIONS[attacker.kind].attack > 0
    && (attacker.faction !== state.playerFaction || Boolean(tile?.explored))
    && gridDistance(attacker, defender) <= attackRange(state, attacker);
}

export function canHarvestWithinCity(base: Base, tile: { x: number; y: number }): boolean {
  return gridDistance(base, tile) <= Math.floor(base.resourceRange / 2);
}

export function healingAmount(state: Pick<GameState, "bases">, unit: Unit): number {
  const maxHp = UNIT_DEFINITIONS[unit.kind].maxHp;
  const ownCity = state.bases.some((base) => base.owner === unit.faction && base.x === unit.x && base.y === unit.y);
  const enemyTerritory = state.bases.some((base) => base.owner !== null && base.owner !== unit.faction && canHarvestWithinCity(base, unit));
  const divisor = ownCity ? 2 : enemyTerritory ? 4 : 3;
  return Math.max(0, Math.min(maxHp - unit.hp, Math.ceil(maxHp / divisor)));
}

export function resourceCost(tile: Tile): number | null {
  if (tile.poiClaimed || tile.poi || tile.bridge) return null;
  if (tile.terrain === "forest") return 2;
  if (tile.geese) return 2;
  if (tile.terrain === "mountain") return 5;
  if (tile.terrain === "water") return 7;
  return null;
}

export function resourceProgress(tile: Tile): number {
  return tile.terrain === "forest" || tile.geese ? 1 : tile.terrain === "mountain" ? 2 : tile.terrain === "water" ? 3 : 0;
}

export function canBuildBridge(state: GameState, base: Base, tile: Tile, axis: "x" | "y", faction: Faction = state.playerFaction): boolean {
  if ((axis !== "x" && axis !== "y") || state.status !== "running" || base.owner !== faction || base.capture || tile.terrain !== "water"
    || tile.poi || tile.bridge || (faction === state.playerFaction && !tile.explored)
    || state.tokens[faction] < 5
    || state.bases.some((city) => city.x === tile.x && city.y === tile.y)
    || state.units.some((unit) => unit.x === tile.x && unit.y === tile.y)) return false;
  const dx = axis === "x" ? 1 : 0;
  const dy = axis === "y" ? 1 : 0;
  return [-1, 1].every((direction) => {
    const x = tile.x + dx * direction, y = tile.y + dy * direction;
    return x >= 0 && y >= 0 && x < state.size && y < state.size
      && state.tiles[y * state.size + x]?.terrain !== "water";
  });
}

export function bridgeAxis(state: GameState, base: Base, tile: Tile, faction: Faction = state.playerFaction): "x" | "y" | undefined {
  return (["x", "y"] as const).find((axis) => canBuildBridge(state, base, tile, axis, faction));
}

export function resourceCity(state: GameState, tile: Tile, preferredBaseId?: string | null): Base | undefined {
  if (!tile.visible || resourceCost(tile) === null
    || state.bases.some((city) => city.x === tile.x && city.y === tile.y)
    || state.units.some((unit) => unit.x === tile.x && unit.y === tile.y && unit.faction !== state.playerFaction)) return undefined;
  const eligible = state.bases.filter((base) => base.owner === state.playerFaction
    && !base.capture && canHarvestWithinCity(base, tile));
  return eligible.find((base) => base.id === preferredBaseId) ?? eligible[0];
}

export function canHarvest(state: GameState, base: Base, tile: Tile, faction: Faction = state.playerFaction): boolean {
  const cost = resourceCost(tile);
  return state.status === "running" && base.owner === faction
    && !base.capture && (faction !== state.playerFaction || tile.visible) && canHarvestWithinCity(base, tile)
    && !state.bases.some((city) => city.x === tile.x && city.y === tile.y)
    && !state.units.some((unit) => unit.x === tile.x && unit.y === tile.y && unit.faction !== faction)
    && cost !== null && state.tokens[faction] >= cost;
}

export function expandResourceArea(state: GameState, baseId: string): boolean {
  const base = state.bases.find((candidate) => candidate.id === baseId && candidate.owner === state.playerFaction);
  if (!base || base.resourceRange !== 3 || state.tokens[state.playerFaction] < 10) return false;
  state.tokens[state.playerFaction] -= 10;
  base.resourceRange = 5;
  return true;
}

export function revealAround(state: Pick<GameState, "tiles" | "size" | "units" | "bases" | "playerFaction" | "tech">): void {
  for (const tile of state.tiles) tile.visible = false;
  const revealFrom = (origin: { x: number; y: number }, vision: number) => {
    for (let dy = -vision; dy <= vision; dy++) {
      for (let dx = -vision; dx <= vision; dx++) {
        const x = origin.x + dx;
        const y = origin.y + dy;
        if (x < 0 || y < 0 || x >= state.size || y >= state.size) continue;
        const tile = state.tiles[y * state.size + x];
        if (tile) {
          tile.visible = true;
          tile.explored = true;
        }
      }
    }
  };
  for (const unit of state.units) {
    if (unit.faction === state.playerFaction) {
      revealFrom(unit, state.tiles[unit.y * state.size + unit.x]?.terrain === "mountain" ? 3 : 1);
    }
  }
  for (const base of state.bases) {
    if (base.owner === state.playerFaction) revealFrom(base, 2);
  }
}

function inBounds(x: number, y: number, size: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

export function shortestPath(
  state: Pick<GameState, "size" | "tiles">,
  start: { x: number; y: number },
  target: { x: number; y: number },
  maxSteps = Number.POSITIVE_INFINITY,
): Array<{ x: number; y: number }> | null {
  const queue = [{ ...start }];
  const previous = new Map<string, string | null>([[`${start.x},${start.y}`, null]]);
  const distance = new Map<string, number>([[`${start.x},${start.y}`, 0]]);
  const key = (x: number, y: number) => `${x},${y}`;
  let found = false;

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    if (current.x === target.x && current.y === target.y) {
      found = true;
      break;
    }
    const currentDistance = distance.get(key(current.x, current.y)) ?? 0;
    if (currentDistance >= maxSteps) continue;

    for (const [dx, dy] of [
      [0, -1], [1, -1], [1, 0], [1, 1],
      [0, 1], [-1, 1], [-1, 0], [-1, -1],
    ]) {
      const x = current.x + dx;
      const y = current.y + dy;
      const tile = inBounds(x, y, state.size) ? state.tiles[y * state.size + x] : undefined;
      if (!inBounds(x, y, state.size) || !tile || (tile.terrain === "water" && !tile.bridge)) continue;
      const currentTile = state.tiles[current.y * state.size + current.x];
      const permits = (bridge: Tile["bridge"]) => !bridge || (bridge.axis === "x" ? dy === 0 && Math.abs(dx) === 1 : dx === 0 && Math.abs(dy) === 1);
      if (!permits(currentTile?.bridge)) continue;
      const next = key(x, y);
      if (previous.has(next)) continue;
      previous.set(next, key(current.x, current.y));
      distance.set(next, currentDistance + 1);
      queue.push({ x, y });
    }
  }

  if (!found) return null;
  const path = [];
  let current: string | null = key(target.x, target.y);
  while (current && current !== key(start.x, start.y)) {
    const [x, y] = current.split(",").map(Number);
    path.unshift({ x, y });
    current = previous.get(current) ?? null;
  }
  return path;
}

export function canMoveTo(state: GameState, unit: Unit, target: { x: number; y: number }): boolean {
  const tile = inBounds(target.x, target.y, state.size) ? state.tiles[target.y * state.size + target.x] : undefined;
  return state.status === "running" && !unit.moved && !unit.attacked
    && (unit.x !== target.x || unit.y !== target.y)
    && gridDistance(unit, target) <= movementRange(state, unit)
    && Boolean(tile && (unit.faction !== state.playerFaction || tile.explored))
    && !state.units.some((other) => other.x === target.x && other.y === target.y)
    && Boolean(shortestPath(state, unit, target, movementRange(state, unit)));
}

export function hasUnitAction(state: GameState, unit: Unit): boolean {
  if (state.status !== "running" || unit.faction !== state.playerFaction) return false;
  if (state.units.some((target) => canAttack(state, unit, target))) return true;
  if (unit.moved || unit.attacked) return false;
  if (healingAmount(state, unit) > 0) return true;
  if (state.bases.some((base) => base.capture?.unitId === unit.id && base.capture.readyTurn <= state.turn)) return true;
  if (state.coffeeBreaks.some((visit) => visit.unitId === unit.id && visit.readyTurn <= state.turn && visit.x === unit.x && visit.y === unit.y)
    || state.coinVisits.some((visit) => visit.unitId === unit.id && visit.readyTurn <= state.turn && visit.x === unit.x && visit.y === unit.y)) return true;
  return state.tiles.some((tile) => canMoveTo(state, unit, tile));
}

function emptyTile(x: number, y: number, terrain: Terrain = "plain"): Tile {
  return { x, y, terrain, geese: false, poi: null, poiClaimed: false, explored: false, visible: false };
}

export function createGame(seed: string, size: number, playerFaction: Faction): GameState {
  if (!MAP_SIZES.some((supportedSize) => supportedSize === size)) {
    throw new Error(`Размер карты должен быть одним из: ${MAP_SIZES.join(", ")}.`);
  }
  const random = seededRandom(seed);
  const tiles = Array.from({ length: size * size }, (_, index) => {
    const x = index % size;
    const y = Math.floor(index / size);
    const roll = random();
    const terrain: Terrain = roll < 0.18 ? "water" : roll < 0.36 ? "forest" : roll < 0.47 ? "mountain" : "plain";
    return { ...emptyTile(x, y, terrain), geese: terrain === "plain" && random() < 0.22 };
  });
  const botFaction: Faction = playerFaction === "lorgoshki" ? "robots" : "lorgoshki";
  const corner = Math.floor(seededRandom(`start:${seed}`)() * 4);
  const playerStart = { x: corner & 1 ? size - 3 : 2, y: corner & 2 ? size - 3 : 2 };
  const botStart = { x: size - 1 - playerStart.x, y: size - 1 - playerStart.y };
  const starts = [playerStart, botStart];

  for (const start of starts) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 3) continue;
        const tile = tiles[(start.y + dy) * size + start.x + dx];
        if (tile?.terrain === "water") tile.terrain = "plain";
      }
    }
  }

  const bases: Base[] = [
    { id: "home-player", name: makeCityName(seed, "home-player", playerFaction, []), ...playerStart, owner: playerFaction, rank: 1, progress: 0, resourceRange: 3 },
    { id: "home-bot", name: makeCityName(seed, "home-bot", botFaction, []), ...botStart, owner: botFaction, rank: 1, progress: 0, resourceRange: 3 },
  ];
  const areaScale = size * size / 256;
  const neutralCount = Math.round(6 * areaScale);
  const coffeeCount = Math.round((4 + Math.floor(random() * 2)) * areaScale);
  const candidates = tiles.filter((tile) => tile.x > 0 && tile.y > 0 && tile.x < size - 1 && tile.y < size - 1);
  let locations: Tile[] = [];
  let coffeeLocations: Tile[] = [];
  for (let attempt = 0; attempt < 1000 && coffeeLocations.length < coffeeCount; attempt++) {
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const chosen: Tile[] = [];
    for (const tile of shuffled) {
      if (starts.every((start) => gridDistance(start, tile) >= 3)
        && chosen.every((other) => gridDistance(other, tile) >= 3)) chosen.push(tile);
      if (chosen.length === neutralCount) break;
    }
    if (chosen.length < neutralCount) continue;
    const coffees: Tile[] = [];
    for (const tile of shuffled) {
      if (starts.every((base) => gridDistance(base, tile) >= 2)
        && chosen.every((base) => gridDistance(base, tile) >= 2)
        && coffees.every((coffee) => gridDistance(coffee, tile) >= 3)) coffees.push(tile);
      if (coffees.length === coffeeCount) break;
    }
    if (coffees.length === coffeeCount) {
      locations = chosen;
      coffeeLocations = coffees;
    }
  }
  if (locations.length !== neutralCount || coffeeLocations.length !== coffeeCount) {
    throw new Error("Не удалось разместить компании и кофейни на карте.");
  }
  for (const [index, tile] of locations.entries()) {
    const { x, y } = tile;
    bases.push({ id: `base-${index}`, name: makeCityName(seed, `base-${index}`, null, bases.map((base) => base.name)), x, y, owner: null, rank: 1, progress: 0, resourceRange: 3 });
    Object.assign(tile, emptyTile(x, y));
  }
  for (const tile of coffeeLocations) {
    Object.assign(tile, emptyTile(tile.x, tile.y));
    tile.poi = "coffee";
  }
  const poiCandidates = candidates.filter((tile) => !tile.poi && !bases.some((base) => base.x === tile.x && base.y === tile.y));
  for (let i = poiCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [poiCandidates[i], poiCandidates[j]] = [poiCandidates[j], poiCandidates[i]];
  }
  const treasuryCount = Math.round(2 * areaScale);
  const treasuries = poiCandidates.slice(0, treasuryCount);
  for (const tile of treasuries) {
    Object.assign(tile, emptyTile(tile.x, tile.y));
    tile.poi = "treasury";
  }
  const reachableLand = () => {
    const queue = [playerStart];
    const visited = new Set([playerStart.y * size + playerStart.x]);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor];
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const x = current.x + dx, y = current.y + dy, key = y * size + x;
        if (!inBounds(x, y, size) || visited.has(key) || tiles[y * size + x].terrain === "water") continue;
        visited.add(key);
        queue.push({ x, y });
      }
    }
    return visited;
  };
  let reachable = reachableLand();
  for (const destination of [...bases, ...coffeeLocations, ...treasuries]) {
    if (reachable.has(destination.y * size + destination.x)) continue;
    let { x, y } = playerStart;
    while (x !== destination.x || y !== destination.y) {
      if (x !== destination.x && (y === destination.y || random() < 0.5)) x += Math.sign(destination.x - x);
      else y += Math.sign(destination.y - y);
      const tile = tiles[y * size + x];
      if (tile.terrain === "water") tile.terrain = "plain";
    }
    reachable = reachableLand();
  }

  const startFactionUnit = (faction: Faction, kind: Unit["kind"], position: { x: number; y: number }): Unit => ({
    id: `${faction}-1`,
    ...makeIdentity(seed, `${faction}-1`, faction, kind, []),
    ...position,
    faction,
    kind,
    homeBaseId: faction === playerFaction ? "home-player" : "home-bot",
    hp: UNIT_DEFINITIONS[kind].maxHp,
    moved: false,
    attacked: false,
  });
  const units = [
    startFactionUnit(playerFaction, playerFaction === "lorgoshki" ? "junior" : "workerBot", playerStart),
    startFactionUnit(botFaction, botFaction === "lorgoshki" ? "junior" : "workerBot", botStart),
  ];
  const state: GameState = {
    seed,
    size,
    playerFaction,
    botFaction,
    turn: 1,
    activeFaction: playerFaction,
    tokens: { lorgoshki: 7, robots: 7 },
    tiles,
    bases,
    units,
    tech: { lorgoshki: [0, 0, 0], robots: [0, 0, 0] },
    logs: [],
    nextEventId: 1,
    coffeeBreaks: [],
    coinVisits: [],
    status: "running",
  };
  revealAround(state);
  return state;
}

export function unitName(kind: UnitKind): string {
  return UNIT_DEFINITIONS[kind].name;
}

export function baseName(faction: Faction): string {
  return faction === "lorgoshki" ? "Компания" : "Майнинг-ферма";
}

export function logEvent(state: GameState, ru: string, en: string): void {
  state.logs = [{ id: state.nextEventId++, ru, en }, ...state.logs];
}

export function transferBase(state: GameState, base: Base, faction: Faction, unit: Unit): void {
  const oldOwner = base.owner;
  base.owner = faction;
  if (oldOwner === null && faction === "lorgoshki") {
    const networking = state.tech.lorgoshki[0];
    if (networking >= 1) base.rank = networking >= 3 ? 3 : 2;
    if (networking >= 3) state.tokens.lorgoshki += 5;
  }
  base.name = makeCityName(state.seed, `${base.id}:${state.turn}`, faction, state.bases.filter((other) => other.id !== base.id).map((other) => other.name));
  base.progress = 0;
  if (faction === state.playerFaction || state.tiles[base.y * state.size + base.x]?.visible) {
    logEvent(state, `${unit.name.ru} открывает «${base.name.ru}».`, `${unit.name.en} opens ${base.name.en}.`);
  }
  if (oldOwner && oldOwner !== faction && !state.bases.some((item) => item.owner === oldOwner)) {
    state.status = faction === state.playerFaction ? "won" : "lost";
  }
}
