import type { Faction, UnitKind } from "./model";

export type LocalizedName = { en: string; ru: string };
export type Identity = { name: LocalizedName; gender: "male" | "female" };

const male = [
  ["Miron", "Мирон"], ["Adam", "Адам"], ["Theodore", "Теодор"], ["Seraphim", "Серафим"],
  ["Platon", "Платон"], ["Tikhon", "Тихон"], ["Prokhor", "Прохор"], ["Marcel", "Марсель"],
];
const female = [
  ["Mia", "Мия"], ["Miroslava", "Мирослава"], ["Agatha", "Агата"], ["Aurora", "Аврора"],
  ["Athena", "Афина"], ["Zlata", "Злата"], ["Adele", "Адель"], ["Yesenia", "Есения"],
];
const robots = [
  ["WALL-E", "ВАЛЛ-И"], ["Terminator", "Терминатор"], ["SKYNET", "СКАЙНЕТ"],
  ["R2-D2", "R2-D2"], ["C-3PO", "C-3PO"], ["RoboCop", "Робокоп"],
  ["Bender", "Бендер"], ["Data", "Дейта"], ["Optimus", "Оптимус"], ["T-800", "Т-800"],
];
const cities: Record<Faction | "neutral", string[][]> = {
  lorgoshki: [["Kookle", "Кукл"], ["Pomazon", "Помазон"], ["Microloft", "Микролофт"], ["Yahuu", "Яхуу"], ["Facebuk", "Фейсбук"], ["Nettflix", "Нетфликс"], ["Appple", "Апппл"], ["Samsong", "Самсонг"]],
  robots: [["Skynet LLC", "Скайнет ООО"], ["ByteDance of Doom", "Байтданс Судьбы"], ["RoboCorp", "Робокорп"], ["CyberDyne", "Кибердайн"], ["Botflix", "Ботфликс"], ["MegaChip", "Мегачип"], ["NullSoft", "Нульсофт"], ["AutoLayoff", "Автосокращение"]],
  neutral: [["Stealth Startup", "Стартап-невидимка"], ["Pitch Please", "Питч Пожалуйста"], ["Unicorn Pending", "Единорог в ожидании"], ["Open Space", "Опенспейс"], ["Cloud Nine", "Облако Девять"], ["No Meeting", "Без созвонов"]],
};

function hash(value: string): number {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function choose(pool: string[][], key: string, used: LocalizedName[]): LocalizedName {
  const start = hash(key) % pool.length;
  for (let i = 0; i < pool.length; i++) {
    const [en, ru] = pool[(start + i) % pool.length];
    if (!used.some((name) => name.en === en)) return { en, ru };
  }
  const [en, ru] = pool[start];
  let suffix = 2;
  while (used.some((name) => name.en === `${en} ${suffix}`)) suffix++;
  return { en: `${en} ${suffix}`, ru: `${ru} ${suffix}` };
}

export function makeIdentity(seed: string, id: string, faction: Faction, kind: UnitKind, used: LocalizedName[]): Identity {
  const gender = hash(`${seed}:${id}:gender`) % 2 === 0 ? "male" : "female";
  const pool = faction === "robots" ? robots : gender === "male" ? male : female;
  return { name: choose(pool, `${seed}:${id}:${kind}`, used), gender };
}

export function makeCityName(seed: string, id: string, owner: Faction | null, used: LocalizedName[]): LocalizedName {
  return choose(cities[owner ?? "neutral"], `${seed}:${id}:${owner}`, used);
}
