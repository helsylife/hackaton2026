"use client";

import { AdminWorkspace } from "@/components/admin-workspace";
import { TelemetryProvider } from "@/lib/telemetry-context";

export default function AdminSetupPage() {
  return (
    <TelemetryProvider>
      <AdminWorkspace layout="page" />
    </TelemetryProvider>
  );
}
