import Image from "next/image";

import logo from "@/lib/logo.png";

export function BrandHeader() {
  return (
    <header className="border-[3px] border-ink bg-ink px-5 py-6 text-paper neo-shadow-lg md:px-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="neo-border flex h-14 w-14 items-center justify-center overflow-hidden bg-electric-lime neo-shadow-sm">
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
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-sun-yellow">Swift Strips India</p>
              <h1 className="brand-display mt-1 text-2xl md:text-3xl">Daily Checklist</h1>
            </div>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 border-[3px] border-paper bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-ink">
          <span className="h-2.5 w-2.5 border-[2px] border-ink bg-brand-green" />
          Live roster review
        </div>
      </div>
      <div className="brand-rule mt-5 h-2 border-[3px] border-ink" />
    </header>
  );
}
