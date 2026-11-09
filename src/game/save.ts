import { z } from "zod";
import { UNIT_BY_TIER, UNIT_DEFINITIONS, type GameState } from "./model";
import { claimCityTerritory } from "./territory";

export const SAVE_KEY = "lorgoshock-save-v1";
const faction = z.enum(["lorgoshki", "robots"]);
const name = z.object({ en: z.string().min(1), ru: z.string().min(1) });
const position = { x: z.number().int().nonnegative(), y: z.number().int().nonnegative() };
const unit = z.object({
  id: z.string().min(1), name, gender: z.enum(["male", "female"]), ...position, faction,
  kind: z.enum(["junior", "courier", "middle", "senior", "workerBot", "drone", "vacuum"]),
  homeBaseId: z.string().nullable(), hp: z.number().positive(), moved: z.boolean(), attacked: z.boolean(),
  coffeeBoostTurn: z.number().int().positive().optional(),
  coffeeMovementBoost: z.boolean().optional(),
});
const base = z.object({
  id: z.string().min(1), name, ...position, owner: faction.nullable(), rank: z.number().int().min(1).max(4),
  progress: z.number().int().nonnegative(), resourceRange: z.union([z.literal(3), z.literal(5)]),
  capture: z.object({ unitId: z.string(), faction, readyTurn: z.number().int().positive() }).optional(),
  captureResult: z.object({ faction, turn: z.number().int().positive() }).optional(),
});
const tile = z.object({
  ...position, terrain: z.enum(["plain", "forest", "mountain", "water"]), geese: z.boolean(),
  poi: z.enum(["coffee", "treasury"]).nullable(), poiClaimed: z.boolean(), explored: z.boolean(), visible: z.boolean(),
  harvestedBy: faction.optional(),
  territoryBaseId: z.string().min(1).optional(),
  bridge: z.object({ axis: z.enum(["x", "y"]), faction }).optional(),
});
const tech = z.tuple([z.number().int().min(0).max(3), z.number().int().min(0).max(3), z.number().int().min(0).max(3)]);
const tokenPair = z.object({ lorgoshki: z.number().nonnegative(), robots: z.number().nonnegative() });

export const savedGameSchema: z.ZodType<GameState> = z.object({
  seed: z.string(), size: z.union([z.literal(8), z.literal(16), z.literal(24), z.literal(32)]),
  playerFaction: faction, botFaction: faction, turn: z.number().int().positive(), activeFaction: faction,
  territoryVersion: z.literal(1).optional(),
  tokens: tokenPair, tiles: z.array(tile), bases: z.array(base).min(1), units: z.array(unit),
  tech: z.object({ lorgoshki: tech, robots: tech }),
  logs: z.array(z.object({ id: z.number().int().positive(), en: z.string(), ru: z.string() })),
  nextEventId: z.number().int().positive(),
  coffeeBreaks: z.array(z.object({ ...position, unitId: z.string(), readyTurn: z.number().int().positive() })),
  coinVisits: z.array(z.object({ ...position, unitId: z.string(), readyTurn: z.number().int().positive() })).default([]),
  pendingProgress: z.array(z.object({ id: z.number().int().positive(), ...position, baseId: z.string(), faction, cost: z.number().int().nonnegative(), progress: z.number().int().positive() })).optional(),
  status: z.literal("running"),
}).superRefine((state, ctx) => {
  const valid = state.tiles.length === state.size * state.size
    && state.tiles.every((tile, index) => tile.x === index % state.size && tile.y === Math.floor(index / state.size))
    && state.playerFaction !== state.botFaction && state.activeFaction === state.playerFaction
    && state.bases.every((base) => base.x < state.size && base.y < state.size)
    && state.units.every((unit) => unit.x < state.size && unit.y < state.size
      && UNIT_BY_TIER[unit.faction].includes(unit.kind) && unit.hp <= UNIT_DEFINITIONS[unit.kind].maxHp
      && (unit.homeBaseId === null || state.bases.some((base) => base.id === unit.homeBaseId && base.owner === unit.faction)))
    && state.coffeeBreaks.every((coffee) => coffee.x < state.size && coffee.y < state.size)
    && state.coinVisits.every((visit) => visit.x < state.size && visit.y < state.size)
    && (state.pendingProgress ?? []).every((entry) => entry.x < state.size && entry.y < state.size
      && entry.id < state.nextEventId && state.bases.some((base) => base.id === entry.baseId))
    && new Set((state.pendingProgress ?? []).map((entry) => entry.id)).size === (state.pendingProgress ?? []).length
    && state.tiles.every((tile) => !tile.bridge || tile.terrain === "water")
    && (state.territoryVersion !== 1 || state.tiles.every((tile) => !tile.territoryBaseId
      || state.bases.some((base) => base.id === tile.territoryBaseId && base.owner !== null
        && Math.max(Math.abs(base.x - tile.x), Math.abs(base.y - tile.y)) <= Math.floor(base.resourceRange / 2))))
    && state.bases.every((base) => !base.capture || state.units.some((unit) => unit.id === base.capture?.unitId
      && unit.faction === base.capture.faction && unit.x === base.x && unit.y === base.y))
    && new Set(state.units.map((unit) => unit.id)).size === state.units.length
    && new Set(state.bases.map((base) => base.id)).size === state.bases.length
    && state.logs.every((event) => event.id < state.nextEventId);
  if (!valid) ctx.addIssue({ code: "custom", message: "Invalid saved game state" });
}).transform((state): GameState => {
  if (state.territoryVersion === undefined) {
    for (const tile of state.tiles) delete tile.territoryBaseId;
    for (const base of state.bases) if (base.owner !== null) claimCityTerritory(state, base);
  }
  return { ...state, territoryVersion: 1 };
});
