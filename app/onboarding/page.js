import { redirect } from "next/navigation";
import AuthLayout from "@/components/auth/AuthLayout";
import OrganisationForm from "@/components/auth/OrganisationForm";
import { resolveSession } from "@/lib/auth/session";
import { requestCookieHeader } from "@/lib/auth/request";

export const metadata = { title: "Set up your organisation" };

export default async function OnboardingPage() {
  const session = await resolveSession({ cookieHeader: await requestCookieHeader() });
  if (session.state === "anonymous") redirect("/login?next=/onboarding");
  if (session.state === "expired") redirect("/login?reason=expired&next=/onboarding");
  if (session.state === "unavailable") redirect("/login?reason=unavailable&next=/onboarding");

  return (
    <AuthLayout
      title="Set up your organisation"
      description="Create a new organisation, or join one your administrator has invited you to."
    >
      <OrganisationForm />
    </AuthLayout>
  );
}
