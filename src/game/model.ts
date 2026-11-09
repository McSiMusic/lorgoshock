export type Faction = "lorgoshki" | "robots";
export type Terrain = "plain" | "forest" | "mountain" | "water";
export type UnitKind = "junior" | "courier" | "middle" | "senior" | "workerBot" | "drone" | "vacuum";
export const MAP_SIZES = [8, 16, 24] as const;
export type Base = {
  id: string;
  name: LocalizedName;
  x: number;
  y: number;
  owner: Faction | null;
  rank: number;
  progress: number;
  resourceRange: 3 | 5;
  capture?: { unitId: string; faction: Faction; readyTurn: number };
  captureResult?: { faction: Faction; turn: number };
};

export type Unit = Identity & {
  id: string;
  x: number;
  y: number;
  faction: Faction;
  kind: UnitKind;
  homeBaseId: string | null;
  hp: number;
  moved: boolean;
  attacked: boolean;
  coffeeBoostTurn?: number;
  coffeeMovementBoost?: boolean;
};

export type CombatEvent = {
  id: number;
  attacker: Unit;
  defender: Unit;
  counterattack: boolean;
  lethal: boolean;
  advance: boolean;
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
  harvestedBy?: Faction;
  bridge?: { axis: "x" | "y"; faction: Faction };
};

export type ResourceEvent = { id: number; x: number; y: number; baseId: string; cost: number; progress: number };
export type PendingProgress = ResourceEvent & { faction: Faction };
export type IncomeEvent = { id: number; x: number; y: number; amount: number };
export type MovementEvent = { id: number; unitId: string; from: { x: number; y: number }; to: { x: number; y: number }; path: Array<{ x: number; y: number }> };
export type BotAction = {
  position: { x: number; y: number };
  before: GameState;
  after: GameState;
  combatEvents: CombatEvent[];
  resourceEvents: ResourceEvent[];
  movementEvents: MovementEvent[];
  events: GameEvent[];
};
export type PoiVisit = { x: number; y: number; unitId: string; readyTurn: number };

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
  logs: GameEvent[];
  nextEventId: number;
  coffeeBreaks: PoiVisit[];
  coinVisits: PoiVisit[];
  pendingProgress?: PendingProgress[];
  status: "running" | "won" | "lost";
};

export type GameEvent = { id: number; en: string; ru: string };

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
  drone: { name: "Дрон-оптимизатор", emoji: "🛸", cost: 4, maxHp: 4, attack: 1, defense: 1, move: 3, range: 2, unlockRank: 2 },
  vacuum: { name: "Пылесос с ножом", emoji: "🧹", cost: 8, maxHp: 14, attack: 4.5, defense: 3, move: 2, range: 1, unlockRank: 3 },
};

export const UNIT_BY_TIER: Record<Faction, UnitKind[]> = {
  lorgoshki: ["junior", "courier", "middle", "senior"],
  robots: ["workerBot", "drone", "vacuum"],
};

export const FACTION_NAMES: Record<Faction, string> = {
  lorgoshki: "Лоргошки",
  robots: "Роботы",
};

export type GameCommand =
  | { type: "START"; seed: string; size: number; faction: Faction }
  | { type: "RESUME"; state: GameState }
  | { type: "MOVE"; x: number; y: number; unitId: string }
  | { type: "ATTACK"; x: number; y: number; unitId: string }
  | { type: "HEAL"; unitId: string }
  | { type: "CAPTURE"; baseId: string; unitId: string }
  | { type: "HARVEST"; x: number; y: number; baseId: string; reward?: "progress" | "tokens" }
  | { type: "BUILD_BRIDGE"; x: number; y: number; baseId: string }
  | { type: "RESOURCE_ARRIVED"; id: number }
  | { type: "HIRE"; baseId: string; kind: UnitKind }
  | { type: "EXPAND_HARVEST_RANGE"; baseId: string }
  | { type: "RESEARCH"; branch: number }
  | { type: "COFFEE"; unitId: string; reward: "tokens" | "vision" | "movement" }
  | { type: "COLLECT_COINS"; unitId: string }
  | { type: "END_TURN" };
import type { Identity, LocalizedName } from "./names";
