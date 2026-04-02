import { Suspense } from "react";

import { PrintCardClient } from "@/components/PrintCardClient";

export default function PunchCardPrintPage() {
  return (
    <Suspense fallback={null}>
      <PrintCardClient />
    </Suspense>
  );
}
