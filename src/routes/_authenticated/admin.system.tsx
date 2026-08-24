import { createFileRoute } from "@tanstack/react-router";
import { DomainDnsCheckCard } from "@/components/DomainDnsCheckCard";

export const Route = createFileRoute("/_authenticated/admin/system")({
  component: AdminSystemPage,
});

function AdminSystemPage() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Technische Plattform-Einstellungen: Domain-Verifizierung (A-Record, TXT-Einträge) und
        Hosting-Status. Diese Angaben sind ausschließlich für den Plattform-Administrator sichtbar.
      </p>
      <DomainDnsCheckCard />
    </div>
  );
}
