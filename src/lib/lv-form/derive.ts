import type { LvDerived, LvInputs } from "./types";

/**
 * Abgeleitete Rechenwerte des LV-Formulars.
 * Rechnung durchgängig in Integer-Cent, Rundung erst am Ende.
 */
export function deriveLvValues(inputs: LvInputs): LvDerived {
  const unterhalt_wertung = Math.round(inputs.unterhalt_pauschale_monat * 12);
  const grund_wertung = Math.round(inputs.grund_pauschale_jahr * 1);
  const sonder_wertung = Math.round(inputs.sonder_stundensatz * inputs.sonder_kontingent);
  const jahr_netto = unterhalt_wertung + grund_wertung + sonder_wertung;
  const mwst_betrag = Math.round((jahr_netto * inputs.mwst_satz) / 100);
  const jahr_brutto = jahr_netto + mwst_betrag;
  return { unterhalt_wertung, grund_wertung, sonder_wertung, jahr_netto, mwst_betrag, jahr_brutto };
}

export const EMPTY_LV_INPUTS: LvInputs = {
  unterhalt_pauschale_monat: 0,
  unterhalt_stunden_monat: 0,
  grund_pauschale_jahr: 0,
  grund_stunden_jahr: 0,
  sonder_stundensatz: 0,
  sonder_kontingent: 0,
  mwst_satz: 19,
};
