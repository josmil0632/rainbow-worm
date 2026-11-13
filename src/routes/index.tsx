import { createFileRoute } from "@tanstack/react-router";
import { RainbowRun } from "@/components/RainbowRun";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <RainbowRun />;
}
