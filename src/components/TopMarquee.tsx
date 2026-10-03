const MARQUEE_ITEMS = [
  "Swift Strips India",
  "Daily ops board",
  "Checkpoint ready",
  "Escalations tracked",
  "Senior checklist",
] as const;

function MarqueeItems() {
  return MARQUEE_ITEMS.map((item) => <span key={item}>{item}</span>);
}

export function TopMarquee() {
  return (
    <div className="marquee" role="presentation">
      <div className="marquee__viewport">
        <div className="marquee__track">
          <div className="marquee__group"><MarqueeItems /></div>
          <div className="marquee__group" aria-hidden="true"><MarqueeItems /></div>
        </div>
      </div>
    </div>
  );
}