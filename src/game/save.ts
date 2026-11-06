import { z } from "zod";
import { UNIT_BY_TIER, UNIT_DEFINITIONS, type GameState } from "./model";

export const SAVE_KEY = "lorgoshock-save-v1";
const faction = z.enum(["lorgoshki", "robots"]);
const name = z.object({ en: z.string().min(1), ru: z.string().min(1) });
const position = { x: z.number().int().nonnegative(), y: z.number().int().nonnegative() };
const unit = z.object({
  id: z.string().min(1), name, gender: z.enum(["male", "female"]), ...position, faction,
  kind: z.enum(["junior", "courier", "middle", "senior", "workerBot", "drone", "vacuum"]),
  homeBaseId: z.string().nullable(), hp: z.number().positive(), moved: z.boolean(), attacked: z.boolean(),
  coffeeBoostTurn: z.number().int().positive().optional(),
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
});
const tech = z.tuple([z.number().int().min(0).max(3), z.number().int().min(0).max(3), z.number().int().min(0).max(3)]);
const tokenPair = z.object({ lorgoshki: z.number().nonnegative(), robots: z.number().nonnegative() });

export const savedGameSchema: z.ZodType<GameState> = z.object({
  seed: z.string(), size: z.union([z.literal(16), z.literal(24), z.literal(32)]),
  playerFaction: faction, botFaction: faction, turn: z.number().int().positive(), activeFaction: faction,
  tokens: tokenPair, tiles: z.array(tile), bases: z.array(base).min(1), units: z.array(unit),
  tech: z.object({ lorgoshki: tech, robots: tech }),
  logs: z.array(z.object({ id: z.number().int().positive(), en: z.string(), ru: z.string() })),
  nextEventId: z.number().int().positive(),
  coffeeBreaks: z.array(z.object({ ...position, unitId: z.string(), readyTurn: z.number().int().positive() })),
  coinVisits: z.array(z.object({ ...position, unitId: z.string(), readyTurn: z.number().int().positive() })).default([]),
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
    && state.bases.every((base) => !base.capture || state.units.some((unit) => unit.id === base.capture?.unitId
      && unit.faction === base.capture.faction && unit.x === base.x && unit.y === base.y))
    && new Set(state.units.map((unit) => unit.id)).size === state.units.length
    && new Set(state.bases.map((base) => base.id)).size === state.bases.length
    && state.logs.every((event) => event.id < state.nextEventId);
  if (!valid) ctx.addIssue({ code: "custom", message: "Invalid saved game state" });
});
