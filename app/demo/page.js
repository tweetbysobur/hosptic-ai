import { notFound } from "next/navigation";
import { connection } from "next/server";
import DemoWorkspace from "@/components/demo/DemoWorkspace";
import { demoEnabled } from "@/lib/workspace/mode";

export const metadata = {
  title: "Demo workspace",
  description: "Explore Hosptic Provider with synthetic healthcare data. No account required.",
  robots: { index: false, follow: false },
};

// Public, clearly labelled demo. It runs the workspace in the browser on synthetic datasets and
// never calls authentication or hospital data endpoints. Disable with HOSPTIC_DEMO_ENABLED=false.
export default async function DemoPage() {
  await connection();
  if (!demoEnabled()) notFound();
  return <DemoWorkspace />;
}
