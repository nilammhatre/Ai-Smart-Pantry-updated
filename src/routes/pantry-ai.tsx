import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/pantry-ai")({
  beforeLoad: () => {
    throw redirect({ to: "/app/assistant" });
  },
});
