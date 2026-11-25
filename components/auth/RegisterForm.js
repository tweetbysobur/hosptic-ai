"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Field from "./Field";
import Notice from "./Notice";
import SubmitButton from "@/components/ui/SubmitButton";
import { apiClient } from "@/lib/api/client";
import { fieldErrorsFrom } from "@/lib/api/errors";
import { messageForError } from "@/lib/auth/messages";
import { validateRegistration, hasErrors } from "@/lib/auth/validation";

// Creates the user, the organisation and its first administrator in one request.
export default function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = useState({ fullName: "", email: "", password: "", confirmPassword: "", organizationName: "", organizationEmail: "" });
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
    try {
      await apiClient.auth.register({
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        password: values.password,
        organizationName: values.organizationName.trim(),
        ...(values.organizationEmail.trim() ? { organizationEmail: values.organizationEmail.trim() } : {}),
      });
      router.replace("/app");
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
      {formError && <Notice title="Account not created">{formError}</Notice>}
      <Field id="fullName" label="Full name" autoComplete="name" value={values.fullName} onChange={update("fullName")} error={errors.fullName} disabled={pending} maxLength={120} />
      <Field id="email" label="Work email" type="email" autoComplete="email" value={values.email} onChange={update("email")} error={errors.email} disabled={pending} hint="Use the address your organisation gave you." />
      <Field id="password" label="Password" type="password" autoComplete="new-password" value={values.password} onChange={update("password")} error={errors.password} disabled={pending} hint="At least 10 characters, with a letter and a number." maxLength={128} />
      <Field id="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" value={values.confirmPassword} onChange={update("confirmPassword")} error={errors.confirmPassword} disabled={pending} maxLength={128} />
      <Field id="organizationName" label="Organisation name" value={values.organizationName} onChange={update("organizationName")} error={errors.organizationName} disabled={pending} maxLength={160} hint="The hospital or research unit you will analyse data for." />
      <Field id="organizationEmail" label="Organisation email" type="email" required={false} value={values.organizationEmail} onChange={update("organizationEmail")} error={errors.organizationEmail} disabled={pending} />
      <SubmitButton pending={pending} pendingLabel="Creating account…">Create account</SubmitButton>
    </form>
  );
}
