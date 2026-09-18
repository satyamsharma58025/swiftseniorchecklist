import Image from "next/image";

import logo from "@/lib/logo.png";

export function BrandHeader() {
  return (
    <header className="rounded-[2rem] border border-brand-navy/10 bg-brand-navy px-5 py-6 text-white shadow-[0_18px_45px_rgba(22,48,92,0.2)] md:px-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-white/20">
              <Image
                src={logo}
                alt="Swift Strips India logo"
                width={56}
                height={56}
                priority
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-brand-saffron/90">Swift Strips India</p>
              <h1 className="mt-1 brand-display text-2xl font-semibold tracking-tight md:text-3xl">
                Daily Checklist
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-green" />
          Live roster review
        </div>
      </div>
      <div className="brand-rule mt-5 h-1.5 rounded-full" />
    </header>
  );
}
