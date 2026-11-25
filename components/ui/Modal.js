"use client";

import { useEffect, useRef } from "react";

// Accessible modal: labelled dialog, Escape to close, focus moves inside and returns afterwards.
export default function Modal({ open, onClose, labelledBy, describedBy, children, width = 440, busy = false }) {
  const panel = useRef(null);
  const returnFocus = useRef(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement;
    const first = panel.current?.querySelector("[data-autofocus], button, input, select, textarea, a[href]");
    first?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose?.(); }
      if (e.key === "Tab" && panel.current) {
        const items = [...panel.current.querySelectorAll("button:not([disabled]), input:not([disabled]), select, textarea, a[href]")];
        if (!items.length) return;
        const [firstItem, lastItem] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === firstItem) { e.preventDefault(); lastItem.focus(); }
        else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); firstItem.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      returnFocus.current?.focus?.();
    };
  }, [open, onClose, busy]);

  if (!open) return null;
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div ref={panel} className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy} style={{ maxWidth: width }}>
        {children}
      </div>
    </div>
  );
}
