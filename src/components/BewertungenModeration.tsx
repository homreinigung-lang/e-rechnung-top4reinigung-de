import { Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { reviewStatusLabel, useAllReviews, useModerateReview } from "@/lib/reviews";

/** Freigabe echter Kundenbewertungen für die öffentliche Startseite. */
export function BewertungenModeration() {
  const { data: reviews = [], isLoading } = useAllReviews(true);
  const moderate = useModerateReview();

  return (
    <section className="surface space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Kundenbewertungen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Nur freigegebene Bewertungen erscheinen auf der öffentlichen Startseite.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Wird geladen …</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">Es liegen noch keine Bewertungen vor.</p>
      ) : (
        <div className="grid gap-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{r.company_name || "Firmenkunde"}</span>
                  <span className="flex items-center gap-0.5 text-amber-500">
                    {Array.from({ length: r.rating }).map((_, i) => (
                      <Star key={i} className="size-3.5 fill-current" />
                    ))}
                  </span>
                </div>
                <Badge variant={r.status === "approved" ? "default" : "secondary"}>
                  {reviewStatusLabel[r.status]}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{r.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={r.status === "approved" || moderate.isPending}
                  onClick={() => moderate.mutate({ id: r.id, status: "approved" })}
                >
                  Freigeben
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={r.status === "rejected" || moderate.isPending}
                  onClick={() => moderate.mutate({ id: r.id, status: "rejected" })}
                >
                  Ablehnen
                </Button>
                <span className="text-xs text-muted-foreground">
                  eingereicht am {formatDate(r.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
