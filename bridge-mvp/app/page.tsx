import { AiChatInterview } from "@/components/ai-chat-interview";
import { RecruiterDashboard } from "@/components/recruiter-dashboard";
import { TelemetryProvider } from "@/lib/telemetry-context";

export default function Home() {
  return (
    <TelemetryProvider>
      <main className="grid h-screen grid-cols-2 overflow-hidden bg-background text-zinc-100 antialiased">
        <section aria-label="Kandidat" className="min-h-0 overflow-hidden border-r border-white/10">
          <AiChatInterview />
        </section>
        <section aria-label="Administrator" className="min-h-0 overflow-hidden">
          <RecruiterDashboard />
        </section>
      </main>
    </TelemetryProvider>
  );
}
