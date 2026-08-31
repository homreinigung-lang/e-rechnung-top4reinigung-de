import React, { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { analyzeLvText } from '@/lib/lv-form.functions';

interface LvItem {
  id?: string;
  item_number: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

export default function LvFormFiller() {
  const runAnalysis = useServerFn(analyzeLvText);
  const [items, setItems] = useState<LvItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectTitle, setProjectTitle] = useState('Neues LV-Projekt');
  
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<LvItem>({
    item_number: '',
    description: '',
    quantity: 0,
    unit: '',
    unit_price: 0
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      console.log('[LV-Analyse] Datei gelesen, Zeichen:', text.length);
      const rawResponse = await runAnalysis({ data: { pdfText: text } });
      console.log('[LV-Analyse] Roh-Antwort:', rawResponse);

      const parsedItems = Array.isArray(rawResponse) ? rawResponse : [];
      if (parsedItems.length === 0) {
        console.warn('[LV-Analyse] Keine Positionen in der Antwort gefunden.');
        alert('Die KI konnte in dieser Datei keine LV-Positionen erkennen. Bitte prüfen Sie, ob das Dokument eine Textebene enthält (kein reines Scan-Bild).');
        return;
      }
      setItems(parsedItems);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[LV-Analyse] Fehler:', message, err);
      alert(`Ein Fehler ist beim Analysieren der Datei aufgetreten: ${message}`);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleDeleteItem = (index: number) => {
    const updatedItems = items.filter((_, i) => i !== index);
    setItems(updatedItems);
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
          <input type="file" accept=".pdf,.txt" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>

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