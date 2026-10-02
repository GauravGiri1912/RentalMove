/**
 * demo.ts — the sample workspace.
 *
 * `prop-381` is the seeded demo home (its later photos are staged). It is only reachable by the demo accounts: a
 * real account sees nothing but the properties it created or was invited to. Wherever the demo home is on screen it
 * is labelled, so nobody mistakes sample data for a real record.
 */

export const DEMO_PROPERTY_IDS: readonly string[] = ["prop-381"];

export const isDemoProperty = (id: string | null | undefined): boolean => !!id && DEMO_PROPERTY_IDS.includes(id);

export const DEMO_NOTE = "Demo workspace: sample data, and some of the later photos are staged. Nothing here is a real record.";
