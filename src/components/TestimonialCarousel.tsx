import { BadgeCheck, Star } from "lucide-react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useApprovedReviews } from "@/lib/reviews";

/** Öffentlicher Carousel mit echten, freigegebenen Kundenbewertungen. */
export function TestimonialCarousel() {
  const { data: reviews = [], isLoading } = useApprovedReviews();

  if (isLoading || reviews.length === 0) return null;

  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;

  return (
    <section className="border-y bg-secondary/40 py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold md:text-3xl">Das sagen unsere Kunden</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Echte Bewertungen verifizierter Firmenkunden – geprüft und freigegeben.
            </p>
          </div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-500">
            <Star className="size-4 fill-current" />
            {avg.toFixed(1)}
            <span className="font-normal text-muted-foreground">
              · {reviews.length} {reviews.length === 1 ? "Bewertung" : "Bewertungen"}
            </span>
          </p>
        </div>

        <Carousel opts={{ align: "start", loop: reviews.length > 2 }} className="mt-8">
          <CarouselContent>
            {reviews.map((r) => (
              <CarouselItem key={r.id} className="sm:basis-1/2 lg:basis-1/3">
                <figure className="surface flex h-full flex-col p-6">
                  <div className="flex items-center gap-0.5 text-amber-500">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`size-4 ${i < r.rating ? "fill-current" : "fill-transparent opacity-40"}`}
                      />
                    ))}
                  </div>
                  <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground/90">
                    „{r.body}“
                  </blockquote>
                  <figcaption className="mt-5">
                    <p className="text-sm font-semibold">{r.company_name || "Firmenkunde"}</p>
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                      <BadgeCheck className="size-3.5" />
                      Verified Business User
                    </p>
                  </figcaption>
                </figure>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden sm:flex" />
          <CarouselNext className="hidden sm:flex" />
        </Carousel>
      </div>
    </section>
  );
}
