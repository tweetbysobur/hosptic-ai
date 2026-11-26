// Official Hosptic logo, used exactly as supplied. Width follows the
// image's own aspect ratio, so the mark is never stretched or cropped.
export default function Logo({ className, size = 32, title }) {
  return (
    <img
      src="/brand/hosptic-logo-768.png"
      alt={title || ""}
      aria-hidden={title ? undefined : true}
      height={size}
      style={{ height: size, width: "auto" }}
      className={`block ${className || ""}`}
      decoding="async"
    />
  );
}
