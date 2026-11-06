import type { Base, Decision, Faction, GameCommand, GameState, Unit } from "./model";
import {
  FACTION_NAMES,
  UNIT_DEFINITIONS,
  type Tile,
  type UnitKind,
} from "./model";
import {
  baseName,
  createGame,
  damage,
  incomeForRank,
  logEvent,
  progressToNextRank,
  revealAround,
  shortestPath,
  transferBase,
} from "./rules";

let game: GameState | null = null;
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
    game.tokens[base.owner ?? game.playerFaction] += 3;
    logEvent(game, `${baseName(base.owner ?? game.playerFaction)} достигла ${base.rank}-го уровня.`);
  }
}

function refreshVisibility(): void {
  if (game) revealAround(game);
}

function claimPosition(unit: Unit): void {
  if (!game) return;
  const base = baseAt(unit.x, unit.y);
  if (base && base.owner !== unit.faction) {
    transferBase(game, base, unit.faction);
    if (game.status !== "running") return;
  }
  const tile = tileAt(unit.x, unit.y);
  if (!tile || tile.poiClaimed || !tile.poi) return;
  tile.poiClaimed = true;
  if (tile.poi === "treasury") {
    game.tokens[unit.faction] += 7;
    logEvent(game, "Найден забытый S3-бакет: бюджет пополнен на 7 токенов.");
  } else if (unit.faction === game.playerFaction) {
    game.pendingCoffee = { x: tile.x, y: tile.y };
    logEvent(game, "В Кофейне ждёт награда — выбери, что важнее.");
  } else {
    game.tokens[unit.faction] += 4;
    logEvent(game, "ИИ нашёл кофе и реинвестировал бонус в команду.");
  }
}

function resolveAttack(attacker: Unit, defender: Unit): boolean {
  if (!game || attacker.faction === defender.faction || attacker.attacked) return false;
  const range = UNIT_DEFINITIONS[attacker.kind].range + game.tech[attacker.faction][1];
  const distance = Math.abs(attacker.x - defender.x) + Math.abs(attacker.y - defender.y);
  if (distance > range || UNIT_DEFINITIONS[attacker.kind].attack === 0) return false;

  const dealt = damage(attacker, defender, game);
  defender.hp -= dealt;
  attacker.attacked = true;
  logEvent(game, `${UNIT_DEFINITIONS[attacker.kind].name}: −${dealt} прочности у ${UNIT_DEFINITIONS[defender.kind].name}.`);

  if (defender.hp <= 0) {
    game.units = game.units.filter((unit) => unit.id !== defender.id);
    logEvent(game, `${UNIT_DEFINITIONS[defender.kind].name} отправляется пасти гусей.`);
    return true;
  }

  const retaliationRange = UNIT_DEFINITIONS[defender.kind].range;
  if (retaliationRange >= distance && UNIT_DEFINITIONS[defender.kind].attack > 0) {
    const retaliation = damage(defender, attacker, game);
    attacker.hp -= retaliation;
    logEvent(game, `Ответный ход: ${UNIT_DEFINITIONS[attacker.kind].name} теряет ${retaliation} HP.`);
    if (attacker.hp <= 0) {
      game.units = game.units.filter((unit) => unit.id !== attacker.id);
      logEvent(game, `${UNIT_DEFINITIONS[attacker.kind].name} уходит пасти гусей.`);
    }
  }
  return true;
}

function moveUnit(unit: Unit, x: number, y: number): boolean {
  if (!game || unit.moved || (unit.x === x && unit.y === y) || unitAt(x, y)) return false;
  const path = shortestPath(game, unit, { x, y }, UNIT_DEFINITIONS[unit.kind].move);
  if (!path?.length) return false;
  const destination = path[Math.min(path.length, UNIT_DEFINITIONS[unit.kind].move) - 1];
  unit.x = destination.x;
  unit.y = destination.y;
  unit.moved = true;
  if (path.length <= UNIT_DEFINITIONS[unit.kind].move) claimPosition(unit);
  refreshVisibility();
  return true;
}

function interactWithResource(x: number, y: number, unitId: string): boolean {
  const state = game;
  if (!state) return false;
  const tile = tileAt(x, y);
  const worker = state.units.find(
    (unit) => unit.id === unitId && unit.faction === state.playerFaction && !unit.moved
      && Math.abs(unit.x - x) + Math.abs(unit.y - y) <= 1,
  );
  const base = state.bases.find(
    (candidate) => candidate.owner === state.playerFaction
      && Math.abs(candidate.x - x) + Math.abs(candidate.y - y) <= 2,
  );
  if (!tile || !worker || !base) return false;

  let cost = 0;
  let progress = 0;
  let message = "";
  if (tile.terrain === "forest" && !tile.poiClaimed) {
    cost = 2;
    progress = 1;
    message = "Фикус в офис, целлюлоза в NDA";
  } else if (tile.geese && !tile.poiClaimed) {
    cost = 3;
    progress = 2;
    message = "Гуси приручены для гусиной терапии";
    if (state.playerFaction === "lorgoshki") state.tokens[state.playerFaction] += 3;
  } else if (tile.terrain === "mountain" && !tile.poiClaimed) {
    cost = 5;
    progress = 3;
    message = "Литиевый карьер / хайк-тропа готова";
  } else if (tile.terrain === "water" && !tile.poiClaimed) {
    cost = 5;
    progress = 3;
    message = state.playerFaction === "robots" ? "Водоём осушён для дата-центра" : "Воркейшн на море завершён";
  }
  if (!cost || state.tokens[state.playerFaction] < cost) return false;
  state.tokens[state.playerFaction] -= cost;
  tile.poiClaimed = true;
  worker.moved = true;
  addProgress(base, progress);
  logEvent(state, `${message}: ${cost} токенов, +${progress} прогресса.`);
  return true;
}

const TECHNOLOGY_NAMES: Record<Faction, string[][]> = {
  lorgoshki: [
    ["Переговоры", "Нетворкинг", "Мастер собеса"],
    ["Хард-скиллы", "IP68", "Сеньорское влияние"],
    ["Гусиная терапия", "Своё стадо", "Гусиный дзен"],
  ],
  robots: [
    ["Термопаста", "Защита от латте", "Жидкостное охлаждение"],
    ["StarLinkedIn", "Перерезание оптики", "Слепая зона"],
    ["Фейковая лента", "Дипфейк", "Меметическая война"],
  ],
};

function research(branch: number): boolean {
  if (!game || branch < 0 || branch > 2) return false;
  const faction = game.playerFaction;
  const level = game.tech[faction][branch];
  const cost = (level + 1) * 5;
  if (level >= 3 || game.tokens[faction] < cost) return false;
  game.tokens[faction] -= cost;
  game.tech[faction][branch] += 1;
  logEvent(game, `Исследована технология «${TECHNOLOGY_NAMES[faction][branch][level]}».`);
  return true;
}

function hire(baseId: string, kind: UnitKind): boolean {
  if (!game) return false;
  const base = game.bases.find((candidate) => candidate.id === baseId && candidate.owner === game?.playerFaction);
  const definition = UNIT_DEFINITIONS[kind];
  if (!base || base.rank < definition.unlockRank || game.tokens[game.playerFaction] < definition.cost) return false;
  const limit = 3 + game.bases.filter((item) => item.owner === game?.playerFaction).length + base.rank;
  if (game.units.filter((unit) => unit.faction === game?.playerFaction).length >= limit) return false;
  const spawn = [
    { x: base.x, y: base.y - 1 }, { x: base.x + 1, y: base.y },
    { x: base.x, y: base.y + 1 }, { x: base.x - 1, y: base.y },
  ].find((position) => {
    const tile = tileAt(position.x, position.y);
    return tile && tile.terrain !== "water" && !unitAt(position.x, position.y);
  });
  if (!spawn) return false;

  game.tokens[game.playerFaction] -= definition.cost;
  const count = game.units.filter((unit) => unit.faction === game?.playerFaction && unit.kind === kind).length + 1;
  game.units.push({
    id: `${game.playerFaction}-${kind}-${game.turn}-${count}`,
    ...spawn,
    faction: game.playerFaction,
    kind,
    hp: definition.maxHp,
    moved: true,
    attacked: true,
  });
  refreshVisibility();
  logEvent(game, `${definition.name} нанят за ${definition.cost} токена.`);
  return true;
}

function chooseCoffee(reward: "tokens" | "confidence" | "recruit"): boolean {
  if (!game || !game.pendingCoffee) return false;
  if (reward === "tokens") {
    game.tokens[game.playerFaction] += 8;
    logEvent(game, "Кофе-брейк дал +8 токенов.");
  } else if (reward === "confidence") {
    game.units
      .filter((unit) => unit.faction === game?.playerFaction)
      .forEach((unit) => { unit.hp = Math.min(UNIT_DEFINITIONS[unit.kind].maxHp, unit.hp + 4); });
    logEvent(game, "Айс-латте вернул +4 HP юнитам.");
  } else {
    const units = game.units.filter((unit) => unit.faction === game?.playerFaction);
    const nearest = units.reduce<Unit | null>((best, unit) => {
      if (!best) return unit;
      return Math.abs(unit.x - game!.pendingCoffee!.x) + Math.abs(unit.y - game!.pendingCoffee!.y)
        < Math.abs(best.x - game!.pendingCoffee!.x) + Math.abs(best.y - game!.pendingCoffee!.y) ? unit : best;
    }, null);
    if (nearest) {
      const definition = UNIT_DEFINITIONS[nearest.kind];
      const coffee = game.pendingCoffee;
      const spawn = [
        { x: coffee.x + 1, y: coffee.y }, { x: coffee.x - 1, y: coffee.y },
        { x: coffee.x, y: coffee.y + 1 }, { x: coffee.x, y: coffee.y - 1 },
      ].find((position) => tileAt(position.x, position.y)?.terrain !== "water" && !unitAt(position.x, position.y));
      if (spawn) {
        game.units.push({
          id: `${game.playerFaction}-referral-${game.turn}-${game.units.length}`,
          ...spawn,
          faction: game.playerFaction,
          kind: nearest.kind,
          hp: definition.maxHp,
          moved: true,
          attacked: true,
        });
        logEvent(game, `Реферальный найм: в команду пришёл ещё один ${definition.name}.`);
      } else {
        game.tokens[game.playerFaction] += 6;
        logEvent(game, "Свободного места не нашлось: вместо сотрудника +6 токенов.");
      }
    }
  }
  game.pendingCoffee = null;
  return true;
}

function evaluateBotTurn(): void {
  if (!game) return;
  const started = performance.now();
  const bot = game.botFaction;
  const phases = [
    "01 / Оценка экономики и технологий",
    "02 / Карта влияния · heatmap",
    "03 / Utility scoring всех юнитов",
    "04 / Симуляция боя · retaliation",
  ];

  const ownedBases = game.bases.filter((base) => base.owner === bot);
  const botUnitCount = game.units.filter((unit) => unit.faction === bot).length;
  const recruit = bot === "robots" ? "workerBot" : "junior";
  const recruitCost = UNIT_DEFINITIONS[recruit].cost;
  if (botUnitCount < 2 && game.tokens[bot] >= recruitCost) {
    const base = ownedBases.find((candidate) => {
      const surrounding = [
        { x: candidate.x, y: candidate.y - 1 }, { x: candidate.x + 1, y: candidate.y },
        { x: candidate.x, y: candidate.y + 1 }, { x: candidate.x - 1, y: candidate.y },
      ];
      return surrounding.some((position) => !unitAt(position.x, position.y)
        && tileAt(position.x, position.y)?.terrain !== "water");
    });
    if (base) {
      game.tokens[bot] -= recruitCost;
      const spawn = [
        { x: base.x, y: base.y - 1 }, { x: base.x + 1, y: base.y },
        { x: base.x, y: base.y + 1 }, { x: base.x - 1, y: base.y },
      ].find((position) => !unitAt(position.x, position.y) && tileAt(position.x, position.y)?.terrain !== "water");
      if (spawn) game.units.push({
        id: `${bot}-hire-${game.turn}`,
        ...spawn,
        faction: bot,
        kind: recruit,
        hp: UNIT_DEFINITIONS[recruit].maxHp,
        moved: false,
        attacked: false,
      });
    }
  }

  const enemyUnits = game.units.filter((unit) => unit.faction !== bot);
  const targets = game.bases.filter((base) => base.owner !== bot);
  const ranked: Decision[] = [];

  for (const unit of game.units.filter((candidate) => candidate.faction === bot)) {
    let bestMove: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    let bestReason = "разведка";
    const enemies = enemyUnits
      .filter((enemy) => Math.abs(enemy.x - unit.x) + Math.abs(enemy.y - unit.y) <= UNIT_DEFINITIONS[unit.kind].range
        && UNIT_DEFINITIONS[unit.kind].attack > 0)
      .map((enemy) => ({ enemy, dealt: damage(unit, enemy, game!) }))
      .sort((a, b) => b.dealt - a.dealt);

    if (!unit.attacked && enemies[0]) {
      const { enemy, dealt } = enemies[0];
      const surviving = enemy.hp > dealt;
      const retaliation = surviving
        ? UNIT_DEFINITIONS[enemy.kind].attack * enemy.hp / UNIT_DEFINITIONS[enemy.kind].maxHp
        : 0;
      const score = dealt * 2 + (dealt >= enemy.hp ? 12 : 0) - (retaliation >= unit.hp ? 30 : retaliation);
      ranked.push({
        unit: UNIT_DEFINITIONS[unit.kind].name,
        choice: `атака → ${UNIT_DEFINITIONS[enemy.kind].name}`,
        score: Number(score.toFixed(1)),
        reason: `урон ${dealt}${retaliation >= unit.hp ? " · ответный удар смертелен" : ""}`,
      });
      if (score > bestScore) {
        bestScore = score;
        bestReason = `атака противника · −${dealt} HP`;
        resolveAttack(unit, enemy);
      }
    }
    if (!game.units.includes(unit)) continue;

    if (!unit.moved && game.status === "running") {
      const candidates = game.tiles
        .filter((tile) => Math.abs(tile.x - unit.x) + Math.abs(tile.y - unit.y) > 0
            && Math.abs(tile.x - unit.x) + Math.abs(tile.y - unit.y) <= UNIT_DEFINITIONS[unit.kind].move
            && !unitAt(tile.x, tile.y))
        .map((tile) => {
          const path = shortestPath(game!, unit, tile, UNIT_DEFINITIONS[unit.kind].move);
          if (!path?.length) return null;
          const distanceToBase = targets.length
            ? Math.min(...targets.map((target) => Math.abs(target.x - tile.x) + Math.abs(target.y - tile.y)))
            : 0;
          const score = (baseAt(tile.x, tile.y) ? 18 : 0)
            + (tile.poi && !tile.poiClaimed ? 7 : 0)
            + (!tile.explored ? 4 : 0)
            - distanceToBase * 1.8
            - (enemies.some(({ enemy }) => Math.abs(enemy.x - tile.x) + Math.abs(enemy.y - tile.y) <= 1) ? 8 : 0);
          return { tile, path, score };
        })
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
        .sort((a, b) => b.score - a.score);
      for (const option of candidates.slice(0, 3)) {
        ranked.push({
          unit: UNIT_DEFINITIONS[unit.kind].name,
          choice: `перемещение → ${option.tile.x},${option.tile.y}`,
          score: Number(option.score.toFixed(1)),
          reason: baseAt(option.tile.x, option.tile.y) ? "захват базы" : "исследование / влияние",
        });
      }
      if (candidates[0] && (candidates[0].score > bestScore || !Number.isFinite(bestScore))) {
        const choice = candidates[0];
        bestMove = choice.tile;
        bestScore = choice.score;
        bestReason = baseAt(choice.tile.x, choice.tile.y) ? "захват нейтральной базы" : "разведка территории";
        moveUnit(unit, choice.tile.x, choice.tile.y);
      }
    }
    if (bestScore > -Infinity) {
      ranked.push({
        unit: UNIT_DEFINITIONS[unit.kind].name,
        choice: bestMove ? `→ ${bestMove.x},${bestMove.y}` : "остаться",
        score: Number(bestScore.toFixed(1)),
        reason: bestReason,
      });
    }
  }

  game.inspector = {
    phases,
    elapsedMs: Number((performance.now() - started).toFixed(1)),
    top: ranked.sort((a, b) => b.score - a.score).slice(0, 8),
  };
  if (targets.length && !game.bases.some((base) => base.owner !== bot)) game.status = bot === game.playerFaction ? "won" : "lost";
}

function endTurn(): void {
  if (!game || game.status !== "running" || game.pendingCoffee) return;
  game.tokens[game.playerFaction] += game.bases
    .filter((base) => base.owner === game?.playerFaction)
    .reduce((sum, base) => sum + incomeForRank(base.rank), 0);
  game.activeFaction = game.botFaction;
  evaluateBotTurn();
  if (game.status !== "running") return;
  game.tokens[game.botFaction] += game.bases
    .filter((base) => base.owner === game?.botFaction)
    .reduce((sum, base) => sum + incomeForRank(base.rank), 0);
  game.turn += 1;
  game.activeFaction = game.playerFaction;
  for (const unit of game.units.filter((candidate) => candidate.faction === game?.playerFaction)) {
    unit.moved = false;
    unit.attacked = false;
    unit.hp = Math.min(UNIT_DEFINITIONS[unit.kind].maxHp, unit.hp + game.tech[game.playerFaction][2]);
  }
  for (const unit of game.units.filter((candidate) => candidate.faction === game?.botFaction)) {
    unit.moved = false;
    unit.attacked = false;
    unit.hp = Math.min(UNIT_DEFINITIONS[unit.kind].maxHp, unit.hp + game.tech[game.botFaction][2]);
  }
  refreshVisibility();
}

function apply(command: GameCommand): void {
  if (command.type === "START") {
    game = createGame(command.seed, command.size, command.faction);
    return;
  }
  if (!game || game.status !== "running" || (game.pendingCoffee && command.type !== "COFFEE")) return;

  switch (command.type) {
    case "MOVE": {
      const unit = game.units.find((candidate) => candidate.id === command.unitId && candidate.faction === game?.playerFaction);
      if (!unit || !moveUnit(unit, command.x, command.y)) {
        throw new Error("Нельзя переместиться: проверь маршрут, воду и оставшиеся очки движения.");
      }
      claimPosition(unit);
      break;
    }
    case "ATTACK": {
      const attacker = game.units.find((candidate) => candidate.id === command.unitId && candidate.faction === game?.playerFaction);
      const defender = unitAt(command.x, command.y);
      if (!attacker || !defender || !resolveAttack(attacker, defender)) {
        throw new Error("Цель недоступна для атаки или юнит уже сделал этот ход.");
      }
      break;
    }
    case "HARVEST":
      if (!interactWithResource(command.x, command.y, command.unitId)) {
        throw new Error("Ресурс недоступен: нужен свободный юнит рядом, база поблизости и достаточно токенов.");
      }
      break;
    case "HIRE":
      if (!hire(command.baseId, command.kind)) {
        throw new Error("Не удалось нанять юнита: проверьте ранг базы, бюджет и лимит армии.");
      }
      break;
    case "RESEARCH":
      if (!research(command.branch)) {
        throw new Error("Исследование недоступно: нужна следующая технология в ветке и достаточно токенов.");
      }
      break;
    case "COFFEE":
      if (!chooseCoffee(command.reward)) {
        throw new Error("Награда кофейни больше недоступна.");
      }
      break;
    case "END_TURN":
      endTurn();
      break;
  }
}

context.onmessage = (event: MessageEvent<GameCommand>) => {
  try {
    apply(event.data);
    if (game) context.postMessage({ type: "STATE", state: game });
  } catch (error) {
    context.postMessage({
      type: "ERROR",
      message: error instanceof Error ? error.message : "Не удалось выполнить команду.",
    });
  }
};
