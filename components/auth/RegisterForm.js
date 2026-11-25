"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Field from "./Field";
import Notice from "./Notice";
import SubmitButton from "@/components/ui/SubmitButton";
import { postJson } from "@/lib/auth/client";
import { validateRegistration, hasErrors } from "@/lib/auth/validation";

export default function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const update = (key) => (value) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    setFormError(null);
    const fieldErrors = validateRegistration(values);
    setErrors(fieldErrors);
    if (hasErrors(fieldErrors)) return;

    inFlight.current = true;
    setPending(true);
    const result = await postJson("/api/auth/register", {
      name: values.name,
      email: values.email,
      password: values.password,
      confirmPassword: values.confirmPassword,
    });
    if (result.ok) {
      router.replace("/onboarding");
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
      {formError && <Notice title="Account not created">{formError}</Notice>}
      <Field id="name" label="Full name" autoComplete="name" value={values.name} onChange={update("name")} error={errors.name} disabled={pending} maxLength={120} />
      <Field id="email" label="Work email" type="email" autoComplete="email" value={values.email} onChange={update("email")} error={errors.email} disabled={pending} hint="Use the address your organisation gave you." />
      <Field id="password" label="Password" type="password" autoComplete="new-password" value={values.password} onChange={update("password")} error={errors.password} disabled={pending} hint="At least 8 characters, with a letter and a number." maxLength={128} />
      <Field id="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" value={values.confirmPassword} onChange={update("confirmPassword")} error={errors.confirmPassword} disabled={pending} maxLength={128} />
      <SubmitButton pending={pending} pendingLabel="Creating account…">Create account</SubmitButton>
    </form>
  );
}
