"use client";

import { useLayoutEffect, useState } from "react";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTelemetry } from "@/lib/telemetry-context";
import { cn } from "@/lib/utils";

const MotionCard = motion.create(Card);

const NODES: { label: string; center?: boolean }[] = [
  { label: "API Gateway" },
  { label: "Auth Service" },
  { label: "Cache" },
  { label: "Worker Pods" },
  { label: "Database Cluster", center: true },
  { label: "Read Replica" },
  { label: "Message Queue" },
  { label: "Object Storage" },
  { label: "Metrics" },
];

const FAKE_LOGS = [
  {
    time: "14:02:11.102",
    level: "ERROR",
    message: "primary db-0 refused connection 10.0.4.12:5432",
  },
  {
    time: "14:02:11.448",
    level: "WARN",
    message: "read-replica-east replication lag 18420ms",
  },
  {
    time: "14:02:12.017",
    level: "ERROR",
    message: "write quorum lost — 1/3 nodes reachable",
  },
  {
    time: "14:02:12.640",
    level: "INFO",
    message: "failover candidate ready: read-replica-east",
  },
  {
    time: "14:02:13.105",
    level: "WARN",
    message: "pod/api-7f9c CrashLoopBackOff restarts=3",
  },
] as const;

const LEVEL_CLASS = {
  ERROR: "text-red-400",
  WARN: "text-amber-300",
  INFO: "text-emerald-400",
} as const;

const INCIDENT_SHADOW = [
  "0 0 0 1px rgba(239, 68, 68, 0.45), 0 0 10px rgba(239, 68, 68, 0.25)",
  "0 0 0 1px rgba(239, 68, 68, 0.95), 0 0 28px rgba(239, 68, 68, 0.9)",
  "0 0 0 1px rgba(239, 68, 68, 0.45), 0 0 10px rgba(239, 68, 68, 0.25)",
];

const HEALTHY_SHADOW =
  "0 0 0 1px rgba(34, 197, 94, 0.75), 0 0 24px rgba(34, 197, 94, 0.55)";

export function CandidateChallenge() {
  const { status, trackAction, resolveIncident, autoFillDemo, triggerIncident } =
    useTelemetry();
  const [logsVisible, setLogsVisible] = useState(false);
  const incident = status === "incident";
  const healthy = status === "stabilno" || status === "rešeno";

  useLayoutEffect(() => {
    triggerIncident();
  }, [triggerIncident]);

  return (
    <div className="dark relative h-full overflow-auto p-6">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center gap-5">
        <div>
          <p className="text-xs text-muted-foreground">
            Candidate challenge
          </p>
          <h1 className="mt-1 text-xl font-medium tracking-tight">
            Production topology
          </h1>
        </div>

        <MotionCard
          className="bg-card"
          animate={
            incident
              ? { x: [0, -3, 3, -2, 2, 0], boxShadow: INCIDENT_SHADOW }
              : { x: 0, boxShadow: healthy ? HEALTHY_SHADOW : "none" }
          }
          transition={
            incident
              ? {
                  x: {
                    duration: 1,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, 0.08, 0.16, 0.24, 0.32, 1],
                  },
                  boxShadow: {
                    duration: 1,
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                }
              : { duration: 0.45, ease: "easeOut" }
          }
        >
          <CardHeader>
            <CardTitle>System architecture</CardTitle>
            <CardDescription>
              {incident
                ? "Primary database is unreachable."
                : status === "rešeno"
                  ? "Traffic is on the read replica."
                  : "Cluster is accepting writes."}
            </CardDescription>
            <CardAction>
              <Badge variant={incident ? "destructive" : "secondary"}>
                {status}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {NODES.map((node) =>
                node.center ? (
                  <Card
                    key={node.label}
                    size="sm"
                    className={cn(
                      "items-center justify-center text-center",
                      incident
                        ? "bg-red-500/10 ring-red-500/50"
                        : "bg-emerald-500/10 ring-emerald-500/40",
                    )}
                  >
                    <CardContent className="flex min-h-16 items-center justify-center text-xs font-semibold">
                      Database Cluster
                    </CardContent>
                  </Card>
                ) : (
                  <div
                    key={node.label}
                    className="flex min-h-16 items-center justify-center rounded-lg bg-muted/60 px-2 text-center text-xs text-muted-foreground ring-1 ring-foreground/10"
                  >
                    {node.label}
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </MotionCard>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => trackAction("Restart Pods", { target: "worker-pods" })}
          >
            Restart Pods
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              trackAction("View Logs", { panel: "console" });
              setLogsVisible(true);
            }}
          >
            View Logs
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              trackAction("Switch to Read-Replica", {
                target: "read-replica-east",
              });
              resolveIncident();
            }}
          >
            Switch to Read-Replica
          </Button>
        </div>

        {logsVisible ? (
          <div className="overflow-hidden rounded-lg bg-zinc-950 font-mono text-[11px] leading-5 ring-1 ring-white/10">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2 text-zinc-500">
              <span className="size-2 rounded-full bg-red-500/80" />
              <span className="size-2 rounded-full bg-amber-400/80" />
              <span className="size-2 rounded-full bg-emerald-500/80" />
              <span className="ml-2">cluster.log</span>
            </div>
            <div className="space-y-1 p-3">
              {FAKE_LOGS.map((line) => (
                <p key={line.time}>
                  <span className="text-zinc-500">{line.time}</span>{" "}
                  <span className={LEVEL_CLASS[line.level]}>{line.level}</span>{" "}
                  <span className="text-zinc-300">{line.message}</span>
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Auto fill demo"
        onClick={() => autoFillDemo()}
        className="fixed right-4 bottom-4 z-50 flex size-8 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/70 backdrop-blur-sm transition hover:bg-white/20 hover:text-white"
      >
        <Zap className="size-3.5" />
      </button>
    </div>
  );
}
