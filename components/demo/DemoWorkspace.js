"use client";

import AppShell from "@/components/AppShell";
import { demoAdapter } from "@/lib/workspace/demo-adapter";

// The real Hosptic Provider workspace, running on the demo data source.
export default function DemoWorkspace() {
  return <AppShell adapter={demoAdapter} />;
}
