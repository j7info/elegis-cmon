import React, { useState } from 'react';
import { DEFINITION } from '../components/interactive/ExcelBasico/definition';
import { InfoModal } from '../components/interactive/ExcelBasico/InfoModal';

export function InteractiveLesson_ExcelBasico() {
  const [selectedCell, setSelectedCell] = useState<any>(null);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-6">{DEFINITION.title}</h1>
      <p className="text-gray-600 mb-4">
        Clique em qualquer célula para saber mais sobre o dado.
      </p>

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-green-700 text-white">
              <th className="border border-green-800 px-4 py-2 text-center w-10"></th>
              {DEFINITION.columns.map((col, i) => (
                <th key={i} className="border border-green-800 px-4 py-2 text-center font-medium">
                  {String.fromCharCode(65 + i)}
                </th>
              ))}
            </tr>
            <tr className="bg-gray-100 text-gray-700">
              <th className="border px-4 py-2 text-center w-10 text-xs font-bold text-gray-500">1</th>
              {DEFINITION.columns.map((col, i) => (
                <td key={i} className="border px-4 py-2 font-bold bg-gray-50 text-center">
                  {col}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEFINITION.rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-blue-50">
                <td className="border px-4 py-2 text-center text-xs font-bold text-gray-500 bg-gray-100">
                  {ri + 2}
                </td>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="border px-4 py-2 cursor-pointer transition-colors hover:bg-blue-100 text-gray-800"
                    onClick={() => setSelectedCell(cell)}
                  >
                    {cell.value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedCell && (
        <InfoModal
          cell={selectedCell}
          onClose={() => setSelectedCell(null)}
        />
      )}
    </div>
  );
}
