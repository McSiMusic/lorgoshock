"use client";

import { useState } from "react";
import { availableTechnologyLevels } from "../game/rules";
import type { Faction, GameState } from "../game/model";

type Language = "en" | "ru";
type Level = { name: string; detail: string };
type Branch = { name: string; levels: [Level, Level, Level] };

const TECHNOLOGIES: Record<Language, Record<Faction, [Branch, Branch, Branch]>> = {
  ru: {
    lorgoshki: [
      { name: "Нетворкинг", levels: [
        { name: "Уверенное кивание на созвонах", detail: "Кивай так убедительно, будто понял, что такое синергия. Нейтральные компании достаются сразу на 2-м уровне." },
        { name: "Мастерство буллшит-бинго", detail: "Найди «проактивность» и «синергию» в одной вакансии. Найм дешевле на 1 токен, но не меньше 1." },
        { name: "Продажа себя за x3 от рынка", detail: "В резюме ты не преувеличиваешь — ты масштабируешь впечатление. Нейтральные компании сразу 3-го уровня и 5 токенов подъёмных." },
      ] },
      { name: "Хард-скиллы", levels: [
        { name: "Чтение документации", detail: "Пугающая, но эффективная практика. +1 к базовой атаке лоргошек против роботов; сила удара по-прежнему зависит от здоровья." },
        { name: "Удалённый дебаг", detail: "Если ошибка не видит тебя, это не значит, что ты её не видишь. Дальность атак +1 клетка." },
        { name: "Архитектурный надзор", detail: "Архитектор обещает критический урон и атаки по площади. Пока у него встреча о встрече: механика ещё не реализована." },
      ] },
      { name: "Фермерство", levels: [
        { name: "Загон для гусей", detail: "Планируется ферма рядом с компанией и +2 к максимуму здоровья нанятых там юнитов. Гуси пока согласовывают оффер." },
        { name: "Свободный выгул", detail: "Планируется защита от роботов и более быстрое восстановление рядом с гусями. Пернатый профсоюз ещё ведёт переговоры." },
        { name: "Гусиный заповедник", detail: "Планируются защита от паники и возвращение в компанию с гусями. Пастбище пока на этапе планирования." },
      ] },
    ],
    robots: [
      { name: "Конструкция", levels: [
        { name: "Влагозащита IP68", detail: "Теперь латте можно проливать с уверенностью. Вклад защиты робота в получаемый урон уменьшается на 1 с учётом здоровья. Заморозка пока не реализована." },
        { name: "Жидкостное охлаждение", detail: "Планируется защита от заморозки и охлаждение водой. Робот уже заказал трубочки, но механика ещё не готова." },
        { name: "Титановый экзоскелет", detail: "Планируются прочный корпус и защита от площадных атак. Экзоскелет пока проходит собеседование на прочность." },
      ] },
      { name: "StarLinkedIn", levels: [
        { name: "Кабельный саботаж", detail: "Планируется отключать чужие провода без расхода действия. Пока робот может только выразительно смотреть на роутер." },
        { name: "Дальний доступ", detail: "Планируется +1 к дальности атак и саботажа. До внедрения сигнал дальше совещательной не проходит." },
        { name: "Отключение инфраструктуры", detail: "Планируется отключение дохода компании на ход. Кабель ещё не перерезан — юристы попросили ножницы с закруглёнными концами." },
      ] },
      { name: "Соцсети", levels: [
        { name: "Демотивирующая лента", detail: "Планируется аура демотивации вокруг дронов. Алгоритм пока показывает только котиков." },
        { name: "Вирусный негатив", detail: "Планируется массовая демотивация и сокращение движения. Публикацию пока проверяет модерация." },
        { name: "Алгоритмический апокалипсис", detail: "Планируется ослабление компаний и урон при атаке. Алгоритм пока слишком занят рекомендациями вебинаров." },
      ] },
    ],
  },
  en: {
    lorgoshki: [
      { name: "Networking", levels: [
        { name: "Confident nodding on calls", detail: "Nod as if you understand synergy. Neutral companies start at level 2." },
        { name: "Buzzword bingo mastery", detail: "Spot 'proactive' and 'synergy' in one job ad. Recruitment costs 1 token less, to a minimum of 1." },
        { name: "Sell yourself at 3× market rate", detail: "It's not exaggeration, it's scaling your personal brand. Neutral companies start at level 3 and grant 5 sign-on tokens." },
      ] },
      { name: "Hard skills", levels: [
        { name: "Reading the documentation", detail: "A frightening but effective practice. +1 base attack against robots; damage still scales with health." },
        { name: "Remote debugging", detail: "Just because the bug can't see you doesn't mean you can't see it. Attack range +1 tile." },
        { name: "Architecture oversight", detail: "Critical damage and area attacks are planned. The architect is in a meeting about meetings; this mechanic isn't ready." },
      ] },
      { name: "Goose farming", levels: [
        { name: "Goose pen", detail: "A company-side farm and +2 maximum health for units hired there are planned. The geese are still reviewing the offer." },
        { name: "Free range", detail: "Robot resistance and faster recovery near geese are planned. The feathered union is still negotiating." },
        { name: "Goose sanctuary", detail: "Panic immunity and returning to a company with geese are planned. The pasture is still on the roadmap." },
      ] },
    ],
    robots: [
      { name: "Construction", levels: [
        { name: "IP68 waterproofing", detail: "Spill your latte with confidence. Reduces the robot defender's damage contribution by 1, scaled by health. Freezing isn't implemented yet." },
        { name: "Liquid cooling", detail: "Freeze protection and water cooling are planned. The robot ordered straws, but the mechanic isn't ready." },
        { name: "Titanium exoskeleton", detail: "A tougher shell and area-attack protection are planned. The exoskeleton is still interviewing for the role." },
      ] },
      { name: "StarLinkedIn", levels: [
        { name: "Cable sabotage", detail: "Cutting enemy cables without spending an action is planned. For now the robot can only glare at the router." },
        { name: "Remote access", detail: "+1 attack and sabotage range is planned. Until then the signal barely reaches the meeting room." },
        { name: "Infrastructure blackout", detail: "Disabling a company's income for one turn is planned. Legal has requested safety scissors before cutting cables." },
      ] },
      { name: "Social networks", levels: [
        { name: "Demotivating feed", detail: "A drone demotivation aura is planned. The algorithm currently recommends only cats." },
        { name: "Viral negativity", detail: "Area demotivation and reduced movement are planned. The post is awaiting moderation." },
        { name: "Algorithmic apocalypse", detail: "Company debuffs and damage on attack are planned. The algorithm is busy recommending webinars." },
      ] },
    ],
  },
};

function TechnologyIcon({ faction, branch, stage }: { faction: Faction; branch: number; stage: number }) {
  const icon = faction === "lorgoshki"
    ? [
      [
        <><path d="M7 11h18v11H14l-5 4v-4H7z" /><path d="M11 15h10M11 18h7" /></>,
        <><rect x="7" y="7" width="18" height="18" rx="2" /><path d="M7 13h18M13 7v18m6-12v12M7 19h18" /><path d="m15 17 2 2 4-4" /></>,
        <><circle cx="16" cy="16" r="10" /><path d="M18 10h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-4m3-10v12M9 24l-2 4 5-2m11-2 2 4-5-2" /></>,
      ],
      [
        <><path d="M7 7h15a3 3 0 0 1 3 3v15H10a3 3 0 0 1-3-3zM10 7v18M13 12h8m-8 4h8m-8 4h5" /></>,
        <><circle cx="14" cy="14" r="7" /><path d="m19 19 6 6M11 14h6m-3-3v6" /></>,
        <><path d="M5 24h22M8 24V12l8-6 8 6v12M12 24v-7h8v7M13 11h6" /></>,
      ],
      [
        <><path d="M9 22c1-5 4-6 8-6 0-5 3-7 6-5l-1 4 4 2-4 1c0 5-4 8-10 8H8z" /><path d="M16 26v3m5-4v4" /><circle cx="20" cy="13" r="0.8" fill="currentColor" stroke="none" /></>,
        <><path d="M4 23c3-4 5-4 8 0s5 4 8 0 5-4 8 0M5 17c3-4 5-4 8 0s5 4 8 0 4-3 6-2M16 5v8m-4-4 4-4 4 4" /></>,
        <><path d="M5 25h22M7 25V14l9-7 9 7v11M12 25v-8h8v8M13 12h6" /><path d="M8 9c1-3 4-5 8-5s7 2 8 5" /></>,
      ],
    ][branch][stage]
    : [
      [
        <><path d="m16 5 9 4v6c0 6-4 10-9 12-5-2-9-6-9-12V9z" /><path d="m13 13 3-3v5h3l-3 6v-5h-3z" /></>,
        <><path d="M16 5c-2 4-7 9-7 14a7 7 0 0 0 14 0c0-5-5-10-7-14z" /><path d="M12 20c0 2 2 4 4 4" /></>,
        <><path d="m16 5 9 4v6c0 6-4 10-9 12-5-2-9-6-9-12V9zM11 13l5-3 5 3v6l-5 3-5-3z" /></>,
      ],
      [
        <><path d="M7 7v6a4 4 0 0 0 4 4h2m12-10v6a4 4 0 0 1-4 4h-2M13 14v6m6-6v6m-6-3h6M16 20v7" /></>,
        <><path d="M6 17c5-6 15-6 20 0M9 20c4-4 10-4 14 0M13 23c2-2 4-2 6 0" /><circle cx="16" cy="26" r="1.5" fill="currentColor" stroke="none" /></>,
        <><path d="M7 8h18v16H7zM11 12h10M11 16h6M11 20h4M5 26l22-20" /></>,
      ],
      [
        <><rect x="7" y="7" width="18" height="18" rx="4" /><path d="M11 15h2m6 0h2M11 20c3 2 7 2 10 0M16 7V4M13 28h6" /></>,
        <><path d="M8 12h16v11H14l-5 4v-4H8zM16 8V5m-3 10h6m-6 4h4" /><path d="m22 6 2 2 3-3" /></>,
        <><circle cx="16" cy="16" r="4" /><circle cx="16" cy="6" r="2" /><circle cx="7" cy="23" r="2" /><circle cx="25" cy="23" r="2" /><path d="M16 8v4m-7 9 4-3m10 3-4-3" /></>,
      ],
    ][branch][stage];
  return <svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>;
}

export default function TechnologyTree({ game, language, tokens, onResearch }: {
  game: GameState;
  language: Language;
  tokens: number;
  onResearch: (branch: number) => void;
}) {
  const [selected, setSelected] = useState<Array<number | null>>([null, null, null]);
  const ru = language === "ru";
  return <div className="technology-tree">{TECHNOLOGIES[language][game.playerFaction].map((branch, branchIndex) => {
    const level = game.tech[game.playerFaction][branchIndex];
    const viewed = selected[branchIndex] ?? Math.min(level, 2);
    const item = branch.levels[viewed];
    const implemented = viewed < availableTechnologyLevels(game.playerFaction, branchIndex);
    const researched = viewed < level;
    const cost = (level + 1) * 5;
    const unavailable = level >= availableTechnologyLevels(game.playerFaction, branchIndex);
    const disabled = level >= 3 || unavailable || tokens < cost;
    const status = researched ? (ru ? "Изучено" : "Researched")
      : !implemented ? (ru ? "Пока недоступно" : "Coming later")
        : viewed > level ? (ru ? "Нужен предыдущий уровень" : "Requires previous level")
          : tokens < cost ? (ru ? "Недостаточно токенов" : "Not enough tokens")
            : (ru ? "Доступно" : "Available");
    return <section className={`technology-branch technology-branch-${branchIndex}`} key={branch.name}>
      <h3>{branch.name}</h3>
      <div className="technology-controls">
        <div className="technology-levels" role="group" aria-label={branch.name}>
          {branch.levels.map((stage, index) => {
            const active = index < level || (index === level && index < availableTechnologyLevels(game.playerFaction, branchIndex) && tokens >= cost);
            return <button type="button" key={stage.name} className={`technology-orb${active ? " is-active" : " is-muted"}${index === viewed ? " is-selected" : ""}${index < level ? " is-done" : ""}`}
              aria-pressed={index === viewed} aria-label={`${branch.name}: ${stage.name} · ${ru ? "уровень" : "level"} ${index + 1}`}
              onClick={() => setSelected((previous) => previous.map((entry, i) => i === branchIndex ? index : entry))}>
              <TechnologyIcon faction={game.playerFaction} branch={branchIndex} stage={index} />
              <span className="technology-orb-number">{index < level ? "✓" : index + 1}</span>
            </button>;
          })}
        </div>
        <div className="technology-research-control">
          <button type="button" className="tech-button technology-research" disabled={disabled}
            aria-label={`${ru ? "Изучить" : "Research"} ${level < 3 ? branch.levels[level].name : branch.name}${level < 3 ? ` · ${cost} T` : ""}`}
            onClick={() => onResearch(branchIndex)}>
            {level >= 3 ? (ru ? "ИЗУЧЕНО" : "COMPLETED") : <>{ru ? "ИЗУЧИТЬ" : "RESEARCH"} <span>{cost} T</span></>}
          </button>
          {level < 3 && unavailable && <small>{ru ? "Пока недоступно" : "Coming later"}</small>}
        </div>
      </div>
      <div className="technology-description" aria-live="polite">
        <div className="technology-description-heading"><strong>{item.name}</strong><span>{status} · {(viewed + 1) * 5} T</span></div>
        <p>{item.detail}</p>
        {level < 3 && !unavailable && <small>{ru ? "Кнопка изучает следующий уровень" : "The button researches the next level"}: {branch.levels[level].name}</small>}
      </div>
    </section>;
  })}</div>;
}
