"use client";

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import { createIsometricGrid, screenToTile, tileCenter } from "../game/isometric";
import { UNIT_DEFINITIONS, type GameState, type Terrain, type Unit } from "../game/model";

type Props = {
  game: GameState;
  selected: { x: number; y: number } | null;
  onTileClick: (x: number, y: number) => void;
};

const TERRAIN_PALETTES: Record<Terrain, [number, number, number]> = {
  plain: [0x82e273, 0x4dc861, 0xb5f28c],
  forest: [0x39c67d, 0x22a862, 0x75e59a],
  mountain: [0xb69ce8, 0x8b79c6, 0xe9c9b3],
  water: [0x33b8ff, 0x2084ec, 0x7ae9ff],
};

function tint(color: number, amount: number): number {
  const red = Math.min(255, ((color >> 16) & 255) + amount);
  const green = Math.min(255, ((color >> 8) & 255) + amount);
  const blue = Math.min(255, (color & 255) + amount);
  return (red << 16) | (green << 8) | blue;
}

function darken(color: number, amount: number): number {
  const red = Math.max(0, ((color >> 16) & 255) - amount);
  const green = Math.max(0, ((color >> 8) & 255) - amount);
  const blue = Math.max(0, (color & 255) - amount);
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
): void {
  const { tileWidth: width, tileHeight: height } = grid;
  const { x, y } = tileCenter(grid, tile.x, tile.y);
  const fogged = !tile.visible;
  const palette = TERRAIN_PALETTES[tile.terrain];
  const variant = (tile.x * 17 + tile.y * 31 + index * 7) % 4;
  const depth = Math.max(2.5, height * 0.88);
  const tileTop = [x, y - height, x + width, y, x, y + height, x - width, y];
  const block = new Graphics();
  const waterWave = new Graphics();

  polygon(block, [x - width, y, x, y + height, x, y + height + depth, x - width, y + depth], tile.terrain === "water" ? 0x1765b2 : 0x984e3f);
  polygon(block, [x, y + height, x + width, y, x + width, y + depth, x, y + height + depth], tile.terrain === "water" ? 0x104887 : 0x743c41);
  polygon(block, tileTop, fogged ? 0x25383d : tint(palette[variant % palette.length], (variant - 1) * 5), fogged ? 0.84 : tile.visible ? 1 : 0.74);
  polygon(block, [x, y, x + width, y, x, y + height], fogged ? 0x33474a : palette[2], fogged ? 0.16 : 0.38);
  polygon(block, [x, y, x - width, y, x, y + height], fogged ? 0x101f31 : palette[1], fogged ? 0.2 : 0.4);
  block.poly(tileTop).stroke({ color: fogged ? 0x566d6f : tint(palette[0], 24), width: 0.65, alpha: fogged ? 0.18 : 0.55 });

  if (tile.visible && !fogged && tile.terrain === "water") {
    waterWave.moveTo(x - width * 0.32, y - height * 0.12)
      .lineTo(x - width * 0.07, y - height * 0.29)
      .lineTo(x + width * 0.13, y - height * 0.15)
      .stroke({ color: 0xb4ffff, width: Math.max(0.7, width * 0.045), alpha: 0.8 });
  }

  root.addChild(block);
  if (tile.visible && !fogged && tile.terrain === "water") root.addChild(waterWave);
  if (fogged || tile.terrain === "water") return;

  if (tile.terrain === "mountain") {
    const heightScale = height * (1.1 + ((tile.x + tile.y) % 3) * 0.16);
    const peak = new Graphics();
    polygon(peak, [
      x - width * 0.63, y - height * 0.16,
      x - width * 0.14, y - heightScale,
      x + width * 0.54, y - height * 0.1,
    ], 0x9762da);
    polygon(peak, [
      x - width * 0.14, y - heightScale,
      x + width * 0.54, y - height * 0.1,
      x + width * 0.07, y - height * 0.04,
    ], 0xe1b4fa);
    polygon(peak, [
      x - width * 0.14, y - heightScale,
      x + width * 0.11, y - heightScale * 0.54,
      x + width * 0.03, y - heightScale * 0.62,
      x - width * 0.03, y - heightScale * 0.38,
    ], 0xffefff);
    root.addChild(peak);
  }

  if (tile.terrain === "forest" || tile.geese && !tile.poiClaimed) {
    const trees = tile.terrain === "forest" ? 1 + ((tile.x * 3 + tile.y * 7) % 2) : 1;
    for (let treeIndex = 0; treeIndex < trees; treeIndex++) {
      const jitter = trees === 1 ? 0 : (treeIndex === 0 ? -0.3 : 0.3);
      const baseX = x + width * jitter;
      const baseY = y + height * 0.27;
      const treeHeight = height * (tile.geese ? 1.1 : 1.45 + treeIndex % 2 * 0.23);
      const foliage = new Graphics();
      const leaf = tile.geese && !tile.poiClaimed ? 0xeff28b : treeIndex === 0 ? 0x18a959 : 0x27cd80;
      polygon(foliage, [
        baseX - width * 0.24, baseY,
        baseX, baseY - treeHeight,
        baseX + width * 0.24, baseY,
      ], leaf);
      polygon(foliage, [
        baseX, baseY - treeHeight,
        baseX + width * 0.24, baseY,
        baseX + width * 0.03, baseY - height * 0.02,
      ], tint(leaf, 22));
      polygon(foliage, [
        baseX - width * 0.045, baseY + depth * 0.18,
        baseX + width * 0.045, baseY + depth * 0.18,
        baseX + width * 0.025, baseY - height * 0.17,
        baseX - width * 0.025, baseY - height * 0.17,
      ], 0x7d492d);
      root.addChild(foliage);
    }
  }
}

function drawBase(root: Container, grid: ReturnType<typeof createIsometricGrid>, game: GameState, base: GameState["bases"][number]): void {
  const { x, y } = tileCenter(grid, base.x, base.y);
  const color = base.owner === game.playerFaction ? 0xffbb39 : base.owner === game.botFaction ? 0xff5e83 : 0xffed91;
  const size = grid.tileWidth;
  const glow = new Graphics();
  glow.ellipse(x, y + grid.tileHeight * 0.35, size * 0.69, grid.tileHeight * 0.28)
    .fill({ color, alpha: 0.19 });
  root.addChild(glow);

  const building = new Graphics();
  const w = size * 0.38;
  const h = grid.tileHeight * 0.36;
  const z = Math.max(4, grid.tileHeight * 0.95);
  polygon(building, [x - w, y - h, x, y - h - h * 0.7, x + w, y - h, x, y + h * 0.12], color);
  polygon(building, [x - w, y - h, x, y + h * 0.12, x, y + z, x - w, y - h + z], darken(color, 72));
  polygon(building, [x, y + h * 0.12, x + w, y - h, x + w, y - h + z, x, y + z], darken(color, 37));
  polygon(building, [x, y - h - h * 0.7, x + w, y - h, x, y - h * 0.48], tint(color, 37));
  building.moveTo(x, y - h * 0.38).lineTo(x, y + h * 0.77)
    .stroke({ color: 0xfffce5, alpha: 0.83, width: Math.max(0.8, size * 0.045) });
  if (base.rank > 1) {
    building.circle(x + size * 0.31, y - grid.tileHeight * 0.66, Math.max(2, size * 0.095))
      .fill({ color: 0xfff37a });
  }
  root.addChild(building);
}

function drawUnit(root: Container, grid: ReturnType<typeof createIsometricGrid>, unit: Unit, game: GameState): void {
  const tile = game.tiles[unit.y * game.size + unit.x];
  if (!tile || !tile.visible && unit.faction !== game.playerFaction) return;

  const { x, y } = tileCenter(grid, unit.x, unit.y);
  const size = grid.tileWidth;
  const isHuman = unit.faction === "lorgoshki";
  const primary = isHuman ? 0xff58bd : 0x5bfcf1;
  const light = isHuman ? 0xffb7e5 : 0xc3fffb;
  const dark = isHuman ? 0xd629a5 : 0x157dc1;
  const height = Math.max(8, grid.tileHeight * 1.8);
  const character = new Graphics();

  character.ellipse(x, y + grid.tileHeight * 0.7, size * 0.33, grid.tileHeight * 0.15)
    .fill({ color: 0x13263a, alpha: 0.45 });

  polygon(character, [x - size * 0.22, y + grid.tileHeight * 0.35, x - size * 0.04, y + grid.tileHeight * 0.35, x - size * 0.14, y + height * 0.09], dark);
  polygon(character, [x + size * 0.04, y + grid.tileHeight * 0.35, x + size * 0.22, y + grid.tileHeight * 0.35, x + size * 0.14, y + height * 0.09], light);
  polygon(character, [x - size * 0.3, y - height * 0.08, x, y - height * 0.25, x + size * 0.3, y - height * 0.08, x, y + grid.tileHeight * 0.4], primary);
  polygon(character, [x, y - height * 0.25, x + size * 0.3, y - height * 0.08, x, y + grid.tileHeight * 0.4], light);
  polygon(character, [x - size * 0.19, y - height * 0.2, x - size * 0.4, y + height * 0.17, x - size * 0.24, y + height * 0.12, x - size * 0.07, y - height * 0.04], dark);
  polygon(character, [x + size * 0.19, y - height * 0.2, x + size * 0.4, y + height * 0.17, x + size * 0.24, y + height * 0.12, x + size * 0.07, y - height * 0.04], primary);

  polygon(character, [
    x - size * 0.22, y - height * 0.25,
    x, y - height * 0.63,
    x + size * 0.22, y - height * 0.25,
  ], light);
  polygon(character, [
    x - size * 0.22, y - height * 0.25,
    x, y - height * 0.63,
    x, y - height * 0.22,
  ], primary);
  polygon(character, [
    x + size * 0.095, y - height * 0.33,
    x + size * 0.16, y - height * 0.32,
    x + size * 0.075, y - height * 0.29,
  ], 0x30274b);

  if (unit.faction !== game.playerFaction) {
    character.circle(x, y + grid.tileHeight * 0.6, Math.max(1.3, size * 0.07))
      .fill({ color: 0xff525c });
  }
  root.addChild(character);

  const healthWidth = Math.max(6, size * 0.63);
  const health = new Graphics();
  health.roundRect(x - healthWidth / 2, y + grid.tileHeight * 0.76, healthWidth, Math.max(1.1, size * 0.055), 1)
    .fill({ color: 0x183040 });
  health.roundRect(
    x - healthWidth / 2,
    y + grid.tileHeight * 0.76,
    healthWidth * (unit.hp / UNIT_DEFINITIONS[unit.kind].maxHp),
    Math.max(1.1, size * 0.055),
    1,
  ).fill({ color: isHuman ? 0xffdf68 : 0x63ffe1 });
  root.addChild(health);
}

function drawLatest(
  root: Container,
  app: Application,
  game: GameState,
  selected: Props["selected"],
): void {
  root.removeChildren().forEach((child) => child.destroy({ children: true }));
  const grid = createIsometricGrid(app.screen.width, app.screen.height, game.size);
  const sky = new Graphics();
  sky.rect(0, 0, app.screen.width, app.screen.height).fill(0x10132b);
  sky.ellipse(app.screen.width * 0.5, app.screen.height * 0.53, app.screen.width * 0.63, app.screen.height * 0.43)
    .fill({ color: 0x282056, alpha: 0.43 });
  root.addChild(sky);

  for (let star = 0; star < 52; star++) {
    const seed = star * 1103515245 + 12345;
    const px = ((seed >>> 0) % 1000) / 1000 * app.screen.width;
    const py = (((seed / 1000) >>> 0) % 1000) / 1000 * app.screen.height;
    const size = star % 9 === 0 ? 1.7 : 0.75;
    const speck = new Graphics();
    speck.circle(px, py, size).fill({ color: star % 4 === 0 ? 0xffda8b : 0xc1dbff, alpha: star % 3 === 0 ? 0.75 : 0.34 });
    root.addChild(speck);
  }

  const tiles = [...game.tiles].sort((a, b) => a.x + a.y - b.x - b.y);
  tiles.forEach((tile, index) => drawTile(root, grid, game, tile, index));

  if (selected) {
    const playerUnit = game.units.find((unit) => unit.x === selected.x && unit.y === selected.y && unit.faction === game.playerFaction);
    const canMove = playerUnit && !playerUnit.moved;
    if (canMove) {
      for (const tile of game.tiles) {
        const distance = Math.abs(tile.x - playerUnit.x) + Math.abs(tile.y - playerUnit.y);
        const occupied = game.units.some((unit) => unit.x === tile.x && unit.y === tile.y);
        if (distance === 0 || distance > UNIT_DEFINITIONS[playerUnit.kind].move || occupied || tile.terrain === "water" || !tile.visible) continue;
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

  for (const base of game.bases) drawBase(root, grid, game, base);
  for (const unit of game.units) drawUnit(root, grid, unit, game);
}

export default function MapView({ game, selected, onTileClick }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const rootRef = useRef<Container | null>(null);
  const callbackRef = useRef(onTileClick);
  const selectedRef = useRef(selected);
  const gameRef = useRef(game);

  useEffect(() => { callbackRef.current = onTileClick; }, [onTileClick]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { gameRef.current = game; }, [game]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    let root: Container | null = null;
    const app = new Application();

    const handleClick = (event: PointerEvent) => {
      const width = app.screen.width;
      const height = app.screen.height;
      const currentGame = gameRef.current;
      const grid = createIsometricGrid(width, height, currentGame.size);
      const point = {
        x: event.offsetX * width / app.canvas.clientWidth,
        y: event.offsetY * height / app.canvas.clientHeight,
      };
      const tile = screenToTile(grid, point);
      if (tile) callbackRef.current(tile.x, tile.y);
    };

    const draw = () => {
      const currentRoot = rootRef.current;
      const currentApp = appRef.current;
      if (currentRoot && currentApp) drawLatest(currentRoot, currentApp, gameRef.current, selectedRef.current);
    };

    const initialize = async () => {
      await app.init({
        resizeTo: host,
        background: "#10132b",
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (!active) {
        app.destroy(true, { children: true });
        return;
      }
      appRef.current = app;
      host.appendChild(app.canvas);
      root = new Container();
      app.stage.addChild(root);
      rootRef.current = root;
      app.canvas.setAttribute("aria-label", "Яркая изометрическая карта. Нажмите на клетку, чтобы выбрать или переместить фигуру.");
      app.canvas.addEventListener("pointerup", handleClick);
      draw();
    };

    initialize().catch((error: unknown) => {
      if (active) host.dataset.error = error instanceof Error ? error.message : "Не удалось загрузить игровую карту.";
    });
    const observer = new ResizeObserver(draw);
    observer.observe(host);
    return () => {
      active = false;
      observer.disconnect();
      if (appRef.current) {
        appRef.current.canvas.removeEventListener("pointerup", handleClick);
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
        rootRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const app = appRef.current;
    if (root && app) drawLatest(root, app, game, selected);
  }, [game, selected]);

  return <div className="map-canvas" ref={hostRef} />;
}
