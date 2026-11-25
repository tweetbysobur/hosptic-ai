"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import Modal from "./Modal";

const ConfirmContext = createContext(null);

// Branded replacement for window.confirm. `await confirm({...})` resolves to true or false.
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolver.current = resolve;
    setRequest(options);
  }), []);

  const settle = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!request} onClose={() => settle(false)} labelledBy="confirm-title" describedBy="confirm-body">
        {request && (
          <>
            <h2 id="confirm-title" className="modal-title">{request.title}</h2>
            {request.body && <p id="confirm-body" className="modal-body">{request.body}</p>}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => settle(false)}>{request.cancelLabel || "Cancel"}</button>
              <button type="button" data-autofocus className={`btn ${request.tone === "danger" ? "danger-solid" : "primary"}`} onClick={() => settle(true)}>
                {request.confirmLabel || "Confirm"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

// Falls back to window.confirm only when no provider is mounted.
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  return ctx || (async (o) => window.confirm([o.title, o.body].filter(Boolean).join("\n\n")));
}
