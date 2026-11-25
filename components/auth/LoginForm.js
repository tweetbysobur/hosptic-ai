"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Field from "./Field";
import Notice from "./Notice";
import SubmitButton from "@/components/ui/SubmitButton";
import { postJson } from "@/lib/auth/client";
import { validateLogin, hasErrors } from "@/lib/auth/validation";

export default function LoginForm({ next }) {
  const router = useRouter();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const update = (key) => (value) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    setFormError(null);
    const fieldErrors = validateLogin(values);
    setErrors(fieldErrors);
    if (hasErrors(fieldErrors)) return;

    inFlight.current = true;
    setPending(true);
    const result = await postJson("/api/auth/login", values);
    if (result.ok) {
      router.replace(next);
      router.refresh();
      return;
    }
    setFormError(result.error);
    setErrors(result.fields || {});
    setPending(false);
    inFlight.current = false;
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {formError && <Notice title="Sign-in failed">{formError}</Notice>}
      <Field id="email" label="Work email" type="email" autoComplete="email" value={values.email} onChange={update("email")} error={errors.email} disabled={pending} />
      <Field id="password" label="Password" type="password" autoComplete="current-password" value={values.password} onChange={update("password")} error={errors.password} disabled={pending} />
      <SubmitButton pending={pending} pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
