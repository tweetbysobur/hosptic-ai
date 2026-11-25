"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Field from "./Field";
import Notice from "./Notice";
import SubmitButton from "@/components/ui/SubmitButton";
import { postJson } from "@/lib/auth/client";
import { ORGANISATION_TYPES } from "@/lib/auth/contract";
import { validateCreateOrganisation, validateJoinOrganisation, hasErrors } from "@/lib/auth/validation";

// Onboarding: create an organisation as its first member, or join one with an invitation code.
// Access to the organisation's data is decided by the backend, never by this form.
export default function OrganisationForm() {
  const router = useRouter();
  const [mode, setMode] = useState("create");
  const [create, setCreate] = useState({ name: "", type: "", country: "" });
  const [join, setJoin] = useState({ code: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const switchMode = (next) => {
    if (pending) return;
    setMode(next);
    setErrors({});
    setFormError(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    setFormError(null);
    const fieldErrors = mode === "create" ? validateCreateOrganisation(create) : validateJoinOrganisation(join);
    setErrors(fieldErrors);
    if (hasErrors(fieldErrors)) return;

    inFlight.current = true;
    setPending(true);
    const result = mode === "create"
      ? await postJson("/api/auth/organisation", create)
      : await postJson("/api/auth/organisation/join", join);
    if (result.ok) {
      router.replace("/app");
      router.refresh();
      return;
    }
    setFormError(result.error);
    setErrors(result.fields || {});
    setPending(false);
    inFlight.current = false;
  };

  const tab = (id, label) => (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={mode === id}
      aria-controls={`panel-${id}`}
      onClick={() => switchMode(id)}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === id ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Organisation setup" className="flex gap-1 rounded-xl bg-canvas p-1">
        {tab("create", "Create organisation")}
        {tab("join", "Join with code")}
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col gap-5" role="tabpanel" id={`panel-${mode}`} aria-labelledby={`tab-${mode}`}>
        {formError && <Notice title="Organisation not saved">{formError}</Notice>}

        {mode === "create" ? (
          <>
            <Field id="orgName" label="Organisation name" value={create.name} onChange={(v) => setCreate((c) => ({ ...c, name: v }))} error={errors.name} disabled={pending} maxLength={160} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="orgType" className="text-sm font-semibold text-ink">Type of organisation</label>
              <select
                id="orgType"
                name="orgType"
                value={create.type}
                onChange={(e) => setCreate((c) => ({ ...c, type: e.target.value }))}
                disabled={pending}
                required
                aria-invalid={errors.type ? "true" : undefined}
                aria-describedby={errors.type ? "orgType-error" : undefined}
                className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink focus:border-rose focus:outline-none focus:ring-2 focus:ring-primary/35 aria-invalid:border-rose"
              >
                <option value="">Select a type</option>
                {ORGANISATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {errors.type && <p id="orgType-error" className="text-sm font-medium text-rose">{errors.type}</p>}
            </div>
            <Field id="orgCountry" label="Country" required={false} value={create.country} onChange={(v) => setCreate((c) => ({ ...c, country: v }))} error={errors.country} disabled={pending} maxLength={80} />
            <p className="text-sm leading-relaxed text-ink-2">You will be the first member of this organisation. You can invite colleagues after setup.</p>
          </>
        ) : (
          <>
            <Field id="inviteCode" label="Invitation code" value={join.code} onChange={(v) => setJoin({ code: v })} error={errors.code} disabled={pending} hint="Ask your organisation administrator for the code." maxLength={64} />
          </>
        )}

        <SubmitButton pending={pending} pendingLabel="Saving…">{mode === "create" ? "Create organisation" : "Join organisation"}</SubmitButton>
      </form>
    </div>
  );
}
