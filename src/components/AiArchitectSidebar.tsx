import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, ChevronRight, ChevronLeft, Bot, User, Trash2, Key, Globe, Zap, RefreshCw } from 'lucide-react';
import { getAiResponse, getN8nAiResponse, getLocalAiResponse, fetchLocalModels, getOpenAiResponse } from '../services/aiService';
import { processAiResponse } from '../utils/aiActionProcessor';

interface Message {
  role: 'user' | 'model';
  content: string;
}

interface AiArchitectSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  currentContext: any;
  onExecuteActions: (actions: any[]) => void;
}

export const AiArchitectSidebar: React.FC<AiArchitectSidebarProps> = ({
  isOpen, onToggle, currentContext, onExecuteActions
}) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: "Hello! I am your AI Architect. How can I help you design your system or perform statistical analysis today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // AI Engine Selection: 'n8n' | 'gemini' | 'local' | 'openai'
  const [aiEngine, setAiEngine] = useState<'n8n' | 'gemini' | 'local' | 'openai'>(
    (localStorage.getItem('ai_engine') as any) || 'n8n'
  );
  const [apiKey, setApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(localStorage.getItem('openai_base_url') || 'https://api.openai.com/v1');
  const [openaiModel, setOpenaiModel] = useState(localStorage.getItem('openai_model') || 'gpt-4o-mini');
  const [localBaseUrl, setLocalBaseUrl] = useState(localStorage.getItem('local_llm_base_url')?.replace('localhost', '127.0.0.1') || 'http://127.0.0.1:1234');
  const [localModel, setLocalModel] = useState(localStorage.getItem('local_llm_model') || 'google/gemma-4-e4b');
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [showSettings, setShowSettings] = useState(aiEngine === 'gemini' || aiEngine === 'openai');

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load API Keys from secure storage on mount
  useEffect(() => {
    const loadApiKeys = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const electron = (window as any).require?.('electron');
        if (electron?.ipcRenderer) {
          const storedKey = await electron.ipcRenderer.invoke('load-api-key', { service: 'gemini' });
          if (storedKey) {
            setApiKey(storedKey);
          }
          const storedOpenAiKey = await electron.ipcRenderer.invoke('load-api-key', { service: 'openai' });
          if (storedOpenAiKey) {
            setOpenaiApiKey(storedOpenAiKey);
          }
        }
      } catch (err) {
        console.warn("Failed to load API keys from secure vault:", err);
      }
    };
    loadApiKeys();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Load local models when local engine is activated or URL changes
  useEffect(() => {
    if (aiEngine === 'local') {
      refreshModels(localBaseUrl);
    }
  }, [aiEngine, localBaseUrl]);

  const refreshModels = async (url: string) => {
    setIsLoadingModels(true);
    try {
      const models = await fetchLocalModels(url);
      setLocalModels(models);
      if (models.length > 0 && !models.includes(localModel)) {
        setLocalModel(models[0]);
        localStorage.setItem('local_llm_model', models[0]);
      }
    } catch (e) {
      console.warn("Failed to fetch models from local API:", e);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    if (aiEngine === 'gemini' && !apiKey) {
      setShowSettings(true);
      return;
    }
    if (aiEngine === 'openai' && !openaiApiKey) {
      setShowSettings(true);
      return;
    }

    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      let responseText: string;
      if (aiEngine === 'n8n') {
        responseText = await getN8nAiResponse(input, currentContext, apiKey, newMessages);
      } else if (aiEngine === 'gemini') {
        responseText = await getAiResponse(apiKey, newMessages, currentContext);
      } else if (aiEngine === 'openai') {
        responseText = await getOpenAiResponse(openaiApiKey, newMessages, currentContext, openaiBaseUrl, openaiModel);
      } else {
        responseText = await getLocalAiResponse(localBaseUrl, localModel, newMessages, currentContext);
      }

      const { message, actions } = processAiResponse(responseText);

      setMessages([...newMessages, { role: 'model', content: message }]);

      if (actions && actions.length > 0) {
        onExecuteActions(actions);
      }
    } catch (error: any) {
      let errorMessage = error.message || "Unknown error";
      if (errorMessage.includes('429')) {
        errorMessage = "API Rate Limit Exceeded. Please wait a minute.";
      }
      setMessages([...newMessages, { role: 'model', content: errorMessage }]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    localStorage.setItem('local_llm_base_url', localBaseUrl);
    localStorage.setItem('local_llm_model', localModel);
    localStorage.setItem('openai_base_url', openaiBaseUrl);
    localStorage.setItem('openai_model', openaiModel);
    localStorage.setItem('ai_engine', aiEngine);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const electron = (window as any).require?.('electron');
      if (electron?.ipcRenderer) {
        await electron.ipcRenderer.invoke('store-api-key', { service: 'gemini', key: apiKey });
        await electron.ipcRenderer.invoke('store-api-key', { service: 'openai', key: openaiApiKey });
      }
    } catch (err) {
      console.warn("Failed to store API keys in secure vault:", err);
    }
    setShowSettings(false);
  };

  return (
    <>
      <button
        onClick={onToggle}
        className={`fixed right-0 top-1/2 -translate-y-1/2 p-2 bg-[#111] border border-[#333] border-r-0 rounded-l-xl shadow-2xl z-[60] transition-all duration-300 ${isOpen ? 'mr-[400px]' : 'mr-0'} ${
          aiEngine === 'n8n' ? 'text-emerald-400 hover:text-emerald-300' : aiEngine === 'gemini' ? 'text-indigo-400 hover:text-indigo-300' : aiEngine === 'openai' ? 'text-sky-400 hover:text-sky-300' : 'text-purple-400 hover:text-purple-300'
        }`}
      >
        <div className="flex flex-col items-center gap-2 py-2">
          {isOpen ? <ChevronRight size={20} /> : (aiEngine === 'n8n' ? <Zap size={20} /> : aiEngine === 'gemini' ? <Sparkles size={20} /> : aiEngine === 'openai' ? <Globe size={20} /> : <Bot size={20} />)}
          {!isOpen && <span className="text-[9px] font-black uppercase [writing-mode:vertical-lr] tracking-widest opacity-70">AI Architect</span>}
        </div>
      </button>

      <div
        className={`fixed right-0 top-0 h-screen bg-[#0f0f0f] border-l border-[#222] transition-all duration-300 z-50 flex flex-col shadow-2xl overflow-hidden ${isOpen ? 'w-[400px]' : 'w-0'}`}
      >
        {isOpen && (
          <>
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-[#222] bg-gradient-to-r from-indigo-950/20 to-transparent">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  aiEngine === 'n8n' ? 'bg-emerald-500/20 text-emerald-400' : aiEngine === 'gemini' ? 'bg-indigo-500/20 text-indigo-400' : aiEngine === 'openai' ? 'bg-sky-500/20 text-sky-400' : 'bg-purple-500/20 text-purple-400'
                }`}>
                  {aiEngine === 'n8n' ? <Zap size={18} /> : aiEngine === 'gemini' ? <Sparkles size={18} /> : aiEngine === 'openai' ? <Globe size={18} /> : <Bot size={18} />}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight">AI Architect Assistant</h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                      aiEngine === 'n8n' ? 'bg-emerald-500' : aiEngine === 'gemini' ? 'bg-indigo-500' : aiEngine === 'openai' ? 'bg-sky-500' : 'bg-purple-500'
                    }`} />
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                      {aiEngine === 'n8n' ? 'n8n Orchestrator Active' : aiEngine === 'gemini' ? 'Gemini Engine Active' : aiEngine === 'openai' ? 'OpenAI Engine Active' : 'Local LLM Active'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowSettings(!showSettings)} className={`p-2 hover:bg-[#222] rounded-lg transition-colors ${showSettings ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400'}`} title="API Settings">
                  <Key size={16} />
                </button>
                <button onClick={() => setMessages([{ role: 'model', content: "Chat cleared." }])} className="p-2 hover:bg-[#222] rounded-lg text-gray-400" title="Clear Chat">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* API Settings Pane */}
            {showSettings && (
              <div className="p-4 bg-[#141414] border-b border-[#222] space-y-4">
                {/* Engine Selector */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase mb-1.5 block">AI Engine Mode</label>
                  <div className="grid grid-cols-4 gap-1 bg-black p-1 rounded-lg border border-[#222]">
                    <button
                      onClick={() => setAiEngine('n8n')}
                      className={`py-1 px-1 rounded text-[9px] font-bold transition-all text-center ${
                        aiEngine === 'n8n'
                          ? 'bg-emerald-600 text-white shadow'
                          : 'text-gray-400 hover:text-white hover:bg-[#222]'
                      }`}
                    >
                      n8n
                    </button>
                    <button
                      onClick={() => setAiEngine('gemini')}
                      className={`py-1 px-1 rounded text-[9px] font-bold transition-all text-center ${
                        aiEngine === 'gemini'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-gray-400 hover:text-white hover:bg-[#222]'
                      }`}
                    >
                      Gemini
                    </button>
                    <button
                      onClick={() => setAiEngine('openai')}
                      className={`py-1 px-1 rounded text-[9px] font-bold transition-all text-center ${
                        aiEngine === 'openai'
                          ? 'bg-sky-600 text-white shadow'
                          : 'text-gray-400 hover:text-white hover:bg-[#222]'
                      }`}
                    >
                      OpenAI
                    </button>
                    <button
                      onClick={() => setAiEngine('local')}
                      className={`py-1 px-1 rounded text-[9px] font-bold transition-all text-center ${
                        aiEngine === 'local'
                          ? 'bg-purple-600 text-white shadow'
                          : 'text-gray-400 hover:text-white hover:bg-[#222]'
                      }`}
                    >
                      LM Studio
                    </button>
                  </div>
                </div>

                {/* Gemini Engine API Settings */}
                {aiEngine === 'gemini' && (
                  <div>
                    <label className="text-[10px] font-bold text-indigo-400 uppercase px-1 mb-1 block">Gemini API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full bg-black border border-[#333] rounded-lg px-3 py-1.5 text-xs text-white focus:border-indigo-500/50 outline-none"
                      placeholder="Paste your Gemini API key..."
                    />
                  </div>
                )}

                {/* OpenAI / Custom Engine API Settings */}
                {aiEngine === 'openai' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-sky-400 uppercase px-1 mb-1 block">API Key (OpenAI / Custom)</label>
                      <input
                        type="password"
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                        className="w-full bg-black border border-[#333] rounded-lg px-3 py-1.5 text-xs text-white focus:border-sky-500/50 outline-none"
                        placeholder="Paste your API key..."
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-sky-400 uppercase px-1 mb-1 block">Base URL</label>
                      <input
                        type="text"
                        value={openaiBaseUrl}
                        onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                        className="w-full bg-black border border-[#333] rounded-lg px-3 py-1.5 text-xs text-white focus:border-sky-500/50 outline-none"
                        placeholder="e.g. https://api.openai.com/v1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-sky-400 uppercase px-1 mb-1 block">Model Name</label>
                      <input
                        type="text"
                        value={openaiModel}
                        onChange={(e) => setOpenaiModel(e.target.value)}
                        className="w-full bg-black border border-[#333] rounded-lg px-3 py-1.5 text-xs text-white focus:border-sky-500/50 outline-none"
                        placeholder="e.g. gpt-4o-mini"
                      />
                    </div>
                  </div>
                )}

                {/* Local Engine Settings */}
                {aiEngine === 'local' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-purple-400 uppercase px-1 mb-1 block">LM Studio URL</label>
                      <input
                        type="text"
                        value={localBaseUrl}
                        onChange={(e) => setLocalBaseUrl(e.target.value)}
                        className="w-full bg-black border border-[#333] rounded-lg px-3 py-1.5 text-xs text-white focus:border-purple-500/50 outline-none"
                        placeholder="http://localhost:1234"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center px-1 mb-1">
                        <label className="text-[10px] font-bold text-purple-400 uppercase">Loaded Model</label>
                        <button
                          onClick={() => refreshModels(localBaseUrl)}
                          disabled={isLoadingModels}
                          className="text-[9px] text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={10} className={isLoadingModels ? 'animate-spin' : ''} />
                          Refresh Models
                        </button>
                      </div>
                      <div className="flex gap-2">
                        {localModels.length > 0 ? (
                          <select
                            value={localModel}
                            onChange={(e) => setLocalModel(e.target.value)}
                            className="w-full bg-black border border-[#333] rounded-lg px-3 py-1.5 text-xs text-white focus:border-purple-500/50 outline-none"
                          >
                            {localModels.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={localModel}
                            onChange={(e) => setLocalModel(e.target.value)}
                            className="w-full bg-black border border-[#333] rounded-lg px-3 py-1.5 text-xs text-white focus:border-purple-500/50 outline-none"
                            placeholder="google/gemma-4-e4b"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button onClick={saveSettings} className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors">
                    Save & Close
                  </button>
                </div>
              </div>
            )}

            {/* Chat Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none shadow-lg'
                      : 'bg-[#1a1a1a] border border-[#333] text-gray-200 rounded-tl-none'
                    }`}>
                    <div className="flex items-center gap-2 mb-1 opacity-50">
                      {m.role === 'user' ? <User size={10} /> : <Bot size={10} />}
                      <span className="text-[9px] font-bold uppercase tracking-wider">{m.role === 'user' ? 'You' : 'Architect'}</span>
                    </div>
                    {m.content}
                  </div>
                </div>
              ))}
               {isLoading && (
                <div className="flex justify-start animate-pulse">
                  <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl rounded-tl-none p-3 flex gap-2 items-center">
                    <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${
                      aiEngine === 'n8n' ? 'bg-emerald-500' : aiEngine === 'gemini' ? 'bg-indigo-500' : aiEngine === 'openai' ? 'bg-sky-500' : 'bg-purple-500'
                    }`} />
                    <div className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.2s] ${
                      aiEngine === 'n8n' ? 'bg-emerald-500' : aiEngine === 'gemini' ? 'bg-indigo-500' : aiEngine === 'openai' ? 'bg-sky-500' : 'bg-purple-500'
                    }`} />
                    <div className={`w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.4s] ${
                      aiEngine === 'n8n' ? 'bg-emerald-500' : aiEngine === 'gemini' ? 'bg-indigo-500' : aiEngine === 'openai' ? 'bg-sky-500' : 'bg-purple-500'
                    }`} />
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-[#0a0a0a] border-t border-[#222]">
              <div className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={
                    aiEngine === 'n8n'
                      ? "Tell the Orchestrator what to model..."
                      : aiEngine === 'gemini'
                      ? "Ask Gemini to design something..."
                      : aiEngine === 'openai'
                      ? "Instruct OpenAI to design something..."
                      : "Instruct your local LM Studio model..."
                  }
                  className={`w-full bg-[#161616] border border-[#333] rounded-xl pl-4 pr-12 py-3 text-xs text-white placeholder:text-gray-600 outline-none resize-none h-20 transition-all ${
                    aiEngine === 'n8n' ? 'focus:border-emerald-500/50' : aiEngine === 'gemini' ? 'focus:border-indigo-500/50' : aiEngine === 'openai' ? 'focus:border-sky-500/50' : 'focus:border-purple-500/50'
                  }`}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className={`absolute right-2 bottom-2 p-2 rounded-lg transition-all ${
                    aiEngine === 'n8n' ? 'bg-emerald-600 hover:bg-emerald-500' : aiEngine === 'gemini' ? 'bg-indigo-600 hover:bg-indigo-500' : aiEngine === 'openai' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-purple-600 hover:bg-purple-500'
                  } disabled:bg-gray-800 disabled:text-gray-600 text-white shadow-lg`}
                >
                  <Send size={16} />
                </button>
              </div>
              <p className="text-[9px] text-center text-gray-600 mt-2">
                {aiEngine === 'n8n'
                  ? 'Connected to n8n Orchestrator for automated modeling.'
                  : aiEngine === 'gemini'
                  ? 'Using Gemini API for architectural guidance.'
                  : aiEngine === 'openai'
                  ? `Connected to OpenAI (${openaiModel}).`
                  : `Connected to LM Studio (${localModel}).`}
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
};
