export function SectionIntro({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
