"use client";

import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { OutlineFilter } from "pixi-filters";
import { createIsometricGrid, screenToTile, tileCenter } from "../game/isometric";
import { UNIT_DEFINITIONS, type Base, type CombatEvent, type GameState, type IncomeEvent, type ResourceEvent, type Terrain, type Unit } from "../game/model";
import { canAttack, canHarvestWithinCity, damage, gridDistance, movementRange, resourceCity, shortestPath } from "../game/rules";

type Props = {
  game: GameState;
  selected: { x: number; y: number } | null;
  selectedUnitId: string | null;
  selectedCityId: string | null;
  language: "en" | "ru";
  revealMap: boolean;
  combatEvents: CombatEvent[];
  resourceEvents: ResourceEvent[];
  incomeEvents: IncomeEvent[];
  onTileClick: (x: number, y: number) => void;
  onCapture: (baseId: string, unitId: string) => void;
  onCollectCoins: (unitId: string) => void;
};

const ART_FILES = {
  units: {
    hipsterMan: "units/hipster-man.png",
    hipsterWoman: "units/hipster-woman.png",
    courier: "units/courier-scooter-woman.png",
    courierMan: "units/courier-scooter-man.png",
    seniorHipster: "units/senior-hipster.png",
    robotWorker: "units/robot-worker.png",
    robotDrone: "units/robot-drone.png",
    robotVacuum: "units/robot-vacuum.png",
    hipsterWomanAlt: "units/hipster-woman-alt.png",
  },
  world: {
    meadowA: "world/meadow-a.png",
    meadowB: "world/meadow-b.png",
    forestA: "world/forest-a.png",
    forestB: "world/forest-b.png",
    mountainA: "world/mountain-a.png",
    mountainB: "world/mountain-b.png",
    waterA: "world/water-a.png",
    waterB: "world/water-b.png",
    forestObjectA: "world/forest-complete.png",
    mountainObjectA: "world/mountain-complete.png",
    mountainObjectB: "world/mountain-complete.png",
    coffee: "world/poi-coffee.png",
    treasury: "world/blet-coins.png",
    stumps: "world/forest-stumps-matched.png",
    mine: "world/mountain-quarry.png",
    hike: "world/mountain-hike.png",
    geese: "world/poi-geese.png",
    icedLatte: "world/iced-latte.png",
    fireworks: "world/fireworks-upgrade.png",
    electricSpark: "world/electric-spark.png",
    hrNegotiation: "world/hr-negotiation.png",
    robotLayoff: "world/robot-layoff.png",
    garage: "world/city-garage.png",
    human1: "world/city-human-1.png",
    human2: "world/city-human-2.png",
    human3: "world/city-human-3.png",
    robot1: "world/city-robot-1.png",
    robot2: "world/city-robot-2.png",
    robot3: "world/city-robot-3.png",
    sweat: "world/sweat.png",
  },
} as const;

type GameArt = { [K in keyof typeof ART_FILES.units | keyof typeof ART_FILES.world]: Texture };

let whiteOutline: OutlineFilter | undefined;
function outline(): OutlineFilter {
  if (!whiteOutline) {
    whiteOutline = new OutlineFilter({ thickness: 2, color: 0xffffff, alpha: 0.9, quality: 0.2 });
    whiteOutline.resolution = "inherit";
  }
  return whiteOutline;
}

async function loadGameArt(): Promise<GameArt> {
  const entries = Object.entries({ ...ART_FILES.units, ...ART_FILES.world });
  const textures = await Promise.all(entries.map(async ([name, file]) => {
    const url = new URL(`game-art/${file}`, window.location.href).href;
    return [name, await Assets.load<Texture>({ src: url, data: { autoGenerateMipmaps: true, scaleMode: "linear" } })] as const;
  }));
  return Object.fromEntries(textures) as GameArt;
}

function tint(color: number, amount: number): number {
  const red = Math.min(255, ((color >> 16) & 255) + amount);
  const green = Math.min(255, ((color >> 8) & 255) + amount);
  const blue = Math.min(255, (color & 255) + amount);
  return (red << 16) | (green << 8) | blue;
}

function polygon(graphics: Graphics, points: number[], color: number, alpha = 1): void {
  graphics.poly(points).fill({ color, alpha });
}

function diamond(cx: number, cy: number, width: number, height: number): number[] {
  return [cx, cy - height, cx + width, cy, cx, cy + height, cx - width, cy];
}

function drawTile(
  root: Container,
  grid: ReturnType<typeof createIsometricGrid>,
  game: GameState,
  tile: GameState["tiles"][number],
  index: number,
  art: GameArt,
  revealMap: boolean,
): void {
  const { tileWidth: width, tileHeight: height } = grid;
  const { x, y } = tileCenter(grid, tile.x, tile.y);
  const unexplored = !revealMap && !tile.explored;
  const variant = (tile.x * 17 + tile.y * 31 + index * 7) % 4;
  const tileTop = [x, y - height, x + width, y, x, y + height, x - width, y];
  const block = new Graphics();
  if (unexplored) {
    polygon(block, tileTop, 0xf7fbff);
    polygon(block, [x, y, x + width, y, x, y + height], 0xffffff, 0.66);
    polygon(block, [x, y, x - width, y, x, y + height], 0xe7f0f7, 0.6);
    block.poly(tileTop).stroke({ color: 0xffffff, width: 0.45, alpha: 0.78 });
  }
  root.addChild(block);
  if (unexplored) return;

  const terrainSprite = new Sprite(getTerrainTexture(art, tile.terrain, variant));
  terrainSprite.anchor.set(0.5);
  terrainSprite.position.set(x, y);
  fitSprite(terrainSprite, width * 2, height * 2);
  root.addChild(terrainSprite);
}

function drawTileDetails(
  root: Container,
  grid: ReturnType<typeof createIsometricGrid>,
  game: GameState,
  tile: GameState["tiles"][number],
  index: number,
  art: GameArt,
  revealMap: boolean,
): void {
  if (!revealMap && !tile.explored) return;
  const { tileWidth: width, tileHeight: height } = grid;
  const { x, y } = tileCenter(grid, tile.x, tile.y);
  const highlighted = Boolean(resourceCity(game, tile));
  const variant = (tile.x * 17 + tile.y * 31 + index * 7) % 2;
  const object = tile.terrain === "forest"
    ? (tile.poiClaimed && !tile.poi ? art.stumps : art.forestObjectA)
    : tile.terrain === "mountain" ? (tile.poiClaimed && !tile.poi && (tile.harvestedBy ?? game.playerFaction) === "robots" ? art.mine : (variant ? art.mountainObjectB : art.mountainObjectA)) : null;
  if (object) {
    const sprite = addWorldSprite(root, object, x, y + height * 0.45, width * (tile.terrain === "forest" ? 2 : 1.5), height * 2.7);
    if (tile.terrain === "forest") sprite.anchor.y = 966 / 1120;
    if (tile.terrain === "forest" && variant) sprite.scale.x *= -1;
    if (highlighted) sprite.filters = [outline()];
  }
  if (tile.terrain === "mountain" && tile.poiClaimed && !tile.poi && (tile.harvestedBy ?? game.playerFaction) !== "robots") {
    const development = tile.harvestedBy ?? game.playerFaction;
    if (development === "lorgoshki") addWorldSprite(root, art.hike, x, y + height * 0.4, width * 1.5, height * 2.7);
  }
  if (tile.geese && !tile.poiClaimed) {
    const geese = addWorldSprite(root, art.geese, x, y, width * 0.85, height * 1.55);
    geese.anchor.y = 185 / 256;
    if (highlighted) geese.filters = [outline()];
  }
  if (tile.poi && !tile.poiClaimed) {
    const poiTexture = tile.poi === "coffee" ? art.coffee : art.treasury;
    const coin = tile.poi === "treasury";
    addWorldSprite(root, poiTexture, x, y + height * 0.42, width * (coin ? 0.8 : 1.8), height * (coin ? 1.2 : 2.8));
  }
  if (highlighted && tile.terrain === "water") {
    const waterOutline = new Graphics();
    waterOutline.poly(diamond(x, y, width * 0.95, height * 0.95)).stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
    root.addChild(waterOutline);
  }
}

function getTerrainTexture(art: GameArt, terrain: Terrain, variant: number): Texture {
  const suffix = variant % 2 === 0 ? "A" : "B";
  if (terrain === "forest") return art[`forest${suffix}`];
  if (terrain === "mountain") return art[`mountain${suffix}`];
  if (terrain === "water") return art[`water${suffix}`];
  return art[`meadow${suffix}`];
}

function addWorldSprite(
  root: Container,
  texture: Texture,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha = 1,
): Sprite {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 1);
  sprite.position.set(x, y);
  fitSprite(sprite, width, height);
  sprite.alpha = alpha;
  root.addChild(sprite);
  return sprite;
}

function fitSprite(sprite: Sprite, maxWidth: number, maxHeight: number): void {
  const scale = Math.min(maxWidth / sprite.texture.width, maxHeight / sprite.texture.height);
  sprite.scale.set(scale);
}

function baseArt(base: GameState["bases"][number], art: GameArt): { texture: Texture; anchorX: number; anchorY: number } {
  if (base.owner === null) return { texture: art.garage, anchorX: 0.5, anchorY: 0.99 };
  if (base.owner === "robots") {
    if (base.rank === 1) return { texture: art.robot1, anchorX: 0.52, anchorY: 0.96 };
    if (base.rank === 2) return { texture: art.robot2, anchorX: 0.49, anchorY: 0.97 };
    return { texture: art.robot3, anchorX: 0.5, anchorY: 0.99 };
  }
  if (base.rank === 1) return { texture: art.human1, anchorX: 0.46, anchorY: 0.95 };
  if (base.rank === 2) return { texture: art.human2, anchorX: 0.5, anchorY: 0.98 };
  return { texture: art.human3, anchorX: 0.5, anchorY: 0.99 };
}

function drawBase(root: Container, grid: ReturnType<typeof createIsometricGrid>, game: GameState, base: GameState["bases"][number], art: GameArt): void {
  const { x, y } = tileCenter(grid, base.x, base.y);
  const color = base.owner === game.playerFaction ? 0xffbb39 : base.owner === game.botFaction ? 0xff5e83 : 0xffed91;
  const size = grid.tileWidth;
  const baseGlow = new Graphics();
  baseGlow.ellipse(x, y + grid.tileHeight * 0.35, size * 0.69, grid.tileHeight * 0.28)
    .fill({ color, alpha: 0.19 });
  root.addChild(baseGlow);

  const image = baseArt(base, art);
  const city = addWorldSprite(root, image.texture, x, y, size * 1.9, grid.tileHeight * (base.rank >= 3 && base.owner ? 5 : 3.35));
  city.anchor.set(image.anchorX, image.anchorY);
  if (base.rank >= 4 && base.owner) city.filters = [outline()];
}

function drawCaptureBadge(root: Container, grid: ReturnType<typeof createIsometricGrid>, game: GameState, base: GameState["bases"][number], art: GameArt, language: Props["language"], revealMap: boolean): void {
  const status = base.capture ?? base.captureResult;
  if (!status || (!revealMap && !game.tiles[base.y * game.size + base.x]?.explored && status.faction !== game.playerFaction)) return;
  const { x, y } = tileCenter(grid, base.x, base.y);
  const complete = !base.capture;
  const ready = Boolean(base.capture && base.capture.readyTurn <= game.turn && status.faction === game.playerFaction);
  const readyUnit = ready ? game.units.find((unit) => unit.id === base.capture?.unitId) : undefined;
  const canCapture = Boolean(readyUnit && !readyUnit.moved && !readyUnit.attacked);
  const label = complete
    ? (status.faction === "robots" ? (language === "ru" ? "СОКРАЩЕНИЕ" : "LAYOFF") : (language === "ru" ? "НАНЯТЫ" : "HIRED"))
    : ready
      ? (status.faction === "robots" ? (language === "ru" ? "СОКРАЩЕНИЕ" : "LAYOFF") : (language === "ru" ? "ПРИНЯТЬ ОФФЕР" : "ACCEPT OFFER"))
      : (status.faction === "robots" ? (language === "ru" ? "РЕСТРУКТУРИЗАЦИЯ" : "RESTRUCTURING") : (language === "ru" ? "СОБЕСЕДОВАНИЕ" : "INTERVIEW IN PROGRESS"));
  const scale = Math.max(12, grid.tileWidth * 0.8);
  const bob = canCapture ? Math.sin(performance.now() / 400) * grid.tileHeight * 0.15 : 0;
  const icon = new Sprite(status.faction === "robots" ? art.robotLayoff : art.hrNegotiation);
  icon.anchor.set(0.5, 1);
  icon.position.set(x, y - grid.tileHeight * 2.4 + bob);
  fitSprite(icon, scale * 1.5, scale * 1.5);
  if (canCapture) icon.filters = [outline()];
  root.addChild(icon);
  const text = new Text({ text: label, resolution: Math.max(3, (window.devicePixelRatio || 1) * 2.2), style: { fontFamily: "Arial", fontWeight: "bold", fontSize: Math.max(9, grid.tileWidth * 0.28), fill: 0xffffff, stroke: { color: 0x182043, width: 3 } } });
  text.anchor.set(0.5, 1);
  text.position.set(x, y - grid.tileHeight * 2.35 + bob);
  root.addChild(text);
}

function getUnitTexture(art: GameArt, unit: Unit): Texture {
  if (unit.kind === "courier") return unit.gender === "male" ? art.courierMan : art.courier;
  if (unit.kind === "drone") return art.robotDrone;
  if (unit.kind === "vacuum") return art.robotVacuum;
  if (unit.faction === "robots") return art.robotWorker;
  if (unit.kind === "senior") return art.seniorHipster;
  if (unit.kind === "middle") return unit.id.length % 2 === 0 ? art.hipsterWomanAlt : art.seniorHipster;
  return unit.id.length % 2 === 0 ? art.hipsterWoman : art.hipsterMan;
}

function unitAnchorY(unit: Unit): number {
  if (unit.kind === "courier") return 1;
  if (unit.kind === "workerBot") return 471 / 512;
  if (unit.kind === "drone") return 345 / 512;
  if (unit.kind === "vacuum") return 450 / 512;
  return 1;
}

function unitPlacement(
  grid: ReturnType<typeof createIsometricGrid>,
  game: GameState,
  unit: Unit,
  position: { x: number; y: number } = unit,
): { x: number; y: number; size: number; tileHeight: number } {
  const center = tileCenter(grid, position.x, position.y);
  const stack = game.units.filter((candidate) => candidate.x === unit.x && candidate.y === unit.y);
  const angle = stack.findIndex((candidate) => candidate.id === unit.id) / stack.length * Math.PI * 2;
  const radius = Math.min(Math.max(grid.tileWidth * 0.5, 6), grid.tileHeight * 1.7);
  return {
    x: center.x + (stack.length > 1 ? Math.cos(angle) * radius : 0),
    y: center.y + (stack.length > 1 ? Math.sin(angle) * radius * 0.65 : 0),
    size: Math.max(grid.tileWidth, 14),
    tileHeight: Math.max(grid.tileHeight, 7.5),
  };
}

function drawUnit(
  root: Container,
  grid: ReturnType<typeof createIsometricGrid>,
  unit: Unit,
  game: GameState,
  art: GameArt,
  attackable: boolean,
  position?: { x: number; y: number },
  forceVisible = false,
): void {
  const tile = game.tiles[unit.y * game.size + unit.x];
  if (!tile || (!forceVisible && !tile.explored && unit.faction !== game.playerFaction)) return;

  const { x, y, size, tileHeight: unitTileHeight } = unitPlacement(grid, game, unit, position);
  const character = new Sprite(getUnitTexture(art, unit));
  character.anchor.set(0.5, unitAnchorY(unit));
  character.position.set(x, y);
  fitSprite(character, size * 1.35, unitTileHeight * 2.8);
  if (attackable) character.tint = 0xff5555;
  else if (unit.faction === game.playerFaction && unit.moved) character.tint = 0x888888;

  if (attackable) {
    const target = new Graphics();
    target.ellipse(x, y, size * 0.48, unitTileHeight * 0.25)
      .fill({ color: 0xff2020, alpha: 0.45 })
      .stroke({ color: 0xff3434, width: Math.max(2, size * 0.1) });
    root.addChild(target);
  }
  const characterDetails = new Graphics();
  characterDetails.ellipse(x, y, size * 0.33, unitTileHeight * 0.15)
    .fill({ color: 0x13263a, alpha: 0.45 });

  const isHuman = unit.faction === game.playerFaction;
  if (!isHuman) {
    characterDetails.circle(x, y, Math.max(1.3, size * 0.07))
      .fill({ color: 0xff525c });
  }
  root.addChild(characterDetails);
  if (!attackable && unit.faction === game.playerFaction && !unit.moved) character.filters = [outline()];
  if (unit.coffeeBoostTurn === game.turn && !unit.moved) {
    const wind = new Graphics();
    for (let i = 0; i < 3; i++) {
      const shift = (performance.now() / 12 + i * size * 0.45) % (size * 1.8);
      wind.moveTo(x - size + shift, y - unitTileHeight * (0.6 + i * 0.55))
        .lineTo(x - size + shift + size * 0.35, y - unitTileHeight * (0.6 + i * 0.55))
        .stroke({ color: 0xb7f7ff, alpha: 0.8, width: Math.max(1, size * 0.05) });
    }
    root.addChild(wind);
  }
  root.addChild(character);
  const healthWidth = Math.max(6, size * 0.63);
  const health = new Graphics();
  health.roundRect(x - healthWidth / 2, y + unitTileHeight * 0.55, healthWidth, Math.max(1.1, size * 0.055), 1)
    .fill({ color: 0x183040 });
  health.roundRect(
    x - healthWidth / 2,
    y + unitTileHeight * 0.55,
    healthWidth * (unit.hp / UNIT_DEFINITIONS[unit.kind].maxHp),
    Math.max(1.1, size * 0.055),
    1,
  ).fill({ color: isHuman ? 0xffdf68 : 0x63ffe1 });
  root.addChild(health);
}

type ActiveCombat = { event: CombatEvent; started: number };
type ActiveResource = { event: ResourceEvent; started: number };
type ActiveIncome = { event: IncomeEvent; started: number };
type Transformation = { started: number; previous: Base };
const COMBAT_DURATION = 900;
const RESOURCE_DURATION = 1700;

function drawResourceEffect(root: Container, grid: ReturnType<typeof createIsometricGrid>, game: GameState, active: ActiveResource, now: number): void {
  const progress = (now - active.started) / RESOURCE_DURATION;
  const target = tileCenter(grid, active.event.x, active.event.y);
  const base = game.bases.find((entry) => entry.id === active.event.baseId);
  const effect = new Graphics();
  if (progress < 0.65) {
    const t = progress / 0.65;
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      const radius = grid.tileWidth * (0.25 + t * 0.65);
      effect.circle(target.x + Math.cos(angle) * radius, target.y - grid.tileHeight + Math.sin(angle) * radius * 0.5, grid.tileWidth * (0.18 + t * 0.16))
        .fill({ color: 0xffffff, alpha: 0.8 * (1 - t) });
    }
  }
  if (base && progress >= 0.48) {
    const destination = tileCenter(grid, base.x, base.y);
    const t = Math.min(1, (progress - 0.48) / 0.45);
    for (let i = 0; i < active.event.progress; i++) {
      const phase = Math.max(0, Math.min(1, t - i * 0.07));
      effect.star(target.x + (destination.x - target.x) * phase, target.y + (destination.y - target.y) * phase - Math.sin(phase * Math.PI) * 20, 5, 5)
        .fill({ color: 0xffec83, alpha: 1 - phase * 0.5 });
    }
  }
  root.addChild(effect);
}

function drawIncomeEffect(root: Container, grid: ReturnType<typeof createIsometricGrid>, active: ActiveIncome, wallet: { x: number; y: number }, now: number): void {
  const progress = (now - active.started) / RESOURCE_DURATION;
  const source = tileCenter(grid, active.event.x, active.event.y);
  const coins = new Graphics();
  for (let i = 0; i < Math.min(active.event.amount, 5); i++) {
    const t = Math.max(0, Math.min(1, (progress - i * 0.06) / 0.7));
    if (t <= 0 || t >= 1) continue;
    coins.circle(source.x + (wallet.x - source.x) * t, source.y + (wallet.y - source.y) * t - Math.sin(t * Math.PI) * 35, 4)
      .fill({ color: 0xffd25c }).stroke({ color: 0x8c5c24, width: 1.5 });
  }
  root.addChild(coins);
}

function drawCombat(
  root: Container,
  grid: ReturnType<typeof createIsometricGrid>,
  game: GameState,
  art: GameArt,
  event: CombatEvent,
  progress: number,
  language: Props["language"],
): void {
  const { attacker, defender } = event;
  const melee = attacker.kind !== "courier" && attacker.kind !== "drone" && gridDistance(attacker, defender) === 1;
  const lunge = melee ? Math.sin(Math.PI * Math.min(progress / 0.75, 1)) * 0.55 : 0;
  const attackerPosition = {
    x: attacker.x + (defender.x - attacker.x) * lunge,
    y: attacker.y + (defender.y - attacker.y) * lunge,
  };
  drawUnit(root, grid, defender, game, art, false, defender, true);
  drawUnit(root, grid, attacker, game, art, false, attackerPosition, true);
  if (event.counterattack) {
    const point = tileCenter(grid, attacker.x, attacker.y);
    const caption = new Text({ text: language === "ru" ? "ОТВЕТНЫЙ УДАР" : "COUNTERATTACK", resolution: Math.max(3, (window.devicePixelRatio || 1) * 2.2), style: { fontFamily: "Arial", fontWeight: "bold", fontSize: Math.max(9, grid.tileWidth * 0.25), fill: 0xffffff, stroke: { color: 0x182043, width: 3 } } });
    caption.anchor.set(0.5, 1);
    caption.position.set(point.x, point.y - grid.tileHeight * 3);
    root.addChild(caption);
  }

  const from = unitPlacement(grid, game, attacker, attackerPosition);
  const to = unitPlacement(grid, game, defender);
  const iconSize = Math.max(5, grid.tileWidth * 0.3);
  if ((attacker.faction === "robots" || attacker.kind === "courier") && progress < 0.68) {
    const travel = Math.min(1, progress / 0.6);
    const x = from.x + (to.x - from.x) * travel;
    const y = from.y + (to.y - from.y) * travel - grid.tileHeight * 0.85 - Math.sin(travel * Math.PI) * grid.tileHeight;
    if (attacker.kind === "courier") {
      const latte = new Sprite(art.icedLatte);
      latte.anchor.set(0.5);
      latte.position.set(x, y);
      fitSprite(latte, iconSize * 1.8, iconSize * 2.5);
      root.addChild(latte);
    } else {
      for (let i = 0; i < 12; i++) {
        const random = (offset: number) => {
          const value = Math.sin(event.id * 83.3 + i * 19.17 + offset * 31.7) * 43758.5453;
          return value - Math.floor(value);
        };
        const delay = random(1) * 0.17;
        const flight = Math.max(0, Math.min(1, (progress - delay) / (0.6 - delay)));
        const spread = Math.sin(flight * Math.PI);
        const binary = new Text({ text: random(2) > 0.5 ? "1" : "0", resolution: Math.max(3, (window.devicePixelRatio || 1) * 2.2), style: { fontFamily: "monospace", fontWeight: "bold", fontSize: Math.max(8, iconSize * (0.7 + random(3) * 0.5)), fill: 0x48faff, stroke: { color: 0x0b3564, width: 2 } } });
        binary.anchor.set(0.5);
        binary.position.set(from.x + (to.x - from.x) * flight + (random(4) - 0.5) * grid.tileWidth * spread,
          from.y + (to.y - from.y) * flight - grid.tileHeight * 0.85 + (random(5) - 0.8) * grid.tileHeight * 2 * spread);
        binary.alpha = flight > 0 && flight < 1 ? 1 : 0;
        root.addChild(binary);
      }
    }
  }
  const impact = melee ? 0.38 : 0.6;
  if (progress >= impact) {
    const fade = Math.min(1, (1 - progress) / 0.2);
    const effects = new Graphics();
    effects.alpha = fade;
    if (defender.faction === "robots") {
      for (let i = 0; i < 8; i++) {
        const random = (offset: number) => {
          const value = Math.sin(event.id * 83.3 + i * 19.17 + offset * 31.7) * 43758.5453;
          return value - Math.floor(value);
        };
        const start = impact + random(1) * (1 - impact) * 0.65;
        const life = (progress - start) / (0.1 + random(2) * 0.15);
        if (life < 0 || life > 1) continue;
        const spark = new Sprite(art.electricSpark);
        spark.anchor.set(0.5);
        spark.position.set(to.x + (random(3) - 0.5) * grid.tileWidth,
          to.y - random(4) * grid.tileHeight * 2);
        spark.rotation = (random(5) - 0.5) * 2;
        spark.alpha = Math.sin(life * Math.PI) * fade;
        fitSprite(spark, iconSize * 1.5, iconSize * 1.5);
        root.addChild(spark);
      }
    } else {
      const x = to.x + iconSize;
      const y = to.y - grid.tileHeight * 2.4 - (progress - impact) * iconSize;
      const r = iconSize * 0.65;
      effects.circle(x, y, r).fill(0xffe66d).stroke({ color: 0x7d4a2d, width: Math.max(1, r * 0.1) });
      effects.circle(x - r * 0.32, y - r * 0.15, r * 0.09).fill(0x523b31);
      effects.circle(x + r * 0.32, y - r * 0.15, r * 0.09).fill(0x523b31);
      effects.moveTo(x - r * 0.35, y + r * 0.45).quadraticCurveTo(x, y + r * 0.05, x + r * 0.35, y + r * 0.45)
        .stroke({ color: 0x523b31, width: Math.max(1, r * 0.12) });
    }
    root.addChild(effects);
  }
}

function drawLatest(
  root: Container,
  app: Application,
  game: GameState,
  selected: Props["selected"],
  selectedUnitId: Props["selectedUnitId"],
  art: GameArt,
  zoom = 1.35,
  animatedPositions: Map<string, { x: number; y: number }> = new Map(),
  pan = { x: 0, y: 0 },
  combat?: { event: CombatEvent; progress: number },
  selectedCityId: string | null = null,
  language: Props["language"] = "en",
  transformations: Map<string, Transformation> = new Map(),
  revealMap = false,
  activeResources: ActiveResource[] = [],
  activeIncome: ActiveIncome[] = [],
  wallet = { x: app.screen.width, y: 0 },
): void {
  root.removeChildren().forEach((child) => child.destroy({ children: true }));
  root.pivot.set(app.screen.width / 2, app.screen.height / 2);
  root.position.set(app.screen.width / 2 + pan.x, app.screen.height / 2 + pan.y);
  root.scale.set(zoom);
  const grid = createIsometricGrid(app.screen.width, app.screen.height, game.size);
  const tiles = [...game.tiles].sort((a, b) => a.x + a.y - b.x - b.y);
  tiles.forEach((tile, index) => drawTile(root, grid, game, tile, index, art, revealMap));
  const city = game.bases.find((base) => base.id === selectedCityId && base.owner === game.playerFaction);
  if (city) {
    for (const tile of game.tiles) {
      if (!canHarvestWithinCity(city, tile)) continue;
      const { x, y } = tileCenter(grid, tile.x, tile.y);
      const outline = new Graphics();
      const vertices = [
        { x, y: y - grid.tileHeight },
        { x: x + grid.tileWidth, y },
        { x, y: y + grid.tileHeight },
        { x: x - grid.tileWidth, y },
      ];
      const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (let edge = 0; edge < 4; edge++) {
        const [dx, dy] = neighbors[edge];
        const neighbor = { x: tile.x + dx, y: tile.y + dy };
        if (neighbor.x >= 0 && neighbor.y >= 0 && neighbor.x < game.size && neighbor.y < game.size
          && canHarvestWithinCity(city, neighbor)) continue;
        const start = vertices[edge];
        const end = vertices[(edge + 1) % 4];
        outline.moveTo(start.x, start.y).lineTo(end.x, end.y)
          .stroke({ color: 0xffe26e, alpha: 0.95, width: Math.max(1.5, grid.tileWidth * 0.08) });
      }
      root.addChild(outline);
    }
  }
  tiles.forEach((tile, index) => drawTileDetails(root, grid, game, tile, index, art, revealMap));

  const playerUnit = game.units.find((unit) => unit.id === selectedUnitId && unit.faction === game.playerFaction);
  if (selected) {
    const canMove = !city && playerUnit && !playerUnit.moved;
    if (canMove) {
      for (const tile of game.tiles) {
        const distance = gridDistance(tile, playerUnit);
        const occupied = game.units.some((unit) => unit.x === tile.x && unit.y === tile.y);
        if (distance === 0 || distance > movementRange(game, playerUnit) || occupied || tile.terrain === "water" || !tile.visible) continue;
        if (!shortestPath(game, playerUnit, tile, movementRange(game, playerUnit))) continue;
        const { x, y } = tileCenter(grid, tile.x, tile.y);
        const marker = new Graphics();
        polygon(marker, diamond(x, y, grid.tileWidth * 0.55, grid.tileHeight * 0.55), 0x67efff, 0.45);
        marker.poly(diamond(x, y, grid.tileWidth * 0.55, grid.tileHeight * 0.55))
          .stroke({ color: 0x9dffff, width: Math.max(0.8, grid.tileWidth * 0.04), alpha: 0.93 });
        root.addChild(marker);
      }
    }

    const center = tileCenter(grid, selected.x, selected.y);
    const marker = new Graphics();
    marker.poly(diamond(center.x, center.y, grid.tileWidth * 0.94, grid.tileHeight * 0.94))
      .stroke({ color: 0xffffff, alpha: 0.94, width: Math.max(1.5, grid.tileWidth * 0.07) });
    root.addChild(marker);
  }

  for (const base of game.bases) {
    const transformation = transformations.get(base.id);
    const progress = transformation ? Math.min(1, (performance.now() - transformation.started) / 1200) : 1;
    if (revealMap || game.tiles[base.y * game.size + base.x]?.explored || base.owner === game.playerFaction) {
      drawBase(root, grid, game, transformation && progress < 0.5 ? transformation.previous : base, art);
    }
    if (transformation && (revealMap || game.tiles[base.y * game.size + base.x]?.explored)) {
      const { x, y } = tileCenter(grid, base.x, base.y);
      const fireworks = addWorldSprite(root, art.fireworks, x, y + grid.tileHeight * 0.4, grid.tileWidth * 4.5, grid.tileHeight * 7);
      fireworks.alpha = Math.min(1, progress * 5, (1 - progress) * 3);
    }
  }
  for (const unit of game.units) {
    if (combat && (unit.id === combat.event.attacker.id || unit.id === combat.event.defender.id)) continue;
    const attackable = Boolean(playerUnit && canAttack(game, playerUnit, unit));
    drawUnit(root, grid, unit, game, art, attackable, animatedPositions.get(unit.id), revealMap);
    if (attackable && playerUnit && damage(playerUnit, unit, game) >= unit.hp) {
      const { x, y, size, tileHeight } = unitPlacement(grid, game, unit);
      for (let i = 0; i < 4; i++) {
        const cycle = (performance.now() / 750 + i * 0.27) % 1;
        const drop = new Sprite(art.sweat);
        drop.anchor.set(0.5);
        drop.position.set(x + Math.sin(i * 83 + Math.floor(performance.now() / 750) * 7) * size * 0.4, y - tileHeight * (2.6 - cycle * 1.8));
        fitSprite(drop, size * 0.22, tileHeight * 0.55);
        drop.alpha = Math.sin(cycle * Math.PI);
        root.addChild(drop);
      }
    }
  }
  for (const coffee of game.coffeeBreaks) {
    const unit = game.units.find((candidate) => candidate.id === coffee.unitId
      && candidate.faction === game.playerFaction && candidate.x === coffee.x && candidate.y === coffee.y);
    if (!unit || game.turn < coffee.readyTurn) continue;
    const { x, y } = tileCenter(grid, coffee.x, coffee.y);
    const icon = addWorldSprite(root, art.icedLatte, x, y - grid.tileHeight * 3 + Math.sin(performance.now() / 400) * grid.tileHeight * 0.15, grid.tileWidth, grid.tileHeight * 2);
    icon.filters = [outline()];
  }
  for (const visit of game.coinVisits) {
    const unit = game.units.find((candidate) => candidate.id === visit.unitId && candidate.faction === game.playerFaction
      && candidate.x === visit.x && candidate.y === visit.y);
    if (!unit || game.turn < visit.readyTurn || unit.moved || unit.attacked) continue;
    const { x, y } = tileCenter(grid, visit.x, visit.y);
    const icon = addWorldSprite(root, art.treasury, x, y - grid.tileHeight * 3 + Math.sin(performance.now() / 400) * grid.tileHeight * 0.15, grid.tileWidth * 0.65, grid.tileHeight * 1.3);
    icon.filters = [outline()];
  }
  if (combat) drawCombat(root, grid, game, art, combat.event, combat.progress, language);
  for (const base of game.bases) drawCaptureBadge(root, grid, game, base, art, language, revealMap);
  for (const resource of activeResources) drawResourceEffect(root, grid, game, resource, performance.now());
  for (const income of activeIncome) drawIncomeEffect(root, grid, income, wallet, performance.now());
}

export default function MapView({ game, selected, selectedUnitId, selectedCityId, language, revealMap, combatEvents, resourceEvents, incomeEvents, onTileClick, onCapture, onCollectCoins }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const rootRef = useRef<Container | null>(null);
  const callbackRef = useRef(onTileClick);
  const captureRef = useRef(onCapture);
  const collectCoinsRef = useRef(onCollectCoins);
  const selectedRef = useRef(selected);
  const selectedUnitIdRef = useRef(selectedUnitId);
  const selectedCityIdRef = useRef(selectedCityId);
  const languageRef = useRef(language);
  const revealMapRef = useRef(revealMap);
  const gameRef = useRef(game);
  const artRef = useRef<GameArt | null>(null);
  const zoomRef = useRef(1.35);
  const zoomSetterRef = useRef<(zoom: number) => void>(() => undefined);
  const previousUnitsRef = useRef(new Map<string, { x: number; y: number }>());
  const previousBasesRef = useRef(new Map<string, Base>());
  const transformationsRef = useRef(new Map<string, Transformation>());
  const animationsRef = useRef(new Map<string, { from: { x: number; y: number }; to: { x: number; y: number }; started: number }>());
  const combatQueueRef = useRef<CombatEvent[]>([]);
  const activeCombatRef = useRef<ActiveCombat | null>(null);
  const lastCombatIdRef = useRef(0);
  const lastResourceIdRef = useRef(0);
  const activeResourcesRef = useRef<ActiveResource[]>([]);
  const lastIncomeIdRef = useRef(0);
  const activeIncomeRef = useRef<ActiveIncome[]>([]);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const [zoom, setZoom] = useState(1.35);
  const [ready, setReady] = useState(false);
  const [clouds] = useState(() => Array.from({ length: 6 }, () => ({
    top: `${Math.round(Math.random() * 85)}%`,
    width: `${10 + Math.round(Math.random() * 10)}%`,
    animationDuration: `${60 + Math.round(Math.random() * 50)}s`,
    animationDelay: `${-Math.round(Math.random() * 100)}s`,
  })));

  useEffect(() => { callbackRef.current = onTileClick; }, [onTileClick]);
  useEffect(() => { captureRef.current = onCapture; }, [onCapture]);
  useEffect(() => { collectCoinsRef.current = onCollectCoins; }, [onCollectCoins]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { selectedUnitIdRef.current = selectedUnitId; }, [selectedUnitId]);
  useEffect(() => { selectedCityIdRef.current = selectedCityId; }, [selectedCityId]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { revealMapRef.current = revealMap; }, [revealMap]);
  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { zoomSetterRef.current = setZoom; }, []);

  useEffect(() => {
    const incoming = combatEvents.filter((event) => event.id > lastCombatIdRef.current);
    if (incoming.length) {
      combatQueueRef.current.push(...incoming);
      lastCombatIdRef.current = incoming[incoming.length - 1].id;
    }
  }, [combatEvents]);

  useEffect(() => {
    const incoming = resourceEvents.filter((event) => event.id > lastResourceIdRef.current);
    if (incoming.length) {
      activeResourcesRef.current.push(...incoming.map((event) => ({ event, started: performance.now() })));
      lastResourceIdRef.current = incoming[incoming.length - 1].id;
    }
  }, [resourceEvents]);

  useEffect(() => {
    const incoming = incomeEvents.filter((event) => event.id > lastIncomeIdRef.current);
    if (incoming.length) {
      activeIncomeRef.current.push(...incoming.map((event) => ({ event, started: performance.now() })));
      lastIncomeIdRef.current = incoming[incoming.length - 1].id;
    }
  }, [incomeEvents]);

  useEffect(() => {
    const previous = previousUnitsRef.current;
    const now = performance.now();
    for (const unit of game.units) {
      const oldPosition = previous.get(unit.id);
      if (oldPosition && (oldPosition.x !== unit.x || oldPosition.y !== unit.y)) {
        animationsRef.current.set(unit.id, { from: oldPosition, to: { x: unit.x, y: unit.y }, started: now });
      }
    }
    previousUnitsRef.current = new Map(game.units.map((unit) => [unit.id, { x: unit.x, y: unit.y }]));
    for (const base of game.bases) {
      const previous = previousBasesRef.current.get(base.id);
      if (previous && (previous.owner !== base.owner || previous.rank !== base.rank) && game.tiles[base.y * game.size + base.x]?.explored) {
        transformationsRef.current.set(base.id, { started: now, previous });
      }
    }
    previousBasesRef.current = new Map(game.bases.map((base) => [base.id, { ...base }]));
  }, [game]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    let root: Container | null = null;
    const app = new Application();

    const draw = () => {
      const currentRoot = rootRef.current;
      const currentApp = appRef.current;
      if (currentRoot && currentApp && artRef.current) {
        drawLatest(currentRoot, currentApp, gameRef.current, selectedRef.current, selectedUnitIdRef.current, artRef.current, zoomRef.current, new Map(), panRef.current, undefined, selectedCityIdRef.current, languageRef.current, transformationsRef.current, revealMapRef.current);
      }
    };

    const handleClick = (event: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag?.moved) return;
      const width = app.screen.width;
      const height = app.screen.height;
      const currentGame = gameRef.current;
      const grid = createIsometricGrid(width, height, currentGame.size);
      const point = {
        x: event.offsetX * width / app.canvas.clientWidth,
        y: event.offsetY * height / app.canvas.clientHeight,
      };
      const centerX = width / 2;
      const centerY = height / 2;
      const unscaledPoint = {
        x: (point.x - centerX - panRef.current.x) / zoomRef.current + centerX,
        y: (point.y - centerY - panRef.current.y) / zoomRef.current + centerY,
      };
      const coinVisit = currentGame.coinVisits.find((entry) => {
        const unit = currentGame.units.find((candidate) => candidate.id === entry.unitId && candidate.faction === currentGame.playerFaction
          && candidate.x === entry.x && candidate.y === entry.y && !candidate.moved && !candidate.attacked);
        if (!unit || entry.readyTurn > currentGame.turn) return false;
        const { x, y } = tileCenter(grid, entry.x, entry.y);
        const bottom = y - grid.tileHeight * 3 + Math.sin(performance.now() / 400) * grid.tileHeight * 0.15;
        return Math.abs(unscaledPoint.x - x) <= grid.tileWidth / 2
          && unscaledPoint.y >= bottom - grid.tileHeight * 2 && unscaledPoint.y <= bottom;
      });
      if (coinVisit) {
        collectCoinsRef.current(coinVisit.unitId);
        return;
      }
      const coffee = currentGame.coffeeBreaks.find((entry) => {
        if (entry.readyTurn > currentGame.turn) return false;
        const unit = currentGame.units.find((candidate) => candidate.id === entry.unitId
          && candidate.faction === currentGame.playerFaction && candidate.x === entry.x && candidate.y === entry.y);
        if (!unit) return false;
        const { x, y } = tileCenter(grid, entry.x, entry.y);
        const bottom = y - grid.tileHeight * 3 + Math.sin(performance.now() / 400) * grid.tileHeight * 0.15;
        return Math.abs(unscaledPoint.x - x) <= grid.tileWidth / 2
          && unscaledPoint.y >= bottom - grid.tileHeight * 2 && unscaledPoint.y <= bottom;
      });
      if (coffee) {
        callbackRef.current(coffee.x, coffee.y);
        return;
      }
      const capture = currentGame.bases.find((base) => {
        if (!base.capture || base.capture.faction !== currentGame.playerFaction || base.capture.readyTurn > currentGame.turn) return false;
        const unit = currentGame.units.find((candidate) => candidate.id === base.capture?.unitId
          && candidate.x === base.x && candidate.y === base.y);
        if (!unit || unit.moved || unit.attacked) return false;
        const { x, y } = tileCenter(grid, base.x, base.y);
        const scale = Math.max(12, grid.tileWidth * 0.8) * 1.5;
        const bob = Math.sin(performance.now() / 400) * grid.tileHeight * 0.15;
        return Math.abs(unscaledPoint.x - x) <= Math.max(scale / 2, grid.tileWidth * 1.8)
          && unscaledPoint.y >= y - grid.tileHeight * 2.4 - scale + bob
          && unscaledPoint.y <= y - grid.tileHeight * 2.35 + bob;
      });
      if (capture?.capture) {
        captureRef.current(capture.id, capture.capture.unitId);
        return;
      }
      const attacker = currentGame.units.find((unit) => unit.id === selectedUnitIdRef.current && unit.faction === currentGame.playerFaction);
      if (attacker && artRef.current) {
        const target = [...currentGame.units].reverse().find((unit) => {
          if (!canAttack(currentGame, attacker, unit)) return false;
          const { x, y, size, tileHeight } = unitPlacement(grid, currentGame, unit);
          const texture = getUnitTexture(artRef.current!, unit);
          const scale = Math.min(size * 1.35 / texture.width, tileHeight * 2.8 / texture.height);
          return Math.abs(unscaledPoint.x - x) <= texture.width * scale / 2
            && unscaledPoint.y >= y - texture.height * scale * unitAnchorY(unit)
            && unscaledPoint.y <= y + texture.height * scale * (1 - unitAnchorY(unit));
        });
        if (target) {
          callbackRef.current(target.x, target.y);
          return;
        }
      }
      const tile = screenToTile(grid, unscaledPoint);
      if (!selectedUnitIdRef.current && artRef.current
        && (!tile || (!currentGame.tiles[tile.y * currentGame.size + tile.x]?.poi
          && !resourceCity(currentGame, currentGame.tiles[tile.y * currentGame.size + tile.x])))
        && (!tile || !currentGame.units.some((unit) => unit.x === tile.x && unit.y === tile.y
          && (unit.faction === currentGame.playerFaction || currentGame.tiles[tile.y * currentGame.size + tile.x]?.explored)))) {
        const art = artRef.current;
        const hit = [...currentGame.bases].reverse().find((base) => {
          if (!revealMapRef.current && !currentGame.tiles[base.y * currentGame.size + base.x]?.explored && base.owner !== currentGame.playerFaction) return false;
          const image = baseArt(base, art);
          const scale = Math.min(grid.tileWidth * 1.9 / image.texture.width,
            grid.tileHeight * (base.rank >= 3 && base.owner ? 5 : 3.35) / image.texture.height);
          const width = image.texture.width * scale, height = image.texture.height * scale;
          const center = tileCenter(grid, base.x, base.y);
          return unscaledPoint.x >= center.x - width * image.anchorX && unscaledPoint.x <= center.x + width * (1 - image.anchorX)
            && unscaledPoint.y >= center.y - height * image.anchorY && unscaledPoint.y <= center.y + height * (1 - image.anchorY);
        });
        if (hit) {
          callbackRef.current(hit.x, hit.y);
          return;
        }
      }
      if (tile) callbackRef.current(tile.x, tile.y);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      app.canvas.setPointerCapture(event.pointerId);
      dragRef.current = {
        x: event.clientX,
        y: event.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
        moved: false,
      };
    };
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !(event.buttons & 1)) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      panRef.current = { x: drag.panX + dx, y: drag.panY + dy };
      draw();
    };
    const handlePointerCancel = () => { dragRef.current = null; };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        zoomSetterRef.current(Math.min(2.2, Math.max(1, zoomRef.current + (event.deltaY < 0 ? 0.1 : -0.1))));
      } else {
        const factor = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? app.screen.height : 1;
        panRef.current = { x: panRef.current.x - event.deltaX * factor, y: panRef.current.y - event.deltaY * factor };
        draw();
      }
    };

    const initialize = async () => {
      await app.init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (!active) {
        app.destroy(true, { children: true });
        return;
      }
      const art = await loadGameArt();
      if (!active) {
        app.destroy(true, { children: true });
        return;
      }
      artRef.current = art;
      appRef.current = app;
      host.appendChild(app.canvas);
      root = new Container();
      app.stage.addChild(root);
      rootRef.current = root;
      app.canvas.setAttribute("aria-label", "Яркая изометрическая карта. Нажмите на клетку, чтобы выбрать или переместить фигуру.");
      app.canvas.addEventListener("pointerup", handleClick);
      app.canvas.addEventListener("pointerdown", handlePointerDown);
      app.canvas.addEventListener("pointermove", handlePointerMove);
      app.canvas.addEventListener("pointercancel", handlePointerCancel);
      host.addEventListener("wheel", handleWheel, { passive: false });
      draw();
      setReady(true);
    };

    initialize().catch((error: unknown) => {
      if (active) host.dataset.error = error instanceof Error ? `Не удалось загрузить игровой ресурс: ${error.message}` : "Не удалось загрузить игровые ресурсы.";
    });
    const observer = new ResizeObserver(draw);
    observer.observe(host);
    return () => {
      active = false;
      observer.disconnect();
      host.removeEventListener("wheel", handleWheel);
      if (appRef.current) {
        appRef.current.canvas.removeEventListener("pointerup", handleClick);
        appRef.current.canvas.removeEventListener("pointerdown", handlePointerDown);
        appRef.current.canvas.removeEventListener("pointermove", handlePointerMove);
        appRef.current.canvas.removeEventListener("pointercancel", handlePointerCancel);
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
        rootRef.current = null;
        artRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const app = appRef.current;
    if (!root || !app) return;
    const attacker = game.units.find((unit) => unit.id === selectedUnitId && unit.faction === game.playerFaction);
    const lethal = Boolean(attacker && game.units.some((target) => canAttack(game, attacker, target) && damage(attacker, target, game) >= target.hp));
    const idleAnimation = game.units.some((unit) => unit.faction === game.playerFaction && (
      (unit.coffeeBoostTurn === game.turn && !unit.moved)
      || game.coffeeBreaks.some((entry) => entry.unitId === unit.id && entry.readyTurn <= game.turn && entry.x === unit.x && entry.y === unit.y)
      || game.coinVisits.some((entry) => entry.unitId === unit.id && entry.readyTurn <= game.turn && entry.x === unit.x && entry.y === unit.y && !unit.moved && !unit.attacked)
      || game.bases.some((base) => base.capture?.unitId === unit.id && base.capture.readyTurn <= game.turn && !unit.moved && !unit.attacked)
    ));
    if (!animationsRef.current.size && !combatQueueRef.current.length && !activeCombatRef.current && !transformationsRef.current.size && !activeResourcesRef.current.length && !activeIncomeRef.current.length && !lethal && !idleAnimation) {
      if (artRef.current) drawLatest(root, app, game, selected, selectedUnitId, artRef.current, zoom, new Map(), panRef.current, undefined, selectedCityId, language, new Map(), revealMap);
      return;
    }
    let lastDraw = 0;
    const tick = () => {
      const now = performance.now();
      activeResourcesRef.current = activeResourcesRef.current.filter((entry) => now - entry.started < RESOURCE_DURATION);
      activeIncomeRef.current = activeIncomeRef.current.filter((entry) => now - entry.started < RESOURCE_DURATION);
      if (now - lastDraw < 33) return;
      lastDraw = now;
      for (const [id, transformation] of transformationsRef.current) {
        if (now - transformation.started >= 1200) transformationsRef.current.delete(id);
      }
      if (!activeCombatRef.current && combatQueueRef.current.length) {
        activeCombatRef.current = { event: combatQueueRef.current.shift()!, started: now };
      }
      const activeCombat = activeCombatRef.current;
      const combat = activeCombat ? { event: activeCombat.event, progress: Math.min(1, (now - activeCombat.started) / COMBAT_DURATION) } : undefined;
      const positions = new Map<string, { x: number; y: number }>();
      for (const [id, animation] of animationsRef.current) {
        const progress = Math.min(1, (now - animation.started) / 320);
        const eased = 1 - (1 - progress) ** 3;
        positions.set(id, {
          x: animation.from.x + (animation.to.x - animation.from.x) * eased,
          y: animation.from.y + (animation.to.y - animation.from.y) * eased,
        });
        if (progress === 1) animationsRef.current.delete(id);
      }
      const walletRect = document.querySelector(".wallet")?.getBoundingClientRect();
      const hostRect = hostRef.current?.getBoundingClientRect();
      const wallet = walletRect && hostRect ? {
        x: ((walletRect.left + walletRect.width / 2 - hostRect.left) * app.screen.width / hostRect.width - app.screen.width / 2 - panRef.current.x) / zoomRef.current + app.screen.width / 2,
        y: ((walletRect.top + walletRect.height / 2 - hostRect.top) * app.screen.height / hostRect.height - app.screen.height / 2 - panRef.current.y) / zoomRef.current + app.screen.height / 2,
      } : { x: app.screen.width, y: 0 };
      if (artRef.current) drawLatest(root, app, gameRef.current, selectedRef.current, selectedUnitIdRef.current, artRef.current, zoomRef.current, positions, panRef.current, combat, selectedCityIdRef.current, languageRef.current, transformationsRef.current, revealMapRef.current, activeResourcesRef.current, activeIncomeRef.current, wallet);
      if (combat?.progress === 1) activeCombatRef.current = null;
      if (!animationsRef.current.size && !combatQueueRef.current.length && !activeCombatRef.current && !transformationsRef.current.size && !activeResourcesRef.current.length && !activeIncomeRef.current.length && !lethal && !idleAnimation) {
        if (artRef.current) drawLatest(root, app, gameRef.current, selectedRef.current, selectedUnitIdRef.current, artRef.current, zoomRef.current, positions, panRef.current, undefined, selectedCityIdRef.current, languageRef.current, new Map(), revealMapRef.current);
        app.ticker.remove(tick);
      }
    };
    app.ticker.add(tick);
    return () => { app.ticker.remove(tick); };
  }, [game, selected, selectedUnitId, selectedCityId, language, zoom, combatEvents, resourceEvents, incomeEvents, ready, revealMap]);

  return <div className="map-canvas" ref={hostRef}>
    <div className="cloud-sky" aria-hidden="true">
      {clouds.map((cloud, index) => <img key={index} className="server-cloud" style={cloud} src="game-art/world/cloud-server.png" alt="" />)}
    </div>
    <div className="map-zoom-controls" aria-label="Map zoom">
      <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.1).toFixed(1))))}>−</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(2.2, Number((value + 0.1).toFixed(1))))}>+</button>
    </div>
  </div>;
}
