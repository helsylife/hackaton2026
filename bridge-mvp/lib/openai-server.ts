type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type CompletionInput = {
  system: string;
  user?: string;
  messages?: ChatTurn[];
  json?: boolean;
};

export async function completeText({
  system,
  user,
  messages,
  json = false,
}: CompletionInput): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: json ? 0.4 : 0.7,
        response_format: json ? { type: "json_object" } : undefined,
        messages: [
          { role: "system", content: system },
          ...(messages ?? [{ role: "user" as const, content: user ?? "" }]),
        ],
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

export function readJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1] : text);
}
