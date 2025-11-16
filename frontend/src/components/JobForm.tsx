import React, { useState, useEffect } from 'react';
import { Play, Download, Monitor, Eye, EyeOff, Sparkles, ArrowRight } from 'lucide-react';
import { WebSocketManager } from '../services/WebSocketManager';
const API_BASE_URL = '';

interface JobFormProps {
  wsManager: WebSocketManager;
  onJobCreated: (data: { jobId: string; streaming: boolean; format: string }) => void;
}

const HISTORY_STORAGE_KEY = 'browserpilot_job_history';

type StorageOptionValue = 'downloads' | 'drive' | 'notion' | 'custom';

const STORAGE_OPTIONS: { value: StorageOptionValue; label: string; description: string }[] = [
  {
    value: 'downloads',
    label: 'Descargar al finalizar',
    description: 'Guarda el archivo en tu equipo desde el navegador'
  },
  {
    value: 'drive',
    label: 'Carpeta en Google Drive',
    description: 'Envía el resultado a /BrowserPilot dentro de tu Drive'
  },
  {
    value: 'notion',
    label: 'Página o base de datos en Notion',
    description: 'Actualiza tu documentación central automáticamente'
  },
  {
    value: 'custom',
    label: 'Otro destino',
    description: 'Especifica manualmente dónde quieres guardar'
  }
];

interface JobHistoryEntry {
  prompt: string;
  format: string;
  headless: boolean;
  streaming: boolean;
  storageSelection: StorageOptionValue;
  storageLabel: string;
  timestamp: number;
}

const COMMAND_PRESETS = [
  {
    title: 'Abrir sitio y resumir',
    description: 'Carga una página y resume su contenido',
    command: 'Visita https://elpais.com, lee la portada y dame un resumen en español en formato Markdown.'
  },
  {
    title: 'Búsqueda comparativa',
    description: 'Compara dos productos y genera tabla',
    command:
      'Busca "mejores laptops 2024" en Google, abre los dos primeros artículos y genera una tabla comparativa en CSV con modelo, precio y puntos clave.'
  },
  {
    title: 'Captura de precios',
    description: 'Extrae precios en e-commerce',
    command:
      'Abre amazon.com y busca "monitores 4k". Extrae los cinco primeros resultados con precio y calificaciones como JSON.'
  },
  {
    title: 'Descarga a PDF',
    description: 'Guarda sección específica',
    command: 'Visita https://firecrawl.dev/docs, navega a la sección Pricing y exporta esa sección como PDF.'
  }
];

export const JobForm: React.FC<JobFormProps> = ({ wsManager, onJobCreated }) => {
  const [prompt, setPrompt] = useState('Navigate to Hacker News and extract the top 10 stories as JSON with titles, URLs, and scores');
  const [format, setFormat] = useState('json');
  const [headless, setHeadless] = useState(false);
  const [streaming, setStreaming] = useState(true);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [history, setHistory] = useState<JobHistoryEntry[]>([]);
  const [storageSelection, setStorageSelection] = useState<StorageOptionValue>('downloads');
  const [customStorageLocation, setCustomStorageLocation] = useState('');

  useEffect(() => {
    const detected = detectFormatFromPrompt(prompt);
    setDetectedFormat(detected);
  }, [prompt]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        const storedEntries = JSON.parse(stored) as JobHistoryEntry[];
        setHistory(
          storedEntries.map((entry) => {
            const normalizedSelection = (entry.storageSelection as StorageOptionValue | undefined) ?? 'downloads';
            const optionLabel =
              entry.storageLabel ||
              STORAGE_OPTIONS.find((option) => option.value === normalizedSelection)?.label ||
              'Descargar al finalizar';

            return {
              ...entry,
              storageSelection: normalizedSelection,
              storageLabel: optionLabel
            } as JobHistoryEntry;
          })
        );
      }
    } catch (error) {
      console.error('Unable to read history', error);
    }
  }, []);

  useEffect(() => {
    try {
      if (history.length === 0) {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
        return;
      }
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 10)));
    } catch (error) {
      console.error('Unable to persist history', error);
    }
  }, [history]);

  const detectFormatFromPrompt = (text: string): string | null => {
    const lower = text.toLowerCase();
    const patterns = {
      pdf: [/\bpdf\b/, /pdf format/, /save.*pdf/, /as pdf/, /to pdf/],
      csv: [/\bcsv\b/, /csv format/, /save.*csv/, /as csv/, /to csv/],
      json: [/\bjson\b/, /json format/, /save.*json/, /as json/, /to json/],
      html: [/\bhtml\b/, /html format/, /save.*html/, /as html/, /to html/],
      md: [/\bmarkdown\b/, /md format/, /save.*markdown/, /as markdown/, /to md/],
      txt: [/\btext\b/, /txt format/, /save.*text/, /as text/, /to txt/, /plain text/]
    };

    for (const [fmt, regexes] of Object.entries(patterns)) {
      if (regexes.some(regex => regex.test(lower))) {
        return fmt;
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const finalFormat = detectedFormat || format;
    const selectedOption = STORAGE_OPTIONS.find(option => option.value === storageSelection);
    const finalStorageLabel =
      storageSelection === 'custom'
        ? (customStorageLocation.trim() || 'Ubicación personalizada')
        : (selectedOption?.label || 'Descargar al finalizar');

    try {
      const response = await fetch(`${API_BASE_URL}/job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          format: finalFormat,
          headless,
          enable_streaming: streaming,
          storage_location: finalStorageLabel
        })
      });

      const data = await response.json();
      setCurrentJobId(data.job_id);
      onJobCreated({
        jobId: data.job_id,
        streaming,
        format: finalFormat
      });
      setHistory(prev => [
        {
          prompt,
          format: finalFormat,
          headless,
          streaming,
          storageSelection,
          storageLabel: finalStorageLabel,
          timestamp: Date.now()
        },
        ...prev
      ].slice(0, 10));
    } catch (error) {
      console.error('Error creating job:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!currentJobId) return;

    try {
      const response = await fetch(`${API_BASE_URL}/download/${currentJobId}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `browserpilot_result_${currentJobId}.${format}`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  return (
    <div 
      className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm border border-stone-200/60 overflow-hidden transition-all duration-500 hover:shadow-md hover:bg-white/80"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="p-8">
        <div className="flex items-center space-x-4 mb-8">
          <div className={`w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-md transition-all duration-300 ${isHovered ? 'scale-110 rotate-3' : ''}`}>
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-medium text-stone-800 mb-1">Create Automation Task</h2>
            <p className="text-stone-600 font-light">Describe what you want to accomplish, and BrowserPilot will handle the rest</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Task Description */}
          <div className="space-y-3">
            <label htmlFor="prompt" className="block text-sm font-medium text-stone-700">
              Task Description
              <span className="text-stone-500 font-light ml-2">(natural language works best)</span>
            </label>
            <div className="relative">
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="w-full px-4 py-4 border border-stone-300/60 dark:border-stone-600/60 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all duration-200 resize-none text-stone-800 dark:text-stone-200 placeholder-stone-400 dark:placeholder-stone-500 bg-white/50 dark:bg-stone-800/50 backdrop-blur-sm"
                placeholder="Examples:&#10;• Navigate to Amazon and find wireless headphones under $100&#10;• Go to LinkedIn and extract AI engineer profiles in San Francisco&#10;• Visit news.ycombinator.com and save top stories as JSON"
              />
              <div className="absolute bottom-3 right-3">
                <ArrowRight className="w-5 h-5 text-stone-400" />
              </div>
            </div>
            
            {/* Example Prompts */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-3">
                Quick Examples
                <span className="text-stone-500 dark:text-stone-400 font-light ml-2">(click to use)</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPrompt("Go to https://news.ycombinator.com and save top stories as JSON")}
                  className="text-left p-3 bg-stone-50/80 dark:bg-stone-800/50 hover:bg-stone-100/80 dark:hover:bg-stone-700/50 border border-stone-200/60 dark:border-stone-600/60 rounded-lg transition-all duration-200 group backdrop-blur-sm"
                >
                  <div className="text-sm font-medium text-stone-700 dark:text-stone-300 group-hover:text-stone-900 dark:group-hover:text-stone-100">
                    Hacker News Stories
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                    Extract top stories as JSON
                  </div>
                </button>
                
                <button
                  type="button"
                  onClick={() => setPrompt("Visit firecrawl.dev pricing page and save to PDF format")}
                  className="text-left p-3 bg-stone-50/80 dark:bg-stone-800/50 hover:bg-stone-100/80 dark:hover:bg-stone-700/50 border border-stone-200/60 dark:border-stone-600/60 rounded-lg transition-all duration-200 group backdrop-blur-sm"
                >
                  <div className="text-sm font-medium text-stone-700 dark:text-stone-300 group-hover:text-stone-900 dark:group-hover:text-stone-100">
                    Save Page as PDF
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                    Convert webpage to PDF
                  </div>
                </button>
                
                <button
                  type="button"
                  onClick={() => setPrompt("Search 'AI tools' and export results as CSV")}
                  className="text-left p-3 bg-stone-50/80 dark:bg-stone-800/50 hover:bg-stone-100/80 dark:hover:bg-stone-700/50 border border-stone-200/60 dark:border-stone-600/60 rounded-lg transition-all duration-200 group backdrop-blur-sm"
                >
                  <div className="text-sm font-medium text-stone-700 dark:text-stone-300 group-hover:text-stone-900 dark:group-hover:text-stone-100">
                    Search & Export CSV
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                    Search results to spreadsheet
                  </div>
                </button>
                
                <button
                  type="button"
                  onClick={() => setPrompt("Find AI engineers in San Francisco on LinkedIn and save their profiles")}
                  className="text-left p-3 bg-stone-50/80 dark:bg-stone-800/50 hover:bg-stone-100/80 dark:hover:bg-stone-700/50 border border-stone-200/60 dark:border-stone-600/60 rounded-lg transition-all duration-200 group backdrop-blur-sm"
                >
                  <div className="text-sm font-medium text-stone-700 dark:text-stone-300 group-hover:text-stone-900 dark:group-hover:text-stone-100">
                    LinkedIn Profiles
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                    Extract professional profiles
                  </div>
                </button>
              </div>
            </div>

            {/* Predefined Commands */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-3">
                Comandos predefinidos
                <span className="text-stone-500 dark:text-stone-400 font-light ml-2">(pensados para flujos comunes)</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {COMMAND_PRESETS.map((preset) => (
                  <button
                    key={preset.title}
                    type="button"
                    onClick={() => setPrompt(preset.command)}
                    className="text-left p-3 bg-orange-50/70 dark:bg-stone-800/40 hover:bg-orange-100/80 dark:hover:bg-stone-700/50 border border-orange-200/70 dark:border-stone-600/60 rounded-lg transition-all duration-200 group backdrop-blur-sm"
                  >
                    <div className="text-sm font-medium text-stone-800 dark:text-stone-200 group-hover:text-stone-900 dark:group-hover:text-white">
                      {preset.title}
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                      {preset.description}
                    </div>
                    <div className="text-xs text-stone-400 dark:text-stone-500 mt-2 font-mono">
                      {preset.command}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Format Detection Indicator */}
          {detectedFormat && (
            <div className="p-4 bg-amber-50/80 backdrop-blur-sm border border-amber-200/60 rounded-xl animate-in fade-in slide-in-from-top-1 duration-300">
              <div className="flex items-center">
                <Sparkles className="w-4 h-4 text-amber-600 mr-3" />
                <span className="text-sm font-medium text-amber-800">Smart Detection:</span>
                <span className="ml-2 text-sm text-amber-700 font-mono uppercase bg-amber-100 px-2 py-1 rounded-md">
                  {detectedFormat} format detected
                </span>
              </div>
            </div>
          )}

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Format Selection */}
            <div className="space-y-3">
              <label htmlFor="format" className="block text-sm font-medium text-stone-700">
                Output Format
              </label>
              <select
                id="format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full px-4 py-3 border border-stone-300/60 dark:border-stone-600/60 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all duration-200 text-stone-800 dark:text-stone-200 bg-white/50 dark:bg-stone-800/50 backdrop-blur-sm"
              >
                <option value="txt">Plain Text (TXT)</option>
                <option value="md">Markdown (MD)</option>
                <option value="json">JSON</option>
                <option value="html">HTML</option>
                <option value="csv">CSV</option>
                <option value="pdf">PDF</option>
              </select>
            </div>

            {/* Options */}
            <div className="space-y-4">
              <label className="block text-sm font-medium text-stone-700">Automation Options</label>
              <div className="space-y-4">
                <label className="flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={headless}
                    onChange={(e) => setHeadless(e.target.checked)}
                    className="w-4 h-4 text-amber-600 border-stone-300 dark:border-stone-600 rounded focus:ring-amber-500/20 focus:ring-2 bg-white dark:bg-stone-800"
                  />
                  <div className="ml-3 flex items-center">
                    {headless ? (
                      <EyeOff className="w-4 h-4 text-stone-600 dark:text-stone-400 mr-2" />
                    ) : (
                      <Eye className="w-4 h-4 text-stone-600 dark:text-stone-400 mr-2" />
                    )}
                    <span className="text-sm text-stone-700 dark:text-stone-300 group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors">
                      Headless Mode
                    </span>
                  </div>
                </label>
                <label className="flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={streaming}
                    onChange={(e) => setStreaming(e.target.checked)}
                    className="w-4 h-4 text-amber-600 border-stone-300 dark:border-stone-600 rounded focus:ring-amber-500/20 focus:ring-2 bg-white dark:bg-stone-800"
                  />
                  <div className="ml-3 flex items-center">
                    <Monitor className="w-4 h-4 text-stone-600 dark:text-stone-400 mr-2" />
                    <span className="text-sm text-stone-700 dark:text-stone-300 group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors">
                      Live Streaming
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Storage Preference */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-stone-700">
              ¿Dónde quieres guardar los resultados?
              <span className="text-stone-500 font-light ml-2">BrowserPilot lo recordará para la próxima vez</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {STORAGE_OPTIONS.map(option => (
                <label
                  key={option.value}
                  className={`border rounded-xl p-4 cursor-pointer transition-all duration-200 backdrop-blur-sm ${
                    storageSelection === option.value
                      ? 'border-amber-400 bg-amber-50/70'
                      : 'border-stone-200/70 bg-white/60 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-start">
                    <input
                      type="radio"
                      name="storage-preference"
                      value={option.value}
                      checked={storageSelection === option.value}
                      onChange={() => {
                        setStorageSelection(option.value);
                        if (option.value !== 'custom') {
                          setCustomStorageLocation('');
                        }
                      }}
                      className="mt-1 w-4 h-4 text-amber-500 border-stone-300 focus:ring-amber-500"
                    />
                    <div className="ml-3">
                      <p className="text-sm font-semibold text-stone-800">{option.label}</p>
                      <p className="text-xs text-stone-500 mt-1">{option.description}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {storageSelection === 'custom' && (
              <input
                type="text"
                value={customStorageLocation}
                onChange={(e) => setCustomStorageLocation(e.target.value)}
                placeholder="Ejemplo: Carpeta compartida del equipo o bucket S3"
                className="w-full px-4 py-3 border border-amber-300/70 rounded-xl focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 bg-white/70"
              />
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4 pt-6 border-t border-stone-200/60">
            <button
              type="submit"
              disabled={isSubmitting || !prompt.trim()}
              className="flex-1 min-w-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-8 py-4 rounded-xl font-medium hover:from-amber-600 hover:to-orange-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center space-x-3 group shadow-md hover:shadow-lg"
            >
              <Play className={`w-5 h-5 transition-transform duration-300 ${isSubmitting ? 'animate-spin' : 'group-hover:scale-110'}`} />
              <span className="text-lg">{isSubmitting ? 'Launching BrowserPilot...' : 'Start Automation'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={!currentJobId}
              className="px-8 py-4 border border-stone-300/60 dark:border-stone-600/60 text-stone-700 dark:text-stone-300 rounded-xl font-medium hover:bg-stone-50 dark:hover:bg-stone-700/50 hover:border-stone-400 dark:hover:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center space-x-3 group bg-white/50 dark:bg-stone-800/50 backdrop-blur-sm"
            >
              <Download className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
              <span>Download Results</span>
            </button>
          </div>
        </form>

        {/* History */}
        {history.length > 0 && (
          <div className="mt-10 p-5 border border-stone-200/70 dark:border-stone-700/60 rounded-2xl bg-stone-50/60 dark:bg-stone-900/40 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-stone-800 dark:text-stone-200">Historial reciente</h3>
                <p className="text-sm text-stone-500">Vuelve a ejecutar tareas con un solo clic</p>
              </div>
              <button
                type="button"
                onClick={() => setHistory([])}
                className="text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-white"
              >
                Limpiar
              </button>
            </div>
            <div className="space-y-3 max-h-64 overflow-auto pr-1">
              {history.map((entry) => (
                <div
                  key={`${entry.timestamp}-${entry.prompt.slice(0, 10)}`}
                  className="p-3 rounded-xl border border-stone-200/70 dark:border-stone-700/60 bg-white/70 dark:bg-stone-800/40 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                >
                  <div>
                    <p className="text-sm text-stone-800 dark:text-stone-100 line-clamp-2">{entry.prompt}</p>
                    <div className="text-xs text-stone-500 dark:text-stone-400 mt-1 flex flex-wrap gap-3">
                      <span className="uppercase font-semibold">{entry.format}</span>
                      <span>{entry.headless ? 'Headless' : 'Visible'}</span>
                      <span>{entry.streaming ? 'Streaming ON' : 'Streaming OFF'}</span>
                      <span className="flex items-center gap-1">
                        <span className="text-amber-500">⬇️</span>
                        {entry.storageLabel}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end md:self-auto">
                    <span className="text-xs text-stone-400">
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPrompt(entry.prompt);
                        setFormat(entry.format);
                        setHeadless(entry.headless);
                        setStreaming(entry.streaming);
                        setStorageSelection(entry.storageSelection);
                        if (entry.storageSelection === 'custom') {
                          setCustomStorageLocation(entry.storageLabel);
                        } else {
                          setCustomStorageLocation('');
                        }
                      }}
                      className="px-3 py-1 text-xs rounded-lg bg-stone-900 text-white hover:bg-stone-700 transition-colors"
                    >
                      Usar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};