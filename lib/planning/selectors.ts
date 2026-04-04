import type { PlanningProject } from "@/lib/planning/types";
import {
  fenestrationToPlanarPoint,
  planarToCylinderPoint,
} from "@/lib/planning/geometry";

export function selectPlanarFenestrations(project: PlanningProject) {
  const selectedDiameterMm = project.graft.neckDiameterMm;

  return project.fenestrations.map((fenestration) => ({
    fenestration,
    point: fenestrationToPlanarPoint({
      clockFraction: fenestration.clockFraction,
      distanceMm: fenestration.distanceMm,
      graftDiameterMm: selectedDiameterMm,
      baselineMode: project.graft.baselineMode,
      templateHeightMm: project.graft.templateHeightMm,
      xAdjustMm: project.graft.xAdjustMm,
    }),
  }));
}

export function selectCylinderFenestrations(project: PlanningProject) {
  const selectedDiameterMm = project.graft.neckDiameterMm;

  return selectPlanarFenestrations(project).map(({ fenestration, point }) => ({
    fenestration,
    point: planarToCylinderPoint({
      xMm: point.xMm,
      yMm: point.yMm,
      graftDiameterMm: selectedDiameterMm,
    }),
  }));
}
