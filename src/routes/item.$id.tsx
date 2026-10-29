import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/item/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app/pantry/$id", params: { id: params.id } });
  },
});
