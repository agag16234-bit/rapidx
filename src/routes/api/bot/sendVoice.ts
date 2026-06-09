import { createFileRoute } from "@tanstack/react-router";
import { makeSendMediaHandler, corsPreflight } from "@/lib/bot-api.server";

export const Route = createFileRoute("/api/bot/sendVoice")({
  server: { handlers: { OPTIONS: async () => corsPreflight(), POST: makeSendMediaHandler("sendVoice", "audio") } },
});
