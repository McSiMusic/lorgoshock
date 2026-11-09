type Language = "en" | "ru";

const CONTENT = {
  en: {
    eyebrow: "THE FIELD GUIDE · 01",
    title: "Win the talent war.",
    intro: "Build a thriving company, explore the map, and outplay the rival corporation. Every turn is a chance to grow, recruit, or make a bold move.",
    mapSizes: "MAP SIZES · 8×8 · 16×16 · 24×24",
    goal: "Your objective",
    goalText: "Take over every rival company. If the opponent loses its last company, the game is yours. Neutral startups are useful stepping stones, but not required for victory.",
    turn: "A turn at a glance",
    steps: ["Explore the fog with your units.", "Gather nearby resources to grow companies.", "Train a team and research technology.", "End your turn. The rival corporation moves next."],
    capture: "From first hello to takeover",
    captureSteps: [
      ["01", "Arrive", "Move a unit onto a neutral startup or rival company."],
      ["02", "Negotiate", "Stay on the tile until your next turn. Leaving cancels the takeover."],
      ["03", "Make it official", "Select the unit and press Accept Offer (Lorgoshki) or Layoff (Robots). It must not move or attack that turn."],
    ],
    companies: "Grow your company",
    companyText: "Gather resources inside your company’s territory. Each company starts at level 1; progress costs 2, 3, then 4 to reach levels 2–4. Capacity is level + 1. A captured startup claims free tiles within 3×3; expand once to claim free tiles within 5×5 for 10 tokens. Tiles already claimed by any company stay with it. Capturing a rival company transfers its territory. Select a company to see its border; rival borders are red.",
    ranks: ["2 tokens / turn", "3 tokens / turn", "4 tokens / turn", "5 tokens / turn"],
    rankLabel: "LEVEL",
    rankCapacity: "units",
    resources: "Turn the map into momentum",
    resourceText: "Each resource can be gathered once. Spend tokens to add progress to a nearby company.",
    resourceRows: [
      ["Forest", "forest-complete.png", "2 tokens", "+1 progress"],
      ["Geese", "poi-geese.png", "2 tokens", "+1 progress"],
      ["Mountain", "mountain-complete.png", "5 tokens", "+2 progress"],
      ["Water", "water-a.png", "7 tokens", "+3 progress"],
    ],
    robotWater: "Robots dry only the water tile they actually harvest; unharvested water stays water.",
    units: "Build your team",
    unitText: "Companies train units up to their capacity (company level + 1). Higher-tier employees unlock as the company grows. New hires can act from your next turn.",
    unitNames: ["Junior", "Courier", "Senior", "Worker robot", "Drone"],
    battle: "Plan each move",
    battleText: "Units can move and attack once per turn. Attacking first ends that unit’s movement; moving first still allows one attack. Healing, collecting coins, choosing a coffee bonus, and taking over a company use the unit’s action.",
    fogText: "Units reveal nearby tiles; mountains extend a unit’s sight. Explored areas remain known, but only nearby areas stay visible.",
    tech: "Research and adapt",
    techText: "Research costs 5, 10, then 15 tokens per branch level. The Lorgoshki specialize in networking, hard skills, and goose farming; Robots develop engineering, StarLinkedIn, and social algorithms.",
    extras: "Small stops, big advantages",
    coffee: "Coffee shops",
    coffeeText: "Wait until the next turn, then choose a bonus: +8 tokens, reveal a radius of 4 around the shop, or permanent double movement for that unit.",
    treasury: "Blet-coins",
    treasuryText: "Hold the tile until next turn, then collect +7 tokens. The unit spends its action.",
    bridge: "Bridges",
    bridgeText: "Spend 5 tokens to bridge one water tile between land. A bridge occupies one tile and is traversable along its direction.",
    close: "Ready to play?",
    back: "BACK TO THE GAME",
  },
  ru: {
    eyebrow: "ПУТЕВОДИТЕЛЬ · 01",
    title: "Выиграй битву за таланты.",
    intro: "Развивай успешные компании, исследуй карту и переиграй корпорацию-соперника. Каждый ход — шанс вырасти, нанять команду или рискнуть.",
    mapSizes: "РАЗМЕРЫ КАРТЫ · 8×8 · 16×16 · 24×24",
    goal: "Твоя цель",
    goalText: "Захвати все компании соперника. Если у врага не осталось компаний — ты победил. Свободные стартапы помогают расти, но для победы захватывать их необязательно.",
    turn: "Как проходит ход",
    steps: ["Исследуй туман войны своими юнитами.", "Собирай ресурсы рядом с компаниями.", "Нанимай команду и изучай технологии.", "Заверши ход — затем действует корпорация-соперник."],
    capture: "От первого знакомства до захвата",
    captureSteps: [
      ["01", "Прибудь", "Перемести юнита в свободный стартап или компанию соперника."],
      ["02", "Веди переговоры", "Останься на клетке до следующего хода. Если уйти — захват отменится."],
      ["03", "Заключи сделку", "Выбери юнита и нажми «Принять оффер» (Лоргошки) или «Сокращение» (Роботы). В этот ход нельзя двигаться или атаковать."],
    ],
    companies: "Развивай компанию",
    companyText: "Собирай ресурсы на территории компании. Для уровней 2–4 нужно 2, 3 и 4 очка прогресса; вместимость равна уровню + 1. Захваченный стартап занимает свободные клетки в области 3×3; за 10 токенов можно один раз занять свободные клетки в области 5×5. Уже занятые клетки остаются у прежней компании, даже вражеской. При захвате вражеской компании её территория переходит новому владельцу. При выборе компании видна её граница; вражеская граница красная.",
    ranks: ["2 токена / ход", "3 токена / ход", "4 токена / ход", "5 токенов / ход"],
    rankLabel: "УРОВЕНЬ",
    rankCapacity: "юнита",
    resources: "Преврати карту в преимущество",
    resourceText: "Каждый ресурс можно собрать один раз. Потрать токены, чтобы повысить прогресс ближайшей компании.",
    resourceRows: [
      ["Лес", "forest-complete.png", "2 токена", "+1 прогресс"],
      ["Гуси", "poi-geese.png", "2 токена", "+1 прогресс"],
      ["Горы", "mountain-complete.png", "5 токенов", "+2 прогресса"],
      ["Вода", "water-a.png", "7 токенов", "+3 прогресса"],
    ],
    robotWater: "Роботы осушают только тот водный тайл, который они действительно собрали. Остальная вода остаётся водой.",
    units: "Собери команду",
    unitText: "Компания нанимает юнитов в пределах вместимости (уровень компании + 1). Более опытные сотрудники открываются с ростом компании. Новички смогут действовать со следующего хода.",
    unitNames: ["Джуниор", "Курьер", "Старший", "Рабочий робот", "Дрон"],
    battle: "Планируй каждый ход",
    battleText: "Юнит может переместиться и атаковать по одному разу за ход. Атака до движения лишает его перемещения; после движения он всё ещё может атаковать. Лечение, сбор монет, кофе-бонус и захват компании расходуют действие.",
    fogText: "Юниты открывают местность рядом с собой; с горы обзор увеличивается. Исследованные области остаются известными, но видны только клетки рядом с твоими силами.",
    tech: "Исследуй и адаптируйся",
    techText: "Исследования стоят 5, 10 и 15 токенов за уровни ветки. Лоргошки развивают нетворкинг, хард-скиллы и гусеводство; Роботы — конструкцию, StarLinkedIn и алгоритмы соцсетей.",
    extras: "Остановки с бонусом",
    coffee: "Кофейни",
    coffeeText: "Дождись следующего хода и выбери бонус: +8 токенов, обзор радиусом 4 вокруг кофейни или постоянное удвоение скорости юнита.",
    treasury: "Blet-коины",
    treasuryText: "Останься на клетке до следующего хода и забери +7 токенов. Юнит потратит действие.",
    bridge: "Мосты",
    bridgeText: "За 5 токенов построй мост на одной водной клетке между участками суши. Мост занимает один тайл и проходим вдоль своей оси.",
    close: "Готов к игре?",
    back: "ВЕРНУТЬСЯ В ИГРУ",
  },
} as const;

export default function RulesContent({ language, assetPrefix = "./", onClose }: { language: Language; assetPrefix?: string; onClose?: () => void }) {
  const content = CONTENT[language];
  return (
    <article className="rules-content">
      <header className="rules-hero">
        <div>
          <div className="rules-eyebrow">{content.eyebrow}</div>
          <h1>{content.title}</h1>
          <p>{content.intro}</p>
          <div className="rules-map-sizes">{content.mapSizes}</div>
        </div>
        <div className="rules-hero-art" aria-hidden="true">
          <img src={`${assetPrefix}game-art/units/mobile-hipster-woman.png`} alt="" />
          <span>VS</span>
          <img src={`${assetPrefix}game-art/units/mobile-robot-worker.png`} alt="" />
        </div>
      </header>

      <section className="rules-objective">
        <span className="rules-section-index">MISSION</span>
        <div><h2>{content.goal}</h2><p>{content.goalText}</p></div>
        <span className="rules-target" aria-hidden="true">◎</span>
      </section>

      <section className="rules-section">
        <div className="rules-section-heading"><span>01</span><div><h2>{content.turn}</h2></div></div>
        <ol className="rules-turn-steps">{content.steps.map((step, index) => <li key={step}><span>0{index + 1}</span>{step}</li>)}</ol>
      </section>

      <section className="rules-section">
        <div className="rules-section-heading"><span>02</span><div><h2>{content.capture}</h2></div></div>
        <div className="rules-capture-steps">{content.captureSteps.map(([number, title, detail]) =>
          <div className="rules-capture-step" key={number}><span>{number}</span><h3>{title}</h3><p>{detail}</p></div>)}</div>
      </section>

      <section className="rules-section">
        <div className="rules-section-heading"><span>03</span><div><h2>{content.companies}</h2><p>{content.companyText}</p></div></div>
        <div className="rules-ranks">{content.ranks.map((income, index) =>
          <div className="rules-rank" key={income}><span>{content.rankLabel} 0{index + 1}</span><strong>✦ × {index + 2}</strong><small>{income}</small><small>{index + 2} {content.rankCapacity}</small></div>)}</div>
      </section>

      <section className="rules-section">
        <div className="rules-section-heading"><span>04</span><div><h2>{content.resources}</h2><p>{content.resourceText}</p></div></div>
        <div className="rules-resources">{content.resourceRows.map(([name, image, cost, progress]) =>
          <div className="rules-resource" key={name}><img src={`${assetPrefix}game-art/world/${image}`} alt="" /><strong>{name}</strong><span>{cost}</span><small>{progress}</small></div>)}</div>
        <p className="rules-note"><span>ROBOT WORKS</span>{content.robotWater}</p>
      </section>

      <section className="rules-section rules-split">
        <div className="rules-feature-card">
          <div className="rules-section-heading"><span>05</span><div><h2>{content.units}</h2><p>{content.unitText}</p></div></div>
          <div className="rules-unit-strip">{[
            ["mobile-hipster-woman.png", content.unitNames[0]],
            ["mobile-courier-woman.png", content.unitNames[1]],
            ["mobile-senior-hipster.png", content.unitNames[2]],
            ["mobile-robot-worker.png", content.unitNames[3]],
            ["mobile-robot-drone.png", content.unitNames[4]],
          ].map(([image, name]) => <div key={image}><img src={`${assetPrefix}game-art/units/${image}`} alt="" /><span>{name}</span></div>)}</div>
        </div>
        <div className="rules-feature-card rules-battle-card">
          <div className="rules-section-heading"><span>06</span><div><h2>{content.battle}</h2><p>{content.battleText}</p></div></div>
          <p className="rules-note">{content.fogText}</p>
        </div>
      </section>

      <section className="rules-section rules-split">
        <div className="rules-feature-card">
          <div className="rules-section-heading"><span>07</span><div><h2>{content.tech}</h2><p>{content.techText}</p></div></div>
          <div className="rules-tech-costs"><span>RESEARCH</span><strong>5</strong><i>→</i><strong>10</strong><i>→</i><strong>15</strong><small>TOKENS</small></div>
        </div>
        <div className="rules-feature-card">
          <div className="rules-section-heading"><span>08</span><div><h2>{content.extras}</h2></div></div>
          <div className="rules-extra"><strong>{content.coffee}</strong><p>{content.coffeeText}</p></div>
          <div className="rules-extra"><strong>{content.treasury}</strong><p>{content.treasuryText}</p></div>
          <div className="rules-extra"><strong>{content.bridge}</strong><p>{content.bridgeText}</p></div>
        </div>
      </section>
      <footer className="rules-cta">
        <span>{content.close}</span>
        {onClose
          ? <button type="button" onClick={onClose}>{content.back} <span aria-hidden="true">↗</span></button>
          : <a href={assetPrefix}>{content.back} <span aria-hidden="true">↗</span></a>}
      </footer>
    </article>
  );
}
