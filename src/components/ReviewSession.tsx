import React, { useState, useEffect } from 'react';
import { Phonogram, CardStatus } from '../types';
import { ChevronLeft, ChevronRight, X, Trophy } from 'lucide-react';

interface ReviewSessionProps {
  cards: Phonogram[];
  cardStatuses: Record<string, CardStatus>;
  onSaveStatus: (id: string, status: CardStatus) => void;
  onExit: () => void;
  onSessionFinish: (results: Record<string, CardStatus>, score: number) => void;
}

export default function ReviewSession({
  cards,
  cardStatuses,
  onSaveStatus,
  onExit,
  onSessionFinish,
}: ReviewSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [sessionStatuses, setSessionStatuses] = useState<Record<string, CardStatus>>({});
  const [sessionCardsCompletedCount, setSessionCardsCompletedCount] = useState(0);

  // Sound play controller
  const playSound = (card: Phonogram) => {
    if (card.audioUrl) {
      try {
        const audio = new Audio(card.audioUrl);
        audio.play().catch(() => playSpeechFallback(card));
      } catch {
        playSpeechFallback(card);
      }
    } else {
      playSpeechFallback(card);
    }
  };

  // Speaks aloud the phonogram letter sound and examples elegantly
  const playSpeechFallback = (card: Phonogram) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const textToSpeak = `${card.id}. Sample words: ${card.sampleWords}.`;
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 0.85; // slightly slower for educational clarity
      utterance.pitch = 1.05;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Get current active card
  const currentCard = cards[currentIndex] || cards[0];

  // Stop audio speech synthesis when card changes
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [currentIndex]);

  if (cards.length === 0) {
    return (
      <div className="bg-white border rounded-2xl p-8 text-center max-w-md mx-auto my-12 shadow-sm">
        <p className="text-slate-500 font-medium">No cards were selected for practice.</p>
        <button
          onClick={onExit}
          className="mt-4 px-6 py-2 bg-indigo-900 text-white rounded-xl font-medium hover:bg-indigo-950 transition"
        >
          Return to Lessons
        </button>
      </div>
    );
  }

  // Active status of current card
  const currentStatus = sessionStatuses[currentCard.id] || cardStatuses[currentCard.id] || 'Needs Work';

  const handleSetStatus = (status: CardStatus) => {
    // Save locally to session state
    setSessionStatuses(prev => {
      const isNew = !prev[currentCard.id];
      if (isNew) {
        setSessionCardsCompletedCount(c => c + 1);
      }
      return { ...prev, [currentCard.id]: status };
    });
    // Fire parent handler to write to DB
    onSaveStatus(currentCard.id, status);
  };

  const handlePrev = () => {
    if (history.length > 0) {
      const prevHistory = [...history];
      const prevIndex = prevHistory.pop()!;
      setHistory(prevHistory);
      setCurrentIndex(prevIndex);
    }
  };

  const handleNext = () => {
    // Record current index into history
    setHistory(prev => [...prev, currentIndex]);

    // Adaptive spacing weight selection algorithm
    const weightedIndices: number[] = [];
    for (let i = 0; i < cards.length; i++) {
      const cardId = cards[i].id;
      const status = sessionStatuses[cardId] || cardStatuses[cardId] || 'Needs Work';
      
      let tickets = 3; // 'Needs Work' default fallback
      if (status === 'Not Known') tickets = 5;
      if (status === 'Known') tickets = 2;
      if (status === 'Remove') tickets = 0; // Skip entirely

      for (let t = 0; t < tickets; t++) {
        weightedIndices.push(i);
      }
    }

    if (weightedIndices.length > 0) {
      // Shuffle weighted tickets list
      const shuffled = [...weightedIndices].sort(() => Math.random() - 0.5);
      let nextIndex = shuffled[0];

      // Avoid immediate repetitive loops unless only 1 card exists
      if (nextIndex === currentIndex && cards.length > 1) {
        nextIndex = shuffled[shuffled.length - 1];
      }
      setCurrentIndex(nextIndex);
    } else {
      // Default step forward fallback
      setCurrentIndex(prev => (prev + 1) % cards.length);
    }
  };

  const handleCompleteAndReport = () => {
    // Calculate fractional score
    const studiedList = Object.entries(sessionStatuses);
    let knownCount = 0;
    studiedList.forEach(([_, cardStatus]) => {
      if (cardStatus === 'Known') {
        knownCount++;
      }
    });

    const finalScore = studiedList.length > 0 ? Math.round((knownCount / studiedList.length) * 100) : 0;
    onSessionFinish(sessionStatuses, finalScore);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <span className="text-xs font-mono font-medium text-slate-400 uppercase tracking-widest">
            ACTIVE PRACTICE SESSION
          </span>
          <h2 className="font-display font-bold text-slate-800 text-lg mt-0.5">
            Progressive Review
          </h2>
        </div>
        <button
          onClick={onExit}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition"
          title="Exit current practice"
          id="btn-exit-practice-x"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex justify-between items-center text-xs text-slate-500 font-medium px-1">
        <span>Reviewed: <b className="text-indigo-900">{sessionCardsCompletedCount}</b> unique cards</span>
        <span>Selection pool: <b>{cards.length}</b> cards</span>
      </div>

      {/* Main Flashcard view centering phonogram and purple play button */}
      <div className="w-full bg-white rounded-3xl border border-slate-100 shadow-sm p-10 flex flex-col items-center justify-center min-h-[420px] transition-all">
        
        {/* Massive Phonogram letter image or text (50% larger than original size) */}
        <div className="flex items-center justify-center select-none py-6">
          {currentCard.imageUrl ? (
            <img
              src={currentCard.imageUrl}
              alt={currentCard.id}
              className="h-48 md:h-52 object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <h1 className="font-display font-bold text-[14.5rem] leading-none text-slate-900 tracking-tight select-none">
              {currentCard.id}
            </h1>
          )}
        </div>

        {/* Purple Play Button directly below the phonogram */}
        <div className="flex justify-center pb-8">
          <button
            onClick={() => playSound(currentCard)}
            id="btn-play-sound-direct"
            className="w-20 h-20 bg-[#5e35b1] hover:bg-[#4d2c91] text-white flex items-center justify-center rounded-full transition-all duration-150 transform hover:scale-105 active:scale-95 shadow-md"
            title="Play Phonogram sound"
          >
            <svg 
              className="w-10 h-10 ml-1.5 text-white fill-current" 
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>

        {/* Status Selector Panel matching screenshot */}
        <div className="w-full border-t border-slate-100/80 pt-6 flex flex-col items-center justify-center space-y-5">
          <h4 className="font-display font-bold text-slate-900 text-lg">
            Status
          </h4>

          <div className="flex justify-between items-start w-full max-w-sm select-none gap-2">
            {[
              { label: 'Not Known', isRemove: false },
              { label: 'Needs Work', isRemove: false },
              { label: 'Known', isRemove: false },
              { label: 'Remove', isRemove: true }
            ].map((op) => {
              const isSelected = currentStatus === op.label;
              return (
                <button
                  key={op.label}
                  id={`btn-status-${op.label.replace(' ', '-')}`}
                  onClick={() => handleSetStatus(op.label as CardStatus)}
                  className="flex flex-col items-center gap-2 flex-1 group cursor-pointer"
                >
                  {/* Concentric check circles styled from the screenshot */}
                  <div className="flex items-center justify-center w-6.5 h-6.5">
                    {isSelected ? (
                      <div className="w-5.5 h-5.5 rounded-full border-2 border-slate-950 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 bg-slate-950 rounded-full" />
                      </div>
                    ) : (
                      <div className="w-5.5 h-5.5 rounded-full border-2 border-slate-400 hover:border-slate-600 transition-colors" />
                    )}
                  </div>

                  {/* Status labels */}
                  <span className={`text-[11px] font-semibold tracking-tight transition-colors text-center ${
                    op.isRemove 
                      ? (isSelected ? 'text-rose-600 font-bold' : 'text-rose-500') 
                      : (isSelected ? 'text-slate-900 font-bold' : 'text-slate-600 group-hover:text-slate-800')
                  }`}>
                    {op.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* Sequential navigation triggers */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-4">
          <button
            onClick={handlePrev}
            disabled={history.length === 0}
            id="btn-prev-card"
            className="flex-1 flex items-center justify-center gap-2 py-4 bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-2xl font-semibold transition disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>

          <button
            onClick={handleNext}
            id="btn-next-card"
            className="flex-1 flex items-center justify-center gap-2 py-4 bg-indigo-900 hover:bg-indigo-950 text-white rounded-2xl font-bold tracking-wide transition shadow-sm hover:shadow"
          >
            Next Random card <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Dynamic complete button */}
        <button
          onClick={handleCompleteAndReport}
          id="btn-finish-practice"
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-800 rounded-2xl font-bold transition"
        >
          <Trophy className="h-4 w-4 font-normal" /> Wrap up Session & See Report
        </button>
      </div>
    </div>
  );
}
