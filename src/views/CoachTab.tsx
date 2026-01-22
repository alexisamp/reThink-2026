
import React, { useState } from 'react';
import { Mic, PlayCircle } from '../components/Icon';
import { getCoachFeedback } from '../services/ai';

interface CoachTabProps {
  userId: string;
}

const CoachTab: React.FC<CoachTabProps> = ({ userId }) => {
  const [feedback, setFeedback] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleAnalyze = async () => {
    setIsLoading(true);
    setFeedback('');
    
    // 1. Get AI Text using userId to query DB View
    const text = await getCoachFeedback(userId);
    setFeedback(text);
    setIsLoading(false);

    // 2. Speak
    speakText(text);
  };

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) {
        alert("Text-to-speech not supported in this browser.");
        return;
    }
    window.speechSynthesis.cancel(); // Stop previous
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="h-full flex flex-col items-center justify-center animate-fade-in pb-20">
      
      <div className={`relative mb-8 transition-all duration-1000 ${isLoading ? 'scale-110' : 'scale-100'}`}>
         {/* Pulse Effect */}
         {(isLoading || isSpeaking) && (
            <div className="absolute inset-0 bg-black opacity-10 rounded-full animate-ping"></div>
         )}
         
         <button 
            onClick={handleAnalyze}
            disabled={isLoading || isSpeaking}
            className="relative z-10 w-32 h-32 bg-black text-white rounded-full flex flex-col items-center justify-center shadow-2xl hover:scale-105 transition-transform disabled:opacity-80 disabled:cursor-not-allowed"
         >
            {isLoading ? (
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isSpeaking ? (
                 <div className="flex gap-1 h-8 items-end">
                    <div className="w-1 bg-white h-4 animate-[bounce_1s_infinite]"></div>
                    <div className="w-1 bg-white h-8 animate-[bounce_1.2s_infinite]"></div>
                    <div className="w-1 bg-white h-6 animate-[bounce_0.8s_infinite]"></div>
                 </div>
            ) : (
                <>
                   <Mic className="w-8 h-8 mb-2" />
                   <span className="text-[10px] uppercase font-bold tracking-widest">Analyze</span>
                </>
            )}
         </button>
      </div>

      <div className="max-w-md text-center space-y-6 px-6">
         <h2 className="text-xl font-serif font-medium">AI Performance Coach</h2>
         
         {feedback ? (
             <div className="bg-notion-sidebar p-6 rounded-xl border border-notion-border shadow-inner">
                 <p className="font-serif text-lg leading-relaxed text-notion-text whitespace-pre-wrap">
                    {feedback}
                 </p>
                 {!isSpeaking && (
                    <button onClick={() => speakText(feedback)} className="mt-4 text-xs flex items-center justify-center gap-2 w-full text-notion-dim hover:text-black">
                        <PlayCircle className="w-4 h-4" /> Replay Voice
                    </button>
                 )}
             </div>
         ) : (
             <p className="text-notion-dim text-sm italic">
                "I will analyze your recent habits and journal entries to give you brutal but necessary feedback."
             </p>
         )}
      </div>

    </div>
  );
};

export default CoachTab;
