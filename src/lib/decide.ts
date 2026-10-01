// Pure rule shared by the API and the UI (no server imports).
/**
 * Who decides on a finding (accept / reject / edit): the person who ran the inspection it
 * belongs to. The other party records agreement or a dispute instead, so neither side can
 * remove the other's evidence from the report. Inspections without a recorded creator fall
 * back to the property owner.
 */
export function canDecide(userId: string, inspectionCreator: string | null | undefined, propertyOwner: string | null | undefined): boolean {
  return userId === (inspectionCreator || propertyOwner);
}
