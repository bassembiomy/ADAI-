import React, { useState } from 'react';

export const ArchitectBrainSidebar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState([
    { role: 'model', parts: [{ text: "Hello! I'm your Architect Brain. I can help you design your physical models and state machines. What would you like to build today?" }] }
  ]);
  const [input, setInput] = useState('');

  return (
    <div className={`flex flex-col border-l border-[#222] bg-[#0d0d0d] transition-all duration-300 ${isOpen ? 'w-80' : 'w-0'}`}>
      <div className="flex items-center justify-between p-4 border-b border-[#222]">
        <h2 className="font-bold text-sm text-gray-400 uppercase tracking-widest">Architect Brain</h2>
        <button onClick={() => setIsOpen(!isOpen)} className="text-gray-500 hover:text-white">
          {isOpen ? '→' : '←'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
              msg.role === 'user' 
                ? 'bg-purple-600 text-white rounded-tr-none' 
                : 'bg-[#1a1a1a] text-gray-200 border border-[#333] rounded-tl-none'
            }`}>
              {msg.parts[0].text}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-[#222]">
        <div className="relative">
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Architect Brain..."
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-purple-500 transition-all"
          />
        </div>
      </div>
    </div>
  );
};
