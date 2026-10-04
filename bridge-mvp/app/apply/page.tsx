"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function ApplyPage() {
  const router = useRouter();
  const [analyzing, setAnalyzing] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!analyzing) return;

    const timeoutId = window.setTimeout(() => {
      router.push("/demo");
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [analyzing, router]);

  function acceptFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-xl border border-white/10 bg-card py-8 shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-2xl leading-tight tracking-tight sm:text-3xl">
            Prijavi se za poziciju: Junior Backend Engineer
          </CardTitle>
        </CardHeader>

        {analyzing ? (
          <CardContent
            className="flex flex-col items-center justify-center gap-4 py-16"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-10 animate-spin text-primary" />
            <p className="text-base text-muted-foreground">
              AI analizira vaš profil...
            </p>
          </CardContent>
        ) : (
          <>
            <CardContent className="flex flex-col gap-6">
              <label
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  acceptFile(event.dataTransfer.files?.[0]);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center transition-colors ${
                  dragging
                    ? "border-primary bg-primary/10"
                    : "border-white/15 bg-card hover:border-primary/40"
                }`}
              >
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(event) => acceptFile(event.target.files?.[0])}
                />
                <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <FileUp className="size-6" />
                </span>
                <span className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Prevuci svoj CV (PDF), ili ispod nalepi GitHub ili portfolio
                </span>
                {fileName ? (
                  <span className="text-sm font-medium text-primary">
                    {fileName}
                  </span>
                ) : null}
              </label>

              <div className="flex flex-col gap-2">
                <label htmlFor="github-url" className="text-sm font-medium">
                  GitHub ili portfolio (opciono)
                </label>
                <Input
                  id="github-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://github.com/korisnik"
                  value={githubUrl}
                  onChange={(event) => setGithubUrl(event.target.value)}
                  className="h-11 px-3"
                />
              </div>
            </CardContent>

            <CardFooter className="border-t-0 bg-transparent">
              <Button
                type="button"
                size="lg"
                className="h-12 w-full text-base font-semibold"
                onClick={() => setAnalyzing(true)}
              >
                Započni AI Intervju
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </main>
  );
}
