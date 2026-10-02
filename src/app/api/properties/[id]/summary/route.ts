import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { reportInspections } from "@/lib/snapshot";
import { getServerSessionUser } from "@/lib/auth";
import { listEvents, deriveMeasures, deriveAssessments, deriveCalibrations, deriveCoverage, deriveCoverageSkips, deriveCoverageSlots, derivePrivacy, derivePrivacyScans, deriveRoomMatch, deriveStances, deriveSubmitted, deriveThreads, deriveWorkOrders } from "@/lib/events";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getServerSessionUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const propertyId = (await params).id;
    const db = getDatabase();
    
    const property = await db.getProperty(propertyId);
    if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [rooms, inspectionsDesc, users, events] = await Promise.all([
      db.getRooms(propertyId),
      db.getInspections(propertyId),
      db.listUsers(),
      listEvents(propertyId),
    ]);

    const inspections = [...inspectionsDesc].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    const { baseline, current } = reportInspections(inspections);

    return NextResponse.json({
      property,
      rooms,
      inspections,
      report: {
        baseline_inspection_id: baseline?.id ?? null,
        current_inspection_id: current?.id ?? null,
      },
      people: Object.fromEntries(users.map(u => [u.id, u.name])),
      stances: deriveStances(events),
      threads: deriveThreads(events),
      measures: deriveMeasures(events),
      assessments: deriveAssessments(events),
      submitted: deriveSubmitted(events),
      // Everything else that a screen can change and then needs to see again (a scale, a hidden area, a repair, a room check,
      // a checklist decision). Leaving these out made such changes succeed on the server and never appear on the Review page.
      calibrations: deriveCalibrations(events),
      work_orders: deriveWorkOrders(events),
      privacy: derivePrivacy(events),
      privacy_scans: derivePrivacyScans(events),
      room_match: deriveRoomMatch(events),
      coverage: deriveCoverage(events),
      coverage_slots: deriveCoverageSlots(events),
      coverage_skips: deriveCoverageSkips(events),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
