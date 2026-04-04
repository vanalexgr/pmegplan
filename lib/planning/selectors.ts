import type { PlanningProject } from "@/lib/planning/types";
import {
  fenestrationToPlanarPoint,
  planarToCylinderPoint,
} from "@/lib/planning/geometry";

export function selectPlanarFenestrations(project: PlanningProject) {
  return selectPlanarFenestrationsForDiameter(
    project,
    project.graft.selectedGraftDiameterMm ?? project.graft.neckDiameterMm,
  );
}

export function selectPlanarFenestrationsForDiameter(
  project: PlanningProject,
  graftDiameterMm: number,
) {
  const selectedDiameterMm = graftDiameterMm;

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
  return selectCylinderFenestrationsForDiameter(
    project,
    project.graft.selectedGraftDiameterMm ?? project.graft.neckDiameterMm,
  );
}

export function selectCylinderFenestrationsForDiameter(
  project: PlanningProject,
  graftDiameterMm: number,
) {
  const selectedDiameterMm = graftDiameterMm;

  return selectPlanarFenestrationsForDiameter(project, selectedDiameterMm).map(
    ({ fenestration, point }) => ({
      fenestration,
      point: planarToCylinderPoint({
        xMm: point.xMm,
        yMm: point.yMm,
        graftDiameterMm: selectedDiameterMm,
      }),
    }),
  );
}
