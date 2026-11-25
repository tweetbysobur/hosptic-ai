import { redirect } from "next/navigation";
import AuthLayout from "@/components/auth/AuthLayout";
import LoginForm from "@/components/auth/LoginForm";
import Notice from "@/components/auth/Notice";
import Link from "next/link";
import { resolveSession } from "@/lib/auth/session";
import { requestCookieHeader } from "@/lib/auth/request";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata = { title: "Sign in" };

const BANNERS = {
  expired: { tone: "info", title: "Your session has ended", text: "Sign in again to continue where you left off." },
  unavailable: { tone: "error", title: "Sign-in is unavailable", text: "The sign-in service cannot be reached right now. Try again shortly." },
  unconfigured: { tone: "error", title: "Sign-in is not connected", text: "The sign-in service has not been configured for this deployment. Contact your administrator." },
  signedOut: { tone: "success", title: "You have signed out", text: "Your session has ended on this device." },
  signedOutLocal: { tone: "info", title: "Signed out on this device", text: "We could not confirm that the session ended on the server. Sign out again when the service is available." },
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const next = safeNextPath(params?.next);

  const session = await resolveSession({ cookieHeader: await requestCookieHeader() });
  if (session.state === "authenticated") redirect(next);

  const configured = Boolean(process.env.HOSPTIC_API_URL);
  const banner = !configured
    ? BANNERS.unconfigured
    : session.state === "unavailable"
    ? BANNERS.unavailable
    : params?.signedOut === "1" ? BANNERS.signedOut
    : params?.signedOut === "local" ? BANNERS.signedOutLocal
    : params?.reason === "expired" || session.state === "expired" ? BANNERS.expired
    : null;

  return (
    <AuthLayout
      title="Sign in to Hosptic"
      description="Use your work email and password to open your organisation's workspace."
      footer={<div className="flex flex-col gap-2"><p>New to Hosptic? <Link href="/register" className="font-semibold text-ink underline decoration-primary underline-offset-4 hover:text-rose">Create an account</Link></p><p>Presenting or evaluating? <Link href="/demo" className="font-semibold text-ink underline decoration-primary underline-offset-4 hover:text-rose">Explore the demo</Link></p></div>}
    >
      <div className="flex flex-col gap-5">
        {banner && <Notice tone={banner.tone} title={banner.title}>{banner.text}</Notice>}
        <LoginForm next={next} />
      </div>
    </AuthLayout>
  );
}
