"use client";

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import { UNIT_DEFINITIONS, type GameState } from "../game/model";

type Props = {
  game: GameState;
  selected: { x: number; y: number } | null;
  onTileClick: (x: number, y: number) => void;
};

const TERRAIN_COLORS = {
  plain: 0x203b34,
  forest: 0x1d483c,
  mountain: 0x57524b,
  water: 0x1c3445,
};

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
    const app = new Application();

    const initialize = async () => {
      await app.init({
        resizeTo: host,
        background: "#111a18",
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
      const root = new Container();
      app.stage.addChild(root);
      rootRef.current = root;
      app.canvas.setAttribute("aria-label", "Интерактивная игровая карта. Нажмите на клетку, чтобы выбрать или переместить юнит.");
      app.canvas.addEventListener("pointerup", handleClick);
      drawLatest(root, app, gameRef.current, selectedRef.current);
    };

    const handleClick = (event: PointerEvent) => {
      const currentApp = appRef.current;
      if (!currentApp) return;
      const cell = Math.min(
        (currentApp.screen.width - 24) / game.size,
        (currentApp.screen.height - 24) / game.size,
      );
      const localX = event.offsetX * currentApp.screen.width / currentApp.canvas.clientWidth;
      const localY = event.offsetY * currentApp.screen.height / currentApp.canvas.clientHeight;
      const x = Math.floor((localX - (currentApp.screen.width - game.size * cell) / 2) / cell);
      const y = Math.floor((localY - (currentApp.screen.height - game.size * cell) / 2) / cell);
      if (x >= 0 && y >= 0 && x < game.size && y < game.size) callbackRef.current(x, y);
    };

    initialize().catch((error: unknown) => {
      if (active && host) host.dataset.error = error instanceof Error ? error.message : "Не удалось загрузить игровую карту.";
    });
    const observer = new ResizeObserver(() => {
      const currentRoot = rootRef.current;
      const currentApp = appRef.current;
      if (currentRoot && currentApp) {
        drawLatest(currentRoot, currentApp, gameRef.current, selectedRef.current);
      }
    });
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
    if (!root || !app) return;
    root.removeChildren().forEach((child) => child.destroy({ children: true }));
    drawLatest(root, app, game, selected);
  }, [game, selected]);

  return <div className="map-canvas" ref={hostRef} />;
}

function drawLatest(root: Container, app: Application, game: GameState, selected: Props["selected"]): void {
  const cell = Math.min((app.screen.width - 24) / game.size, (app.screen.height - 24) / game.size);
  const left = (app.screen.width - game.size * cell) / 2;
  const top = (app.screen.height - game.size * cell) / 2;
  root.position.set(left, top);
  const background = new Graphics();

  for (const tile of game.tiles) {
    const x = tile.x * cell;
    const y = tile.y * cell;
    background.rect(x + 0.6, y + 0.6, cell - 1.2, cell - 1.2).fill({
      color: tile.explored ? TERRAIN_COLORS[tile.terrain] : 0x0d1414,
      alpha: tile.visible ? 1 : tile.explored ? 0.35 : 1,
    });
    if (tile.visible && tile.poi && !tile.poiClaimed) {
      const icon = new Text({ text: tile.poi === "coffee" ? "☕" : "▣", style: { fontFamily: "Arial", fontSize: Math.max(8, cell * 0.5) } });
      icon.anchor.set(0.5);
      icon.position.set(x + cell / 2, y + cell / 2);
      root.addChild(icon);
    } else if (tile.visible && tile.geese && !tile.poiClaimed && cell >= 15) {
      const icon = new Text({ text: "🪿", style: { fontFamily: "Arial", fontSize: cell * 0.45 } });
      icon.anchor.set(0.5);
      icon.position.set(x + cell / 2, y + cell / 2);
      root.addChild(icon);
    } else if (tile.visible && tile.terrain === "forest" && cell >= 15) {
      const icon = new Text({ text: "♠", style: { fontFamily: "Arial", fontSize: cell * 0.5, fill: "#91a784" } });
      icon.anchor.set(0.5);
      icon.position.set(x + cell / 2, y + cell / 2);
      root.addChild(icon);
    } else if (tile.visible && tile.terrain === "mountain" && cell >= 15) {
      const icon = new Text({ text: "▲", style: { fontFamily: "Arial", fontSize: cell * 0.48, fill: "#c5b9a2" } });
      icon.anchor.set(0.5);
      icon.position.set(x + cell / 2, y + cell / 2);
      root.addChild(icon);
    } else if (tile.visible && tile.terrain === "water" && cell >= 19) {
      const icon = new Text({ text: "≈", style: { fontFamily: "Arial", fontSize: cell * 0.55, fill: "#6090a7" } });
      icon.anchor.set(0.5);
      icon.position.set(x + cell / 2, y + cell / 2);
      root.addChild(icon);
    }
  }
  root.addChildAt(background, 0);

  for (const base of game.bases) {
    const centerX = base.x * cell + cell / 2;
    const centerY = base.y * cell + cell / 2;
    const color = base.owner === game.playerFaction ? 0xf3bd61 : base.owner === game.botFaction ? 0xf08068 : 0xd9c899;
    const icon = new Graphics();
    icon.roundRect(centerX - cell * 0.38, centerY - cell * 0.38, cell * 0.76, cell * 0.76, Math.max(2, cell * 0.12))
      .fill({ color: 0x17201c }).stroke({ color, width: Math.max(1.2, cell * 0.06) });
    root.addChild(icon);
    if (cell >= 14) {
      const label = new Text({ text: base.owner === "robots" ? "⌘" : base.owner === "lorgoshki" ? "↗" : "＋", style: { fontFamily: "Arial", fontSize: cell * 0.4, fontWeight: "bold", fill: color } });
      label.anchor.set(0.5);
      label.position.set(centerX, centerY);
      root.addChild(label);
    }
    if (base.rank > 1) {
      const rank = new Text({ text: `${base.rank}`, style: { fontFamily: "Arial", fontSize: Math.max(8, cell * 0.26), fill: "#fff2d6" } });
      rank.anchor.set(0.5);
      rank.position.set(centerX + cell * 0.33, centerY - cell * 0.33);
      root.addChild(rank);
    }
  }

  for (const unit of game.units) {
    if (!game.tiles[unit.y * game.size + unit.x].visible && unit.faction !== game.playerFaction) continue;
    const x = unit.x * cell + cell / 2;
    const y = unit.y * cell + cell / 2;
    const accent = unit.faction === game.playerFaction ? 0xf3bd61 : 0xef8270;
    const marker = new Graphics();
    marker.circle(x, y, Math.max(5, cell * 0.39))
      .fill({ color: unit.faction === game.playerFaction ? 0x283126 : 0x2d2624 })
      .stroke({ color: accent, width: Math.max(1.5, cell * 0.075) });
    root.addChild(marker);
    if (cell >= 15) {
      const emoji = new Text({ text: UNIT_DEFINITIONS[unit.kind].emoji, style: { fontFamily: "Arial", fontSize: cell * 0.54 } });
      emoji.anchor.set(0.5);
      emoji.position.set(x, y);
      root.addChild(emoji);
    }
    const width = cell * 0.75;
    const bar = new Graphics();
    bar.roundRect(x - width / 2, y + cell * 0.31, width, Math.max(1.5, cell * 0.08), 2).fill({ color: 0x141616 });
    bar.roundRect(x - width / 2, y + cell * 0.31, width * unit.hp / UNIT_DEFINITIONS[unit.kind].maxHp, Math.max(1.5, cell * 0.08), 2)
      .fill({ color: unit.faction === game.playerFaction ? 0xf2bc59 : 0xed7768 });
    root.addChild(bar);
  }

  if (selected) {
    const outline = new Graphics();
    outline.rect(selected.x * cell + 1.5, selected.y * cell + 1.5, cell - 3, cell - 3)
      .stroke({ color: 0xf5ebca, alpha: 0.95, width: Math.max(1, cell * 0.065) });
    root.addChild(outline);
  }
}
