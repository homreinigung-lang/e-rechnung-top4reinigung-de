import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/freigabe-ausstehend")({
  head: () => ({
    meta: [
      { title: "Konto wartet auf Freigabe – HomR Office" },
      {
        name: "description",
        content:
          "Ihr neues Konto wurde registriert und wartet auf die Freigabe durch den Inhaber.",
      },
      { property: "og:title", content: "Konto wartet auf Freigabe – HomR Office" },
      {
        property: "og:description",
        content: "Neue Konten werden vor der ersten Anmeldung manuell freigegeben.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PendingPage,
});

function PendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="surface w-full max-w-md space-y-4 p-6 text-center">
        <h1 className="font-display text-xl font-semibold">Konto wartet auf Freigabe</h1>
        <p className="text-sm text-muted-foreground">
          Ihre Registrierung wurde übermittelt. Der Inhaber prüft den Zugang und gibt ihn frei –
          Sie erhalten anschließend eine E-Mail und können sich dann anmelden.
        </p>
        <Link to="/auth" className="inline-block text-sm underline">
          Zurück zur Anmeldung
        </Link>
      </div>
    </div>
  );
}
