"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { MAP_SIZES, UNIT_DEFINITIONS, type Faction, type GameCommand, type GameState, type UnitKind } from "../game/model";
import { incomeForRank, progressToNextRank } from "../game/rules";
import { makeStore, resetState, setError, syncState, type AppDispatch, type RootState } from "../state/store";
import MapView from "./MapView";

const TECHNOLOGIES: Record<Faction, Array<{ name: string; detail: string }>> = {
  lorgoshki: [
    { name: "Нетворкинг", detail: "Найм и переговоры" },
    { name: "Хард-скиллы", detail: "Усиление атаки и дальности" },
    { name: "Гусиная терапия", detail: "Восстановление HP" },
  ],
  robots: [
    { name: "Термопаста", detail: "Защита от кофе и перегрева" },
    { name: "StarLinkedIn", detail: "Дальность и инфраструктура" },
    { name: "Соцсети", detail: "Ремонт алгоритмов и HP" },
  ],
};

const UNIT_BY_TIER: Record<Faction, UnitKind[]> = {
  lorgoshki: ["junior", "courier", "middle", "senior"],
  robots: ["workerBot", "drone", "vacuum"],
};

function createSeed(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function useGame() {
  return useSelector((state: RootState) => state.game.state);
}

function GameApp() {
  const dispatch = useDispatch<AppDispatch>();
  const game = useGame();
  const error = useSelector((state: RootState) => state.game.error);
  const workerRef = useRef<Worker | null>(null);
  const [faction, setFaction] = useState<Faction>("lorgoshki");
  const [mapSize, setMapSize] = useState(16);
  const [seed, setSeed] = useState(createSeed);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<{ x: number; y: number } | null>(null);
  const [showInspector, setShowInspector] = useState(true);

  useEffect(() => {
    const worker = new Worker(new URL("../game/worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<{ type: string; state?: GameState; message?: string }>) => {
      if (event.data.type === "STATE" && event.data.state) dispatch(syncState(event.data.state));
      else if (event.data.type === "ERROR") dispatch(setError(event.data.message ?? "Не удалось выполнить ход."));
    };
    worker.onerror = (event) => dispatch(setError(event.message || "Ошибка игрового потока."));

    const query = new URLSearchParams(window.location.search);
    const sharedSeed = query.get("seed");
    const sharedFaction = query.get("faction");
    const sharedSize = Number(query.get("map"));
    if (sharedSeed) {
      setSeed(sharedSeed);
      if (sharedFaction === "robots" || sharedFaction === "lorgoshki") setFaction(sharedFaction);
      if (MAP_SIZES.some((size) => size === sharedSize)) setMapSize(sharedSize);
      worker.postMessage({
        type: "START",
        seed: sharedSeed,
        size: MAP_SIZES.some((size) => size === sharedSize) ? sharedSize : 16,
        faction: sharedFaction === "robots" ? "robots" : "lorgoshki",
      } satisfies GameCommand);
    }

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [dispatch]);

  const send = (command: GameCommand) => {
    if (workerRef.current) {
      dispatch(setError(null));
      workerRef.current.postMessage(command);
    } else {
      dispatch(setError("Игровой поток ещё не готов. Обнови страницу."));
    }
  };

  const startGame = () => {
    const safeSeed = seed.trim() || createSeed();
    setSeed(safeSeed);
    setSelectedId(null);
    setSelectedPosition(null);
    window.history.replaceState({}, "", `${window.location.pathname}?seed=${encodeURIComponent(safeSeed)}&faction=${faction}&map=${mapSize}`);
    send({ type: "START", seed: safeSeed, size: mapSize, faction });
  };

  const units = game?.units ?? [];
  const selectedUnit = units.find((unit) => unit.id === selectedId);
  const selectedPositionVisible = Boolean(selectedPosition
    && game?.tiles[selectedPosition.y * game.size + selectedPosition.x]?.visible);
  const selectedBase = selectedPositionVisible
    ? game?.bases.find((base) => base.x === selectedPosition?.x && base.y === selectedPosition?.y)
    : undefined;
  const selectedTile = selectedPositionVisible
    ? game?.tiles.find((tile) => tile.x === selectedPosition?.x && tile.y === selectedPosition?.y)
    : undefined;
  const selectedOwnedBase = selectedBase?.owner === game?.playerFaction ? selectedBase : undefined;
  const selectedEnemy = selectedPositionVisible
    ? units.find((unit) => unit.x === selectedPosition?.x && unit.y === selectedPosition?.y && unit.faction !== game?.playerFaction)
    : undefined;
  const nearbyFriendlyUnit = units.find((unit) => unit.x === selectedPosition?.x && unit.y === selectedPosition?.y && unit.faction === game?.playerFaction);
  const selectedUnitDefinition = selectedUnit ? UNIT_DEFINITIONS[selectedUnit.kind] : null;
  const availableRecruit = selectedOwnedBase
    ? UNIT_BY_TIER[game?.playerFaction ?? faction].filter((kind) => UNIT_DEFINITIONS[kind].unlockRank <= selectedOwnedBase.rank)
    : [];
  const isKnownBase = (base: NonNullable<typeof game>["bases"][number]) =>
    base.owner === game?.playerFaction || game?.tiles[base.y * game.size + base.x]?.explored;
  const knownBases = game?.bases.filter(isKnownBase) ?? [];
  const enemyBases = knownBases.filter((base) => base.owner === game?.botFaction).length;
  const neutralBases = knownBases.filter((base) => base.owner === null).length;
  const knownBaseCount = knownBases.length;

  const selectTile = (x: number, y: number) => {
    const tileVisible = Boolean(game?.tiles[y * game.size + x]?.visible);
    const unitsOnTile = units.filter((candidate) => candidate.x === x && candidate.y === y
      && (tileVisible || candidate.faction === game?.playerFaction));
    setSelectedPosition({ x, y });
    const friendlyUnits = unitsOnTile.filter((candidate) => candidate.faction === game?.playerFaction);
    if (friendlyUnits.length) {
      const currentIndex = friendlyUnits.findIndex((candidate) => candidate.id === selectedId);
      const nextUnit = selectedPosition?.x === x && selectedPosition.y === y && currentIndex >= 0
        ? friendlyUnits[(currentIndex + 1) % friendlyUnits.length]
        : friendlyUnits[0];
      setSelectedId(nextUnit.id);
      return;
    }
    const unit = unitsOnTile[0];
    if (!selectedId) setSelectedId(units.find((candidate) => candidate.faction === game?.playerFaction)?.id ?? null);
    if (!game || !selectedId) return;

    const selected = units.find((candidate) => candidate.id === selectedId);
    if (!selected || (selected.x === x && selected.y === y)) return;
    const distance = Math.abs(selected.x - x) + Math.abs(selected.y - y);
    const attackRange = (selectedUnitDefinition?.range ?? 0) + game.tech[game.playerFaction][1];
    if (unit && unit.faction !== game.playerFaction && distance <= attackRange) {
      send({ type: "ATTACK", unitId: selected.id, x, y });
    } else if (!unit && !selected.moved && distance <= (selectedUnitDefinition?.move ?? 0) + 1) {
      send({ type: "MOVE", unitId: selected.id, x, y });
    }
  };

  const useResource = () => {
    if (selectedPosition && selectedUnit) {
      send({ type: "HARVEST", ...selectedPosition, unitId: selectedUnit.id });
    }
  };

  const canHarvest = Boolean(
    selectedTile
      && (selectedTile.terrain === "forest" || selectedTile.terrain === "mountain" || selectedTile.terrain === "water" || selectedTile.geese)
      && !selectedTile.poiClaimed
      && selectedUnit
      && !selectedUnit.moved
      && Math.abs(selectedUnit.x - selectedTile.x) + Math.abs(selectedUnit.y - selectedTile.y) <= 1
      && game?.bases.some((base) => base.owner === game.playerFaction
        && Math.abs(base.x - selectedTile.x) + Math.abs(base.y - selectedTile.y) <= 2),
  );

  if (!game) {
    return (
      <main className="landing">
        <div className="landing-grid" />
        <header className="topline"><span className="brand-mark">LS</span><span>Независимая стратегия · сезон 2026</span><span className="online"><i /> БЭКЕНД НЕ ТРЕБУЕТСЯ</span></header>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> АВТОНОМНАЯ 4X-СТРАТЕГИЯ</div>
            <h1>Lorgoshock<span>:</span><br /><em>Open to Work</em></h1>
            <p className="intro">Рынок перегрет. Карта поделена. Токенов хватит на один хороший ход. Решай, кто сегодня уйдёт пасти гусей.</p>
            <div className="hero-stats"><span><strong>4X</strong> expand your network</span><span><strong>0</strong> совещаний на сервере</span><span><strong>∞</strong> карьерных возможностей</span></div>
          </div>
          <div className="setup-card">
            <div className="card-kicker">НОВАЯ СЕССИЯ <span>01 — SETUP</span></div>
            <h2>Выбери сторону</h2>
            <div className="faction-options">
              <button className={`faction-option ${faction === "lorgoshki" ? "active human" : ""}`} onClick={() => setFaction("lorgoshki")} type="button">
                <span className="faction-emoji">🧑‍💻</span><span className="faction-label"><strong>Лоргошки</strong><small>ЕДА · WI-FI · САМОУВЕРЕННОСТЬ</small></span><span className="radio-dot" />
              </button>
              <button className={`faction-option ${faction === "robots" ? "active machine" : ""}`} onClick={() => setFaction("robots")} type="button">
                <span className="faction-emoji">🤖</span><span className="faction-label"><strong>Роботы</strong><small>ЛИТИЙ · СЕРВЕРЫ · АЛГОРИТМЫ</small></span><span className="radio-dot" />
              </button>
            </div>
            <div className="setup-row"><label htmlFor="map-size">РАЗМЕР КАРТЫ</label><select id="map-size" value={mapSize} onChange={(event) => setMapSize(Number(event.target.value))}>{MAP_SIZES.map((size) => <option value={size} key={size}>{size} × {size} · {size === 16 ? "Экспресс" : size === 24 ? "Карьера" : "Выгорание"}</option>)}</select></div>
            <div className="setup-row"><label htmlFor="seed">СИД МАТЧА</label><div className="seed-control"><input id="seed" value={seed} onChange={(event) => setSeed(event.target.value)} maxLength={24} /><button type="button" aria-label="Сгенерировать сид" onClick={() => setSeed(createSeed())}>⟳</button></div></div>
            <button type="button" className="launch-button" onClick={startGame}><span>НАЧАТЬ ПАРТИЮ</span><span>↗</span></button>
            <p className="setup-note">Мир и соперник создаются локально. <strong>Сервера не следят.</strong></p>
          </div>
        </section>
        <footer className="landing-footer"><span>ВЫХОД ЕСТЬ. НО ОН НЕ В КОМПАНИЮ.</span><span>НАЖМИ <kbd>НАЧАТЬ</kbd> И ПОСМОТРИ, КАК ПОЙДЁТ</span></footer>
      </main>
    );
  }

  return (
    <main className="game-screen">
      <header className="game-header">
        <a className="game-brand" href="./"><span className="brand-mark">LS</span><span>LORGOSHOCK<small>OPEN TO WORK</small></span></a>
        <div className="turn-indicator"><i /> ХОД {game.turn} <span>·</span> ТВОЯ ОЧЕРЕДЬ</div>
        <div className="header-right">
          <div className="wallet"><span>◈</span> {game.tokens[game.playerFaction]} <small>TOKENS</small></div>
          <button type="button" className={`inspector-toggle ${showInspector ? "selected" : ""}`} onClick={() => setShowInspector((shown) => !shown)}>⌘ <span>AI INSPECTOR</span></button>
          <button type="button" className="leave-button" onClick={() => { dispatch(resetState()); window.location.href = window.location.pathname; }}>ВЫЙТИ ↗</button>
        </div>
      </header>
      <section className="game-layout">
        <div className="map-column">
          <div className="map-caption"><span><i /> ПОЛЕ {game.size} × {game.size}</span><span>СИД · {game.seed}</span></div>
          <MapView game={game} selected={selectedPosition} onTileClick={selectTile} />
          <div className="map-legend"><span><i className="legend-human" />ТВОЯ КОМАНДА</span><span><i className="legend-enemy" />ИИ-КОРПОРАЦИЯ</span><span><i className="legend-neutral" />БЕСХОЗНАЯ БАЗА</span><span><i className="legend-fog" />ТУМАН ВОЙНЫ</span></div>
          <div className="map-tip">ВЫБЕРИ ГЕРОЯ И НАЖМИ НА ГОЛУБУЮ КЛЕТКУ ДЛЯ ХОДА · Закрепи за собой все базы</div>
        </div>
        <aside className="sidebar">
          <div className="faction-banner"><div><span className="mini-label">ТВОЯ ФРАКЦИЯ</span><strong>{game.playerFaction === "lorgoshki" ? "🧑‍💻 Лоргошки" : "🤖 Роботы"}</strong></div><span className="turn-number">#{game.turn.toString().padStart(2, "0")}</span></div>
          <div className="section-title"><span>ЭКОНОМИКА</span><span>ХОД / ТИК</span></div>
          <div className="economy-grid">
            <div className="economy-card"><span>◈</span><small>БЮДЖЕТ</small><strong>{game.tokens[game.playerFaction]}<i> T</i></strong></div>
            <div className="economy-card"><span>▤</span><small>{game.playerFaction === "lorgoshki" ? "КОМПАНИЙ" : "ФЕРМ"}</small><strong>{game.bases.filter((base) => base.owner === game.playerFaction).length}<i> / {knownBaseCount} ИЗВЕСТНЫХ</i></strong></div>
            <div className="economy-card"><span>⌁</span><small>ДОХОД</small><strong>+{game.bases.filter((base) => base.owner === game.playerFaction).reduce((sum, base) => sum + incomeForRank(base.rank), 0)}<i> / ход</i></strong></div>
            <div className="economy-card"><span>⚔</span><small>АРМИЯ</small><strong>{units.filter((unit) => unit.faction === game.playerFaction).length}<i> юн.</i></strong></div>
          </div>
          <div className="section-title detail-title"><span>ОБЪЕКТ</span>{selectedPosition && <span>{selectedPosition.x} · {selectedPosition.y}</span>}</div>
          <div className="object-card">
            {selectedOwnedBase ? (
              <>
                <div className="object-heading"><span className="object-icon">{game.playerFaction === "lorgoshki" ? "🏢" : "🏭"}</span><div><strong>{game.playerFaction === "lorgoshki" ? "Компания" : "Майнинг-ферма"}</strong><small>УРОВЕНЬ {selectedOwnedBase.rank} · +{incomeForRank(selectedOwnedBase.rank)} T / ХОД</small></div></div>
                <div className="garrison-note">{units.filter((unit) => unit.x === selectedOwnedBase.x && unit.y === selectedOwnedBase.y && unit.faction === game.playerFaction).length} юн. в гарнизоне · повторный клик выбирает бойца</div>
                <div className="progress-copy"><span>ПРОГРЕСС РАЗВИТИЯ</span><span>{selectedOwnedBase.rank >= 4 ? "MAX" : `${selectedOwnedBase.progress} / ${progressToNextRank(selectedOwnedBase.rank)}`}</span></div>
                <div className="progress-track"><span style={{ width: `${selectedOwnedBase.rank >= 4 ? 100 : Math.min(100, selectedOwnedBase.progress / progressToNextRank(selectedOwnedBase.rank) * 100)}%` }} /></div>
                <div className="recruit-heading"><span>ТРЕНИРОВКА В ГОРОДЕ</span><span>НАЙМ · TOKEN</span></div>
                <div className="recruit-list">{availableRecruit.map((kind) => {
                  const unit = UNIT_DEFINITIONS[kind];
                  const canAfford = game.tokens[game.playerFaction] >= unit.cost;
                  return <button type="button" key={kind} className="recruit-row" disabled={!canAfford || units.filter((candidate) => candidate.faction === game.playerFaction).length >= 3 + game.bases.filter((base) => base.owner === game.playerFaction).length + selectedOwnedBase.rank} onClick={() => send({ type: "HIRE", baseId: selectedOwnedBase.id, kind })}><span className="recruit-emoji">{unit.emoji}</span><span><strong>{unit.name}</strong><small>HP {unit.maxHp} · ATK {unit.attack} · MOV {unit.move}</small></span><span className="recruit-cost">{unit.cost} T</span></button>;
                })}</div>
              </>
            ) : selectedEnemy ? (
              <div className="object-heading"><span className="object-icon">{UNIT_DEFINITIONS[selectedEnemy.kind].emoji}</span><div><strong>{UNIT_DEFINITIONS[selectedEnemy.kind].name}</strong><small>ИИ · {selectedEnemy.hp} / {UNIT_DEFINITIONS[selectedEnemy.kind].maxHp} HP</small></div></div>
            ) : nearbyFriendlyUnit ? (
              <div className="object-heading"><span className="object-icon">{UNIT_DEFINITIONS[nearbyFriendlyUnit.kind].emoji}</span><div><strong>{UNIT_DEFINITIONS[nearbyFriendlyUnit.kind].name}</strong><small>{nearbyFriendlyUnit.hp} / {UNIT_DEFINITIONS[nearbyFriendlyUnit.kind].maxHp} HP · {nearbyFriendlyUnit.moved ? "ХОД СДЕЛАН" : "ГОТОВ К ХОДУ"}</small></div></div>
            ) : selectedBase ? (
              <div className="object-heading"><span className="object-icon">{selectedBase.owner ? "🏢" : "🏗️"}</span><div><strong>{selectedBase.owner ? "База противника" : "Бесхозный стартап"}</strong><small>{selectedBase.owner ? "Захвати — и он твой" : "Пройди собеседование"}</small></div></div>
            ) : (
              <div className="empty-selection">{selectedPosition ? "Пустая клетка. Разведай, найди ресурсы и расширь сеть." : "Выбери базу, юнита или ресурс на карте."}</div>
            )}
            {canHarvest && selectedPosition && <button className="secondary-action" type="button" onClick={useResource}>⌁ ИССЛЕДОВАТЬ РЕСУРС <span>→</span></button>}
          </div>
          <div className="section-title tech-title"><span>ДЕРЕВО ТЕХНОЛОГИЙ</span><span>3 ВЕТКИ · 3 УРОВНЯ</span></div>
          <div className="technology-list">{TECHNOLOGIES[game.playerFaction].map((tech, branch) => {
            const level = game.tech[game.playerFaction][branch];
            const cost = Math.min(15, (level + 1) * 5);
            return <div className="technology-row" key={tech.name}><div className={`technology-icon tech-${branch}`}>{["◎", "⌘", "✳"][branch]}</div><div className="technology-copy"><strong>{tech.name}</strong><small>{level >= 3 ? "ВЕТКА ИЗУЧЕНА" : `${tech.detail} · T${level + 1}`}</small><div className="tech-dots">{[0, 1, 2].map((stage) => <i key={stage} className={stage < level ? "done" : ""} />)}</div></div><button type="button" className="tech-button" disabled={level >= 3 || game.tokens[game.playerFaction] < cost} onClick={() => send({ type: "RESEARCH", branch })}>{level >= 3 ? "✓" : `${cost} T`}</button></div>;
          })}</div>
          <div className="section-title log-title"><span>ПОСЛЕДНИЕ СОБЫТИЯ</span></div>
          <div className="event-log" aria-live="polite">{game.logs.slice(0, 3).map((log, index) => <div key={`${log}-${index}`}><i />{log}</div>)}</div>
          <button type="button" className="end-turn-button" disabled={game.pendingCoffee !== null || game.status !== "running"} onClick={() => send({ type: "END_TURN" })}><span>КОНЕЦ ХОДА</span><span>→</span></button>
        </aside>
      </section>
      {showInspector && <section className="inspector-panel"><div className="inspector-header"><span><i /> AI INSPECTOR <small>UTILITY AI / LIVE TRACE</small></span><span>4 PHASES · {game.inspector.elapsedMs.toFixed(1)} ms</span></div><div className="inspector-phases">{game.inspector.phases.map((phase, index) => <span className={game.inspector.phases.length ? "phase-done" : ""} key={phase}><i>{String(index + 1).padStart(2, "0")}</i>{phase.replace(/^\d\d \/ /, "")}</span>)}</div><div className="inspector-decisions">{game.inspector.top.length ? game.inspector.top.slice(0, 4).map((decision, index) => <div key={`${decision.unit}-${decision.choice}-${index}`}><span className="decision-rank">0{index + 1}</span><span className="decision-unit">{decision.unit}</span><strong>{decision.choice}</strong><span className="decision-reason">{decision.reason}</span><span className="decision-score">{decision.score > 0 ? "+" : ""}{decision.score.toFixed(1)}</span></div>) : <div className="inspector-idle">ИИ оценивает экономику, разведку и угрозы. Передай ему ход — увидишь его расчёты здесь.</div>}</div></section>}
      {game.pendingCoffee && <div className="modal-backdrop"><section className="coffee-modal"><div className="eyebrow"><span className="eyebrow-line" /> НЕЙТРАЛЬНАЯ ТОЧКА</div><div className="coffee-cup">☕</div><h2>Перерыв у кофемашины</h2><p>Кофейня закрывается. Выбери бонус перед тем, как вернуться к собеседованиям.</p><div className="coffee-rewards"><button type="button" onClick={() => send({ type: "COFFEE", reward: "tokens" })}><span>◈</span><strong>ВНЕЗАПНЫЙ БОНУС</strong><small>+8 токенов в бюджет</small></button><button type="button" onClick={() => send({ type: "COFFEE", reward: "confidence" })}><span>♡</span><strong>АЙС-ЛАТТЕ</strong><small>+4 HP всем юнитам</small></button><button type="button" onClick={() => send({ type: "COFFEE", reward: "recruit" })}><span>↗</span><strong>РЕФЕРАЛЬНЫЙ НАЙМ</strong><small>Новый боец в команду</small></button></div></section></div>}
      {game.status !== "running" && <div className="modal-backdrop"><section className="result-modal"><div className="coffee-cup">{game.status === "won" ? "🏆" : "🪿"}</div><div className="eyebrow">{game.status === "won" ? "ВЫБРАЛИСЬ ИЗ СИСТЕМЫ" : "МЫ ПЕРЕСМОТРИМ ВАШЕ РЕЗЮМЕ"}</div><h2>{game.status === "won" ? "Вся карта — твоя." : "Пора пасти гусей."}</h2><p>{game.status === "won" ? "Каждая компания и майнинг-ферма теперь в твоих руках. Это и есть повышение." : "ИИ-корпорация захватила все базы. Иногда лучшая карьерная стратегия — начать заново."}</p><button className="launch-button" type="button" onClick={() => { dispatch(resetState()); window.location.href = window.location.pathname; }}>НОВАЯ СЕССИЯ <span>↗</span></button></section></div>}
      {error && <div className="error-toast" role="alert">{error}<button type="button" onClick={() => dispatch(setError(null))}>✕</button></div>}
      <footer className="game-footer"><span>СИД {game.seed} · АВТОСОХРАНЕНИЕ НЕ ТРЕБУЕТСЯ</span><span>{neutralBases} БЕСХОЗНЫХ · {enemyBases} ВРАЖЕСКИХ БАЗ</span></footer>
    </main>
  );
}

export default function GameShell() {
  const store = useMemo(() => makeStore(), []);
  return <Provider store={store}><GameApp /></Provider>;
}
