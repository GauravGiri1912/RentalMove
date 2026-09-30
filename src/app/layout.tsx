import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { StudioProvider } from "@/components/providers";
import { TourOverlay } from "@/components/tour";
import { AskPanel } from "@/components/assistant";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <StudioProvider>
          {children}
          <AskPanel />
          <TourOverlay />
        </StudioProvider>
      </body>
    </html>
  );
}
