import { useState, useRef, ChangeEvent } from "react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

export interface CompanySettings {
  companyName: string;
  hourlyLaborRate: number;
  overheadPercentage: number;
  profitPercentage: number;
}

export interface LVPosition {
  id: string;
  posNo: string;
  description: string;
  qty: number;
  unit: string;
  estimatedHours: number;
  materialCost: number;
  suggestedUnitPrice: number;
  manualUnitPrice?: number;
  sourceDoc: string;
  sourcePage: number;
  longText: string;
}

export function LvFormFiller() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>("Noch keine Datei hochgeladen");
  const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null);
  const [activePreviewPage] = useState<number>(1);
  const objectUrlRef = useRef<string | null>(null);

  const [settings, setSettings] = useState<CompanySettings>({
    companyName: "Hom Reinigung Service",
    hourlyLaborRate: 45,
    overheadPercentage: 15,
    profitPercentage: 10,
  });

  const [positions, setPositions] = useState<LVPosition[]>([]);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const fileBlobUrl = URL.createObjectURL(file);
    objectUrlRef.current = fileBlobUrl;
    setPdfFileUrl(fileBlobUrl);
    setUploadedFileName(file.name);
    setIsAnalyzing(true);
    toast.info(`Datei "${file.name}" wurde geladen.`);

    setTimeout(() => {
      setIsAnalyzing(false);
      const samplePosition: LVPosition = {
        id: `pos-${Date.now()}`,
        posNo: "01.01.0010",
        description: "Unterhaltsreinigung - Sporthalle",
        longText: "Unterhaltsreinigung - Sporthalle",
        qty: 220.5,
        unit: "Stunden",
        estimatedHours: 220.5,
        materialCost: 0,
        suggestedUnitPrice: 0,
        manualUnitPrice: 0,
        sourceDoc: file.name,
        sourcePage: 1,
      };
      setPositions([samplePosition]);
      toast.success("Positionen bereit zur Bearbeitung.");
    }, 600);
  };

  const handleRemoveFile = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPdfFileUrl(null);
    setUploadedFileName("Noch keine Datei hochgeladen");
    setPositions([]);
    toast.info("Datei und Positionen wurden zurückgesetzt.");
  };

  const calculatePrice = (p: LVPosition) => {
    const laborCost = p.estimatedHours * settings.hourlyLaborRate;
    const directCost = laborCost + p.materialCost;
    const withOverhead = directCost * (1 + settings.overheadPercentage / 100);
    const finalPrice = withOverhead * (1 + settings.profitPercentage / 100);
    return Number((finalPrice / (p.qty || 1)).toFixed(2));
  };

  const handleAutoCalculate = () => {
    setPositions((prev) =>
      prev.map((p) => {
        const calculated = calculatePrice(p);
        return { ...p, suggestedUnitPrice: calculated, manualUnitPrice: calculated };
      })
    );
    toast.success("Preise wurden automatisch berechnet!");
  };

  const clampNonNegative = (val: number) => (Number.isFinite(val) && val >= 0 ? val : 0);

  const handlePriceChange = (id: string, val: number) => {
    setPositions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, manualUnitPrice: clampNonNegative(val) } : p))
    );
  };

  const handleHoursChange = (id: string, val: number) => {
    setPositions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, estimatedHours: clampNonNegative(val) } : p))
    );
  };

  const handleMaterialChange = (id: string, val: number) => {
    setPositions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, materialCost: clampNonNegative(val) } : p))
    );
  };

  const handleSettingChange = (key: keyof CompanySettings, val: string | number) => {
    setSettings((prev) => ({
      ...prev,
      [key]: typeof val === "number" ? clampNonNegative(val) : val,
    }));
  };

  const handleDeletePosition = (id: string) => {
    const target = positions.find((p) => p.id === id);
    setPositions((prev) => prev.filter((p) => p.id !== id));
    if (target) {
      toast.success(`Position "${target.posNo}" wurde entfernt.`, {
        action: {
          label: "Rückgängig",
          onClick: () => setPositions((prev) => [...prev, target]),
        },
      });
    }
  };

  const handleAddPosition = () => {
    const nextIndex = positions.length + 1;
    const newPosition: LVPosition = {
      id: `manual-${Date.now()}`,
      posNo: `01.01.${String(nextIndex * 10).padStart(4, "0")}`,
      description: "Neue Position",
      longText: "Neue Position",
      qty: 1,
      unit: "psch",
      estimatedHours: 0,
      materialCost: 0,
      suggestedUnitPrice: 0,
      manualUnitPrice: 0,
      sourceDoc: uploadedFileName,
      sourcePage: activePreviewPage,
    };
    setPositions((prev) => [...prev, newPosition]);
    toast.info("Neue Position hinzugefügt.");
  };

  const handleFieldChange = (id: string, field: "description" | "posNo" | "unit", value: string) => {
    setPositions((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const handleQtyChange = (id: string, val: number) => {
    setPositions((prev) => prev.map((p) => (p.id === id ? { ...p, qty: clampNonNegative(val) || 1 } : p)));
  };

  const totalPriceSum = positions.reduce((sum, p) => {
    const price = p.manualUnitPrice ?? p.suggestedUnitPrice ?? 0;
    return sum + price * p.qty;
  }, 0);

  const isReady = positions.length > 0;

  const handleExportDocument = () => {
    try {
      const doc = new jsPDF();
      const currentDate = new Date().toLocaleDateString("de-DE");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(settings.companyName, 20, 20);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Datum: ${currentDate}`, 150, 20);

      doc.setLineWidth(0.5);
      doc.line(20, 25, 190, 25);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Leistungsverzeichnis - Angebot", 20, 35);

      let yPos = 45;

      positions.forEach((p) => {
        const unitPrice = p.manualUnitPrice ?? p.suggestedUnitPrice ?? 0;
        const totalItemPrice = unitPrice * p.qty;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`${p.posNo} - ${p.description}`, 20, yPos);
        yPos += 7;

        doc.setFont("helvetica", "normal");
        doc.text(`Menge: ${p.qty} ${p.unit}`, 25, yPos);
        doc.text(`Einzelpreis: ${unitPrice.toFixed(2)} EUR`, 100, yPos);
        yPos += 7;
        doc.text(`Gesamtpreis: ${totalItemPrice.toFixed(2)} EUR`, 25, yPos);
        yPos += 12;
      });

      doc.setLineWidth(0.2);
      doc.line(20, yPos, 190, yPos);
      yPos += 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Gesamtsumme (netto): ${totalPriceSum.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR`, 20, yPos);

      doc.save("Angebot_Hom_Reinigung_Service.pdf");
      toast.success("Angebot erfolgreich als PDF exportiert!");
    } catch (err) {
      console.error(err);
      toast.error("Fehler beim Generieren des PDFs.");
    }
  };

  return (
    <div className="p-6 bg-slate-100 min-h-screen space-y-6 text-left" dir="ltr">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800">LV-Formular ausfüllen & Kalkulation</h2>
          <p className="text-sm text-slate-500">Document Engine • PDF-Erkennung & Angebots-Export</p>
        </div>
        <button
          onClick={handleAutoCalculate}
          disabled={positions.length === 0}
          className={`px-4 py-2 font-medium rounded-lg shadow-sm transition text-sm flex items-center gap-2 ${
            positions.length === 0
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
          }`}
        >
          ⚡ Preise automatisch berechnen
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 text-center relative">
            <button
              onClick={handleRemoveFile}
              type="button"
              className="absolute top-3 right-3 bg-red-100 hover:bg-red-200 text-red-700 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 z-10"
              title="Datei komplett entfernen"
            >
              🗑️ Datei entfernen
            </button>

            <input
              type="file"
              accept="application/pdf"
              id="lv-file-upload"
              className="hidden"
              onChange={handleFileUpload}
            />
            <label htmlFor="lv-file-upload" className="cursor-pointer block space-y-1">
              <div className="text-2xl">📥</div>
              <div className="font-semibold text-slate-700 text-sm">
                Datei: <span className="text-blue-600 font-bold">{uploadedFileName}</span>
              </div>
              <p className="text-xs text-slate-500">Klicken Sie hier, um eine PDF-Ausschreibung hochzuladen</p>
            </label>
            {isAnalyzing && (
              <div className="mt-2 text-xs text-blue-600 font-medium animate-pulse">
                ⏳ PDF wird geladen…
              </div>
            )}
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Unternehmensname (Firmenstempel):</label>
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) => handleSettingChange("companyName", e.target.value)}
                className="w-full p-1.5 border border-slate-300 rounded bg-white text-xs font-semibold text-slate-800"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Stundensatz (€/h):</label>
                <input
                  type="number"
                  min={0}
                  value={settings.hourlyLaborRate}
                  onChange={(e) => handleSettingChange("hourlyLaborRate", Number(e.target.value))}
                  className="w-full p-1.5 border border-slate-300 rounded bg-white text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Gemeinkosten (%):</label>
                <input
                  type="number"
                  min={0}
                  value={settings.overheadPercentage}
                  onChange={(e) => handleSettingChange("overheadPercentage", Number(e.target.value))}
                  className="w-full p-1.5 border border-slate-300 rounded bg-white text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Gewinn / Wagnis (%):</label>
                <input
                  type="number"
                  min={0}
                  value={settings.profitPercentage}
                  onChange={(e) => handleSettingChange("profitPercentage", Number(e.target.value))}
                  className="w-full p-1.5 border border-slate-300 rounded bg-white text-xs font-semibold"
                />
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 text-white space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">STATUS & SUMME</span>
            <div className="flex flex-wrap gap-3 text-xs font-medium items-center justify-between">
              <span className="text-emerald-400">🟢 {positions.length} Positionen gelistet</span>
              <span className="text-blue-300 font-bold text-sm">
                Gesamt: {totalPriceSum.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[11px] text-slate-500">Positionen bearbeiten oder hinzufügen:</span>
            <button
              onClick={handleAddPosition}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1"
            >
              ➕ Position hinzufügen
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Pos.</th>
                  <th className="p-2.5">Beschreibung</th>
                  <th className="p-2.5">Menge</th>
                  <th className="p-2.5">Einheit</th>
                  <th className="p-2.5">Std.</th>
                  <th className="p-2.5">Material (€)</th>
                  <th className="p-2.5">Quelle</th>
                  <th className="p-2.5">EP (€)</th>
                  <th className="p-2.5 text-right">Gesamt (€)</th>
                  <th className="p-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {positions.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-slate-400">
                      Noch keine Positionen — laden Sie ein LV-PDF hoch oder fügen Sie eine Position hinzu.
                    </td>
                  </tr>
                )}
                {positions.map((p) => {
                  const finalPrice = p.manualUnitPrice ?? p.suggestedUnitPrice ?? 0;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={p.posNo}
                          onChange={(e) => handleFieldChange(p.id, "posNo", e.target.value)}
                          className="w-24 p-1 border border-slate-300 rounded font-mono text-slate-600 bg-white"
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={p.description}
                          onChange={(e) => handleFieldChange(p.id, "description", e.target.value)}
                          className="w-full min-w-[160px] p-1 border border-slate-300 rounded font-medium text-slate-800 bg-white"
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number"
                          min={0}
                          value={p.qty}
                          onChange={(e) => handleQtyChange(p.id, Number(e.target.value))}
                          className="w-16 p-1 border border-slate-300 rounded text-slate-600 bg-white"
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={p.unit}
                          onChange={(e) => handleFieldChange(p.id, "unit", e.target.value)}
                          className="w-16 p-1 border border-slate-300 rounded text-slate-600 bg-white"
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number"
                          min={0}
                          value={p.estimatedHours}
                          onChange={(e) => handleHoursChange(p.id, Number(e.target.value))}
                          className="w-14 p-1 border border-slate-300 rounded bg-white"
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number"
                          min={0}
                          value={p.materialCost}
                          onChange={(e) => handleMaterialChange(p.id, Number(e.target.value))}
                          className="w-16 p-1 border border-slate-300 rounded bg-white"
                        />
                      </td>
                      <td className="p-2.5">
                        <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-200 text-[11px] font-medium">
                          📄 S. {p.sourcePage}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={finalPrice}
                          onChange={(e) => handlePriceChange(p.id, Number(e.target.value))}
                          className="w-20 p-1 border border-slate-300 rounded font-semibold text-slate-800 bg-white"
                        />
                      </td>
                      <td className="p-2.5 font-bold text-slate-900 text-right font-mono">
                        {(finalPrice * p.qty).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => handleDeletePosition(p.id)}
                          title="Löschen"
                          className="text-red-500 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded p-1 transition cursor-pointer"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pt-2 flex justify-between items-center border-t border-slate-100">
            <p className="text-[11px] text-slate-500">
              Unternehmen: <span className="font-bold text-slate-700">{settings.companyName}</span>
            </p>
            <button
              disabled={!isReady}
              onClick={handleExportDocument}
              className={`px-5 py-2 rounded-lg font-bold text-white shadow-sm transition text-xs ${
                isReady ? "bg-emerald-600 hover:bg-emerald-700 cursor-pointer" : "bg-slate-300 cursor-not-allowed"
              }`}
            >
              📥 Angebot exportieren / drucken
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 bg-slate-900 rounded-xl shadow-lg border border-slate-800 flex flex-col h-[780px] overflow-hidden">
          <div className="bg-slate-800 px-4 py-2.5 border-b border-slate-700 flex justify-between items-center text-slate-300">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-red-400 font-bold text-xs bg-red-950/80 border border-red-800 px-1.5 py-0.5 rounded">PDF</span>
              <span className="text-xs font-semibold text-slate-200 truncate max-w-[160px]">{uploadedFileName}</span>
            </div>
          </div>

          <div className="flex-1 bg-slate-950 relative overflow-hidden">
            {pdfFileUrl ? (
              <iframe
                src={pdfFileUrl}
                className="w-full h-full border-0 bg-white"
                title="Original PDF Document"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm p-6 text-center">
                Nach dem Upload wird hier die Original-Ausschreibung angezeigt.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}