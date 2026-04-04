import { Badge } from "@/components/ui/badge";
import type { DeviceAnalysisResult } from "@/lib/types";

const hierarchyLabels: Record<number, string> = {
  1: "Gold Standard",
  2: "Common",
  3: "Emerging",
  4: "Niche",
};

export function RecommendationBadge({
  result,
  rank,
}: {
  result: DeviceAnalysisResult;
  rank: number;
}) {
  const label = hierarchyLabels[result.device.clinicalRank] ?? "Platform";
  const toneClass =
    rank === 0
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : "border-[color:var(--border)] bg-white/80 text-[color:var(--muted-foreground)]";

  return (
    <Badge className={toneClass}>
      {rank === 0
        ? `Recommended • ${label} • ${result.manufacturabilityScore.toFixed(1)}`
        : `${label} • ${result.manufacturabilityScore.toFixed(1)}`}
    </Badge>
  );
}
