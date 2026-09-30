/**
 * Template "rolling text" hover: each character is stacked twice and slides up with a small
 * per-letter stagger when the parent `.roll-host` is hovered or focused.
 */
export function RollingText({ text }: { text: string }) {
  return (
    <span className="roll" aria-label={text}>
      {Array.from(text).map((ch, i) => {
        const c = ch === ' ' ? ' ' : ch;
        return (
          <span className="roll__ch" style={{ ['--i' as string]: i }} key={i} aria-hidden>
            <span>{c}</span>
            <span>{c}</span>
          </span>
        );
      })}
    </span>
  );
}
