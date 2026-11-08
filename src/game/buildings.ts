import type { Base } from "./model";

type Footprint = { left: number; right: number; sidesY: number; frontX: number; frontY: number };
type BuildingKind = "garage" | "human1" | "human2" | "human3" | "robot1" | "robot2" | "robot3" | "coffee";

// Contact points are measured in the original PNGs, not their transparent bounding boxes.
export const BUILDING_FOOTPRINTS: Record<BuildingKind, Footprint> = {
  garage: { left: 20, right: 470, sidesY: 374, frontX: 276, frontY: 454 },
  human1: { left: 18, right: 467, sidesY: 313, frontX: 310, frontY: 412 },
  human2: { left: 18, right: 432, sidesY: 412, frontX: 253, frontY: 503 },
  human3: { left: 12, right: 211, sidesY: 458, frontX: 116, frontY: 510 },
  robot1: { left: 25, right: 487, sidesY: 370, frontX: 275, frontY: 459 },
  robot2: { left: 16, right: 446, sidesY: 414, frontX: 227, frontY: 509 },
  robot3: { left: 5, right: 222, sidesY: 460, frontX: 114, frontY: 511 },
  coffee: { left: 18, right: 226, sidesY: 176, frontX: 130, frontY: 249 },
};

export function buildingKind(base: Base): Exclude<BuildingKind, "coffee"> {
  if (!base.owner) return "garage";
  if (base.owner === "robots") return base.rank === 1 ? "robot1" : base.rank === 2 ? "robot2" : "robot3";
  return base.rank === 1 ? "human1" : base.rank === 2 ? "human2" : "human3";
}

export function buildingLayout(kind: BuildingKind, texture: { width: number; height: number }, tileWidth: number, tileHeight: number) {
  const footprint = BUILDING_FOOTPRINTS[kind];
  const centerX = (footprint.left + footprint.right) / 2;
  const centerY = (footprint.sidesY + footprint.frontY) / 2;
  const extent = Math.max(
    (centerX - footprint.left) / tileWidth + (centerY - footprint.sidesY) / tileHeight,
    (footprint.right - centerX) / tileWidth + (centerY - footprint.sidesY) / tileHeight,
    Math.abs(footprint.frontX - centerX) / tileWidth + (footprint.frontY - centerY) / tileHeight,
  );
  const scale = Math.min(
    tileWidth * 1.9 / texture.width,
    tileHeight * (kind === "human3" || kind === "robot3" ? 5 : 3.35) / texture.height,
    0.9 / extent,
  );
  return { scale, anchorX: centerX / texture.width, anchorY: centerY / texture.height };
}
