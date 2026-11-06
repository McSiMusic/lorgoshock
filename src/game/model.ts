export type Faction = "lorgoshki" | "robots";
export type Terrain = "plain" | "forest" | "mountain" | "water";
export type UnitKind = "junior" | "courier" | "middle" | "senior" | "workerBot" | "drone" | "vacuum";
export const MAP_SIZES = [16, 24, 32] as const;
export type Base = {
  id: string;
  x: number;
  y: number;
  owner: Faction | null;
  rank: number;
  progress: number;
};

export type Unit = {
  id: string;
  x: number;
  y: number;
  faction: Faction;
  kind: UnitKind;
  hp: number;
  moved: boolean;
  attacked: boolean;
};

export type Tile = {
  x: number;
  y: number;
  terrain: Terrain;
  geese: boolean;
  poi: "coffee" | "treasury" | null;
  poiClaimed: boolean;
  explored: boolean;
  visible: boolean;
};

export type Decision = {
  unit: string;
  choice: string;
  score: number;
  reason: string;
};

export type Inspector = {
  phases: string[];
  elapsedMs: number;
  top: Decision[];
};

export type GameState = {
  seed: string;
  size: number;
  playerFaction: Faction;
  botFaction: Faction;
  turn: number;
  activeFaction: Faction;
  tokens: Record<Faction, number>;
  tiles: Tile[];
  bases: Base[];
  units: Unit[];
  tech: Record<Faction, [number, number, number]>;
  logs: string[];
  inspector: Inspector;
  pendingCoffee: { x: number; y: number } | null;
  status: "running" | "won" | "lost";
};

export type UnitDefinition = {
  name: string;
  emoji: string;
  cost: number;
  maxHp: number;
  attack: number;
  defense: number;
  move: number;
  range: number;
  unlockRank: number;
};

export const UNIT_DEFINITIONS: Record<UnitKind, UnitDefinition> = {
  junior: { name: "Джуниор", emoji: "🧑‍💻", cost: 2, maxHp: 5, attack: 2, defense: 1, move: 1, range: 1, unlockRank: 1 },
  courier: { name: "Курьер", emoji: "🚴", cost: 3, maxHp: 4, attack: 1, defense: 1, move: 3, range: 2, unlockRank: 1 },
  middle: { name: "Мидл", emoji: "🧑‍🔧", cost: 5, maxHp: 10, attack: 3.5, defense: 2, move: 1, range: 1, unlockRank: 2 },
  senior: { name: "Сеньор на галере", emoji: "🧔‍♂️", cost: 8, maxHp: 15, attack: 4.5, defense: 3, move: 1, range: 1, unlockRank: 3 },
  workerBot: { name: "Рабочий робот", emoji: "🤖", cost: 3, maxHp: 8, attack: 2.5, defense: 2, move: 1, range: 1, unlockRank: 1 },
  drone: { name: "Дрон-оптимизатор", emoji: "🛸", cost: 4, maxHp: 4, attack: 0, defense: 1, move: 3, range: 1, unlockRank: 2 },
  vacuum: { name: "Пылесос с ножом", emoji: "🧹", cost: 8, maxHp: 14, attack: 4.5, defense: 3, move: 2, range: 1, unlockRank: 3 },
};

export const FACTION_NAMES: Record<Faction, string> = {
  lorgoshki: "Лоргошки",
  robots: "Роботы",
};

export type GameCommand =
  | { type: "START"; seed: string; size: number; faction: Faction }
  | { type: "MOVE"; x: number; y: number; unitId: string }
  | { type: "ATTACK"; x: number; y: number; unitId: string }
  | { type: "HARVEST"; x: number; y: number; unitId: string }
  | { type: "HIRE"; baseId: string; kind: UnitKind }
  | { type: "RESEARCH"; branch: number }
  | { type: "COFFEE"; reward: "tokens" | "confidence" | "recruit" }
  | { type: "END_TURN" };
