import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILDING_FOOTPRINTS, buildingKind, buildingLayout } from "./buildings";
import { createGame } from "./rules";

const sizes = {
  garage: [512, 474], human1: [512, 414], human2: [449, 512], human3: [227, 512],
  robot1: [512, 461], robot2: [455, 512], robot3: [229, 512], coffee: [256, 256],
} as const;
const files = {
  garage: "city-garage", human1: "city-human-1", human2: "city-human-2", human3: "city-human-3",
  robot1: "city-robot-1", robot2: "city-robot-2", robot3: "city-robot-3", coffee: "poi-coffee",
} as const;

describe("building footprint layout", () => {
  it.each(Object.keys(sizes) as Array<keyof typeof sizes>)("centers %s on its tile at every map scale", (kind) => {
    const [width, height] = sizes[kind];
    const png = readFileSync(join(process.cwd(), "public", "game-art", "world", `${files[kind]}.png`));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([width, height]);
    const footprint = BUILDING_FOOTPRINTS[kind];
    for (const tileWidth of [9, 20, 45]) {
      const tileHeight = tileWidth / 2;
      const layout = buildingLayout(kind, { width, height }, tileWidth, tileHeight);
      const points = [
        { x: footprint.left, y: footprint.sidesY },
        { x: footprint.right, y: footprint.sidesY },
        { x: footprint.frontX, y: footprint.frontY },
      ];
      for (const point of points) {
        const x = (point.x - layout.anchorX * width) * layout.scale;
        const y = (point.y - layout.anchorY * height) * layout.scale;
        expect(Math.abs(x) / tileWidth + Math.abs(y) / tileHeight).toBeLessThanOrEqual(1);
      }
    }
  });

  it("uses the same final art for levels three and four", () => {
    const base = createGame("layout", 16, "lorgoshki").bases[0];
    for (const owner of ["lorgoshki", "robots"] as const) {
      base.owner = owner;
      base.rank = 3;
      const kind = buildingKind(base);
      base.rank = 4;
      expect(buildingKind(base)).toBe(kind);
    }
  });
});
