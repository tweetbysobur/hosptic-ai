import { redirect } from "next/navigation";
import Link from "next/link";
import AuthLayout from "@/components/auth/AuthLayout";
import RegisterForm from "@/components/auth/RegisterForm";
import { resolveSession } from "@/lib/auth/session";
import { requestCookieHeader } from "@/lib/auth/request";

export const metadata = { title: "Create an account" };

export default async function RegisterPage() {
  const session = await resolveSession({ cookieHeader: await requestCookieHeader() });
  if (session.state === "authenticated") redirect("/app");

  return (
    <AuthLayout
      title="Create your account"
      description="You will set up your organisation in the next step."
      footer={<>Already have an account? <Link href="/login" className="font-semibold text-ink underline decoration-primary underline-offset-4 hover:text-rose">Sign in</Link></>}
    >
      <RegisterForm />
    </AuthLayout>
  );
}
