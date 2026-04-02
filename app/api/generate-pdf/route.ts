import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      message:
        "The MVP currently uses client-side jsPDF export and the /punch-card-print route for print output.",
    },
    { status: 501 },
  );
}

