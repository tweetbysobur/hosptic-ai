import Link from "next/link";

const BASE =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-[15px] font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose active:scale-[0.98]";

const VARIANTS = {
  primary: "bg-primary text-white shadow-[0_10px_24px_-12px_rgba(255,96,130,0.75)] hover:bg-rose",
  secondary: "border border-line bg-surface text-ink hover:border-primary/50 hover:bg-blush",
  ghost: "text-ink-2 hover:text-ink",
};

export default function Button({ href, variant = "primary", size = "md", className = "", children, ...rest }) {
  const sizing = size === "sm" ? "h-10 px-5 text-sm" : "";
  return (
    <Link href={href} className={`${BASE} ${VARIANTS[variant]} ${sizing} ${className}`} {...rest}>
      {children}
    </Link>
  );
}
