import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, ChevronRight, ChevronLeft, Bot, User, Trash2, Key, Globe, Zap } from 'lucide-react';
import { getAiResponse, getN8nAiResponse } from '../services/aiService';
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
    { role: 'model', content: "Hello! I am your AI Architect. I am now connected to the n8n Orchestrator. How can I help you design your system or perform statistical analysis today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useOrchestrator, setUseOrchestrator] = useState(true);
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(!apiKey && !useOrchestrator);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    if (!useOrchestrator && !apiKey) {
      setShowKeyInput(true);
      return;
    }

    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      let responseText: string;
      if (useOrchestrator) {
        responseText = await getN8nAiResponse(input, currentContext);
      } else {
        responseText = await getAiResponse(apiKey, newMessages, currentContext);
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

  const saveKey = () => {
    localStorage.setItem('gemini_api_key', apiKey);
    setShowKeyInput(false);
  };

  return (
    <>
      <button
        onClick={onToggle}
        className={`fixed right-0 top-1/2 -translate-y-1/2 p-2 bg-[#111] border border-[#333] border-r-0 rounded-l-xl text-indigo-400 hover:text-indigo-300 shadow-2xl z-[60] transition-all duration-300 ${isOpen ? 'mr-[400px]' : 'mr-0'}`}
      >
        <div className="flex flex-col items-center gap-2 py-2">
          {isOpen ? <ChevronRight size={20} /> : <Sparkles size={20} />}
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
                <div className={`p-2 rounded-lg ${useOrchestrator ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                  {useOrchestrator ? <Zap size={18} /> : <Sparkles size={18} />}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight">AI Architect Assistant</h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${useOrchestrator ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                      {useOrchestrator ? 'n8n Orchestrator Active' : 'Gemini Engine Active'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setUseOrchestrator(!useOrchestrator)} 
                  className={`p-2 rounded-lg transition-colors ${useOrchestrator ? 'text-emerald-400 bg-emerald-500/10' : 'text-gray-400 hover:bg-[#222]'}`}
                  title={useOrchestrator ? "Switch to Gemini" : "Switch to n8n Orchestrator"}
                >
                  <Globe size={16} />
                </button>
                <button onClick={() => setShowKeyInput(!showKeyInput)} className="p-2 hover:bg-[#222] rounded-lg text-gray-400" title="API Settings">
                  <Key size={16} />
                </button>
                <button onClick={() => setMessages([{ role: 'model', content: "Chat cleared." }])} className="p-2 hover:bg-[#222] rounded-lg text-gray-400" title="Clear Chat">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* API Key Input */}
            {showKeyInput && (
              <div className="p-4 bg-amber-500/5 border-b border-amber-500/20">
                <label className="text-[10px] font-bold text-amber-500/70 uppercase px-1 mb-1 block">Gemini API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="flex-1 bg-black border border-[#333] rounded-lg px-3 py-1.5 text-xs text-white focus:border-amber-500/50 outline-none"
                    placeholder="Paste your API key..."
                  />
                  <button onClick={saveKey} className="bg-amber-600 hover:bg-amber-500 text-white px-3 rounded-lg text-xs font-bold transition-colors">
                    Save
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
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]" />
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
                  placeholder={useOrchestrator ? "Tell the Orchestrator what to model..." : "Ask me to design something..."}
                  className={`w-full bg-[#161616] border border-[#333] rounded-xl pl-4 pr-12 py-3 text-xs text-white placeholder:text-gray-600 outline-none resize-none h-20 transition-all ${useOrchestrator ? 'focus:border-emerald-500/50' : 'focus:border-indigo-500/50'}`}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className={`absolute right-2 bottom-2 p-2 rounded-lg transition-all ${useOrchestrator ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-500'} disabled:bg-gray-800 disabled:text-gray-600 text-white shadow-lg`}
                >
                  <Send size={16} />
                </button>
              </div>
              <p className="text-[9px] text-center text-gray-600 mt-2">
                {useOrchestrator ? 'Connected to n8n Orchestrator for automated modeling.' : 'Using Gemini for architectural guidance.'}
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
};
