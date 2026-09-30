import Link from "next/link";
import { named } from "@/lib/cloudinary-urls";

const SIDE = "properties/prop-381/insp-2024-move-in/living_room/living-floor-01";

/** Split layout for login/sign-up: form on the left, a real (face-pixelated) inspection photo on the right. */
export function AuthFrame({ title, lede, children }: { title: React.ReactNode; lede: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 md:px-12">
        <Link href="/welcome" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-[9px] bg-ink text-bg">
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><rect x="9" y="12" width="6" height="5" rx=".6" className="stroke-signal" /></svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight">RentalMove</span>
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 animate-fade-up">
          <h1 className="h-display text-[48px] md:text-[56px]">{title}</h1>
          <p className="mb-8 mt-2 text-[15px] text-ink-2">{lede}</p>
          {children}
        </div>
        <p className="text-center text-[11.5px] text-ink-3">Secured by Supabase Auth · media by Cloudinary</p>
      </div>
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={named(SIDE, "rm_portrait")} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute inset-x-10 bottom-10 text-white">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/60">Living room · move-in · face pixelated by Cloudinary</div>
          <div className="mt-3 font-display text-[40px] leading-tight">Every room <em className="text-signal">remembers</em>.</div>
        </div>
      </div>
    </div>
  );
}
