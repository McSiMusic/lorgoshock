"use client";

import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { OutlineFilter } from "pixi-filters";
import { createIsometricGrid, fleePosition, initialMapZoom, screenToTile, tileCenter } from "../game/isometric";
import { buildingKind, buildingLayout } from "../game/buildings";
import { BOT_FOCUS_DURATION, COMBAT_DURATION, FOG_REVEAL_DURATION, INCOME_DURATION, RESOURCE_ARRIVAL, RESOURCE_DURATION, TRANSFORMATION_DURATION, advancePosition, fogRevealAlpha, incomeCoinAmount, incomeCoinCount, incomeCoinProgress, resourceStarProgress, transformationFrame } from "../game/animation";
import { UNIT_DEFINITIONS, type Base, type CombatEvent, type GameState, type IncomeEvent, type MovementEvent, type ResourceEvent, type Terrain, type Unit } from "../game/model";
import { canAttack, canMoveTo, cityCapacity, cityOccupancy, damage, gridDistance, hasCover, hasUnitAction, resourceCity } from "../game/rules";
import { territoryEdges } from "../game/territory";
import { UNIT_ART_FILES, unitArtKey } from "../game/unitArt";

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
  movementEvents: MovementEvent[];
  focusTarget: { id: number; x: number; y: number } | null;
  onFocusArrived: (id: number) => void;
  onIncomeArrived: (id: number, amount: number, complete: boolean) => void;
  onResourceArrived: (id: number) => void;
  onAnimationsFinished: () => void;
  onTileClick: (x: number, y: number) => void;
  onSelectCoffee: (unitId: string) => void;
  onCapture: (baseId: string, unitId: string) => void;
  onCollectCoins: (unitId: string) => void;
};

const ART_FILES = {
  units: UNIT_ART_FILES,
  world: {
    meadowA: "world/meadow-a.png",
    meadowB: "world/meadow-b.png",
    forestA: "world/forest-a.png",
    forestB: "world/forest-b.png",
    mountainA: "world/mountain-a.png",
    mountainB: "world/mountain-b.png",
    waterA: "world/water-a.png",
    waterB: "world/water-b.png",
    workationFloats: "world/workation-floats.png",
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
    smoke: "world/upgrade-smoke.png",
    resourceStar: "world/resource-star.png",
    electricSpark: "world/electric-spark.png",
    hrNegotiation: "world/hr-negotiation.png",
    robotLayoff: "world/robot-layoff.png",
    bridgeHumanX: "world/bridge-human-x.png",
    bridgeHumanY: "world/bridge-human-y.png",
    bridgeRobotX: "world/bridge-robot-x.png",
    bridgeRobotY: "world/bridge-robot-y.png",
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
    whiteOutline.resolution = Math.max(2, (window.devicePixelRatio || 1) * 2);
  }
  return whiteOutline;
}

async function loadGameArt(onProgress: (progress: number) => void): Promise<GameArt> {
  const entries = Object.entries({ ...ART_FILES.units, ...ART_FILES.world });
  let loaded = 0;
  const textures = await Promise.all(entries.map(async ([name, file]) => {
    const url = new URL(`game-art/${file}`, window.location.href).href;
    const texture = await Assets.load<Texture>({ src: url, data: { autoGenerateMipmaps: true, scaleMode: "linear" } });
    onProgress(++loaded / entries.length);
    return [name, texture] as const;
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

  if (tile.terrain === "water" && tile.harvestedBy === "robots") {
    drawDriedLake(root, x, y, width, height, variant);
  } else {
    const terrainSprite = new Sprite(getTerrainTexture(art, tile.terrain, variant));
    terrainSprite.anchor.set(0.5);
    terrainSprite.position.set(x, y);
    fitSprite(terrainSprite, width * 2, height * 2);
    root.addChild(terrainSprite);
  }
}

function drawDriedLake(root: Container, x: number, y: number, width: number, height: number, variant: number): void {
  const lake = new Graphics();
  const tile = diamond(x, y, width, height);
  lake.poly(tile).fill(variant % 2 ? 0xb9a777 : 0xc6b583);
  lake.poly(diamond(x, y, width * 0.86, height * 0.82))
    .fill({ color: 0xd3c18d, alpha: 0.58 })
    .stroke({ color: 0x8e7950, alpha: 0.55, width: Math.max(0.4, width * 0.018) });
  for (let i = 0; i < 4; i++) {
    const offset = (variant + i * 3) % 4;
    const px = x + (offset - 1.5) * width * 0.15;
    const py = y + ((i % 2) - 0.5) * height * 0.42;
    lake.moveTo(px - width * 0.12, py)
      .lineTo(px - width * 0.04, py - height * 0.1)
      .lineTo(px + width * 0.02, py + height * 0.04)
      .lineTo(px + width * 0.12, py - height * 0.03)
      .stroke({ color: 0x927c50, alpha: 0.66, width: Math.max(0.45, width * 0.018) });
  }
  const puddles = [
    { x: x - width * 0.22, y: y - height * 0.1, rx: width * 0.12, ry: height * 0.095 },
    { x: x + width * 0.19, y: y + height * 0.18, rx: width * 0.09, ry: height * 0.07 },
    { x: x + (variant % 2 ? -1 : 1) * width * 0.04, y: y - height * 0.38, rx: width * 0.07, ry: height * 0.05 },
  ];
  for (const puddle of puddles) {
    lake.ellipse(puddle.x, puddle.y, puddle.rx * 1.5, puddle.ry * 1.5)
      .fill({ color: 0xe2d09c, alpha: 0.8 });
    lake.ellipse(puddle.x, puddle.y, puddle.rx, puddle.ry)
      .fill({ color: 0x6da8a0, alpha: 0.88 })
      .stroke({ color: 0xeee0b0, alpha: 0.75, width: Math.max(0.5, width * 0.02) });
  }
  root.addChild(lake);
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
  if (tile.terrain === "water" && tile.poiClaimed && !tile.bridge && (tile.harvestedBy ?? game.playerFaction) === "lorgoshki") {
    addWorldSprite(root, art.workationFloats, x, y + height * 0.6, width * 1.8, height * 1.7);
  }
  if (tile.bridge) {
    const bridgeArt = tile.bridge.faction === "robots"
      ? tile.bridge.axis === "x" ? art.bridgeRobotX : art.bridgeRobotY
      : tile.bridge.axis === "x" ? art.bridgeHumanX : art.bridgeHumanY;
    const bridge = new Sprite(bridgeArt);
    bridge.anchor.set(0.5);
    bridge.position.set(x, y);
    fitSprite(bridge, width * 2, height * 2);
    root.addChild(bridge);
  }
  if (tile.poi && !tile.poiClaimed) {
    if (tile.poi === "coffee") {
      const layout = buildingLayout("coffee", art.coffee, width, height);
      const sprite = new Sprite(art.coffee);
      sprite.anchor.set(layout.anchorX, layout.anchorY);
      sprite.position.set(x, y);
      sprite.scale.set(layout.scale);
      root.addChild(sprite);
    } else {
      addWorldSprite(root, art.treasury, x, y + height * 0.42, width * 0.8, height * 1.2);
    }
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

function drawBase(root: Container, grid: ReturnType<typeof createIsometricGrid>, game: GameState, base: GameState["bases"][number], art: GameArt): void {
  const { x, y } = tileCenter(grid, base.x, base.y);
  const color = base.owner === game.playerFaction ? 0xffbb39 : base.owner === game.botFaction ? 0xff5e83 : 0xffed91;
  const size = grid.tileWidth;
  const baseGlow = new Graphics();
  baseGlow.ellipse(x, y + grid.tileHeight * 0.35, size * 0.69, grid.tileHeight * 0.28)
    .fill({ color, alpha: 0.19 });
  root.addChild(baseGlow);

  const kind = buildingKind(base);
  const city = new Sprite(art[kind]);
  const layout = buildingLayout(kind, city.texture, grid.tileWidth, grid.tileHeight);
  city.anchor.set(layout.anchorX, layout.anchorY);
  city.position.set(x, y);
  city.scale.set(layout.scale);
  root.addChild(city);
  if (base.rank >= 4 && base.owner) city.filters = [outline()];
}

function drawCaptureBadge(root: Container, grid: ReturnType<typeof createIsometricGrid>, game: GameState, base: GameState["bases"][number], art: GameArt, revealMap: boolean, floatingIcons: FloatingIcon[], zoom: number): void {
  const status = base.capture;
  if (!status || (!revealMap && !game.tiles[base.y * game.size + base.x]?.explored && status.faction !== game.playerFaction)) return;
  const { x, y } = tileCenter(grid, base.x, base.y);
  const phase = (base.x * 17 + base.y * 31) * 0.13;
  const scale = Math.max(15, grid.tileWidth * 1.15);
  const icon = new Sprite(status.faction === "robots" ? art.robotLayoff : art.hrNegotiation);
  icon.anchor.set(0.5, 1);
  const iconX = x + grid.tileWidth * 0.48;
  const iconY = y - grid.tileHeight * 1.45;
  icon.position.set(iconX, iconY);
  fitSprite(icon, scale, scale);
  icon.filters = [outline()];
  root.addChild(icon);
  floatingIcons.push({ sprite: icon, y: iconY, phase, amplitude: 3 / zoom });
}

function getUnitTexture(art: GameArt, unit: Unit): Texture {
  return art[unitArtKey(unit)];
}

function unitAnchorY(unit: Unit): number {
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
  showShield = true,
): void {
  const tile = game.tiles[unit.y * game.size + unit.x];
  if (!tile || (!forceVisible && !tile.explored && unit.faction !== game.playerFaction)) return;

  const { x, y, size, tileHeight: unitTileHeight } = unitPlacement(grid, game, unit, position);
  const character = new Sprite(getUnitTexture(art, unit));
  character.anchor.set(0.5, unitAnchorY(unit));
  character.position.set(x, y);
  fitSprite(character, size * 0.66, unitTileHeight * 1.54);
  const canAct = unit.faction === game.playerFaction && hasUnitAction(game, unit);
  if (attackable) character.tint = 0xff5555;
  else if (unit.faction === game.playerFaction && !canAct) character.tint = 0x888888;

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
  root.addChild(characterDetails);
  if (!attackable && canAct) character.filters = [outline()];
  if (unit.coffeeMovementBoost || (unit.coffeeBoostTurn === game.turn && !unit.moved)) {
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
  if (showShield && hasCover(game, unit)) {
    const shield = new Graphics();
    const sx = x + size * 0.47, sy = y - unitTileHeight * 1.65;
    const s = Math.max(2.5, size * 0.14);
    shield.poly([sx - s, sy - s * 0.7, sx + s, sy - s * 0.7, sx + s * 0.8, sy + s * 0.5, sx, sy + s, sx - s * 0.8, sy + s * 0.5])
      .fill(0x469fe0).stroke({ color: 0xffffff, width: Math.max(1, size * 0.04) });
    root.addChild(shield);
  }
}

type ActiveCombat = { event: CombatEvent; started: number };
type ActiveResource = { event: ResourceEvent; started: number };
type ActiveIncome = { event: IncomeEvent; started: number; arrived: number };
type Transformation = { started: number; previous: Base };
type FloatingIcon = { sprite: Sprite; y: number; phase: number; amplitude: number };

function drawStaticWorld(
  root: Container,
  app: Application,
  game: GameState,
  art: GameArt,
  revealMap: boolean,
): void {
  root.removeChildren().forEach((child) => child.destroy({ children: true }));
  const grid = createIsometricGrid(app.screen.width, app.screen.height, game.size);
  const tiles = [...game.tiles].sort((a, b) => a.x + a.y - b.x - b.y);
  tiles.forEach((tile, index) => drawTile(root, grid, game, tile, index, art, revealMap));
  tiles.forEach((tile, index) => drawTileDetails(root, grid, game, tile, index, art, revealMap));
}

function drawResourceEffect(root: Container, grid: ReturnType<typeof createIsometricGrid>, game: GameState, art: GameArt, active: ActiveResource, now: number, zoom: number): void {
  const progress = (now - active.started) / RESOURCE_DURATION;
  const target = tileCenter(grid, active.event.x, active.event.y);
  const base = game.bases.find((entry) => entry.id === active.event.baseId);
  if (progress < 0.65) {
    const smoke = addWorldSprite(root, art.smoke, target.x, target.y + grid.tileHeight * 0.5, grid.tileWidth * 2, grid.tileHeight * 3);
    smoke.alpha = Math.min(1, progress * 12, (0.65 - progress) * 4);
  }
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
    for (let i = 0; i < active.event.progress; i++) {
      const phase = resourceStarProgress(now - active.started, i);
      const star = new Sprite(art.resourceStar);
      star.anchor.set(0.5);
      fitSprite(star, 7 / zoom, 7 / zoom);
      star.position.set(
        target.x + (destination.x - target.x) * phase,
        target.y + (destination.y - target.y) * phase - Math.sin(phase * Math.PI) * 20 / zoom,
      );
      star.alpha = 1 - phase * 0.5;
      root.addChild(star);
    }
  }
  root.addChild(effect);
}

function drawIncomeEffect(root: Container, grid: ReturnType<typeof createIsometricGrid>, active: ActiveIncome, wallet: { x: number; y: number }, now: number, zoom: number): void {
  const source = tileCenter(grid, active.event.x, active.event.y);
  const coins = new Graphics();
  for (let i = 0; i < incomeCoinCount(active.event.amount); i++) {
    const t = incomeCoinProgress(now - active.started, i);
    if (t <= 0 || t >= 1) continue;
    coins.circle(source.x + (wallet.x - source.x) * t, source.y + (wallet.y - source.y) * t - Math.sin(t * Math.PI) * 35 / zoom, 4 / zoom)
      .fill({ color: 0xffd25c }).stroke({ color: 0x8c5c24, width: 1.5 / zoom });
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
): void {
  const { attacker, defender } = event;
  const melee = attacker.kind !== "courier" && attacker.kind !== "drone" && gridDistance(attacker, defender) === 1;
  if (event.lethal) {
    if (attacker.faction === "lorgoshki" && !melee && progress < 0.68) {
      const from = unitPlacement(grid, game, attacker);
      const to = unitPlacement(grid, game, defender);
      const travel = Math.min(1, progress / 0.6);
      const latte = new Sprite(art.icedLatte);
      latte.anchor.set(0.5);
      latte.position.set(from.x + (to.x - from.x) * travel,
        from.y + (to.y - from.y) * travel - grid.tileHeight * 0.85 - Math.sin(travel * Math.PI) * grid.tileHeight);
      fitSprite(latte, grid.tileWidth * 0.54, grid.tileWidth * 0.75);
      root.addChild(latte);
    }
    const attackerPosition = event.advance ? advancePosition(attacker, defender, progress) : attacker;
    drawUnit(root, grid, attacker, game, art, false, attackerPosition, true);
    const point = tileCenter(grid, defender.x, defender.y);
    if (defender.faction === "robots") {
      if (progress < 0.25) drawUnit(root, grid, defender, game, art, false, defender, true);
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI * 2 / 12 + event.id;
        const spark = new Sprite(art.electricSpark);
        spark.anchor.set(0.5);
        spark.position.set(point.x + Math.cos(angle) * grid.tileWidth * progress * 1.5,
          point.y - grid.tileHeight + Math.sin(angle) * grid.tileHeight * progress * 2);
        spark.rotation = angle;
        spark.alpha = 1 - progress;
        fitSprite(spark, grid.tileWidth * 0.4, grid.tileHeight * 0.8);
        root.addChild(spark);
      }
    } else {
      const position = fleePosition(attacker, defender, game.size, progress);
      drawUnit(root, grid, defender, game, art, false, position, true, false);
      const location = tileCenter(grid, position.x, position.y);
      const geese = addWorldSprite(root, art.geese, location.x - grid.tileWidth * 0.6, location.y + grid.tileHeight * 0.25, grid.tileWidth * 0.6, grid.tileHeight);
      geese.alpha = Math.min(1, progress * 3);
      const face = new Text({ text: "☹", style: { fontFamily: "Arial", fontSize: Math.max(12, grid.tileWidth * 0.4), fill: 0xffd75a, stroke: { color: 0x56391e, width: 2 } } });
      face.anchor.set(0.5, 1);
      face.position.set(location.x, location.y - grid.tileHeight * 2.7);
      root.addChild(face);
      for (let i = 0; i < 2; i++) {
        const tear = new Sprite(art.sweat);
        const tearProgress = Math.min(1, Math.max(0, (progress - 0.16 - i * 0.12) / 0.5));
        tear.anchor.set(0.5);
        tear.position.set(location.x + (i ? 1 : -1) * grid.tileWidth * 0.12,
          location.y - grid.tileHeight * (2.35 - tearProgress * 0.42));
        tear.alpha = Math.sin(tearProgress * Math.PI);
        fitSprite(tear, grid.tileWidth * 0.16, grid.tileHeight * 0.42);
        root.addChild(tear);
      }
    }
    return;
  }
  const lunge = melee ? Math.sin(Math.PI * Math.min(progress / 0.75, 1)) * 0.55 : 0;
  const attackerPosition = {
    x: attacker.x + (defender.x - attacker.x) * lunge,
    y: attacker.y + (defender.y - attacker.y) * lunge,
  };
  drawUnit(root, grid, defender, game, art, false, defender, true);
  drawUnit(root, grid, attacker, game, art, false, attackerPosition, true);
  const from = unitPlacement(grid, game, attacker, attackerPosition);
  const to = unitPlacement(grid, game, defender);
  const iconSize = Math.max(5, grid.tileWidth * 0.3);
  if ((attacker.faction === "robots" || !melee) && progress < 0.68) {
    const travel = Math.min(1, progress / 0.6);
    const x = from.x + (to.x - from.x) * travel;
    const y = from.y + (to.y - from.y) * travel - grid.tileHeight * 0.85 - Math.sin(travel * Math.PI) * grid.tileHeight;
    if (attacker.faction === "lorgoshki") {
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
  world: Container,
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
  fogReveals: Map<number, number> = new Map(),
  floatingIcons: FloatingIcon[] = [],
): void {
  root.removeChildren().forEach((child) => child.destroy({ children: true }));
  floatingIcons.length = 0;
  world.pivot.set(app.screen.width / 2, app.screen.height / 2);
  world.position.set(app.screen.width / 2 + pan.x, app.screen.height / 2 + pan.y);
  world.scale.set(zoom);
  root.pivot.set(app.screen.width / 2, app.screen.height / 2);
  root.position.set(app.screen.width / 2 + pan.x, app.screen.height / 2 + pan.y);
  root.scale.set(zoom);
  const grid = createIsometricGrid(app.screen.width, app.screen.height, game.size);
  const city = game.bases.find((base) => base.id === selectedCityId && base.owner !== null);
  if (city) {
    const outline = new Graphics();
    for (const tile of territoryEdges(game, city)) {
      const { x, y } = tileCenter(grid, tile.x, tile.y);
      const vertices = [
        { x, y: y - grid.tileHeight },
        { x: x + grid.tileWidth, y },
        { x, y: y + grid.tileHeight },
        { x: x - grid.tileWidth, y },
      ];
      const start = vertices[tile.edge];
      const end = vertices[(tile.edge + 1) % 4];
      outline.moveTo(start.x, start.y).lineTo(end.x, end.y)
        .stroke({ color: city.owner === game.playerFaction ? 0xffe26e : 0xff5555, alpha: 0.95, width: Math.max(1.5, grid.tileWidth * 0.08) });
    }
    root.addChild(outline);
  }
  const playerUnit = game.units.find((unit) => unit.id === selectedUnitId && unit.faction === game.playerFaction);
  if (selected) {
    const canMove = !city && playerUnit && !playerUnit.moved && !playerUnit.attacked;
    if (canMove) {
      for (const tile of game.tiles) {
        if (!canMoveTo(game, playerUnit, tile)) continue;
        const { x, y } = tileCenter(grid, tile.x, tile.y);
        const marker = new Graphics();
        polygon(marker, diamond(x, y, grid.tileWidth * 0.55, grid.tileHeight * 0.55), 0x67efff, 0.45);
        marker.poly(diamond(x, y, grid.tileWidth * 0.55, grid.tileHeight * 0.55))
          .stroke({ color: 0x9dffff, width: 1.4 / zoom, alpha: 0.93 });
        root.addChild(marker);
      }
    }

    const center = tileCenter(grid, selected.x, selected.y);
    const marker = new Graphics();
    marker.poly(diamond(center.x, center.y, grid.tileWidth * 0.94, grid.tileHeight * 0.94))
      .stroke({ color: 0xffffff, alpha: 0.94, width: 2 / zoom });
    root.addChild(marker);
  }

  for (const base of game.bases) {
    const transformation = transformations.get(base.id);
    const frame = transformation ? transformationFrame(performance.now() - transformation.started) : undefined;
    if (revealMap || game.tiles[base.y * game.size + base.x]?.explored || base.owner === game.playerFaction) {
      const building = new Container();
      building.x = (frame?.shake ?? 0) * grid.tileWidth * 0.1;
      drawBase(building, grid, game, transformation && frame?.previous ? transformation.previous : base, art);
      root.addChild(building);
    }
    if (frame && (revealMap || game.tiles[base.y * game.size + base.x]?.explored || base.owner === game.playerFaction)) {
      const { x, y } = tileCenter(grid, base.x, base.y);
      const smoke = addWorldSprite(root, art.smoke, x, y + grid.tileHeight * 0.5, grid.tileWidth * 2.3, grid.tileHeight * 3.5);
      smoke.alpha = frame.flash * 0.85;
    }
  }
  for (const unit of game.units) {
    if (unit.id === selectedUnitId) continue;
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
    const phase = (coffee.x * 17 + coffee.y * 31) * 0.13;
    const iconY = y - grid.tileHeight * 2;
    const icon = addWorldSprite(root, art.icedLatte, x, iconY, grid.tileWidth, grid.tileHeight * 2);
    icon.filters = [outline()];
    floatingIcons.push({ sprite: icon, y: iconY, phase, amplitude: 3 / zoom });
  }
  for (const visit of game.coinVisits) {
    const unit = game.units.find((candidate) => candidate.id === visit.unitId && candidate.faction === game.playerFaction
      && candidate.x === visit.x && candidate.y === visit.y);
    if (!unit || game.turn < visit.readyTurn || unit.moved || unit.attacked) continue;
    const { x, y } = tileCenter(grid, visit.x, visit.y);
    const phase = (visit.x * 17 + visit.y * 31) * 0.13;
    const iconY = y - grid.tileHeight * 2;
    const icon = addWorldSprite(root, art.treasury, x, iconY, grid.tileWidth * 0.65, grid.tileHeight * 1.3);
    icon.filters = [outline()];
    floatingIcons.push({ sprite: icon, y: iconY, phase, amplitude: 3 / zoom });
  }
  const selectedInCombat = combat && (selectedUnitId === combat.event.attacker.id || selectedUnitId === combat.event.defender.id);
  if (combat && !selectedInCombat) drawCombat(root, grid, game, art, combat.event, combat.progress);
  for (const base of game.bases) drawCaptureBadge(root, grid, game, base, art, revealMap, floatingIcons, zoom);
  for (const base of game.bases) {
    if (!base.owner || (!revealMap && !game.tiles[base.y * game.size + base.x]?.explored && base.owner !== game.playerFaction)) continue;
    const kind = buildingKind(base);
    const layout = buildingLayout(kind, art[kind], grid.tileWidth, grid.tileHeight);
    const { x, y } = tileCenter(grid, base.x, base.y);
    const count = cityCapacity(base);
    const occupied = cityOccupancy(game, base);
    const cell = Math.max(6, Math.min(20, grid.tileWidth * 0.8) / zoom);
    const gap = Math.max(2, Math.min(6, grid.tileWidth * 0.16) / zoom);
    const top = y - art[kind].height * layout.scale * layout.anchorY - cell * 1.3;
    const bar = new Graphics();
    const progress = base.rank >= 4 ? count : base.progress;
    for (let i = 0; i < count; i++) {
      const cellX = x - (count * cell + (count - 1) * gap) / 2 + i * (cell + gap);
      bar.roundRect(cellX, top, cell, cell * 0.62, 1)
        .fill(0x243b4c).stroke({ color: 0xffffff, width: 0.65 / zoom });
      bar.circle(cellX + cell / 2, top + cell * 0.31, cell * 0.14)
        .fill(i < occupied ? 0xffdc5d : 0x132331)
        .stroke({ color: i < occupied ? 0xfff0a3 : 0x7d8b8b, width: 0.35 / zoom });
      bar.roundRect(cellX + cell * 0.12, top + cell * 0.49, cell * 0.76, cell * 0.09, 1)
        .fill(i < progress ? 0xffdc5d : 0x132331);
    }
    root.addChild(bar);
  }
  if (playerUnit && (!combat || (playerUnit.id !== combat.event.attacker.id && playerUnit.id !== combat.event.defender.id))) {
    drawUnit(root, grid, playerUnit, game, art, false, animatedPositions.get(playerUnit.id), revealMap);
  }
  if (combat && selectedInCombat) drawCombat(root, grid, game, art, combat.event, combat.progress);
  for (const [index, started] of fogReveals) {
    const elapsed = performance.now() - started;
    if (elapsed >= FOG_REVEAL_DURATION) {
      fogReveals.delete(index);
      continue;
    }
    const tile = game.tiles[index];
    if (!tile) continue;
    const center = tileCenter(grid, tile.x, tile.y);
    const fog = new Graphics();
    polygon(fog, diamond(center.x, center.y, grid.tileWidth, grid.tileHeight), 0xe9f3f6, fogRevealAlpha(elapsed));
    root.addChild(fog);
  }
  for (const resource of activeResources) drawResourceEffect(root, grid, game, art, resource, performance.now(), zoom);
  for (const income of activeIncome) drawIncomeEffect(root, grid, income, wallet, performance.now(), zoom);
}

export default function MapView({ game, selected, selectedUnitId, selectedCityId, language, revealMap, combatEvents, resourceEvents, incomeEvents, movementEvents, focusTarget, onFocusArrived, onIncomeArrived, onResourceArrived, onAnimationsFinished, onTileClick, onSelectCoffee, onCapture, onCollectCoins }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const rootRef = useRef<Container | null>(null);
  const worldRef = useRef<Container | null>(null);
  const callbackRef = useRef(onTileClick);
  const coffeeRef = useRef(onSelectCoffee);
  const incomeArrivedRef = useRef(onIncomeArrived);
  const resourceArrivedRef = useRef(onResourceArrived);
  const animationsFinishedRef = useRef(onAnimationsFinished);
  const focusArrivedRef = useRef(onFocusArrived);
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
  const drawRef = useRef<() => void>(() => undefined);
  const previousUnitsRef = useRef(new Map<string, { x: number; y: number }>());
  const previousUnitBoostsRef = useRef(new Map<string, boolean>());
  const previousBasesRef = useRef(new Map<string, Base>());
  const transformationsRef = useRef(new Map<string, Transformation>());
  const animationsRef = useRef(new Map<string, { from: { x: number; y: number }; to: { x: number; y: number }; path?: Array<{ x: number; y: number }>; started: number; duration?: number }>());
  const lastMovementIdRef = useRef(0);
  const combatQueueRef = useRef<CombatEvent[]>([]);
  const activeCombatRef = useRef<ActiveCombat | null>(null);
  const lastCombatIdRef = useRef(0);
  const lastPositionCombatIdRef = useRef(0);
  const lastResourceIdRef = useRef(0);
  const activeResourcesRef = useRef<ActiveResource[]>([]);
  const lastIncomeIdRef = useRef(0);
  const activeIncomeRef = useRef<ActiveIncome[]>([]);
  const fogRevealsRef = useRef(new Map<number, number>());
  const previousExploredRef = useRef<Map<number, boolean> | null>(null);
  const floatingIconsRef = useRef<FloatingIcon[]>([]);
  const panRef = useRef({ x: 0, y: 0 });
  const cameraRef = useRef<{ id: number; from: { x: number; y: number }; to: { x: number; y: number }; started: number } | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const pointerPositionsRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartRef = useRef<{ distance: number; zoom: number; world: { x: number; y: number } } | null>(null);
  const [zoom, setZoom] = useState(1.35);
  const [ready, setReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [clouds] = useState(() => Array.from({ length: 6 }, () => ({
    top: `${Math.round(Math.random() * 85)}%`,
    width: `${10 + Math.round(Math.random() * 10)}%`,
    animationDuration: `${60 + Math.round(Math.random() * 50)}s`,
    animationDelay: `${-Math.round(Math.random() * 100)}s`,
  })));

  useEffect(() => { callbackRef.current = onTileClick; }, [onTileClick]);
  useEffect(() => { coffeeRef.current = onSelectCoffee; }, [onSelectCoffee]);
  useEffect(() => { incomeArrivedRef.current = onIncomeArrived; }, [onIncomeArrived]);
  useEffect(() => { resourceArrivedRef.current = onResourceArrived; }, [onResourceArrived]);
  useEffect(() => { animationsFinishedRef.current = onAnimationsFinished; }, [onAnimationsFinished]);
  useEffect(() => { focusArrivedRef.current = onFocusArrived; }, [onFocusArrived]);
  useEffect(() => { captureRef.current = onCapture; }, [onCapture]);
  useEffect(() => { collectCoinsRef.current = onCollectCoins; }, [onCollectCoins]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { selectedUnitIdRef.current = selectedUnitId; }, [selectedUnitId]);
  useEffect(() => { selectedCityIdRef.current = selectedCityId; }, [selectedCityId]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { revealMapRef.current = revealMap; }, [revealMap]);
  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => {
    zoomSetterRef.current = (nextZoom) => {
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      drawRef.current();
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    if (!focusTarget || !app) return;
    const grid = createIsometricGrid(app.screen.width, app.screen.height, gameRef.current.size);
    const target = tileCenter(grid, focusTarget.x, focusTarget.y);
    cameraRef.current = {
      id: focusTarget.id,
      from: { ...panRef.current },
      to: { x: (app.screen.width / 2 - target.x) * zoomRef.current, y: (app.screen.height / 2 - target.y) * zoomRef.current },
      started: performance.now(),
    };
  }, [focusTarget, ready]);

  useEffect(() => {
    const world = worldRef.current;
    const app = appRef.current;
    const art = artRef.current;
    if (ready && world && app && art) drawStaticWorld(world, app, game, art, revealMap);
  }, [game, ready, revealMap]);

  useEffect(() => {
    const incoming = combatEvents.filter((event) => event.id > lastCombatIdRef.current);
    if (incoming.length) {
      combatQueueRef.current.push(...incoming);
      lastCombatIdRef.current = incoming[incoming.length - 1].id;
      const lethal = [...incoming].reverse().find((event) => event.lethal);
      const app = appRef.current;
      if (lethal && app) {
        const target = lethal.counterattack ? lethal.attacker : lethal.defender;
        const grid = createIsometricGrid(app.screen.width, app.screen.height, gameRef.current.size);
        const center = tileCenter(grid, target.x, target.y);
        cameraRef.current = {
          id: 0,
          from: { ...panRef.current },
          to: {
            x: (app.screen.width / 2 - center.x) * zoomRef.current,
            y: (app.screen.height / 2 - center.y) * zoomRef.current,
          },
          started: performance.now(),
        };
      }
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
      activeIncomeRef.current.push(...incoming.map((event) => ({ event, started: performance.now(), arrived: 0 })));
      lastIncomeIdRef.current = incoming[incoming.length - 1].id;
    }
  }, [incomeEvents]);

  useEffect(() => {
    const previous = previousUnitsRef.current;
    const previousBoosts = previousUnitBoostsRef.current;
    const now = performance.now();
    const previousExplored = previousExploredRef.current;
    if (previousExplored) {
      game.tiles.forEach((tile, index) => {
        if (!previousExplored.get(index) && tile.explored) fogRevealsRef.current.set(index, now);
      });
    }
    previousExploredRef.current = new Map(game.tiles.map((tile, index) => [index, tile.explored]));
    for (const unit of game.units) {
      const oldPosition = previous.get(unit.id);
      const combatAdvance = combatEvents.some((event) => event.id > lastPositionCombatIdRef.current && event.advance && event.attacker.id === unit.id);
      if (!combatAdvance && unit.faction === game.playerFaction && oldPosition && (oldPosition.x !== unit.x || oldPosition.y !== unit.y)) {
        animationsRef.current.set(unit.id, { from: oldPosition, to: { x: unit.x, y: unit.y }, started: now });
      } else if (unit.coffeeMovementBoost && !previousBoosts.get(unit.id)) {
        animationsRef.current.set(unit.id, {
          from: { x: unit.x, y: unit.y },
          to: { x: unit.x, y: unit.y },
          started: now,
          duration: 900,
        });
      }
    }
    let start = Math.max(now, ...Array.from(animationsRef.current.values(), (animation) => animation.duration ? now : animation.started + 220));
    const incoming = movementEvents.filter((event) => event.id > lastMovementIdRef.current);
    for (const event of incoming) {
      if (game.units.some((unit) => unit.id === event.unitId)) {
        animationsRef.current.set(event.unitId, { from: event.from, to: event.to, path: event.path, started: start });
        start += 220;
      }
      lastMovementIdRef.current = event.id;
    }
    previousUnitsRef.current = new Map(game.units.map((unit) => [unit.id, { x: unit.x, y: unit.y }]));
    previousUnitBoostsRef.current = new Map(game.units.map((unit) => [unit.id, unit.coffeeMovementBoost ?? false]));
    if (combatEvents.length) lastPositionCombatIdRef.current = combatEvents[combatEvents.length - 1].id;
    for (const base of game.bases) {
      const previous = previousBasesRef.current.get(base.id);
      if (previous && (previous.owner !== base.owner || previous.rank !== base.rank) && game.tiles[base.y * game.size + base.x]?.explored) {
        transformationsRef.current.set(base.id, { started: now, previous });
      }
    }
    previousBasesRef.current = new Map(game.bases.map((base) => [base.id, { ...base }]));
  }, [game, movementEvents, combatEvents]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    let root: Container | null = null;
    let world: Container | null = null;
    let animateFloatingIcons: () => void = () => undefined;
    const app = new Application();

    const draw = () => {
      const currentRoot = rootRef.current;
      const currentWorld = worldRef.current;
      const currentApp = appRef.current;
      if (currentRoot && currentWorld && currentApp && artRef.current) {
        drawLatest(currentRoot, currentWorld, currentApp, gameRef.current, selectedRef.current, selectedUnitIdRef.current, artRef.current, zoomRef.current, new Map(), panRef.current, undefined, selectedCityIdRef.current, languageRef.current, transformationsRef.current, revealMapRef.current, [], [], undefined, fogRevealsRef.current, floatingIconsRef.current);
      }
    };
    drawRef.current = draw;

    const drawAll = () => {
      const currentWorld = worldRef.current;
      const currentApp = appRef.current;
      if (currentWorld && currentApp && artRef.current) {
        drawStaticWorld(currentWorld, currentApp, gameRef.current, artRef.current, revealMapRef.current);
      }
      draw();
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
        const bottom = y - grid.tileHeight * 2;
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
        const bottom = y - grid.tileHeight * 2;
        return Math.abs(unscaledPoint.x - x) <= grid.tileWidth / 2
          && unscaledPoint.y >= bottom - grid.tileHeight * 2 && unscaledPoint.y <= bottom;
      });
      if (coffee) {
        coffeeRef.current(coffee.unitId);
        return;
      }
      const capture = currentGame.bases.find((base) => {
        if (!base.capture || base.capture.faction !== currentGame.playerFaction || base.capture.readyTurn > currentGame.turn) return false;
        const unit = currentGame.units.find((candidate) => candidate.id === base.capture?.unitId
          && candidate.x === base.x && candidate.y === base.y);
        if (!unit || unit.moved || unit.attacked) return false;
        const { x, y } = tileCenter(grid, base.x, base.y);
        const scale = Math.max(15, grid.tileWidth * 1.15);
        const iconX = x + grid.tileWidth * 0.48;
        const phase = (base.x * 17 + base.y * 31) * 0.13;
        const bottom = y - grid.tileHeight * 1.45 + Math.sin(performance.now() / 360 + phase) * 3 / zoomRef.current;
        return Math.abs(unscaledPoint.x - iconX) <= scale * 0.58
          && unscaledPoint.y >= bottom - scale * 1.13
          && unscaledPoint.y <= bottom;
      });
      if (capture?.capture) {
        captureRef.current(capture.id, capture.capture.unitId);
        return;
      }
      const tile = screenToTile(grid, unscaledPoint);
      const selectedMover = currentGame.units.find((unit) => unit.id === selectedUnitIdRef.current && unit.faction === currentGame.playerFaction);
      if (tile) {
        const center = tileCenter(grid, tile.x, tile.y);
        const markerDistance = Math.abs(unscaledPoint.x - center.x) / grid.tileWidth
          + Math.abs(unscaledPoint.y - center.y) / grid.tileHeight;
        const tileData = currentGame.tiles[tile.y * currentGame.size + tile.x];
        if ((selectedMover && canMoveTo(currentGame, selectedMover, tile))
          || (markerDistance <= 0.55 && !selectedMover && (tileData.poi || resourceCity(currentGame, tileData)))) {
          callbackRef.current(tile.x, tile.y);
          return;
        }
      }
      if (artRef.current
        && (!tile || !currentGame.units.some((unit) => unit.x === tile.x && unit.y === tile.y
          && (unit.faction === currentGame.playerFaction || currentGame.tiles[tile.y * currentGame.size + tile.x]?.explored)))) {
        const art = artRef.current;
        const contains = (position: { x: number; y: number }, texture: Texture, layout: ReturnType<typeof buildingLayout>) => {
          const center = tileCenter(grid, position.x, position.y);
          const width = texture.width * layout.scale, height = texture.height * layout.scale;
          return unscaledPoint.x >= center.x - width * layout.anchorX && unscaledPoint.x <= center.x + width * (1 - layout.anchorX)
            && unscaledPoint.y >= center.y - height * layout.anchorY && unscaledPoint.y <= center.y + height * (1 - layout.anchorY);
        };
        const hit = [...currentGame.bases].reverse().find((base) => {
          if (!revealMapRef.current && !currentGame.tiles[base.y * currentGame.size + base.x]?.explored && base.owner !== currentGame.playerFaction) return false;
          if (selectedMover && !canMoveTo(currentGame, selectedMover, base)) return false;
          const kind = buildingKind(base);
          return contains(base, art[kind], buildingLayout(kind, art[kind], grid.tileWidth, grid.tileHeight));
        });
        if (hit) {
          callbackRef.current(hit.x, hit.y);
          return;
        }
        const coffeeShop = [...currentGame.tiles].reverse().find((entry) => entry.poi === "coffee" && !entry.poiClaimed
          && (entry.explored || revealMapRef.current) && (!selectedMover || canMoveTo(currentGame, selectedMover, entry))
          && contains(entry, art.coffee, buildingLayout("coffee", art.coffee, grid.tileWidth, grid.tileHeight)));
        if (coffeeShop) {
          callbackRef.current(coffeeShop.x, coffeeShop.y);
          return;
        }
      }
      if (tile) callbackRef.current(tile.x, tile.y);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      app.canvas.setPointerCapture(event.pointerId);
      pointerPositionsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointerPositionsRef.current.size === 1) {
        dragRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
          moved: false,
        };
        return;
      }
      dragRef.current = null;
      const points = [...pointerPositionsRef.current.values()];
      const first = points[0], second = points[1];
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const rect = app.canvas.getBoundingClientRect();
      const screenCenter = { x: app.screen.width / 2, y: app.screen.height / 2 };
      const screenPoint = {
        x: (center.x - rect.left) * app.screen.width / rect.width,
        y: (center.y - rect.top) * app.screen.height / rect.height,
      };
      pinchStartRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        zoom: zoomRef.current,
        world: {
          x: (screenPoint.x - screenCenter.x - panRef.current.x) / zoomRef.current + screenCenter.x,
          y: (screenPoint.y - screenCenter.y - panRef.current.y) / zoomRef.current + screenCenter.y,
        },
      };
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerPositionsRef.current.has(event.pointerId)) return;
      pointerPositionsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointerPositionsRef.current.size >= 2 && pinchStartRef.current) {
        const points = [...pointerPositionsRef.current.values()].slice(0, 2);
        const first = points[0], second = points[1];
        const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        const rect = app.canvas.getBoundingClientRect();
        const screenCenter = { x: app.screen.width / 2, y: app.screen.height / 2 };
        const screenPoint = {
          x: (center.x - rect.left) * app.screen.width / rect.width,
          y: (center.y - rect.top) * app.screen.height / rect.height,
        };
        const maximum = window.matchMedia("(max-width: 720px)").matches ? 16 : 3.5;
        const nextZoom = Math.min(maximum, Math.max(0.8, pinchStartRef.current.zoom
          * Math.hypot(second.x - first.x, second.y - first.y) / Math.max(1, pinchStartRef.current.distance)));
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        panRef.current = {
          x: screenPoint.x - screenCenter.x - (pinchStartRef.current.world.x - screenCenter.x) * nextZoom,
          y: screenPoint.y - screenCenter.y - (pinchStartRef.current.world.y - screenCenter.y) * nextZoom,
        };
        draw();
        return;
      }
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      panRef.current = { x: drag.panX + dx, y: drag.panY + dy };
      draw();
    };
    const handlePointerUp = (event: PointerEvent) => {
      const wasPinching = pinchStartRef.current !== null;
      if (!wasPinching && pointerPositionsRef.current.size === 1) handleClick(event);
      pointerPositionsRef.current.delete(event.pointerId);
      if (pointerPositionsRef.current.size < 2) pinchStartRef.current = null;
      const remaining = [...pointerPositionsRef.current.entries()][0];
      if (remaining) {
        dragRef.current = {
          pointerId: remaining[0],
          x: remaining[1].x,
          y: remaining[1].y,
          panX: panRef.current.x,
          panY: panRef.current.y,
          moved: true,
        };
      } else {
        dragRef.current = null;
      }
    };
    const handlePointerCancel = (event: PointerEvent) => {
      pointerPositionsRef.current.delete(event.pointerId);
      pinchStartRef.current = null;
      dragRef.current = null;
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const maximum = window.matchMedia("(max-width: 720px)").matches ? 16 : 3.5;
        zoomSetterRef.current(Math.min(maximum, Math.max(0.8, zoomRef.current + (event.deltaY < 0 ? 0.1 : -0.1))));
      } else {
        const factor = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? app.screen.height : 1;
        panRef.current = { x: panRef.current.x - event.deltaX * factor, y: panRef.current.y - event.deltaY * factor };
        draw();
      }
    };

    const initialize = async () => {
      const mobile = window.matchMedia("(max-width: 720px)").matches;
      await app.init({
        resizeTo: host,
        backgroundAlpha: 0,
        resolution: Math.min(window.devicePixelRatio || 1, mobile ? 2.25 : 2.5),
        antialias: true,
        autoDensity: true,
      });
      if (!active) {
        app.destroy(true, { children: true });
        return;
      }
      const art = await loadGameArt((progress) => {
        if (active) setLoadingProgress(progress);
      });
      if (!active) {
        app.destroy(true, { children: true });
        return;
      }
      artRef.current = art;
      appRef.current = app;
      host.appendChild(app.canvas);
      app.ticker.maxFPS = mobile ? 24 : 30;
      animateFloatingIcons = () => {
        const time = performance.now() / 360;
        for (const icon of floatingIconsRef.current) {
          if (!icon.sprite.parent) continue;
          const offset = Math.sin(time + icon.phase) * icon.amplitude;
          icon.sprite.y = icon.y + offset;
          icon.sprite.rotation = Math.sin(time + icon.phase) * 0.025;
        }
      };
      app.ticker.add(animateFloatingIcons);
      world = new Container();
      root = new Container();
      app.stage.addChild(world, root);
      worldRef.current = world;
      rootRef.current = root;
      const initialZoom = initialMapZoom(
        createIsometricGrid(app.screen.width, app.screen.height, gameRef.current.size),
        mobile,
      );
      zoomRef.current = initialZoom;
      setZoom(initialZoom);
      const startUnit = gameRef.current.units.find((unit) => unit.faction === gameRef.current.playerFaction);
      if (startUnit) {
        const grid = createIsometricGrid(app.screen.width, app.screen.height, gameRef.current.size);
        const center = tileCenter(grid, startUnit.x, startUnit.y);
        panRef.current = {
          x: (app.screen.width / 2 - center.x) * initialZoom,
          y: (app.screen.height / 2 - center.y) * initialZoom,
        };
      }
      app.canvas.setAttribute("aria-label", "Яркая изометрическая карта. Нажмите на клетку, чтобы выбрать или переместить фигуру.");
      app.canvas.addEventListener("pointerup", handlePointerUp);
      app.canvas.addEventListener("pointerdown", handlePointerDown);
      app.canvas.addEventListener("pointermove", handlePointerMove);
      app.canvas.addEventListener("pointercancel", handlePointerCancel);
      host.addEventListener("wheel", handleWheel, { passive: false });
      drawAll();
      setReady(true);
    };

    initialize().catch((error: unknown) => {
      if (active) {
        const message = error instanceof Error ? `Не удалось загрузить игровой ресурс: ${error.message}` : "Не удалось загрузить игровые ресурсы.";
        host.dataset.error = message;
        setLoadingError(message);
      }
    });
    const observer = new ResizeObserver(drawAll);
    observer.observe(host);
    return () => {
      active = false;
      observer.disconnect();
      host.removeEventListener("wheel", handleWheel);
      if (appRef.current) {
        appRef.current.ticker.remove(animateFloatingIcons);
        appRef.current.canvas.removeEventListener("pointerup", handlePointerUp);
        appRef.current.canvas.removeEventListener("pointerdown", handlePointerDown);
        appRef.current.canvas.removeEventListener("pointermove", handlePointerMove);
        appRef.current.canvas.removeEventListener("pointercancel", handlePointerCancel);
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
        rootRef.current = null;
        worldRef.current = null;
        artRef.current = null;
      }
      drawRef.current = () => undefined;
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const world = worldRef.current;
    const app = appRef.current;
    if (!root || !world || !app) return;
    if (!cameraRef.current && !animationsRef.current.size && !combatQueueRef.current.length && !activeCombatRef.current && !transformationsRef.current.size && !activeResourcesRef.current.length && !activeIncomeRef.current.length && !fogRevealsRef.current.size) {
      if (artRef.current) drawLatest(root, world, app, game, selected, selectedUnitId, artRef.current, zoomRef.current, new Map(), panRef.current, undefined, selectedCityId, language, new Map(), revealMap, [], [], undefined, fogRevealsRef.current, floatingIconsRef.current);
      if (game.status !== "running") animationsFinishedRef.current();
      return;
    }
    let lastDraw = 0;
    const tick = () => {
      const now = performance.now();
      const camera = cameraRef.current;
      if (camera) {
        const progress = Math.min(1, (now - camera.started) / BOT_FOCUS_DURATION);
        const eased = progress * progress * (3 - 2 * progress);
        panRef.current = {
          x: camera.from.x + (camera.to.x - camera.from.x) * eased,
          y: camera.from.y + (camera.to.y - camera.from.y) * eased,
        };
        if (progress === 1) {
          cameraRef.current = null;
          focusArrivedRef.current(camera.id);
        }
      }
      activeResourcesRef.current = activeResourcesRef.current.filter((entry) => {
        if (now - entry.started < RESOURCE_ARRIVAL) return true;
        resourceArrivedRef.current(entry.event.id);
        return false;
      });
      for (const entry of activeIncomeRef.current) {
        const count = incomeCoinCount(entry.event.amount);
        while (entry.arrived < count && incomeCoinProgress(now - entry.started, entry.arrived) >= 1) {
          incomeArrivedRef.current(entry.event.id, incomeCoinAmount(entry.event.amount, entry.arrived), entry.arrived === count - 1);
          entry.arrived++;
        }
      }
      activeIncomeRef.current = activeIncomeRef.current.filter((entry) => now - entry.started < INCOME_DURATION);
      if (now - lastDraw < 33) return;
      lastDraw = now;
      for (const [id, transformation] of transformationsRef.current) {
        if (now - transformation.started >= TRANSFORMATION_DURATION) transformationsRef.current.delete(id);
      }
      for (const [index, started] of fogRevealsRef.current) {
        if (now - started >= FOG_REVEAL_DURATION) fogRevealsRef.current.delete(index);
      }
      if (!activeCombatRef.current && combatQueueRef.current.length) {
        activeCombatRef.current = { event: combatQueueRef.current.shift()!, started: now };
      }
      const activeCombat = activeCombatRef.current;
      const combat = activeCombat ? { event: activeCombat.event, progress: Math.min(1, (now - activeCombat.started) / COMBAT_DURATION) } : undefined;
      const positions = new Map<string, { x: number; y: number }>();
      for (const [id, animation] of animationsRef.current) {
        const progress = Math.max(0, Math.min(1, (now - animation.started) / (animation.duration ?? 220)));
        const eased = 1 - (1 - progress) ** 3;
        const path = animation.path ?? [animation.to];
        const step = Math.min(path.length - 1, Math.floor(eased * path.length));
        const from = step ? path[step - 1] : animation.from;
        const to = path[step];
        const fraction = Math.min(1, eased * path.length - step);
        positions.set(id, {
          x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction,
        });
        if (progress === 1) animationsRef.current.delete(id);
      }
      const walletRect = document.querySelector(".wallet")?.getBoundingClientRect();
      const hostRect = hostRef.current?.getBoundingClientRect();
      const wallet = walletRect && hostRect ? {
        x: ((walletRect.left + walletRect.width / 2 - hostRect.left) * app.screen.width / hostRect.width - app.screen.width / 2 - panRef.current.x) / zoomRef.current + app.screen.width / 2,
        y: ((walletRect.top + walletRect.height / 2 - hostRect.top) * app.screen.height / hostRect.height - app.screen.height / 2 - panRef.current.y) / zoomRef.current + app.screen.height / 2,
      } : { x: app.screen.width, y: 0 };
      if (artRef.current) drawLatest(root, world, app, gameRef.current, selectedRef.current, selectedUnitIdRef.current, artRef.current, zoomRef.current, positions, panRef.current, combat, selectedCityIdRef.current, languageRef.current, transformationsRef.current, revealMapRef.current, activeResourcesRef.current, activeIncomeRef.current, wallet, fogRevealsRef.current, floatingIconsRef.current);
      if (combat?.progress === 1) activeCombatRef.current = null;
      if (gameRef.current.status !== "running" && !animationsRef.current.size && !combatQueueRef.current.length && !activeCombatRef.current && !transformationsRef.current.size && !activeResourcesRef.current.length && !activeIncomeRef.current.length) {
        animationsFinishedRef.current();
      }
      if (!cameraRef.current && !animationsRef.current.size && !combatQueueRef.current.length && !activeCombatRef.current && !transformationsRef.current.size && !activeResourcesRef.current.length && !activeIncomeRef.current.length && !fogRevealsRef.current.size) {
        if (artRef.current) drawLatest(root, world, app, gameRef.current, selectedRef.current, selectedUnitIdRef.current, artRef.current, zoomRef.current, positions, panRef.current, undefined, selectedCityIdRef.current, languageRef.current, new Map(), revealMapRef.current, [], [], undefined, fogRevealsRef.current, floatingIconsRef.current);
        app.ticker.remove(tick);
      }
    };
    app.ticker.add(tick);
    return () => { if (appRef.current === app) app.ticker.remove(tick); };
  }, [game, selected, selectedUnitId, selectedCityId, language, combatEvents, resourceEvents, incomeEvents, ready, revealMap, focusTarget]);

  return <div className="map-canvas" ref={hostRef}>
    <div className="cloud-sky" aria-hidden="true">
      {clouds.map((cloud, index) => <img key={index} className="server-cloud" style={cloud} src="game-art/world/cloud-server.png" alt="" />)}
    </div>
    {!ready && <div className="map-loader" role="status" aria-live="polite">
      {loadingError ? <>
        <strong>{language === "ru" ? "Не удалось загрузить карту" : "Map failed to load"}</strong>
        <span>{loadingError}</span>
      </> : <>
        <span className="map-loader-icon" aria-hidden="true">▧</span>
        <strong>{language === "ru" ? "Готовим игровое поле" : "Preparing the game world"}</strong>
        <div className="map-loader-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(loadingProgress * 100)}>
          <span style={{ width: `${Math.round(loadingProgress * 100)}%` }} />
        </div>
        <small>{Math.round(loadingProgress * 100)}%</small>
      </>}
    </div>}
  </div>;
}
