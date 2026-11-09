import type { Unit } from "./model";

export const UNIT_ART_FILES = {
  hipsterMan: "units/mobile-hipster-man.png",
  hipsterWoman: "units/mobile-hipster-woman.png",
  courier: "units/mobile-courier-woman.png",
  courierMan: "units/mobile-courier-man.png",
  seniorHipster: "units/mobile-senior-hipster.png",
  robotWorker: "units/mobile-robot-worker.png",
  robotDrone: "units/mobile-robot-drone.png",
  robotVacuum: "units/mobile-robot-vacuum.png",
  hipsterWomanAlt: "units/mobile-hipster-alt.png",
} as const;

export type UnitArtKey = keyof typeof UNIT_ART_FILES;

export function unitArtKey(unit: Unit): UnitArtKey {
  if (unit.kind === "courier") return unit.gender === "male" ? "courierMan" : "courier";
  if (unit.kind === "drone") return "robotDrone";
  if (unit.kind === "vacuum") return "robotVacuum";
  if (unit.faction === "robots") return "robotWorker";
  if (unit.kind === "senior") return "seniorHipster";
  if (unit.kind === "middle") return unit.id.length % 2 === 0 ? "hipsterWomanAlt" : "seniorHipster";
  return unit.id.length % 2 === 0 ? "hipsterWoman" : "hipsterMan";
}

export function unitPortraitPath(unit: Unit): string {
  return `/game-art/${UNIT_ART_FILES[unitArtKey(unit)]}`;
}
