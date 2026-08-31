import { useEffect, useState } from "react";
import { Star } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useMyReview, useSaveReview, reviewStatusLabel } from "@/lib/reviews";

/** Sterne-Auswahl 1–5. */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} von 5 Sternen`}
          onClick={() => onChange(n)}
          className="text-amber-500 transition-transform hover:scale-110"
        >
          <Star
            className={`size-6 ${n <= value ? "fill-current" : "fill-transparent opacity-40"}`}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * Bewertungsformular als Dialog. Wird über den schwebenden Button im
 * Kundenbereich geöffnet und nutzt dieselbe Logik wie die frühere
 * Bewertungs-Karte auf „Mein Paket“.
 */
export function BewertungDialog({
  open,
  onOpenChange,
  defaultCompanyName = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCompanyName?: string;
}) {
  const { data: review, isLoading } = useMyReview();
  const save = useSaveReview();
  const [rating, setRating] = useState(5);
  const [company, setCompany] = useState(defaultCompanyName);
  const [body, setBody] = useState("");

  useEffect(() => {
    if (review) {
      setRating(review.rating);
      setCompany(review.company_name);
      setBody(review.body);
    } else if (defaultCompanyName) {
      setCompany((c) => c || defaultCompanyName);
    }
  }, [review, defaultCompanyName]);

  const locked = review?.status === "approved";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle>Ihre Bewertung</DialogTitle>
            {review ? <Badge variant="secondary">{reviewStatusLabel[review.status]}</Badge> : null}
          </div>
          <DialogDescription>
            Teilen Sie Ihre Erfahrung als verifizierter Firmenkunde. Nach Freigabe erscheint Ihre
            Bewertung auf der öffentlichen Startseite.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Sterne</Label>
              {locked ? (
                <div className="flex items-center gap-1 text-amber-500">
                  {Array.from({ length: rating }).map((_, i) => (
                    <Star key={i} className="size-5 fill-current" />
                  ))}
                </div>
              ) : (
                <StarPicker value={rating} onChange={setRating} />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="review-company">Firmenname</Label>
              <Input
                id="review-company"
                value={company}
                readOnly={locked}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Muster Reinigung GmbH"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="review-body">Bewertungstext</Label>
              <Textarea
                id="review-body"
                rows={4}
                value={body}
                readOnly={locked}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Was hat Ihnen im Alltag am meisten geholfen?"
              />
            </div>

            {locked ? (
              <p className="text-xs text-muted-foreground">
                Ihre Bewertung ist freigegeben und öffentlich sichtbar. Für Änderungen wenden Sie
                sich bitte an den Support.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
          {!locked ? (
            <Button
              disabled={save.isPending}
              onClick={() =>
                save.mutate(
                  { id: review?.id, company_name: company, rating, body },
                  {
                    onSuccess: () => onOpenChange(false),
                  },
                )
              }
            >
              {save.isPending
                ? "Wird gespeichert …"
                : review
                  ? "Bewertung aktualisieren"
                  : "Bewertung absenden"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
