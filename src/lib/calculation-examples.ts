/** Product examples contain no customer's identity and never set a selling price. */
export const CALCULATION_EXAMPLES = [
  { label: "Halle monatlich", prompt: "Hallenreinigung, insgesamt 210 m², einmal im Monat" },
  { label: "Büro mit Nebenräumen", prompt: "Büroreinigung 150 m² plus Teeküche 20 m² und WC 12 m², einmal pro Woche" },
  { label: "Treppenhaus 14-tägig", prompt: "Treppenhausreinigung, 4 Etagen, alle 14 Tage" },
  { label: "Fenster einmalig", prompt: "Fensterreinigung, 80 m² Glasfläche, einmalig" },
  { label: "Wohnung nach Zeit", prompt: "Wohnungsreinigung, 90 Minuten je Einsatz, einmalig" },
  { label: "Grundreinigung", prompt: "Grundreinigung, 110 m², einmalig" },
] as const;
