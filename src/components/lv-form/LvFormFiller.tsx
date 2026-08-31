import React, { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { analyzeLvText, analyzeLvScan } from '@/lib/lv-form.functions';
import {
  cleanItems,
  extractDocument,
  fileToBase64,
  itemsFromRows,
  itemsFromText,
  type LvImportItem,
} from '@/lib/lv-form/import';

interface LvItem {
  id?: string;
  item_number: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

type AnalysisStep = { state: 'ok' | 'warn' | 'error'; label: string };

export default function LvFormFiller() {
  const runAnalysis = useServerFn(analyzeLvText);
  const runScanAnalysis = useServerFn(analyzeLvScan);
  const [items, setItems] = useState<LvItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectTitle, setProjectTitle] = useState('Neues LV-Projekt');
  const [steps, setSteps] = useState<AnalysisStep[]>([]);
  const [textPreview, setTextPreview] = useState('');
  const [textReason, setTextReason] = useState('');
  const [showText, setShowText] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);


  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<LvItem>({
    item_number: '',
    description: '',
    quantity: 0,
    unit: '',
    unit_price: 0
  });

  /** Liest die Datei, versucht mehrere Erkennungswege und meldet das Ergebnis transparent. */
  const analyzeFile = async (file: File) => {
    setLoading(true);
    setLastFile(file);
    setTextPreview('');
    setTextReason('Die Datei wird gerade gelesen …');
    const toastId = toast.loading('Die KI analysiert Ihr Leistungsverzeichnis…');

    const log: AnalysisStep[] = [];
    const diagnostic = (message: string, details?: unknown) => {
      if (details === undefined) console.info(`[LV-Import] ${message}`);
      else console.info(`[LV-Import] ${message}`, details);
    };
    try {
      diagnostic('Datei empfangen', {
        name: file.name,
        type: file.type || 'unbekannt',
        sizeBytes: file.size,
      });
      const doc = await extractDocument(file);
      log.push({
        state: 'ok',
        label: `Datei gelesen (${file.type || 'unbekannter Typ'}, ${file.size.toLocaleString('de-DE')} Bytes)`,
      });
      log.push({
        state: doc.text.length ? 'ok' : 'warn',
        label: `${doc.text.length.toLocaleString('de-DE')} Zeichen extrahiert${doc.pageCount ? ` (${doc.pageCount} PDF-Seiten)` : ''}`,
      });
      diagnostic('Dokument extrahiert', {
        kind: doc.kind,
        hasTextLayer: doc.hasTextLayer,
        pageCount: doc.pageCount ?? null,
        characters: doc.text.length,
        preview: doc.text.slice(0, 1000),
      });
      // Exakt der Text, der auch für die Analyse verwendet wurde – ungekürzt,
      // mit Zeilenumbrüchen und Seitenreihenfolge wie extrahiert.
      const extracted = typeof doc.text === 'string' ? doc.text : '';
      setTextPreview(extracted);
      setTextReason(
        extracted.length > 0
          ? ''
          : doc.kind === 'pdf'
            ? 'Die PDF-Datei enthält keine auslesbare Textebene (vermutlich ein Scan). Es wurde daher OCR verwendet – der Text liegt nicht als Vorschau vor.'
            : 'Die Datei enthält keinen auslesbaren Text.',
      );
      if (extracted.length > 0) setShowText(true);


      const methodCounts: Record<string, number> = {};
      // Alle Erkennungswege werden ausgewertet und anschließend zusammengeführt,
      // damit keine Position verloren geht.
      const candidates: LvImportItem[][] = [];

      // 1) Tabellen (CSV/Excel): Spalten direkt erkennen – ohne KI, ohne Raten.
      if (doc.rows.length > 0) {
        const rowsItems = cleanItems(itemsFromRows(doc.rows));
        candidates.push(rowsItems);
        methodCounts['tabellen'] = rowsItems.length;
        diagnostic('Methode: Tabellen-/Spaltenerkennung', { rows: doc.rows.length, positions: rowsItems.length });
        log.push({
          state: rowsItems.length ? 'ok' : 'warn',
          label: rowsItems.length
            ? `Tabellenspalten erkannt (${rowsItems.length} Positionen)`
            : 'Tabellenspalten nicht eindeutig (0 Positionen)',
        });
      }

      // 2) PDF/Text mit Textebene: KI-Analyse und regelbasierte Erkennung parallel bewerten.
      if (doc.hasTextLayer && doc.text.trim().length >= 20) {
        log.push({ state: 'ok', label: 'Methode: PDF-Textebene → KI-Analyse' });
        diagnostic('Sende extrahierten Text an KI', {
          characters: doc.text.length,
          preview: doc.text.slice(0, 1000),
        });
        try {
          const ai = await runAnalysis({ data: { pdfText: doc.text } });
          const aiItems = cleanItems(Array.isArray(ai) ? ai : []);
          candidates.push(aiItems);
          methodCounts['ki'] = aiItems.length;
          diagnostic('KI-Analyse abgeschlossen', { positions: aiItems.length });
          log.push({
            state: aiItems.length ? 'ok' : 'warn',
            label: `KI-Analyse: ${aiItems.length} Positionen`,
          });
        } catch (aiError) {
          const reason = aiError instanceof Error ? aiError.message : String(aiError);
          methodCounts['ki'] = 0;
          console.error('[LV-Import] KI-Analyse fehlgeschlagen', aiError);
          log.push({
            state: 'error',
            label: `KI-Analyse fehlgeschlagen. Grund: ${reason}`,
          });
        }

        const ruleItems = cleanItems(itemsFromText(doc.text));
        candidates.push(ruleItems);
        methodCounts['regelbasiert'] = ruleItems.length;
        diagnostic('Methode: regelbasierte Erkennung', { positions: ruleItems.length });
        log.push({
          state: ruleItems.length ? 'ok' : 'warn',
          label: `Regelbasierte Erkennung: ${ruleItems.length} Positionen`,
        });
      }

      let found = mergeCandidates(candidates);

      // 3) OCR nur, wenn bisher gar nichts erkannt wurde.
      if (found.length === 0 && doc.kind === 'pdf') {
        log.push({
          state: 'warn',
          label: doc.hasTextLayer
            ? 'Textebene ergab keine Positionen – OCR wird versucht'
            : 'Keine brauchbare Textebene – OCR wird versucht',
        });
        diagnostic('Methode: OCR', { reason: doc.hasTextLayer ? 'Textebene ohne Positionen' : 'keine Textebene' });
        try {
          const ocr = await runScanAnalysis({
            data: {
              fileName: file.name,
              mimeType: file.type || 'application/pdf',
              base64: await fileToBase64(file),
            },
          });
          found = cleanItems(Array.isArray(ocr) ? ocr : []);
          methodCounts['ocr'] = found.length;
          diagnostic('OCR abgeschlossen', { positions: found.length });
          log.push({
            state: found.length ? 'ok' : 'warn',
            label: `OCR: ${found.length} Positionen`,
          });
        } catch (ocrError) {
          const reason = ocrError instanceof Error ? ocrError.message : String(ocrError);
          methodCounts['ocr'] = 0;
          console.error('[LV-Import] OCR fehlgeschlagen', ocrError);
          log.push({
            state: 'error',
            label: `OCR fehlgeschlagen. Grund: ${reason}`,
          });
        }
      }


      if (found.length === 0) {
        const attempted = Object.entries(methodCounts)
          .map(([method, count]) => `${method}: ${count}`)
          .join(', ');
        const reason = doc.text.trim().length === 0
          ? 'Die Datei enthält keine extrahierbare Textebene und OCR lieferte keine Positionen.'
          : `Keine Methode lieferte eine Position (${attempted || 'keine Erkennungsmethode anwendbar'}).`;
        diagnostic('Finale Positionsliste ist leer', { reason, methodCounts });
        log.push({ state: 'warn', label: `Keine eindeutige LV-Struktur erkannt. Grund: ${reason}` });
        setSteps(log);
        toast.warning('LV-Struktur nicht eindeutig erkannt', {
          id: toastId,
          description:
            'Die Datei wurde gelesen, aber die LV-Struktur konnte nicht eindeutig erkannt werden. Sie können die Analyse erneut starten oder die Positionen manuell erfassen.',
          duration: 8000,
        });
        return;
      }

      log.push({ state: 'ok', label: `${found.length} Positionen erkannt` });
      diagnostic('Finale Positionsliste', { positions: found.length, methodCounts });
      setSteps(log);
      setItems(found);
      toast.success('Analyse abgeschlossen', {
        id: toastId,
        description: `${found.length} Positionen wurden erkannt und übernommen.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[LV-Import] Dokumentanalyse abgebrochen', err);
      setSteps([...log, { state: 'error', label: message }]);
      setTextReason((prev) =>
        prev === 'Die Datei wird gerade gelesen …' || !prev
          ? `Textvorschau nicht verfügbar. Grund: ${message}`
          : prev,
      );

      toast.error('Analyse fehlgeschlagen', {
        id: toastId,
        description: `Beim Analysieren der Datei ist ein Fehler aufgetreten: ${message}. Bitte versuchen Sie es erneut oder wenden Sie sich an den Support.`,
        duration: 8000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await analyzeFile(file);
  };


  const handleDeleteItem = (index: number) => {
    const updatedItems = items.filter((_, i) => i !== index);
    setItems(updatedItems);
    toast.success('Position gelöscht', {
      description: 'Die Position wurde aus dem Leistungsverzeichnis entfernt.',
    });
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    if (items[index]) {
      setEditForm(items[index]);
    }
  };

  const handleSaveEdit = (index: number) => {
    const updatedItems = [...items];
    updatedItems[index] = editForm;
    setItems(updatedItems);
    setEditingIndex(null);
    toast.success('Änderungen gespeichert', {
      description: `Position ${editForm.item_number || index + 1} wurde aktualisiert.`,
    });
  };

  const grandTotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center border-b border-gray-200 pb-4">
        <input 
          type="text" 
          value={projectTitle} 
          onChange={(e) => setProjectTitle(e.target.value)}
          className="text-2xl font-bold border-b border-gray-300 pb-1 focus:outline-none bg-transparent"
        />
        <label className="bg-blue-600 text-white px-4 py-2.5 rounded-lg cursor-pointer hover:bg-blue-700 transition font-medium shadow-sm">
          {loading ? 'KI analysiert...' : 'LV (PDF/TXT) hochladen & analysieren'}
          <input
            type="file"
            accept=".pdf,.txt,.csv,.xlsx,.xlsm"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {steps.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-800">Analyse-Ergebnis</h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowText((v) => !v)}
                className="text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                {showText ? 'Textvorschau ausblenden' : 'Textvorschau anzeigen'}
              </button>
              <button
                type="button"
                disabled={loading || !lastFile}
                onClick={() => lastFile && void analyzeFile(lastFile)}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400"
              >
                Erneut analysieren
              </button>
            </div>
          </div>
          <ul className="space-y-1 text-sm">
            {steps.map((step, i) => (
              <li
                key={i}
                className={
                  step.state === 'ok'
                    ? 'text-green-700'
                    : step.state === 'error'
                      ? 'text-red-700'
                      : 'text-amber-700'
                }
              >
                {step.state === 'ok' ? '✓' : step.state === 'error' ? '✗' : '⚠'} {step.label}
              </li>
            ))}
          </ul>
          {showText && (
            <div className="text-xs text-gray-600">
              <div className="mb-1 font-medium">
                Erkannter Text
                {textPreview
                  ? ` (${textPreview.length.toLocaleString('de-DE')} Zeichen)`
                  : ''}
              </div>
              {textPreview ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-gray-200 bg-white p-2 text-left font-mono text-[11px] leading-relaxed text-gray-800">
                  {textPreview}
                </pre>
              ) : (
                <p className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
                  {textReason || 'Es wurde noch keine Datei analysiert.'}
                </p>
              )}
            </div>
          )}

        </div>
      )}


      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Leistungsverzeichnis (LV) Positionen</h2>
          <span className="text-sm text-gray-500">Gesamt Positionen: {items.length}</span>
        </div>
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="border-b border-gray-200 text-gray-700 bg-gray-50/50 text-sm">
              <th className="p-3 w-24 text-right">OZ / Pos.</th>
              <th className="p-3 text-right">Beschreibung</th>
              <th className="p-3 w-24 text-center">Menge</th>
              <th className="p-3 w-20 text-center">Einheit</th>
              <th className="p-3 w-32 text-right">Einheitspreis</th>
              <th className="p-3 w-36 text-right">Gesamtpreis</th>
              <th className="p-3 w-28 text-center">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center p-8 text-gray-500">
                  Keine Positionen vorhanden. Bitte laden Sie ein Leistungsverzeichnis hoch, um zu beginnen.
                </td>
              </tr>
            ) : (
              items.map((item, idx) => {
                const isEditing = editingIndex === idx;
                return (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/50 text-sm">
                    {isEditing ? (
                      <>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={editForm.item_number}
                            onChange={(e) => setEditForm({...editForm, item_number: e.target.value})}
                            className="w-full border p-1 rounded text-right"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={editForm.description}
                            onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                            className="w-full border p-1 rounded text-right"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="number" 
                            value={editForm.quantity}
                            onChange={(e) => setEditForm({...editForm, quantity: Number(e.target.value)})}
                            className="w-full border p-1 rounded text-center"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={editForm.unit}
                            onChange={(e) => setEditForm({...editForm, unit: e.target.value})}
                            className="w-full border p-1 rounded text-center"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="number" 
                            value={editForm.unit_price}
                            onChange={(e) => setEditForm({...editForm, unit_price: Number(e.target.value)})}
                            className="w-full border p-1 rounded text-right"
                          />
                        </td>
                        <td className="p-2 text-right font-bold">
                          {(editForm.quantity * editForm.unit_price).toFixed(2)} €
                        </td>
                        <td className="p-2 text-center space-x-1">
                          <button 
                            onClick={() => handleSaveEdit(idx)}
                            className="bg-green-600 text-white px-2.5 py-1 rounded text-xs hover:bg-green-700 shadow-sm"
                          >
                            Speichern
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-3 font-medium text-gray-900">{item.item_number}</td>
                        <td className="p-3 text-gray-700">{item.description}</td>
                        <td className="p-3 text-center text-gray-600">{item.quantity}</td>
                        <td className="p-3 text-center text-gray-600">{item.unit}</td>
                        <td className="p-3 text-right text-gray-800">
                          {item.unit_price.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                        </td>
                        <td className="p-3 text-right font-bold text-gray-950">
                          {(item.quantity * item.unit_price).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                        </td>
                        <td className="p-3 text-center space-x-2">
                          <button 
                            onClick={() => handleStartEdit(idx)}
                            className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                          >
                            Bearbeiten
                          </button>
                          <button 
                            onClick={() => handleDeleteItem(idx)}
                            className="text-red-600 hover:text-red-800 font-medium text-xs"
                          >
                            Löschen
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td colSpan={5} className="p-4 text-xl font-bold text-gray-900 text-left">
                Gesamtsumme:
              </td>
              <td colSpan={2} className="p-4 text-2xl font-extrabold text-gray-950 text-right">
                {grandTotal.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}