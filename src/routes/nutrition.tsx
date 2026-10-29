import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/nutrition")({
  beforeLoad: () => {
    throw redirect({ to: "/app/nutrition" });
  },
});
