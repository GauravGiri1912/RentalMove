import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { reportInspections } from "@/lib/snapshot";
import { getServerSessionUser } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getServerSessionUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const propertyId = (await params).id;
    const db = getDatabase();
    
    const property = await db.getProperty(propertyId);
    if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [rooms, inspectionsDesc, users, measuresArr, assessmentsArr] = await Promise.all([
      db.getRooms(propertyId),
      db.getInspections(propertyId),
      db.listUsers(),
      db.getMeasures(propertyId),
      db.getAssessments(propertyId),
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
      measures: Object.fromEntries(measuresArr.map((m) => [m.id, m])),
      assessments: Object.fromEntries(assessmentsArr.map((a) => [a.id, a])),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
