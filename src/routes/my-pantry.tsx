import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/my-pantry")({
  beforeLoad: () => {
    throw redirect({ to: "/app/pantry" });
  },
});
