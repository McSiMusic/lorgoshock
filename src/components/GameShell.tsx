"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { MAP_SIZES, UNIT_BY_TIER, UNIT_DEFINITIONS, type BotAction, type CombatEvent, type Faction, type GameCommand, type GameEvent, type GameState, type IncomeEvent, type MovementEvent, type ResourceEvent, type UnitKind } from "../game/model";
import { COMBAT_DURATION, RESOURCE_DURATION, TRANSFORMATION_DURATION } from "../game/animation";
import { SAVE_KEY, savedGameSchema } from "../game/save";
import { attackRange, bridgeAxis, canAttack, canHarvest, canHarvestWithinCity, canMoveTo, cityCapacity, cityOccupancy, effectiveAttack, hasUnitAction, healingAmount, hireCost, incomeForRank, progressToNextRank, resourceCity as findResourceCity, resourceCost, resourceProgress } from "../game/rules";
import { unitPortraitPath } from "../game/unitArt";
import { makeStore, resetState, setError, syncState, type AppDispatch, type RootState } from "../state/store";
import MapView from "./MapView";
import TechnologyTree from "./TechnologyTree";

type Language = "en" | "ru";
type Panel = "tech" | "log" | null;

const TEXT: Record<Language, Record<string, string>> = {
  en: {
    tagline: "A bright, independent strategy · 2026", offline: "NO SERVER REQUIRED", strategy: "A BRIGHT 4X STRATEGY",
    intro: "Build your company, explore a vivid world, gather resources, and meet the rival robots.", newGame: "NEW GAME",
    chooseFaction: "Choose your team", lorgoshki: "Lorgoshki", robots: "Robots", mapSize: "MAP SIZE",
    quick: "Quick", career: "Career", large: "Large", start: "START GAME", local: "World and rival are generated locally.",
    resume: "RESUME GAME", saveError: "Unable to access the saved game in this browser.", invalidSave: "The saved game is invalid or from an unsupported version.",
    turn: "TURN", yourTurn: "YOUR TURN", opponentTurn: "OPPONENT'S TURN", leave: "EXIT", yourTeam: "YOUR TEAM", rival: "RIVAL ROBOTS",
    neutral: "UNCLAIMED STARTUP", fog: "UNDISCOVERED", tip: "Select a unit, then choose a highlighted tile to move. Click your company to train units.",
    openTech: "TECHNOLOGY", openLog: "LOG", emptyLog: "No events yet.", endTurn: "END TURN", city: "COMPANY", train: "TRAIN A UNIT IN YOUR COMPANY",
    level: "LEVEL", perTurn: "PER TURN", garrison: "Units here", expand: "EXPAND RESOURCE AREA TO 5×5",
    expanded: "RESOURCE AREA EXPANDED", resourceArea: "Resource area", research: "RESEARCH", branchDone: "COMPLETED",
    tokens: "TOKENS", close: "CLOSE", ready: "READY FOR ACTION", spent: "ACTION USED", unit: "UNIT",
    revealMap: "REVEAL MAP", revealMapHint: "Debug: reveal the map without changing visibility rules",
    opponent: "OPPONENT", neutralCity: "Unclaimed startup", empty: "Select a unit, company, or resource on the map.",
    resource: "GATHER RESOURCE", moveHere: "MOVE HERE", coffee: "Coffee break", coffeeText: "Choosing a bonus ends this unit's turn.",
    bonus: "TOKEN BONUS", heal: "HEAL", balcony: "CLIMB TO BALCONY", wifi: "CONNECT TO WI-FI", scouting: "Reveal radius 4", speed: "PERMANENT SPEED", collectCoins: "COLLECT BLET-COINS", robotCoffee: "Thermal latte: choosing a bonus ends this unit's turn.", next: "NEW GAME", won: "The rival has no companies left.",
    lost: "You have no companies left. Try a new strategy.", statusWin: "VICTORY", statusLost: "SESSION ENDED",
    cityHint: "Training happens here. Select a highlighted resource to gather it.", expandedMessage: "This company's resource area now covers 5×5 tiles.",
    cityFull: "Company capacity is full.", selectGarrison: "SELECT A UNIT",
    cityContested: "Company is being captured. Training and resource gathering are unavailable.",
    cityResources: "Click a resource inside the company border to gather it.",
    cityOccupied: "Move the unit out before training.",
    progress: "company progress", resourceTokens: "tokens",
    acceptOffer: "ACCEPT OFFER", layoff: "LAYOFF",
    forest: "Forest", geese: "Geese", mountain: "Mountain", water: "Water",
    forestHuman: "Turn trees into office decor and potted ficuses.", forestRobot: "Turn trees into pulp for 500-page NDAs.",
    geeseHuman: "Domesticate the goose for the team.", geeseRobot: "Cybernetically upgrade the goose into a robogoose.",
    mountainHuman: "Build hiking trails for the team.", mountainRobot: "Open lithium quarries for the machines.",
    waterHuman: "Organize a workation by the sea.", waterRobot: "Drain the water to cool data centers.",
    expandForResource: "Try expanding a company's resource area to reach this tile.",
    mountainVision: "A unit on a mountain reveals terrain within radius 3.", bridge: "BUILD BRIDGE", bridgeHint: "Build a bridge across one water tile for 5 tokens. Its direction is chosen automatically.", gathered: "Already gathered.",
    unavailable: "COMING LATER",
    builtBridge: "Bridge built.",
    resourceProgress: "PROGRESS", resourceAlternative: "TOKENS INSTEAD",
    aiFallback: "Unable to complete that action. Check the unit's range, terrain, and token cost.",
    playerCount: "COMPANIES", army: "UNITS", income: "INCOME", objective: "CONTROL THE MAP",
    welcomeTitle: "Your mission, should HR approve", welcomeText: "Explore, collect resources and grow your companies. Capture the rival's last company to win. Keep your team alive: even robots dislike surprise layoffs.",
    startupTitle: "UNCLAIMED STARTUP", startupDetail: "An independent garage startup. Move a unit here, survive until the next turn, then accept the offer or perform a layoff to take it over.",
    enemyCompany: "RIVAL COMPANY", enemyCompanyDetail: "The rival owns this company. Defeat any defender, then hold it until the next turn to take it over.",
    treasureTitle: "BLET-COINS", treasureDetail: "Move a unit here and wait until next turn. Click the coin icon to collect +7 tokens instead of moving.",
    coffeeTitle: "COFFEE SHOP", coffeeDetail: "Move a unit here and wait until next turn to choose a coffee-break bonus.",
    attackStat: "ATK", rangeStat: "RANGE", droneDetail: "Fast drone: weak ranged attack (2 tiles).",
  },
  ru: {
    tagline: "Яркая независимая стратегия · 2026", offline: "СЕРВЕР НЕ НУЖЕН", strategy: "ЯРКАЯ СТРАТЕГИЯ 4X",
    intro: "Развивай компанию, исследуй красочный мир, собирай ресурсы и встречай роботов-соперников.", newGame: "НОВАЯ ИГРА",
    chooseFaction: "Выбери команду", lorgoshki: "Лоргошки", robots: "Роботы", mapSize: "РАЗМЕР КАРТЫ",
    quick: "Быстрая", career: "Карьера", large: "Большая", start: "НАЧАТЬ ИГРУ", local: "Мир и соперник создаются локально.",
    resume: "ПРОДОЛЖИТЬ ИГРУ", saveError: "Не удалось получить доступ к сохранению в браузере.", invalidSave: "Сохранение повреждено или создано неподдерживаемой версией.",
    turn: "ХОД", yourTurn: "ТВОЯ ОЧЕРЕДЬ", opponentTurn: "ХОД СОПЕРНИКА", leave: "ВЫЙТИ", yourTeam: "ТВОЯ КОМАНДА", rival: "РОБОТЫ-СОПЕРНИКИ",
    neutral: "СВОБОДНЫЙ СТАРТАП", fog: "НЕ ИССЛЕДОВАНО", tip: "Выбери юнита, затем нажми на подсвеченную клетку. Нажми на компанию, чтобы тренировать юнитов.",
    openTech: "ТЕХНОЛОГИИ", openLog: "ЖУРНАЛ", emptyLog: "Событий пока нет.", endTurn: "ЗАВЕРШИТЬ ХОД", city: "КОМПАНИЯ", train: "ТРЕНИРОВКА ЮНИТА В КОМПАНИИ",
    level: "УРОВЕНЬ", perTurn: "ЗА ХОД", garrison: "Юнитов здесь", expand: "РАСШИРИТЬ ОБЛАСТЬ РЕСУРСОВ ДО 5×5",
    expanded: "ОБЛАСТЬ РЕСУРСОВ РАСШИРЕНА", resourceArea: "Область ресурсов", research: "ИЗУЧИТЬ", branchDone: "ИЗУЧЕНО",
    tokens: "ТОКЕНОВ", close: "ЗАКРЫТЬ", ready: "ГОТОВ К ДЕЙСТВИЮ", spent: "ДЕЙСТВИЕ ИСПОЛЬЗОВАНО", unit: "ЮНИТ",
    revealMap: "ОТКРЫТЬ КАРТУ", revealMapHint: "Отладка: открыть карту, не меняя правила видимости",
    opponent: "СОПЕРНИК", neutralCity: "Свободный стартап", empty: "Выбери юнита, компанию или ресурс на карте.",
    resource: "СОБРАТЬ РЕСУРС", moveHere: "ПЕРЕЙТИ СЮДА", coffee: "Кофе-брейк", coffeeText: "Выбор бонуса завершает ход этого юнита.",
    bonus: "БОНУС ТОКЕНОВ", heal: "ЛЕЧЕНИЕ", balcony: "ПОДНЯТЬСЯ НА БАЛКОН", wifi: "ПОДКЛЮЧИТЬСЯ К WI-FI", scouting: "Открыть радиус 4", speed: "СКОРОСТЬ НАВСЕГДА", collectCoins: "СОБРАТЬ BLET-КОИНЫ", robotCoffee: "Термолатте: выбор бонуса завершает ход этого юнита.", next: "НОВАЯ ИГРА", won: "У соперника не осталось компаний.",
    lost: "У тебя не осталось компаний. Попробуй другую стратегию.", statusWin: "ПОБЕДА", statusLost: "ИГРА ЗАВЕРШЕНА",
    cityHint: "Тренировка проходит здесь. Выбери подсвеченный ресурс, чтобы собрать его.", expandedMessage: "Область ресурсов компании теперь охватывает 5×5 клеток.",
    cityFull: "Вместимость компании исчерпана.", selectGarrison: "ВЫБРАТЬ ЮНИТА",
    cityContested: "Компанию захватывают. Обучение и сбор ресурсов недоступны.",
    cityResources: "Нажми на ресурс в пределах компании, чтобы собрать его.",
    cityOccupied: "Выведи юнита из компании перед тренировкой.",
    progress: "прогресса компании", resourceTokens: "токенов",
    acceptOffer: "ПРИНЯТЬ ОФФЕР", layoff: "СОКРАЩЕНИЕ",
    forest: "Лес", geese: "Гуси", mountain: "Горы", water: "Вода",
    forestHuman: "Вырубить деревья для дизайна офиса и фикусов.", forestRobot: "Переработать деревья в целлюлозу для 500-страничных NDA.",
    geeseHuman: "Одомашнить гуся для команды.", geeseRobot: "Кибернетизировать гуся и превратить его в робогуся.",
    mountainHuman: "Открыть хайк-тропы для команды.", mountainRobot: "Открыть литиевые карьеры для машин.",
    waterHuman: "Устроить воркейшн у моря.", waterRobot: "Осушить водоём для охлаждения дата-центров.",
    expandForResource: "Попробуй расширить область ресурсов компании, чтобы добраться до этой клетки.",
    mountainVision: "Юнит на горе открывает местность в радиусе 3 клеток.", bridge: "ПОСТРОИТЬ МОСТ", bridgeHint: "Мост за 5 токенов занимает одну водную клетку. Направление выбирается автоматически.", gathered: "Ресурс уже собран.",
    unavailable: "ПОЗЖЕ",
    builtBridge: "Мост построен.",
    resourceProgress: "ПРОГРЕСС", resourceAlternative: "ВМЕСТО ПРОГРЕССА",
    aiFallback: "Не удалось выполнить действие. Проверь дальность, тип местности и стоимость в токенах.",
    playerCount: "КОМПАНИИ", army: "ЮНИТЫ", income: "ДОХОД", objective: "КОНТРОЛИРУЙ КАРТУ",
    welcomeTitle: "Твоя миссия, если HR одобрит", welcomeText: "Исследуй мир, собирай ресурсы и развивай компании. Захвати последнюю компанию соперника, чтобы победить. Береги команду: даже роботы не любят внезапные сокращения.",
    startupTitle: "СВОБОДНЫЙ СТАРТАП", startupDetail: "Независимый стартап в гараже. Поставь сюда юнита, продержись до следующего хода и прими оффер или проведи сокращение, чтобы захватить компанию.",
    enemyCompany: "КОМПАНИЯ СОПЕРНИКА", enemyCompanyDetail: "Эта компания принадлежит сопернику. Победи защитника и удерживай компанию до следующего хода, чтобы её захватить.",
    treasureTitle: "BLET-КОИНЫ", treasureDetail: "Поставь сюда юнита и дождись следующего хода. Нажми на значок монеты: +7 токенов вместо движения.",
    coffeeTitle: "КОФЕЙНЯ", coffeeDetail: "Поставь сюда юнита и дождись следующего хода, чтобы выбрать бонус кофе-брейка.",
    attackStat: "АТАКА", rangeStat: "ДАЛЬНОСТЬ", droneDetail: "Быстрый дрон: слабая дальняя атака (2 клетки).",
  },
};

const UNIT_ART: Record<UnitKind, string> = {
  junior: "hipster-man", courier: "courier-scooter-woman", middle: "hipster-woman-alt", senior: "senior-hipster",
  workerBot: "robot-worker", drone: "robot-drone", vacuum: "robot-vacuum",
};

const UNIT_NAMES: Record<Language, Partial<Record<UnitKind, string>>> = {
  en: { junior: "Junior", courier: "Courier", middle: "Mid-level", senior: "Senior", workerBot: "Worker bot", drone: "Optimizer drone", vacuum: "Blade vacuum" },
  ru: {},
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
  const [language, setLanguage] = useState<Language>("en");
  const [faction, setFaction] = useState<Faction>("lorgoshki");
  const [mapSize, setMapSize] = useState(16);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCoffeeId, setSelectedCoffeeId] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<{ x: number; y: number; baseId: string } | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [revealMap, setRevealMap] = useState(false);
  const [combatEvents, setCombatEvents] = useState<CombatEvent[]>([]);
  const [resourceEvents, setResourceEvents] = useState<ResourceEvent[]>([]);
  const [incomeEvents, setIncomeEvents] = useState<IncomeEvent[]>([]);
  const [pendingIncome, setPendingIncome] = useState<Record<number, number>>({});
  const incomeArrived = useCallback((id: number, amount: number, complete: boolean) => {
    if (complete) setIncomeEvents((events) => events.filter((event) => event.id !== id));
    setPendingIncome((pending) => {
      if (pending[id] === undefined) return pending;
      const next = { ...pending };
      next[id] -= amount;
      if (next[id] <= 0) delete next[id];
      return next;
    });
  }, []);
  const [movementEvents, setMovementEvents] = useState<MovementEvent[]>([]);
  const [focusTarget, setFocusTarget] = useState<{ id: number; x: number; y: number } | null>(null);
  const [replaying, setReplaying] = useState(false);
  const replayingRef = useRef(false);
  const arrivedResourcesRef = useRef<number[]>([]);
  const resourceArrived = useCallback((id: number) => {
    setResourceEvents((events) => events.filter((event) => event.id !== id));
    if (replayingRef.current) arrivedResourcesRef.current.push(id);
    else workerRef.current?.postMessage({ type: "RESOURCE_ARRIVED", id } satisfies GameCommand);
  }, []);
  const replayTimerRef = useRef<number | null>(null);
  const focusIdRef = useRef(0);
  const focusArrivalRef = useRef<{ id: number; run: () => void } | null>(null);
  const focusArrived = useCallback((id: number) => {
    if (focusArrivalRef.current?.id !== id) return;
    const { run } = focusArrivalRef.current;
    focusArrivalRef.current = null;
    run();
  }, []);
  const [resultPending, setResultPending] = useState(false);
  const animationsFinished = useCallback(() => { if (!replayingRef.current) setResultPending(false); }, []);
  const [savedGame, setSavedGame] = useState<GameState | null>(null);
  const [storageError, setStorageError] = useState<"saveError" | "invalidSave" | null>(null);
  const [notices, setNotices] = useState<GameEvent[]>([]);
  const dismissNotice = useCallback((id: number) => {
    setNotices((previous) => previous.filter((notice) => notice.id !== id));
  }, []);
  const [welcome, setWelcome] = useState(false);
  const startingRef = useRef(false);
  const languageRef = useRef(language);
  languageRef.current = language;
  const text = TEXT[language];
  const unitName = (kind: UnitKind) => UNIT_NAMES[language][kind] ?? UNIT_DEFINITIONS[kind].name;
  const getError = (message?: string) => languageRef.current === "en"
    ? TEXT.en.aiFallback
    : message ?? TEXT.ru.aiFallback;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("lorgoshock-language");
      if (saved === "en" || saved === "ru") setLanguage(saved);
    } catch {
      setStorageError("saveError");
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("lorgoshock-language", language);
    } catch {
      setStorageError("saveError");
    }
  }, [language]);

  useEffect(() => {
    let restored: GameState | null = null;
    let savePresent = false;
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        savePresent = true;
        const parsed = savedGameSchema.safeParse(JSON.parse(raw));
        if (parsed.success) restored = parsed.data;
        else setStorageError("invalidSave");
      }
    } catch (error) {
      savePresent = true;
      setStorageError(error instanceof SyntaxError ? "invalidSave" : "saveError");
    }
    setSavedGame(restored);
    const worker = new Worker(new URL("../game/worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<{ type: string; state?: GameState; message?: string; combatEvents?: CombatEvent[]; resourceEvents?: ResourceEvent[]; incomeEvents?: IncomeEvent[]; movementEvents?: MovementEvent[]; events?: GameEvent[]; botActions?: BotAction[] }>) => {
      if (event.data.type === "STATE" && event.data.state) {
        const state = event.data.state;
        if (state.status !== "running") setResultPending(true);
        if (startingRef.current) {
          setWelcome(true);
          startingRef.current = false;
        }
        try {
          if (state.status === "running") {
            window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
            setSavedGame(state);
          } else {
            window.localStorage.removeItem(SAVE_KEY);
            setSavedGame(null);
          }
          setStorageError(null);
        } catch {
          setStorageError("saveError");
        }
        const steps = event.data.botActions ?? [];
        const stepCombatIds = new Set(steps.flatMap((step) => step.combatEvents.map((item) => item.id)));
        const stepResourceIds = new Set(steps.flatMap((step) => step.resourceEvents.map((item) => item.id)));
        const stepMovementIds = new Set(steps.flatMap((step) => step.movementEvents.map((item) => item.id)));
        const stepNoticeIds = new Set(steps.flatMap((step) => step.events.map((item) => item.id)));
        const appendEvents = (combat: CombatEvent[], resources: ResourceEvent[], movements: MovementEvent[], notices: GameEvent[]) => {
          if (combat.length) setCombatEvents((previous) => [...previous, ...combat].slice(-100));
          if (resources.length) setResourceEvents((previous) => [...previous, ...resources].slice(-100));
          if (movements.length) setMovementEvents((previous) => [...previous, ...movements].slice(-100));
          if (notices.length) setNotices((previous) => [...previous, ...notices]);
        };
        appendEvents(
          (event.data.combatEvents ?? []).filter((item) => !stepCombatIds.has(item.id)),
          (event.data.resourceEvents ?? []).filter((item) => !stepResourceIds.has(item.id)),
          (event.data.movementEvents ?? []).filter((item) => !stepMovementIds.has(item.id)),
          (event.data.events ?? []).filter((item) => !stepNoticeIds.has(item.id)),
        );
        if (event.data.incomeEvents?.length) {
          const income = event.data.incomeEvents;
          setPendingIncome((previous) => {
            const next = { ...previous };
            income.forEach((entry) => { next[entry.id] = entry.amount; });
            return next;
          });
          setIncomeEvents((previous) => [...previous, ...income]);
        }
        if (!steps.length) {
          replayingRef.current = false;
          setReplaying(false);
          dispatch(syncState(state));
        } else {
          replayingRef.current = true;
          setReplaying(true);
          let index = 0;
          const next = () => {
            const step = steps[index++];
            if (!step) {
              replayingRef.current = false;
              setReplaying(false);
              setFocusTarget(null);
              if (state.status !== "running") setResultPending(true);
              dispatch(syncState(state));
              for (const id of arrivedResourcesRef.current.splice(0)) {
                workerRef.current?.postMessage({ type: "RESOURCE_ARRIVED", id } satisfies GameCommand);
              }
              replayTimerRef.current = null;
              return;
            }
            dispatch(syncState(step.before));
            const focusId = ++focusIdRef.current;
            focusArrivalRef.current = { id: focusId, run: () => {
              dispatch(syncState(step.after));
              appendEvents(step.combatEvents, step.resourceEvents, step.movementEvents, step.events);
              const transformed = step.before.bases.some((base) => {
                const after = step.after.bases.find((entry) => entry.id === base.id);
                return after && (after.rank !== base.rank || after.owner !== base.owner);
              });
              const duration = Math.max(300, step.combatEvents.length * COMBAT_DURATION + 80,
                step.resourceEvents.length ? RESOURCE_DURATION : 0, transformed ? TRANSFORMATION_DURATION : 0);
              replayTimerRef.current = window.setTimeout(next, duration);
            } };
            setFocusTarget({ id: focusId, ...step.position });
          };
          next();
        }
      }
      else if (event.data.type === "ERROR") {
        startingRef.current = false;
        replayingRef.current = false;
        arrivedResourcesRef.current = [];
        focusArrivalRef.current = null;
        setReplaying(false);
        dispatch(setError(getError(event.data.message)));
      }
    };
    worker.onerror = (event) => {
      replayingRef.current = false;
      setReplaying(false);
      dispatch(setError(getError(event.message)));
    };
    const query = new URLSearchParams(window.location.search);
    const sharedSeed = query.get("seed");
    const sharedFaction = query.get("faction");
    const sharedSize = Number(query.get("map"));
    if (sharedSeed && !savePresent) {
      startingRef.current = true;
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
      if (replayTimerRef.current !== null) window.clearTimeout(replayTimerRef.current);
      replayingRef.current = false;
      worker.terminate();
      workerRef.current = null;
    };
  }, [dispatch]);

  const send = (command: GameCommand) => {
    if (replayingRef.current) return;
    if (!workerRef.current) {
      dispatch(setError(text.aiFallback));
      return;
    }
    dispatch(setError(null));
    if (command.type === "END_TURN") {
      replayingRef.current = true;
      setReplaying(true);
      setSelectedId(null);
      setSelectedCoffeeId(null);
      setSelectedPosition(null);
      setSelectedCityId(null);
      setSelectedResource(null);
      setPanel(null);
    }
    if (command.type === "START") startingRef.current = true;
    if (command.type === "RESUME") { startingRef.current = false; setWelcome(false); }
    workerRef.current.postMessage(command);
  };

  const startGame = () => {
    const safeSeed = createSeed();
    setCombatEvents([]);
    setResourceEvents([]);
    setIncomeEvents([]);
    setPendingIncome({});
    setMovementEvents([]);
    setNotices([]);
    setResultPending(false);
    setSelectedId(null);
    setSelectedCoffeeId(null);
    setSelectedPosition(null);
    setSelectedCityId(null);
    setSelectedResource(null);
    setPanel(null);
    window.history.replaceState({}, "", `${window.location.pathname}?seed=${encodeURIComponent(safeSeed)}&faction=${faction}&map=${mapSize}`);
    send({ type: "START", seed: safeSeed, size: mapSize, faction });
  };

  const units = game?.units ?? [];
  const displayedTokens = game ? game.tokens[game.playerFaction] - Object.values(pendingIncome).reduce((sum, amount) => sum + amount, 0) : 0;
  const income = game ? game.bases.filter((base) => base.owner === game.playerFaction)
    .reduce((sum, base) => sum + incomeForRank(base.rank), 0) : 0;
  const selectedUnit = units.find((unit) => unit.id === selectedId);
  const resourceCity = game?.bases.find((base) => base.id === selectedCityId && base.owner === game.playerFaction);
  const availableRecruit = resourceCity && game
    ? UNIT_BY_TIER[game.playerFaction].filter((kind) => UNIT_DEFINITIONS[kind].unlockRank <= resourceCity.rank)
    : [];
  const knownBases = game?.bases.filter((base) => base.owner === game.playerFaction || game.tiles[base.y * game.size + base.x]?.explored) ?? [];
  const enemyBases = knownBases.filter((base) => base.owner === game?.botFaction).length;
  const neutralBases = knownBases.filter((base) => base.owner === null).length;
  const cityUnitCount = resourceCity && game ? cityOccupancy(game, resourceCity) : 0;
  const cityRecruitLimitReached = Boolean(resourceCity && cityUnitCount >= cityCapacity(resourceCity));
  const cityOccupied = Boolean(resourceCity && units.some((unit) => unit.x === resourceCity.x && unit.y === resourceCity.y));
  const resourceTile = selectedResource ? game?.tiles[selectedResource.y * game.size + selectedResource.x] : undefined;
  const resourceBase = selectedResource && game ? game.bases.find((base) => base.id === selectedResource.baseId) : undefined;
  const selectedCapture = selectedUnit && game?.bases.find((base) => base.capture?.unitId === selectedUnit.id
    && base.capture.faction === game.playerFaction && base.capture.readyTurn <= game.turn);
  const coffeeUnit = units.find((unit) => unit.id === (selectedCoffeeId ?? selectedId) && unit.faction === game?.playerFaction);
  const selectedCoffee = game?.coffeeBreaks.find((coffee) => coffee.unitId === coffeeUnit?.id
    && coffee.readyTurn <= game.turn && coffeeUnit.x === coffee.x && coffeeUnit.y === coffee.y);
  const selectedCoins = game?.coinVisits.find((visit) => visit.unitId === selectedId
    && visit.readyTurn <= game.turn && selectedUnit?.x === visit.x && selectedUnit.y === visit.y);
  const inspectedTile = selectedPosition && game ? game.tiles[selectedPosition.y * game.size + selectedPosition.x] : undefined;
  const describedTile = resourceTile ?? (!selectedUnit && !resourceCity && inspectedTile?.explored ? inspectedTile : undefined);
  const bridgeBase = describedTile && game && describedTile.terrain === "water"
    ? game.bases.find((base) => bridgeAxis(game, base, describedTile))
      ?? game.bases.find((base) => base.owner === game.playerFaction && !base.capture)
    : undefined;
  const inspectedBase = inspectedTile && (inspectedTile.explored || revealMap) && game
    ? game.bases.find((base) => base.x === inspectedTile.x && base.y === inspectedTile.y && base.owner !== game.playerFaction)
    : undefined;
  const inspectedEnemy = inspectedTile && (inspectedTile.explored || revealMap) && game
    ? units.find((unit) => unit.x === inspectedTile.x && unit.y === inspectedTile.y && unit.faction !== game.playerFaction)
    : undefined;

  const selectTile = (x: number, y: number) => {
    if (!game) return;
    const tile = game.tiles[y * game.size + x];
    const base = game.bases.find((candidate) => candidate.x === x && candidate.y === y);
    const ownUnit = units.find((unit) => unit.x === x && unit.y === y && unit.faction === game.playerFaction);
    const enemy = tile.explored ? units.find((unit) => unit.x === x && unit.y === y && unit.faction !== game.playerFaction) : undefined;
    const attacker = units.find((unit) => unit.id === selectedId);
    setSelectedCoffeeId(null);
    setSelectedResource(null);
    if (enemy && attacker && canAttack(game, attacker, enemy)) {
      setPanel(null);
      setSelectedCityId(null);
      send({ type: "ATTACK", unitId: attacker.id, x, y });
      return;
    }
    if (attacker && canMoveTo(game, attacker, { x, y })) {
      setSelectedCityId(null);
      setPanel(null);
      setSelectedPosition({ x, y });
      send({ type: "MOVE", unitId: attacker.id, x, y });
      return;
    }
    if (base?.owner === game.playerFaction && (!ownUnit || (selectedUnit?.x === x && selectedUnit.y === y))) {
      setSelectedPosition({ x, y });
      setSelectedCityId(base.id);
      setSelectedId(null);
      setPanel(null);
      return;
    }
    setPanel(null);
    const gatheringCity = !enemy && (!ownUnit || selectedId === ownUnit.id) ? findResourceCity(game, tile, selectedCityId) : undefined;
    if (gatheringCity) {
      setSelectedCityId(null);
      setSelectedId(null);
      setSelectedPosition({ x, y });
      setSelectedResource({ x, y, baseId: gatheringCity.id });
      return;
    }
    if (ownUnit) {
      setSelectedCityId(null);
      setSelectedResource(null);
      setSelectedPosition({ x, y });
      setSelectedId(ownUnit.id);
      return;
    }
    const targetUnit = tile.explored ? units.find((unit) => unit.x === x && unit.y === y) : undefined;
    const selected = units.find((unit) => unit.id === selectedId);
    setSelectedCityId(null);
    if (!selected || (selected.x === x && selected.y === y)) {
      setSelectedPosition({ x, y });
      setSelectedId(null);
      return;
    }
    if (targetUnit && canAttack(game, selected, targetUnit)) {
      send({ type: "ATTACK", unitId: selected.id, x, y });
    } else if (!targetUnit && canMoveTo(game, selected, { x, y })) {
      setSelectedPosition({ x, y });
      send({ type: "MOVE", unitId: selected.id, x, y });
    } else {
      setSelectedPosition({ x, y });
      setSelectedId(null);
    }
  };

  const clearGame = () => {
    if (replayTimerRef.current !== null) window.clearTimeout(replayTimerRef.current);
    replayTimerRef.current = null;
    focusArrivalRef.current = null;
    replayingRef.current = false;
    arrivedResourcesRef.current = [];
    setReplaying(false);
    setFocusTarget(null);
    dispatch(resetState());
    setCombatEvents([]);
    setResourceEvents([]);
    setIncomeEvents([]);
    setPendingIncome({});
    setMovementEvents([]);
    setNotices([]);
    setResultPending(false);
    setRevealMap(false);
    window.history.replaceState({}, "", window.location.pathname);
    setPanel(null);
    setSelectedId(null);
    setSelectedCoffeeId(null);
    setSelectedPosition(null);
    setSelectedCityId(null);
    setSelectedResource(null);
  };

  if (!game) {
    return (
      <main className="landing">
        <div className="landing-grid" />
        <header className="topline">
          <span className="brand-mark">LS</span><span>{text.tagline}</span>
          <div className="landing-controls"><span className="online"><i /> {text.offline}</span><LanguageSwitch language={language} setLanguage={setLanguage} /></div>
        </header>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> {text.strategy}</div>
            <h1>Lorgoshock<span>:</span><br /><em>Open to Work</em></h1>
            <p className="intro">{text.intro}</p>
            <div className="hero-stats"><span><strong>4X</strong> explore and expand</span><span><strong>24×24</strong> maximum map</span><span><strong>0</strong> server required</span></div>
          </div>
          <div className="setup-card">
            <div className="card-kicker">{text.newGame}<span>01 — SETUP</span></div>
            <h2>{text.chooseFaction}</h2>
            <div className="faction-options">
              <button className={`faction-option ${faction === "lorgoshki" ? "active human" : ""}`} onClick={() => setFaction("lorgoshki")} type="button">
                <span className="faction-emoji">🧑‍💻</span><span className="faction-label"><strong>{text.lorgoshki}</strong><small>PEOPLE · IDEAS · GEESE</small></span><span className="radio-dot" />
              </button>
              <button className={`faction-option ${faction === "robots" ? "active machine" : ""}`} onClick={() => setFaction("robots")} type="button">
                <span className="faction-emoji">🤖</span><span className="faction-label"><strong>{text.robots}</strong><small>LITHIUM · SERVERS · ALGORITHMS</small></span><span className="radio-dot" />
              </button>
            </div>
            <div className="setup-row"><label htmlFor="map-size">{text.mapSize}</label><select id="map-size" value={mapSize} onChange={(event) => setMapSize(Number(event.target.value))}>{MAP_SIZES.map((size) => <option value={size} key={size}>{size} × {size} · {size === 8 ? text.quick : size === 16 ? text.career : text.large}</option>)}</select></div>
            <button type="button" className="launch-button" onClick={startGame}><span>{text.start}</span><span>↗</span></button>
            {savedGame && <button type="button" className="launch-button resume-button" onClick={() => {
              window.history.replaceState({}, "", window.location.pathname);
              setCombatEvents([]);
              setResourceEvents([]);
              setIncomeEvents([]);
              setPendingIncome({});
              setMovementEvents([]);
              setNotices([]);
              send({ type: "RESUME", state: savedGame });
            }}><span>{text.resume}</span><span>↗</span></button>}
            {storageError && <p role="alert">{text[storageError]}</p>}
            <p className="setup-note">{text.local}</p>
          </div>
        </section>
        <footer className="landing-footer"><span>{text.objective}</span><span>{language === "ru" ? "Вдохновлено " : "Inspired by "}<a href="https://polytopia.io/" target="_blank" rel="noopener noreferrer">The Battle of Polytopia</a></span></footer>
      </main>
    );
  }

  return (
    <main className="game-screen">
      <header className="game-header">
        <div className="turn-indicator"><i /> {text.turn} {game.turn} <span>·</span> {replaying ? text.opponentTurn : text.yourTurn}</div>
        <div className="header-right">
          <div className="wallet"><span>◈</span> {displayedTokens}T <small>(+{income} {text.tokens})</small></div>
          <LanguageSwitch language={language} setLanguage={setLanguage} />
          <button type="button" className="leave-button" onClick={clearGame}>{text.leave} ↗</button>
        </div>
      </header>
      <div className="event-queue" aria-live="polite" aria-relevant="additions">
        {notices.slice(0, 2).map((notice) => <EventToast key={notice.id} notice={notice} language={language} dismiss={dismissNotice} />)}
      </div>
      {storageError && <div className="save-warning" role="alert">{text[storageError]}</div>}
      <section className="game-layout">
        <div className="map-column">
          <label className="fog-toggle" title={text.revealMapHint}>
            <span>DEBUG · {text.revealMap}</span>
            <input type="checkbox" role="switch" checked={revealMap} onChange={(event) => setRevealMap(event.target.checked)} aria-label={text.revealMapHint} />
          </label>
          <MapView game={game} selected={selectedUnit ? { x: selectedUnit.x, y: selectedUnit.y } : selectedPosition} selectedUnitId={selectedId} selectedCityId={resourceCity?.id ?? null} language={language} revealMap={revealMap} combatEvents={combatEvents} resourceEvents={resourceEvents} incomeEvents={incomeEvents} movementEvents={movementEvents} focusTarget={focusTarget} onFocusArrived={focusArrived} onIncomeArrived={incomeArrived} onResourceArrived={resourceArrived} onAnimationsFinished={animationsFinished} onTileClick={selectTile} onSelectCoffee={(unitId) => { setSelectedCoffeeId(unitId); setSelectedId(null); setSelectedPosition(null); setSelectedCityId(null); setSelectedResource(null); setPanel(null); }} onCapture={(baseId, unitId) => send({ type: "CAPTURE", baseId, unitId })} onCollectCoins={(unitId) => send({ type: "COLLECT_COINS", unitId })} />
          <div className="map-legend"><span><i className="legend-human" />{text.yourTeam}</span><span><i className="legend-enemy" />{text.rival}</span><span><i className="legend-neutral" />{text.neutral}</span><span><i className="legend-fog" />{text.fog}</span></div>
          <div className="map-tip">{text.tip}</div>
          {resourceCity && <div className="context-actions" aria-label={text.train}>
            <div className="context-title">{resourceCity.name[language]} · {text.level} {resourceCity.rank} · {cityUnitCount}/{cityCapacity(resourceCity)} · {text.progress}: {resourceCity.rank < 4 ? `${resourceCity.progress}/${progressToNextRank(resourceCity.rank)}` : "MAX"}
              {cityRecruitLimitReached && <span> · {text.cityFull}</span>}
              {cityOccupied && <span> · {text.cityOccupied}</span>}
              {resourceCity.capture && <span> · {text.cityContested}</span>}
            </div>
            <div className="context-options">
              {availableRecruit.map((kind) => {
                const definition = UNIT_DEFINITIONS[kind];
                const cost = hireCost(game, game.playerFaction, kind);
                return <button type="button" className="context-option" key={kind} title={kind === "drone" ? text.droneDetail : undefined} aria-label={`${unitName(kind)} · ${cost} ${text.tokens}${kind === "drone" ? ` · ${text.droneDetail}` : ""}`}
                  disabled={displayedTokens < cost || cityRecruitLimitReached || cityOccupied || Boolean(resourceCity.capture)}
                  onClick={() => send({ type: "HIRE", baseId: resourceCity.id, kind })}>
                  <img src={`game-art/units/${UNIT_ART[kind]}.png`} alt="" /><strong>{unitName(kind)}</strong><small>{cost} T{kind === "drone" ? ` · ${text.rangeStat} ${definition.range}` : ""}</small>
                </button>;
              })}
              {resourceCity.resourceRange === 3 && <button type="button" className="context-option" disabled={displayedTokens < 10}
                onClick={() => send({ type: "EXPAND_HARVEST_RANGE", baseId: resourceCity.id })}>
                <span>⬚</span><strong>5×5</strong><small>10 T</small>
              </button>}
            </div>
          </div>}
          {describedTile && !describedTile.poi && (describedTile.geese || describedTile.terrain !== "plain") && <div className="context-actions" aria-label={text.resource}>
            <div className="context-title">{text[describedTile.terrain === "forest" ? "forest" : describedTile.geese ? "geese" : describedTile.terrain]} {resourceCost(describedTile) !== null ? `· ${resourceCost(describedTile)} ${text.tokens} · +${resourceProgress(describedTile)} ${text.progress}` : `· ${describedTile.bridge ? text.builtBridge : text.gathered}`}
            </div>
            <div className="context-title">{text[`${describedTile.terrain === "forest" ? "forest" : describedTile.geese ? "geese" : describedTile.terrain}${game.playerFaction === "robots" ? "Robot" : "Human"}`]} {describedTile.terrain === "mountain" && text.mountainVision}</div>
            {resourceCost(describedTile) !== null && !findResourceCity(game, describedTile) && <div className="context-title">{text.expandForResource}</div>}
            {bridgeBase && !describedTile.bridge && <div className="context-title">{text.bridgeHint}</div>}
            <div className="context-options">{resourceTile && resourceBase && resourceCost(resourceTile) !== null && <button type="button" className="context-option"
              disabled={!canHarvest(game, resourceBase, resourceTile) || displayedTokens < (resourceCost(resourceTile) ?? 0)}
              onClick={() => { send({ type: "HARVEST", baseId: resourceBase.id, x: resourceTile.x, y: resourceTile.y, reward: "progress" }); setSelectedResource(null); }}>
              <span className="resource-icon"><img src={`game-art/world/${resourceTile.terrain === "forest" ? "forest-complete" : resourceTile.geese ? "poi-geese" : resourceTile.terrain === "mountain" ? "mountain-complete" : "water-a"}.png`} alt="" /><span className="resource-price">{resourceCost(resourceTile)}T</span></span><strong>{text.resourceProgress}</strong><small>+{resourceProgress(resourceTile)}</small>
            </button>}
            {bridgeBase && bridgeAxis(game, bridgeBase, describedTile) && <button type="button" className="context-option" disabled={displayedTokens < 5}
              onClick={() => { send({ type: "BUILD_BRIDGE", baseId: bridgeBase.id, x: describedTile.x, y: describedTile.y }); setSelectedResource(null); }}><span>◇</span><strong>{text.bridge}</strong><small>5 T</small></button>}
            </div>
          </div>}
          {selectedCapture && selectedUnit && <div className="context-actions" aria-label={game.playerFaction === "robots" ? text.layoff : text.acceptOffer}>
            <div className="context-options"><button type="button" className="context-option"
              disabled={selectedUnit.moved || selectedUnit.attacked}
              onClick={() => send({ type: "CAPTURE", baseId: selectedCapture.id, unitId: selectedUnit.id })}>
              <img src={`game-art/world/${game.playerFaction === "robots" ? "robot-layoff" : "hr-negotiation"}.png`} alt="" />
              <strong>{game.playerFaction === "robots" ? text.layoff : text.acceptOffer}</strong>
            </button></div>
          </div>}
          {selectedCoffee && <div className="context-actions" aria-label={text.coffee}>
            <div className="context-title">{text.coffee} · {game.playerFaction === "robots" ? text.robotCoffee : text.coffeeText}</div>
            <div className="context-options">
              <button type="button" className="context-option" disabled={coffeeUnit?.moved || coffeeUnit?.attacked} onClick={() => send({ type: "COFFEE", unitId: selectedCoffee.unitId, reward: "tokens" })}><span>◈</span><strong>{text.bonus}</strong><small>+8</small></button>
              <button type="button" className="context-option" disabled={coffeeUnit?.moved || coffeeUnit?.attacked} onClick={() => send({ type: "COFFEE", unitId: selectedCoffee.unitId, reward: "vision" })}><span>◎</span><strong>{game.playerFaction === "robots" ? text.wifi : text.balcony}</strong><small>{text.scouting}</small></button>
              <button type="button" className="context-option" disabled={coffeeUnit?.moved || coffeeUnit?.attacked || coffeeUnit?.coffeeMovementBoost} onClick={() => send({ type: "COFFEE", unitId: selectedCoffee.unitId, reward: "movement" })}><span>↗</span><strong>{text.speed}</strong><small>×2 ∞</small></button>
            </div>
          </div>}
          {selectedCoins && selectedUnit && <div className="context-actions" aria-label={text.collectCoins}>
            <div className="context-options"><button type="button" className="context-option" disabled={selectedUnit.moved || selectedUnit.attacked}
              onClick={() => send({ type: "COLLECT_COINS", unitId: selectedCoins.unitId })}>
              <img src="game-art/world/blet-coins.png" alt="" /><strong>{text.collectCoins}</strong><small>+7</small>
            </button></div>
          </div>}
          {selectedUnit?.kind === "drone" && !selectedCapture && !selectedCoffee && !selectedCoins && <div className="context-actions" aria-label={unitName("drone")}><div className="context-title">{selectedUnit.name[language]} · {text.droneDetail} · {text.attackStat} {UNIT_DEFINITIONS.drone.attack} · {text.rangeStat} {attackRange(game, selectedUnit)}</div></div>}
          {!selectedUnit && !resourceCity && !selectedResource && inspectedTile && (inspectedTile.explored || revealMap) && (inspectedBase || (inspectedTile.poi && !inspectedTile.poiClaimed) || inspectedEnemy) && <div className="context-actions" aria-label={inspectedBase ? (inspectedBase.owner ? text.enemyCompany : text.startupTitle) : inspectedEnemy ? text.opponent : inspectedTile.poi === "treasury" ? text.treasureTitle : text.coffeeTitle}>
            {inspectedEnemy && <div className="context-title">{inspectedEnemy.name[language]} · {unitName(inspectedEnemy.kind)} · {inspectedEnemy.hp}/{UNIT_DEFINITIONS[inspectedEnemy.kind].maxHp} HP</div>}
            {inspectedBase && <><div className="context-title">{inspectedBase.name[language]} · {inspectedBase.owner ? text.enemyCompany : text.startupTitle}</div><div className="context-title">{inspectedBase.owner ? text.enemyCompanyDetail : text.startupDetail}</div></>}
            {!inspectedBase && inspectedTile.poi && !inspectedTile.poiClaimed && <><div className="context-title">{inspectedTile.poi === "treasury" ? text.treasureTitle : text.coffeeTitle}</div><div className="context-title">{inspectedTile.poi === "treasury" ? text.treasureDetail : text.coffeeDetail}</div></>}
          </div>}
          <div className="action-bar">
            <div className="selection-summary">
              {resourceCity ? <span className="action-hint">{text.cityResources}</span>
                : selectedUnit ? <><img className="selection-portrait" src={unitPortraitPath(selectedUnit)} alt="" /><span><strong>{selectedUnit.name[language]} · {unitName(selectedUnit.kind)}</strong><small>{hasUnitAction(game, selectedUnit) ? text.ready : text.spent} · {selectedUnit.hp}/{UNIT_DEFINITIONS[selectedUnit.kind].maxHp} HP · {text.attackStat} {Number(effectiveAttack(game, selectedUnit).toFixed(1))} · {text.rangeStat} {attackRange(game, selectedUnit)}</small></span></>
                : <span className="action-hint">{selectedPosition ? text.empty : text.tip}</span>}
            </div>
            {selectedUnit && <button type="button" className="action-button heal-action" disabled={selectedUnit.moved || selectedUnit.attacked || healingAmount(game, selectedUnit) <= 0}
              onClick={() => send({ type: "HEAL", unitId: selectedUnit.id })}>♡ {text.heal} · +{healingAmount(game, selectedUnit)} HP</button>}
            <button type="button" className="action-button" onClick={() => setPanel("tech")}>◎ {text.openTech}</button>
            <button type="button" className="action-button" onClick={() => setPanel("log")}>☰ {text.openLog}</button>
            <button type="button" className="end-turn-button" disabled={game.status !== "running" || Boolean(game.pendingProgress?.length)} onClick={() => send({ type: "END_TURN" })}>{text.endTurn} <span>→</span></button>
          </div>
        </div>
      </section>
      {panel === "tech" && <div className="panel-backdrop" onClick={() => setPanel(null)}>
        <section className="game-popup tech-popup" role="dialog" aria-modal="true" aria-labelledby="tech-title" onClick={(event) => event.stopPropagation()}>
          <PopupHeader id="tech-title" title={text.openTech} subtitle={`${displayedTokens} ${text.tokens}`} close={() => setPanel(null)} />
          <TechnologyTree game={game} language={language} tokens={displayedTokens} onResearch={(branch) => send({ type: "RESEARCH", branch })} />
        </section>
      </div>}
      {panel === "log" && <div className="panel-backdrop" onClick={() => setPanel(null)}>
        <section className="game-popup log-popup" role="dialog" aria-modal="true" aria-labelledby="log-title" onClick={(event) => event.stopPropagation()}>
          <PopupHeader id="log-title" title={text.openLog} subtitle={`${game.logs.length}`} close={() => setPanel(null)} />
          {game.logs.length ? <ol className="game-log">{game.logs.map((event) => <li key={event.id}>{event[language]}</li>)}</ol> : <p className="popup-hint">{text.emptyLog}</p>}
        </section>
      </div>}
      {welcome && game.status === "running" && <div className="modal-backdrop"><section className="result-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title"><h2 id="welcome-title">{text.welcomeTitle}</h2><p>{text.welcomeText}</p><button className="launch-button" type="button" onClick={() => setWelcome(false)}>{text.close} <span>↗</span></button></section></div>}
      {game.status !== "running" && !resultPending && <div className="modal-backdrop"><section className="result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title"><div className="coffee-cup">{game.status === "won" ? "🏆" : "🤖"}</div><div className="eyebrow">{game.status === "won" ? text.statusWin : text.statusLost}</div><h2 id="result-title">{game.status === "won" ? text.won : text.lost}</h2><button className="launch-button" type="button" onClick={clearGame}>{text.next} <span>↗</span></button></section></div>}
      {error && <div className="error-toast" role="alert">{error}<button type="button" onClick={() => dispatch(setError(null))}>✕</button></div>}
      {replaying && <div className="ai-playback-block" role="status" aria-label={text.opponentTurn} />}
      <footer className="game-footer"><span>{text.objective}</span><span>{neutralBases} {text.neutralCity.toUpperCase()} · {enemyBases} {text.opponent}</span></footer>
    </main>
  );
}

function EventToast({ notice, language, dismiss }: { notice: GameEvent; language: Language; dismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(notice.id), 3500);
    return () => window.clearTimeout(timer);
  }, [dismiss, notice.id]);
  return <div className="event-toast">{notice[language]}</div>;
}

function LanguageSwitch({ language, setLanguage }: { language: Language; setLanguage: (language: Language) => void }) {
  return <div className="language-switch" role="group" aria-label="Language">
    <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
    <button type="button" className={language === "ru" ? "active" : ""} onClick={() => setLanguage("ru")}>RU</button>
  </div>;
}

function PopupHeader({ id, title, subtitle, close }: { id: string; title: string; subtitle: string; close: () => void }) {
  return <div className="popup-header"><div><h2 id={id}>{title}</h2><span>{subtitle}</span></div><button type="button" onClick={close} aria-label="Close dialog">×</button></div>;
}

export default function GameShell() {
  const store = useMemo(() => makeStore(), []);
  return <Provider store={store}><GameApp /></Provider>;
}
