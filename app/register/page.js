import Link from "next/link";
import AuthLayout from "@/components/auth/AuthLayout";
import RegisterForm from "@/components/auth/RegisterForm";

export const metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <AuthLayout
      title="Create your account"
      description="Your account and organisation are created together. You will be the organisation's first administrator."
      footer={<>Already have an account? <Link href="/login" className="font-semibold text-ink underline decoration-primary underline-offset-4 hover:text-rose">Sign in</Link></>}
    >
      <RegisterForm />
    </AuthLayout>
  );
}
