import {
  FACTION_NAMES,
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

export function damage(attacker: Unit, defender: Unit, state: GameState): number {
  const attack = UNIT_DEFINITIONS[attacker.kind].attack
    + state.tech[attacker.faction][1] * 0.4;
  const defense = UNIT_DEFINITIONS[defender.kind].defense
    + state.tech[defender.faction][0] * 0.5;
  const attackForce = attack * (attacker.hp / UNIT_DEFINITIONS[attacker.kind].maxHp);
  const defenseForce = defense * (defender.hp / UNIT_DEFINITIONS[defender.kind].maxHp);
  return Math.max(1, Math.min(defender.hp, Math.round(attackForce + defenseForce)));
}

export function incomeForRank(rank: number): number {
  return [0, 2, 3, 4, 5][Math.min(4, Math.max(1, Math.floor(rank)))] ?? 2;
}

export function progressToNextRank(rank: number): number {
  return rank >= 4 ? 4 : rank + 1;
}

export function revealAround(state: Pick<GameState, "tiles" | "size" | "units" | "bases" | "playerFaction" | "tech">): void {
  for (const tile of state.tiles) tile.visible = false;
  const revealFrom = (origin: { x: number; y: number }) => {
    const vision = state.tech ? 2 + state.tech[state.playerFaction][1] : 2;
    for (let dy = -vision; dy <= vision; dy++) {
      for (let dx = -vision; dx <= vision; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > vision) continue;
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
    if (unit.faction === state.playerFaction) revealFrom(unit);
  }
  for (const base of state.bases) {
    if (base.owner === state.playerFaction) revealFrom(base);
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

    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = current.x + dx;
      const y = current.y + dy;
      const tile = state.tiles[y * state.size + x];
      if (!inBounds(x, y, state.size) || !tile || tile.terrain === "water") continue;
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
    const terrain: Terrain = roll < 0.11 ? "water" : roll < 0.29 ? "forest" : roll < 0.40 ? "mountain" : "plain";
    return { ...emptyTile(x, y, terrain), geese: terrain === "plain" && random() < 0.22 };
  });
  const botFaction: Faction = playerFaction === "lorgoshki" ? "robots" : "lorgoshki";
  const playerStart = { x: 2, y: 2 };
  const botStart = { x: size - 3, y: size - 3 };
  const starts = [playerStart, botStart];

  for (const start of starts) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 3) continue;
        const tile = tiles[(start.y + dy) * size + start.x + dx];
        if (tile) Object.assign(tile, emptyTile(tile.x, tile.y));
      }
    }
  }

  const bases: Base[] = [
    { id: "home-player", ...playerStart, owner: playerFaction, rank: 1, progress: 0 },
    { id: "home-bot", ...botStart, owner: botFaction, rank: 1, progress: 0 },
  ];
  const neutralCount = Math.max(4, Math.floor(size * size / 65));

  for (let index = 0; index < neutralCount; index++) {
    for (let attempt = 0; attempt < 120; attempt++) {
      const x = 1 + Math.floor(random() * (size - 2));
      const y = 1 + Math.floor(random() * (size - 2));
      const tile = tiles[y * size + x];
      const farFromStarts = starts.every((start) => Math.abs(x - start.x) + Math.abs(y - start.y) >= 5);
      const farFromBases = bases.every((base) => Math.abs(x - base.x) + Math.abs(y - base.y) >= 4);
      if (tile.terrain !== "water" && farFromStarts && farFromBases) {
        bases.push({ id: `base-${index}`, x, y, owner: null, rank: 1, progress: 0 });
        Object.assign(tile, emptyTile(x, y));
        break;
      }
    }
  }

  for (let index = 0; index < Math.floor(size / 5); index++) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = 1 + Math.floor(random() * (size - 2));
      const y = 1 + Math.floor(random() * (size - 2));
      const tile = tiles[y * size + x];
      if (tile.terrain !== "water" && !bases.some((base) => base.x === x && base.y === y)) {
        tile.poi = index % 2 === 0 ? "coffee" : "treasury";
        tile.geese = false;
        break;
      }
    }
  }

  const startFactionUnit = (faction: Faction, kind: Unit["kind"], position: { x: number; y: number }): Unit => ({
    id: `${faction}-1`,
    ...position,
    faction,
    kind,
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
    logs: [`Сид ${seed}. Матч начался — компания Лоргошков против дата-центра.`],
    inspector: { phases: [], elapsedMs: 0, top: [] },
    pendingCoffee: null,
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

export function logEvent(state: GameState, message: string): void {
  state.logs = [message, ...state.logs].slice(0, 8);
}

export function transferBase(state: GameState, base: Base, faction: Faction): void {
  base.owner = faction;
  base.progress = 0;
  logEvent(state, `${FACTION_NAMES[faction]} захватывают ${baseName(faction)}.`);
  const owned = state.bases.filter((item) => item.owner === faction).length;
  const total = state.bases.length;
  if (owned === total) state.status = faction === state.playerFaction ? "won" : "lost";
}
