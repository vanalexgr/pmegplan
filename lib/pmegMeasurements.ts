import { clockToArc } from "@/lib/conflictDetection";
import { buildBenchCtRenderModel } from "@/lib/geometry/benchCtRenderModel";
import { wrapMm } from "@/lib/planning/geometry";
import type {
  DeviceAnalysisResult,
  Fenestration,
  StrutSegment,
} from "@/lib/types";

export interface PmegTarget {
  index: number;
  fenestration: Fenestration;
  xMm: number;
  yMm: number;
}

export interface PmegMeasurement {
  id: string;
  label: string;
  valueMm: number;
  state?: "primary" | "safe" | "review";
}

export interface PmegMeasurementSet {
  activeIndex: number;
  selectedTarget: PmegTarget;
  targets: PmegTarget[];
  measurements: PmegMeasurement[];
}

interface Landmark {
  xMm: number;
  yMm: number;
}

function signedWrappedDelta(value: number, circumference: number) {
  return (
    wrapMm(value + circumference / 2, circumference) - circumference / 2
  );
}

function measuredSegments(
  result: DeviceAnalysisResult,
): StrutSegment[] {
  const descriptor = result.device.benchCtDescriptor;
  if (!descriptor) {
    return result.strutSegments;
  }

  const model = buildBenchCtRenderModel(descriptor);
  return model.rings.flatMap((ring) => {
    if (ring.points.length < 2) return [];
    const ordered = [...ring.points].sort(
      (left, right) => left.thetaRad - right.thetaRad,
    );
    const points = ordered.map((point) => ({
      xMm: (point.thetaRad / (Math.PI * 2)) * result.circumferenceMm,
      yMm: point.zMm,
    }));
    const closed = [
      ...points,
      {
        xMm: points[0].xMm + result.circumferenceMm,
        yMm: points[0].yMm,
      },
    ];
    return closed.slice(0, -1).map((point, index) => {
      const next = closed[index + 1];
      return [point.xMm, point.yMm, next.xMm, next.yMm] as StrutSegment;
    });
  });
}

function strutExtrema(segments: StrutSegment[]) {
  const vertices = new Map<
    string,
    { point: Landmark; neighbourDeltas: number[] }
  >();
  const add = (xMm: number, yMm: number, neighbourY: number) => {
    const key = `${xMm.toFixed(2)}:${yMm.toFixed(2)}`;
    const vertex = vertices.get(key) ?? {
      point: { xMm, yMm },
      neighbourDeltas: [],
    };
    vertex.neighbourDeltas.push(neighbourY - yMm);
    vertices.set(key, vertex);
  };
  for (const [ax, ay, bx, by] of segments) {
    add(ax, ay, by);
    add(bx, by, ay);
  }
  return {
    peaks: [...vertices.values()]
      .filter(({ neighbourDeltas }) =>
        neighbourDeltas.every((delta) => delta >= -0.02),
      )
      .map(({ point }) => point),
    valleys: [...vertices.values()]
      .filter(({ neighbourDeltas }) =>
        neighbourDeltas.every((delta) => delta <= 0.02),
      )
      .map(({ point }) => point),
  };
}

export function buildPmegMeasurementSet(
  result: DeviceAnalysisResult,
  selectedIndex: number,
): PmegMeasurementSet | null {
  if (!result.size || result.device.benchCtDescriptor == null) {
    return null;
  }

  const circumference = result.circumferenceMm;
  const model = buildBenchCtRenderModel(result.device.benchCtDescriptor);
  const targets: PmegTarget[] = result.optimalConflicts.map(
    (conflict, index) => ({
      index,
      fenestration: {
        vessel: "CUSTOM",
        ftype: "SMALL_FEN",
        clock: conflict.adjustedClock,
        depthMm: result.depthOptimisation.adjustedDepths[index] ?? 0,
        widthMm: 0,
        heightMm: 0,
      },
      xMm: clockToArc(conflict.adjustedClock, circumference),
      yMm: result.depthOptimisation.adjustedDepths[index] ?? 0,
    }),
  );

  // The result does not retain the original case input. Consumers replace the
  // placeholder fenestration fields through attachPmegCaseTargets.
  if (targets.length === 0) return null;
  const activeIndex = Math.min(Math.max(0, selectedIndex), targets.length - 1);
  return buildMeasurements(result, targets, activeIndex, model);
}

function buildMeasurements(
  result: DeviceAnalysisResult,
  targets: PmegTarget[],
  activeIndex: number,
  model: ReturnType<typeof buildBenchCtRenderModel>,
): PmegMeasurementSet {
  const circumference = result.circumferenceMm;
  const selected = targets[activeIndex];
  const segments = measuredSegments(result);
  const extrema = strutExtrema(segments);
  const radiusAt = (yMm: number) => model.diameterAt(yMm) / 2;
  const distance = (left: Landmark, right: Landmark) => {
    const angleDelta =
      (signedWrappedDelta(left.xMm - right.xMm, circumference) /
        circumference) *
      Math.PI *
      2;
    const surfaceArc =
      angleDelta * ((radiusAt(left.yMm) + radiusAt(right.yMm)) / 2);
    return Math.hypot(surfaceArc, left.yMm - right.yMm);
  };
  const nearest = (
    landmarks: Landmark[],
    predicate: (landmark: Landmark) => boolean,
  ) =>
    landmarks
      .filter(predicate)
      .map((landmark) => ({
        ...landmark,
        distanceMm: distance(selected, landmark),
      }))
      .sort((left, right) => left.distanceMm - right.distanceMm)[0] ?? null;
  const proximalPeak =
    nearest(extrema.peaks, (point) => point.yMm <= selected.yMm + 0.2) ??
    nearest(extrema.peaks, () => true);
  const distalValley =
    nearest(extrema.valleys, (point) => point.yMm >= selected.yMm - 0.2) ??
    nearest(extrema.valleys, () => true);
  let nearestWireDistance = Number.POSITIVE_INFINITY;
  for (const [ax, ay, bx, by] of segments) {
    for (let sample = 0; sample <= 20; sample += 1) {
      const fraction = sample / 20;
      nearestWireDistance = Math.min(
        nearestWireDistance,
        distance(selected, {
          xMm: wrapMm(ax + (bx - ax) * fraction, circumference),
          yMm: ay + (by - ay) * fraction,
        }),
      );
    }
  }
  const nearestOther = targets
    .filter((target) => target.index !== activeIndex)
    .map((target) => ({
      target,
      distanceMm: distance(selected, target),
    }))
    .sort((left, right) => left.distanceMm - right.distanceMm)[0];
  const selectedRadius =
    (selected.fenestration.widthMm + selected.fenestration.heightMm) / 4;
  const otherRadius = nearestOther
    ? (nearestOther.target.fenestration.widthMm +
        nearestOther.target.fenestration.heightMm) /
      4
    : 0;
  const safeThreshold =
    Math.max(
      selected.fenestration.widthMm,
      selected.fenestration.heightMm,
    ) /
      2 +
    result.device.wireRadius;
  const strutClearance = nearestWireDistance - safeThreshold;
  const datumFraction = wrapMm(selected.xMm, circumference) / circumference;
  const datumArc =
    Math.min(datumFraction, 1 - datumFraction) *
    (Math.PI * model.diameterAt(selected.yMm));

  return {
    activeIndex,
    selectedTarget: selected,
    targets,
    measurements: [
      {
        id: "edge-center",
        label: "Fabric edge → center",
        valueMm: selected.yMm,
        state: "primary",
      },
      {
        id: "edge-opening",
        label: "Fabric edge → opening",
        valueMm:
          selected.yMm - selected.fenestration.heightMm / 2,
        state: "primary",
      },
      {
        id: "proximal-peak",
        label: "Center → proximal peak",
        valueMm: proximalPeak?.distanceMm ?? Number.NaN,
      },
      {
        id: "distal-valley",
        label: "Center → distal valley",
        valueMm: distalValley?.distanceMm ?? Number.NaN,
      },
      {
        id: "wire-clearance",
        label: "Opening → nearest wire",
        valueMm: strutClearance,
        state: strutClearance >= 1 ? "safe" : "review",
      },
      {
        id: "other-opening",
        label: nearestOther
          ? `Center → ${nearestOther.target.fenestration.vessel}`
          : "Center → next opening",
        valueMm: nearestOther?.distanceMm ?? Number.NaN,
      },
      {
        id: "opening-gap",
        label: "Opening edge → opening edge",
        valueMm: nearestOther
          ? nearestOther.distanceMm - selectedRadius - otherRadius
          : Number.NaN,
      },
      {
        id: "datum",
        label: "Center → CT datum",
        valueMm: datumArc,
      },
    ],
  };
}

export function attachPmegCaseTargets(
  result: DeviceAnalysisResult,
  fenestrations: Fenestration[],
  selectedIndex: number,
): PmegMeasurementSet | null {
  if (!result.size || result.device.benchCtDescriptor == null) {
    return null;
  }
  const circumference = result.circumferenceMm;
  const targets = fenestrations.map((fenestration, index) => {
    const adjustedClock =
      result.optimalConflicts[index]?.adjustedClock ?? fenestration.clock;
    return {
      index,
      fenestration,
      xMm: clockToArc(adjustedClock, circumference),
      yMm:
        fenestration.ftype === "SCALLOP"
          ? 0
          : result.depthOptimisation.adjustedDepths[index] ??
            fenestration.depthMm,
    };
  });
  if (targets.length === 0) return null;
  const activeIndex = Math.min(Math.max(0, selectedIndex), targets.length - 1);
  return buildMeasurements(
    result,
    targets,
    activeIndex,
    buildBenchCtRenderModel(result.device.benchCtDescriptor),
  );
}
