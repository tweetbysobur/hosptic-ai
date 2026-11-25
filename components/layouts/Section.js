// Page section wrapper: consistent vertical rhythm, container width and anchor offset for the sticky header.
export default function Section({ id, tone = "canvas", className = "", children, labelledBy }) {
  const tones = {
    canvas: "bg-canvas",
    surface: "bg-surface",
    blush: "bg-blush/60",
  };
  return (
    <section id={id} aria-labelledby={labelledBy} className={`scroll-mt-20 py-20 sm:py-28 ${tones[tone]} ${className}`}>
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">{children}</div>
    </section>
  );
}
