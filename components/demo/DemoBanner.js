"use client";

import Link from "next/link";

// Persistent label for the demo workspace. It sits above the workspace on every screen, so a
// presentation never shows synthetic data without saying so.
export default function DemoBanner({ onReset }) {
  return (
    <div className="demo-banner" role="region" aria-label="Demo mode">
      <p className="demo-banner-text">
        <span className="demo-banner-dot" aria-hidden="true" />
        <strong>Demo mode.</strong> Synthetic data only. Nothing here connects to a hospital system or a real patient record.
      </p>
      <div className="demo-banner-actions">
        <button type="button" className="btn" onClick={onReset}>Reset demo</button>
        <Link href="/login" className="btn">Sign in with your organisation</Link>
      </div>
    </div>
  );
}
