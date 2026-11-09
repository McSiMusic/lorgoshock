import type { Base, BotAction, CombatEvent, Faction, GameCommand, GameEvent, GameState, IncomeEvent, MovementEvent, ResourceEvent, Unit } from "./model";
import { makeIdentity } from "./names";
import { savedGameSchema } from "./save";
import {
  FACTION_NAMES,
  UNIT_DEFINITIONS,
  UNIT_BY_TIER,
  type Tile,
  type UnitKind,
} from "./model";
import {
  canAttack,
  bridgeAxis,
  attackRange,
  availableTechnologyLevels,
  canHarvest,
  canMoveTo,
  cityCapacity,
  cityOccupancy,
  createGame,
  damage,
  expandResourceArea,
  gridDistance,
  healingAmount,
  hireCost,
  incomeForRank,
  logEvent,
  movementRange,
  progressToNextRank,
  resourceCost,
  resourceProgress,
  revealAround,
  shortestPath,
  transferBase,
} from "./rules";

let game: GameState | null = null;
let combatEvents: CombatEvent[] = [];
let notifications: GameEvent[] = [];
let resourceEvents: ResourceEvent[] = [];
let incomeEvents: IncomeEvent[] = [];
let movementEvents: MovementEvent[] = [];
let botActions: BotAction[] = [];
let nextMovementEventId = 0;
let nextIncomeEventId = 0;
let nextCombatEventId = 0;
type WorkerContext = {
  onmessage: ((event: MessageEvent<GameCommand>) => void) | null;
  postMessage(message: object): void;
};
const context = self as unknown as WorkerContext;

function unitAt(x: number, y: number): Unit | undefined {
  return game?.units.find((unit) => unit.x === x && unit.y === y);
}

function baseAt(x: number, y: number): Base | undefined {
  return game?.bases.find((base) => base.x === x && base.y === y);
}

function tileAt(x: number, y: number): Tile | undefined {
  if (!game || x < 0 || y < 0 || x >= game.size || y >= game.size) return undefined;
  return game.tiles[y * game.size + x];
}

function addProgress(base: Base, amount: number): void {
  if (!game) return;
  base.progress += amount;
  while (base.rank < 4 && base.progress >= progressToNextRank(base.rank)) {
    base.progress -= progressToNextRank(base.rank);
    base.rank += 1;
    logEvent(game, `«${base.name.ru}» достигла ${base.rank}-го уровня.`, `${base.name.en} reached level ${base.rank}.`);
  }
}

function refreshVisibility(scout?: { x: number; y: number }): void {
  if (!game) return;
  const previouslyExplored = new Set(game.tiles.filter((tile) => tile.explored).map((tile) => `${tile.x},${tile.y}`));
  revealAround(game);
  if (scout) {
    for (const tile of game.tiles) {
      if (gridDistance(tile, scout) <= 4) tile.explored = true;
    }
  }
  for (const tile of game.tiles) {
    if (!tile.explored || previouslyExplored.has(`${tile.x},${tile.y}`)) continue;
    const base = game.bases.find((candidate) => candidate.x === tile.x && candidate.y === tile.y);
    if (base && base.owner !== game.playerFaction) {
      notify(`Обнаружена компания «${base.name.ru}»!`, `Discovered company ${base.name.en}!`);
    }
    if (tile.poi === "coffee" && !tile.poiClaimed) {
      notify("Обнаружена кофейня! Пора на разведку с латте.", "Coffee shop discovered! Reconnaissance needs a latte.");
    }
  }
}

function notify(ru: string, en: string): void {
  if (!game) return;
  logEvent(game, ru, en);
  notifications.push(game.logs[0]);
}

function notifyDeath(unit: Unit): void {
  if (!game) return;
  const city = game.bases.find((base) => base.id === unit.homeBaseId);
  if (unit.faction === "robots") {
    notify(`${unit.name.ru} отключён навсегда.`, `${unit.name.en} has been permanently unplugged.`);
  } else {
    notify(`${unit.name.ru} реш${unit.gender === "female" ? "ила" : "ил"} уйти из IT и открыть ${city ? `«${city.name.ru}»` : "свою компанию"}.`,
      `${unit.name.en} quit IT and started ${city?.name.en ?? "a company"}.`);
  }
}

function claimPosition(unit: Unit): void {
  if (!game) return;
  const base = baseAt(unit.x, unit.y);
  if (base && base.owner !== unit.faction) {
    base.capture = { unitId: unit.id, faction: unit.faction, readyTurn: game.turn + 1 };
    delete base.captureResult;
    if (unit.faction === game.playerFaction || game.tiles[base.y * game.size + base.x]?.explored) {
      notify(`${unit.name.ru}: переговоры за «${base.name.ru}» начались.`, `${unit.name.en} starts negotiations for ${base.name.en}.`);
    }
  }
  const tile = tileAt(unit.x, unit.y);
  if (!tile || tile.poiClaimed || !tile.poi) return;
  if (tile.poi === "treasury") {
    game.coinVisits.push({ x: tile.x, y: tile.y, unitId: unit.id, readyTurn: game.turn + 1 });
    logEvent(game, `${unit.name.ru}: blet-коины можно собрать на следующем ходу.`, `${unit.name.en} can collect the blet-coins next turn.`);
  } else {
    game.coffeeBreaks.push({ x: tile.x, y: tile.y, unitId: unit.id, readyTurn: game.turn + 1 });
    if (unit.faction === game.playerFaction || tile.visible) {
      notify(`${unit.name.ru} заходит в кофейню: бонус доступен на следующем ходу.`, `${unit.name.en} enters the coffee shop: the bonus is ready next turn.`);
    }
  }
}

function resolveAttack(attacker: Unit, defender: Unit): boolean {
  if (!game || !canAttack(game, attacker, defender)) return false;
  const distance = gridDistance(attacker, defender);

  const dealt = damage(attacker, defender, game);
  recordAttack(attacker, defender, false, dealt >= defender.hp);
  defender.hp -= dealt;
  attacker.attacked = true;
  attacker.moved = true;
  const visible = attacker.faction === game.playerFaction || defender.faction === game.playerFaction || Boolean(game.tiles[attacker.y * game.size + attacker.x]?.explored);
  if (visible) logEvent(game, `${attacker.name.ru} атакует ${defender.name.ru}: −${dealt} HP.`, `${attacker.name.en} hits ${defender.name.en}: −${dealt} HP.`);

  if (defender.hp <= 0) {
    const base = baseAt(defender.x, defender.y);
    if (base?.capture?.unitId === defender.id) delete base.capture;
    game.units = game.units.filter((unit) => unit.id !== defender.id);
    game.coffeeBreaks = game.coffeeBreaks.filter((coffee) => coffee.unitId !== defender.id);
    game.coinVisits = game.coinVisits.filter((visit) => visit.unitId !== defender.id);
    if (visible) notifyDeath(defender);
    advanceAfterDefeat(attacker, defender);
    return true;
  }

  const retaliationRange = attackRange(game, defender);
  if (retaliationRange >= distance && UNIT_DEFINITIONS[defender.kind].attack > 0) {
    const retaliation = damage(defender, attacker, game);
    recordAttack(defender, attacker, true, retaliation >= attacker.hp);
    attacker.hp -= retaliation;
    if (visible) logEvent(game, `Ответный удар: ${attacker.name.ru} теряет ${retaliation} HP.`, `Counterattack: ${attacker.name.en} loses ${retaliation} HP.`);
    if (attacker.hp <= 0) {
      const base = baseAt(attacker.x, attacker.y);
      if (base?.capture?.unitId === attacker.id) delete base.capture;
      game.units = game.units.filter((unit) => unit.id !== attacker.id);
      game.coffeeBreaks = game.coffeeBreaks.filter((coffee) => coffee.unitId !== attacker.id);
      game.coinVisits = game.coinVisits.filter((visit) => visit.unitId !== attacker.id);
      if (visible) notifyDeath(attacker);
    }
  }
  return true;
}

function advanceAfterDefeat(winner: Unit, defeated: Unit): void {
  if (!game || winner.kind === "courier" || winner.kind === "drone"
    || gridDistance(winner, defeated) !== 1 || unitAt(defeated.x, defeated.y)) return;
  const oldBase = baseAt(winner.x, winner.y);
  if (oldBase?.capture?.unitId === winner.id) delete oldBase.capture;
  game.coffeeBreaks = game.coffeeBreaks.filter((coffee) => coffee.unitId !== winner.id);
  game.coinVisits = game.coinVisits.filter((visit) => visit.unitId !== winner.id);
  winner.x = defeated.x;
  winner.y = defeated.y;
  winner.moved = true;
  claimPosition(winner);
  refreshVisibility();
}

function recordAttack(attacker: Unit, defender: Unit, counterattack: boolean, lethal: boolean): void {
  const state = game;
  if (!state) return;
  const visible = (unit: Unit) => unit.faction === state.playerFaction
    || Boolean(state.tiles[unit.y * state.size + unit.x]?.explored);
  if (visible(attacker) && visible(defender)) {
    const advance = lethal && !counterattack && attacker.kind !== "courier" && attacker.kind !== "drone"
      && gridDistance(attacker, defender) === 1;
    combatEvents.push({ id: ++nextCombatEventId, attacker: { ...attacker }, defender: { ...defender }, counterattack, lethal, advance });
  }
}

function moveUnit(unit: Unit, x: number, y: number): boolean {
  if (!game || !canMoveTo(game, unit, { x, y })) return false;
  const range = movementRange(game, unit);
  const path = shortestPath(game, unit, { x, y }, range);
  if (!path?.length) return false;
  const destination = path[Math.min(path.length, range) - 1];
  const from = { x: unit.x, y: unit.y };
  const originExplored = game.tiles[from.y * game.size + from.x]?.explored;
  const oldBase = baseAt(unit.x, unit.y);
  if (oldBase?.capture?.unitId === unit.id) delete oldBase.capture;
  game.coffeeBreaks = game.coffeeBreaks.filter((coffee) => coffee.unitId !== unit.id);
  game.coinVisits = game.coinVisits.filter((visit) => visit.unitId !== unit.id);
  unit.x = destination.x;
  unit.y = destination.y;
  unit.moved = true;
  if (unit.faction === game.playerFaction || game.tiles[unit.y * game.size + unit.x]?.visible) {
    logEvent(game, `${unit.name.ru} исследует клетку ${unit.x}, ${unit.y}.`, `${unit.name.en} explores tile ${unit.x}, ${unit.y}.`);
  }
  if (path.length <= range) claimPosition(unit);
  refreshVisibility();
  const steps = path.slice(0, range);
  if (unit.faction === game.botFaction && originExplored
    && steps.every((step) => game!.tiles[step.y * game!.size + step.x]?.explored)) {
    movementEvents.push({ id: ++nextMovementEventId, unitId: unit.id, from, to: { x: unit.x, y: unit.y }, path: steps });
  }
  return true;
}

function interactWithResource(x: number, y: number, baseId: string, faction: Faction = game!.playerFaction): boolean {
  const state = game;
  if (!state) return false;
  const tile = tileAt(x, y);
  const base = state.bases.find((candidate) => candidate.id === baseId);
  if (!tile || !base || !canHarvest(state, base, tile, faction)) return false;
  const cost = resourceCost(tile)!;
  const progress = resourceProgress(tile);
  let message = "";
  if (tile.terrain === "forest" && !tile.poiClaimed) {
    message = "Фикус в офис, целлюлоза в NDA";
  } else if (tile.geese && !tile.poiClaimed) {
    message = "Гуси приручены для гусиной терапии";
  } else if (tile.terrain === "mountain" && !tile.poiClaimed) {
    message = "Литиевый карьер / хайк-тропа готова";
  } else if (tile.terrain === "water" && !tile.poiClaimed) {
    message = faction === "robots" ? "Водоём осушён для дата-центра" : "Воркейшн на море завершён";
  }
  state.tokens[faction] -= cost;
  tile.poiClaimed = true;
  tile.harvestedBy = faction;
  if (faction === state.playerFaction || tile.explored) {
    const pending = { id: state.nextEventId++, x, y, baseId, cost, progress, faction };
    (state.pendingProgress ??= []).push(pending);
    resourceEvents.push(pending);
    logEvent(state, `${base.name.ru}: ${message}.`, `${base.name.en} gathered a resource for ${cost} tokens.`);
  } else {
    addProgress(base, progress);
  }
  return true;
}

const TECHNOLOGY_NAMES: Record<Faction, string[][]> = {
  lorgoshki: [
    ["Уверенное кивание на созвонах", "Мастерство буллшит-бинго", "Продажа себя за x3 от рынка"],
    ["Чтение документации", "Удалённый дебаг", "Архитектурный надзор"],
    ["Гусиная терапия", "Своё стадо", "Гусиный дзен"],
  ],
  robots: [
    ["Влагозащита IP68", "Жидкостное охлаждение", "Титановый экзоскелет"],
    ["StarLinkedIn", "Перерезание оптики", "Слепая зона"],
    ["Фейковая лента", "Дипфейк", "Мем-алгоритмы"],
  ],
};

function research(branch: number): boolean {
  if (!game || branch < 0 || branch > 2) return false;
  const faction = game.playerFaction;
  const level = game.tech[faction][branch];
  const cost = (level + 1) * 5;
  if (level >= availableTechnologyLevels(faction, branch) || game.tokens[faction] < cost) return false;
  game.tokens[faction] -= cost;
  game.tech[faction][branch] += 1;
  logEvent(game, `Исследована технология «${TECHNOLOGY_NAMES[faction][branch][level]}».`, `Technology researched: ${branch + 1}.${level + 1}.`);
  return true;
}

function hire(baseId: string, kind: UnitKind, faction: Faction = game!.playerFaction): boolean {
  if (!game) return false;
  const base = game.bases.find((candidate) => candidate.id === baseId && candidate.owner === faction);
  const definition = UNIT_DEFINITIONS[kind];
  if (!definition || !UNIT_BY_TIER[faction].includes(kind)
    || !base || base.capture || base.rank < definition.unlockRank || game.tokens[faction] < hireCost(game, faction, kind)) return false;
  if (unitAt(base.x, base.y) || cityOccupancy(game, base) >= cityCapacity(base)) return false;
  game.tokens[faction] -= hireCost(game, faction, kind);
  let count = 1;
  while (game.units.some((unit) => unit.id === `${faction}-${kind}-${game!.turn}-${count}`)) count++;
  const id = `${faction}-${kind}-${game.turn}-${count}`;
  const identity = makeIdentity(game.seed, id, faction, kind, game.units.map((unit) => unit.name));
  game.units.push({
    id,
    ...identity,
    x: base.x,
    y: base.y,
    faction,
    kind,
    homeBaseId: base.id,
    hp: definition.maxHp,
    moved: true,
    attacked: true,
  });
  if (faction === game.playerFaction) {
    refreshVisibility();
    logEvent(game, `${identity.name.ru} присоединяется к «${base.name.ru}».`, `${identity.name.en} joins ${base.name.en}.`);
  }
  return true;
}

function expandHarvestRange(baseId: string): boolean {
  if (!game) return false;
  if (!expandResourceArea(game, baseId)) return false;
  refreshVisibility();
  logEvent(game, "Компания заняла доступные клетки в области 5×5.", "The company claimed available tiles within 5×5.");
  return true;
}

function chooseCoffee(unitId: string, reward: "tokens" | "vision" | "movement", faction: Faction): boolean {
  if (!game) return false;
  if (reward !== "tokens" && reward !== "vision" && reward !== "movement") return false;
  const coffee = game.coffeeBreaks.find((entry) => entry.unitId === unitId && entry.readyTurn <= game!.turn);
  const visitor = game.units.find((unit) => unit.id === unitId && unit.faction === faction
    && unit.x === coffee?.x && unit.y === coffee.y);
  if (!coffee || !visitor || visitor.moved || visitor.attacked) return false;
  if (reward === "tokens") {
    game.tokens[faction] += 8;
    if (faction === game.playerFaction) incomeEvents.push({ id: ++nextIncomeEventId, x: coffee.x, y: coffee.y, amount: 8 });
    logEvent(game, faction === "robots" ? "Термолатте перепродан дата-центру: +8 токенов." : "Кофе-брейк дал +8 токенов.", faction === "robots" ? "Thermal latte resold to a data center: +8 tokens." : "Coffee break brought +8 tokens.");
  } else if (reward === "vision") {
    if (faction === game.playerFaction) refreshVisibility(coffee);
    logEvent(game, faction === "robots" ? "Подключение к Wi-Fi открыло карту вокруг кофейни." : "С балкончика открылась карта вокруг кофейни.", faction === "robots" ? "Wi-Fi revealed the area around the coffee shop." : "The balcony revealed the area around the coffee shop.");
  } else {
    if (visitor.coffeeMovementBoost) return false;
    visitor.coffeeMovementBoost = true;
    logEvent(game, faction === "robots" ? "Термолатте разогнал процессор: движение ×2 навсегда." : "Двойной эспрессо: движение ×2 навсегда.", faction === "robots" ? "Thermal latte overclocked the CPU: movement ×2 permanently." : "Double espresso: movement ×2 permanently.");
  }
  visitor.moved = true;
  visitor.attacked = true;
  const tile = tileAt(coffee.x, coffee.y);
  if (tile) tile.poiClaimed = true;
  game.coffeeBreaks = game.coffeeBreaks.filter((entry) => entry.unitId !== unitId);
  return true;
}

function healUnit(unit: Unit): boolean {
  if (!game || unit.moved || unit.attacked) return false;
  const amount = healingAmount(game, unit);
  if (amount <= 0) return false;
  unit.hp += amount;
  unit.moved = true;
  unit.attacked = true;
  if (unit.faction === game.playerFaction || game.tiles[unit.y * game.size + unit.x]?.explored) {
    logEvent(game, `${unit.name.ru} восстанавливает ${amount} HP.`, `${unit.name.en} restores ${amount} HP.`);
  }
  return true;
}

function collectCoins(unitId: string, faction: Faction): boolean {
  if (!game) return false;
  const visit = game.coinVisits.find((entry) => entry.unitId === unitId && entry.readyTurn <= game!.turn);
  const visitor = game.units.find((unit) => unit.id === unitId && unit.faction === faction
    && unit.x === visit?.x && unit.y === visit.y && !unit.moved && !unit.attacked);
  const tile = visit && tileAt(visit.x, visit.y);
  if (!visit || !visitor || !tile || tile.poi !== "treasury" || tile.poiClaimed) return false;
  tile.poiClaimed = true;
  game.tokens[faction] += 7;
  if (faction === game.playerFaction) incomeEvents.push({ id: ++nextIncomeEventId, x: visit.x, y: visit.y, amount: 7 });
  visitor.moved = true;
  visitor.attacked = true;
  game.coinVisits = game.coinVisits.filter((entry) => entry.unitId !== unitId);
  logEvent(game, `${visitor.name.ru} собирает blet-коины: +7 токенов.`, `${visitor.name.en} collects blet-coins: +7 tokens.`);
  return true;
}

function performBotAction(position: { x: number; y: number }, action: () => boolean, destination?: { x: number; y: number }): boolean {
  if (!game) return false;
  const originVisible = Boolean(game.tiles[position.y * game.size + position.x]?.explored);
  const visible = originVisible || Boolean(destination && game.tiles[destination.y * game.size + destination.x]?.explored);
  const focus = !originVisible && destination ? { ...destination } : { x: position.x, y: position.y };
  const before = visible ? structuredClone(game) : null;
  const combatIndex = combatEvents.length;
  const resourceIndex = resourceEvents.length;
  const movementIndex = movementEvents.length;
  const noticeIndex = notifications.length;
  const success = action();
  if (success && before && game) {
    botActions.push({
      position: focus, before, after: structuredClone(game),
      combatEvents: combatEvents.slice(combatIndex),
      resourceEvents: resourceEvents.slice(resourceIndex),
      movementEvents: movementEvents.slice(movementIndex),
      events: notifications.slice(noticeIndex),
    });
  }
  return success;
}

function evaluateBotTurn(): void {
  if (!game) return;
  const bot = game.botFaction;
  for (const visit of [...game.coinVisits]) {
    const unit = game.units.find((candidate) => candidate.id === visit.unitId && candidate.faction === bot);
    if (unit && visit.readyTurn <= game.turn) performBotAction(unit, () => collectCoins(unit.id, bot));
  }
  for (const visit of [...game.coffeeBreaks]) {
    const unit = game.units.find((candidate) => candidate.id === visit.unitId && candidate.faction === bot);
    if (unit && visit.readyTurn <= game.turn) performBotAction(unit, () => chooseCoffee(unit.id, "tokens", bot));
  }

  const ownedBases = game.bases.filter((base) => base.owner === bot);
  for (const base of ownedBases) {
    const resource = game.tiles
      .filter((tile) => canHarvest(game!, base, tile, bot))
      .sort((a, b) => (resourceCost(b) ?? 0) - (resourceCost(a) ?? 0))[0];
    if (resource && base.rank < 4) performBotAction(resource, () => interactWithResource(resource.x, resource.y, base.id, bot));
  }
  for (const base of ownedBases) {
    if (base.capture || unitAt(base.x, base.y) || cityOccupancy(game, base) >= cityCapacity(base)) continue;
    const available = UNIT_BY_TIER[bot].filter((kind) => UNIT_DEFINITIONS[kind].unlockRank <= base.rank
      && hireCost(game!, bot, kind) <= game!.tokens[bot]);
    const kind = available[available.length - 1];
    if (kind) performBotAction(base, () => hire(base.id, kind, bot));
  }

  const enemyUnits = game.units.filter((unit) => unit.faction !== bot);
  const targets = game.bases.filter((base) => base.owner !== bot);
  for (const unit of game.units.filter((candidate) => candidate.faction === bot)) {
    let bestScore = -Infinity;
    const enemies = enemyUnits
      .filter((enemy) => game!.units.includes(enemy) && canAttack(game!, unit, enemy))
      .map((enemy) => ({ enemy, dealt: damage(unit, enemy, game!) }))
      .sort((a, b) => b.dealt - a.dealt);

    if (!enemies.length && unit.hp <= UNIT_DEFINITIONS[unit.kind].maxHp / 2
      && !baseAt(unit.x, unit.y)?.capture && !game.coffeeBreaks.some((visit) => visit.unitId === unit.id)
      && !game.coinVisits.some((visit) => visit.unitId === unit.id) && performBotAction(unit, () => healUnit(unit))) continue;

    if (!unit.attacked && enemies[0]) {
      const { enemy, dealt } = enemies[0];
      const surviving = enemy.hp > dealt;
      const retaliation = surviving
        ? UNIT_DEFINITIONS[enemy.kind].attack * enemy.hp / UNIT_DEFINITIONS[enemy.kind].maxHp
        : 0;
      const score = dealt * 2 + (dealt >= enemy.hp ? 12 : 0) - (retaliation >= unit.hp ? 30 : retaliation);
      if (score > bestScore) {
        bestScore = score;
        performBotAction(unit, () => resolveAttack(unit, enemy));
      }
    }
    if (!game.units.includes(unit)) continue;

    if (!unit.moved && game.status === "running" && baseAt(unit.x, unit.y)?.capture?.unitId !== unit.id
      && !game.coinVisits.some((visit) => visit.unitId === unit.id)
      && !game.coffeeBreaks.some((visit) => visit.unitId === unit.id)) {
      const candidates = game.tiles
        .filter((tile) => gridDistance(tile, unit) > 0
            && gridDistance(tile, unit) <= movementRange(game!, unit)
            && !unitAt(tile.x, tile.y))
        .map((tile) => {
          const path = shortestPath(game!, unit, tile, movementRange(game!, unit));
          if (!path?.length) return null;
          const distanceToBase = targets.length
            ? Math.min(...targets.map((target) => gridDistance(target, tile)))
            : 0;
          const targetBase = baseAt(tile.x, tile.y);
          const score = (targetBase && targetBase.owner !== bot ? 18 : 0)
            + (tile.poi && !tile.poiClaimed ? 7 : 0)
            + (!tile.explored ? 4 : 0)
            - distanceToBase * 1.8
            - (enemies.some(({ enemy }) => gridDistance(enemy, tile) <= 1) ? 8 : 0);
          return { tile, path, score };
        })
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
        .sort((a, b) => b.score - a.score);
      if (candidates[0] && (candidates[0].score > bestScore || !Number.isFinite(bestScore))) {
        const choice = candidates[0];
        performBotAction(unit, () => moveUnit(unit, choice.tile.x, choice.tile.y), choice.tile);
      }
    }
    if (game.units.includes(unit) && unit.moved && !unit.attacked) {
      const enemy = game.units
        .filter((candidate) => canAttack(game!, unit, candidate))
        .sort((a, b) => damage(unit, b, game!) - damage(unit, a, game!))[0];
      if (enemy) {
        performBotAction(unit, () => resolveAttack(unit, enemy));
      }
    }
  }
}

function completeCapture(base: Base, unit: Unit): boolean {
  if (!game || base.capture?.unitId !== unit.id || base.capture.faction !== unit.faction
    || base.capture.readyTurn > game.turn || base.owner === unit.faction
    || unit.x !== base.x || unit.y !== base.y || unit.moved || unit.attacked) return false;
  delete base.capture;
  for (const other of game.units) {
    if (other.homeBaseId === base.id && other.faction !== unit.faction) other.homeBaseId = null;
  }
  transferBase(game, base, unit.faction, unit);
  if (unit.faction === game.playerFaction || game.tiles[base.y * game.size + base.x]?.explored) {
    notify(unit.faction === "robots" ? `${unit.name.ru}: сокращение в «${base.name.ru}» завершено.` : `${unit.name.ru} получает оффер от «${base.name.ru}»!`,
      unit.faction === "robots" ? `${unit.name.en} completed the layoff at ${base.name.en}.` : `${unit.name.en} received an offer from ${base.name.en}!`);
  }
  unit.homeBaseId = base.id;
  unit.moved = true;
  unit.attacked = true;
  base.captureResult = { faction: unit.faction, turn: game.turn };
  refreshVisibility();
  return true;
}

function endTurn(): void {
  if (!game || game.status !== "running") return;
  for (const base of game.bases.filter((base) => base.owner === game?.playerFaction)) {
    const amount = incomeForRank(base.rank);
    game.tokens[game.playerFaction] += amount;
    incomeEvents.push({ id: ++nextIncomeEventId, x: base.x, y: base.y, amount });
  }
  game.activeFaction = game.botFaction;
  for (const base of game.bases) delete base.captureResult;
  for (const base of game.bases) {
    const unit = game.units.find((candidate) => candidate.id === base.capture?.unitId && candidate.faction === game?.botFaction);
    if (unit) performBotAction(unit, () => completeCapture(base, unit));
  }
  if (game.status !== "running") return;
  evaluateBotTurn();
  if (game.status !== "running") return;
  game.tokens[game.botFaction] += game.bases
    .filter((base) => base.owner === game?.botFaction)
    .reduce((sum, base) => sum + incomeForRank(base.rank), 0);
  game.turn += 1;
  game.activeFaction = game.playerFaction;
  logEvent(game, `Начался ход ${game.turn}.`, `Turn ${game.turn} begins.`);
  for (const unit of game.units.filter((candidate) => candidate.faction === game?.playerFaction)) {
    unit.moved = false;
    unit.attacked = false;
  }
  for (const unit of game.units.filter((candidate) => candidate.faction === game?.botFaction)) {
    unit.moved = false;
    unit.attacked = false;
  }
  refreshVisibility();
}

function apply(command: GameCommand): void {
  if (command.type === "START") {
    game = createGame(command.seed, command.size, command.faction);
    return;
  }
  if (command.type === "RESUME") {
    game = savedGameSchema.parse(command.state);
    resourceEvents.push(...(game.pendingProgress ?? []));
    return;
  }
  if (!game) return;
  if (command.type === "RESOURCE_ARRIVED") {
    const pending = game.pendingProgress?.find((entry) => entry.id === command.id);
    if (pending) {
      game.pendingProgress = game.pendingProgress?.filter((entry) => entry.id !== command.id);
      const base = game.bases.find((entry) => entry.id === pending.baseId && entry.owner === pending.faction);
      if (base) addProgress(base, pending.progress);
    }
    return;
  }
  if (game.status !== "running") return;

  switch (command.type) {
    case "MOVE": {
      const unit = game.units.find((candidate) => candidate.id === command.unitId && candidate.faction === game?.playerFaction);
      if (!unit || !moveUnit(unit, command.x, command.y)) {
        throw new Error("Нельзя переместиться: проверь маршрут, воду и оставшиеся очки движения.");
      }
      break;
    }
    case "ATTACK": {
      const attacker = game.units.find((candidate) => candidate.id === command.unitId && candidate.faction === game?.playerFaction);
      const defender = game.units.find((unit) => unit.x === command.x && unit.y === command.y && unit.faction !== attacker?.faction);
      if (!attacker || !defender || !resolveAttack(attacker, defender)) {
        throw new Error("Цель недоступна для атаки или юнит уже сделал этот ход.");
      }
      break;
    }
    case "HEAL": {
      const unit = game.units.find((candidate) => candidate.id === command.unitId && candidate.faction === game?.playerFaction);
      if (!unit || !healUnit(unit)) throw new Error("Лечение недоступно: юнит здоров или уже совершил действие.");
      break;
    }
    case "CAPTURE": {
      const base = game.bases.find((candidate) => candidate.id === command.baseId);
      const unit = game.units.find((candidate) => candidate.id === command.unitId && candidate.faction === game?.playerFaction);
      if (!base || !unit || !completeCapture(base, unit)) {
        throw new Error("Захват недоступен: дождитесь следующего хода и сохраните юнита в компании.");
      }
      break;
    }
    case "HARVEST":
      if (command.reward === "tokens" || !interactWithResource(command.x, command.y, command.baseId)) {
        throw new Error("Ресурс недоступен: проверь компанию, её область и количество токенов.");
      }
      break;
    case "BUILD_BRIDGE": {
      const tile = tileAt(command.x, command.y);
      const base = game.bases.find((candidate) => candidate.id === command.baseId);
      const axis = tile && base ? bridgeAxis(game, base, tile) : undefined;
      if (!tile || !base || !axis) {
        throw new Error("Мост недоступен: нужны 5 токенов, вода в области компании и суша с двух сторон.");
      }
      game.tokens[game.playerFaction] -= 5;
      tile.bridge = { axis, faction: game.playerFaction };
      logEvent(game, "Построен мост.", "A bridge was built.");
      break;
    }
    case "HIRE":
      if (!hire(command.baseId, command.kind)) {
        throw new Error("Не удалось нанять юнита: проверьте ранг компании, бюджет и вместимость.");
      }
      break;
    case "EXPAND_HARVEST_RANGE":
      if (!expandHarvestRange(command.baseId)) {
        throw new Error("Cannot expand the company's resource area. It is already expanded or you need 10 tokens.");
      }
      break;
    case "RESEARCH":
      if (!research(command.branch)) {
        throw new Error("Исследование недоступно: нужна следующая технология в ветке и достаточно токенов.");
      }
      break;
    case "COFFEE":
      if (!chooseCoffee(command.unitId, command.reward, game.playerFaction)) {
        throw new Error("Награда кофейни больше недоступна.");
      }
      break;
    case "COLLECT_COINS":
      if (!collectCoins(command.unitId, game.playerFaction)) {
        throw new Error("Коины недоступны: дождитесь следующего хода и сохраните юнита на клетке.");
      }
      break;
    case "END_TURN":
      if (game.pendingProgress?.length) throw new Error("Дождитесь, пока звёзды долетят до компании.");
      endTurn();
      break;
  }
}

context.onmessage = (event: MessageEvent<GameCommand>) => {
  combatEvents = [];
  notifications = [];
  resourceEvents = [];
  incomeEvents = [];
  movementEvents = [];
  botActions = [];
  try {
    apply(event.data);
    if (game) context.postMessage({ type: "STATE", state: game, combatEvents,
      events: notifications, resourceEvents, incomeEvents, movementEvents, botActions });
  } catch (error) {
    context.postMessage({
      type: "ERROR",
      message: error instanceof Error ? error.message : "Не удалось выполнить команду.",
    });
  }
};
