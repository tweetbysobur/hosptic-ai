"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Field from "./Field";
import Notice from "./Notice";
import SubmitButton from "@/components/ui/SubmitButton";
import { apiClient } from "@/lib/api/client";
import { fieldErrorsFrom } from "@/lib/api/errors";
import { messageForError } from "@/lib/auth/messages";
import { validateLogin, hasErrors } from "@/lib/auth/validation";

export default function LoginForm({ next }) {
  const router = useRouter();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  // A visitor who already has a valid session goes straight to the requested page.
  useEffect(() => {
    let active = true;
    apiClient.auth.me()
      .then(() => { if (active) router.replace(next); })
      .catch(() => {});
    return () => { active = false; };
  }, [next, router]);

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
    try {
      await apiClient.auth.login({ email: values.email.trim(), password: values.password });
      router.replace(next);
      router.refresh();
    } catch (error) {
      setFormError(messageForError(error));
      setErrors(fieldErrorsFrom(error));
      setPending(false);
      inFlight.current = false;
    }
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
