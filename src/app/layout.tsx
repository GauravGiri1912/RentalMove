import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { StudioProvider, InitialStudioData } from "@/components/providers";
import { TourOverlay } from "@/components/tour";
import { AskPanel } from "@/components/assistant";
import { getServerSessionUser } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { buildSnapshot } from "@/lib/snapshot";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display" });

export const metadata: Metadata = {
  title: { default: "RentalMove", template: "%s · RentalMove" },
  description: "Visual property memory — capture once, find instantly, compare over time.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F4EF" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0C0E" },
  ],
};

// Runs before paint so a saved dark theme never flashes light.
const themeScript = `try{var t=JSON.parse(localStorage.getItem('rm.theme'));if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let initialData: InitialStudioData | undefined = undefined;
  try {
    const user = await getServerSessionUser();
    if (user) {
      const db = getDatabase();
      const properties = await db.listProperties(user.id, user.role);
      if (properties.length > 0) {
        const pid = user.assigned_property_id ?? properties[0].id;
        const snapshot = await buildSnapshot(pid, user);
        initialData = {
          sessionUser: {
            ...user,
            initials: user.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
          },
          properties,
          propertyId: pid,
          snapshot,
        };
      }
    }
  } catch {}

  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <StudioProvider initialData={initialData}>
          {children}
          <AskPanel />
          <TourOverlay />
        </StudioProvider>
      </body>
    </html>
  );
}
