import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/freigabe-ausstehend")({
  head: () => ({
    meta: [
      { title: "Zugang gesperrt – GebCalc" },
      {
        name: "description",
        content: "Dieser Zugang wurde vom Anbieter gesperrt und ist derzeit nicht nutzbar.",
      },
      { property: "og:title", content: "Zugang gesperrt – GebCalc" },
      {
        property: "og:description",
        content: "Gesperrte Firmenkonten können sich nicht anmelden.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BlockedPage,
});

function BlockedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="surface w-full max-w-md space-y-4 p-6 text-center">
        <h1 className="font-display text-xl font-semibold">Zugang gesperrt</h1>
        <p className="text-sm text-muted-foreground">
          Dieser Zugang wurde vom Anbieter gesperrt. Bitte kontaktieren Sie uns, um Ihr Konto wieder
          freischalten zu lassen.
        </p>
        <Link to="/auth" className="inline-block text-sm underline">
          Zurück zur Anmeldung
        </Link>
      </div>
    </div>
  );
}
