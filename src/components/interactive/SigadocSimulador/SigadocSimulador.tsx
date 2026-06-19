import React, { useState } from 'react';
import { sigadocData } from './definition';

export default function SigadocSimulador() {
  const [currentStep, setCurrentStep] = useState(0);
  const [activeHotspot, setActiveHotspot] = useState<number | null>(null);

  const stepData = sigadocData[currentStep];

  const nextStep = () => {
    if (currentStep < sigadocData.length - 1) {
      setCurrentStep(prev => prev + 1);
      setActiveHotspot(null);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      setActiveHotspot(null);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-slate-50 text-slate-800 font-sans">
      {/* Esquerda: Imagem */}
      <div className="flex-1 p-6 flex flex-col items-center justify-center bg-slate-100 border-r border-slate-200">
        <div className="bg-white p-2 rounded-xl shadow-lg ring-1 ring-slate-900/5 max-h-[90vh] flex items-center justify-center">
          <img 
            src={stepData.image} 
            alt={stepData.title}
            className="max-h-[85vh] w-auto object-contain rounded"
          />
        </div>
      </div>

      {/* Direita: Conteúdo */}
      <div className="w-full md:w-[450px] lg:w-[500px] flex flex-col h-full bg-white shadow-xl overflow-hidden relative">
        {/* Cabeçalho do Passo */}
        <div className="p-8 border-b border-slate-100 bg-white z-10 shadow-sm">
          <div className="text-sm font-semibold tracking-wider text-blue-600 mb-2">
            PASSO {currentStep + 1} DE {sigadocData.length}
          </div>
          <h2 className="text-2xl font-bold text-slate-900 leading-tight">
            {stepData.title}
          </h2>
          <p className="mt-4 text-slate-600 leading-relaxed text-sm">
            {stepData.explanation}
          </p>
        </div>

        {/* Lista de Pontos Clicáveis (Hotspots) */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Pontos de Interação
          </h3>
          <div className="space-y-3">
            {stepData.hotspots.map((hotspot, idx) => {
              const isActive = activeHotspot === idx;
              return (
                <div 
                  key={idx}
                  className={`border rounded-lg transition-all duration-200 overflow-hidden ${
                    isActive 
                      ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-500' 
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <button 
                    onClick={() => setActiveHotspot(isActive ? null : idx)}
                    className="w-full text-left px-5 py-4 flex items-center justify-between focus:outline-none"
                  >
                    <span className={`font-medium ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>
                      {hotspot.title}
                    </span>
                    <span className={`text-xl transition-transform duration-200 ${isActive ? 'rotate-180 text-blue-500' : 'text-slate-400'}`}>
                      ▾
                    </span>
                  </button>
                  
                  {isActive && (
                    <div className="px-5 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-50 pt-3 bg-blue-50/30">
                      {hotspot.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Rodapé: Navegação */}
        <div className="p-6 border-t border-slate-200 bg-white flex justify-between items-center z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <button 
            onClick={prevStep}
            disabled={currentStep === 0}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-lg hover:bg-slate-100"
          >
            ← Anterior
          </button>
          
          {currentStep < sigadocData.length - 1 ? (
            <button 
              onClick={nextStep}
              className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-md transition-colors"
            >
              Próximo →
            </button>
          ) : (
            <button 
              className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-md transition-colors"
              onClick={() => {
                alert("Simulação concluída com sucesso!");
                window.parent.postMessage({ type: 'LESSON_PROGRESS', data: { score: 100, module: 'sigadoc-001' } }, '*');
              }}
            >
              Finalizar Simulação
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
