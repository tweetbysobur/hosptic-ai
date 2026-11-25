export default function SectionIntro({ eyebrow, title, description, id, align = "left", tone = "default" }) {
  const alignment = align === "center" ? "mx-auto text-center" : "";
  const dark = tone === "dark";
  return (
    <div className={`max-w-2xl ${alignment}`}>
      <h2 id={id} className={`mt-3 text-balance text-3xl font-extrabold leading-[1.12] tracking-[-0.02em] sm:text-4xl lg:text-[42px] ${dark ? "text-white" : "text-ink"}`}>
        {title}
      </h2>
      {description && (
        <p className={`mt-4 text-pretty text-base leading-relaxed sm:text-lg ${dark ? "text-white/70" : "text-muted"}`}>{description}</p>
      )}
    </div>
  );
}
