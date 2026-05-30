import React, { useMemo } from 'react';
import { allPhonograms } from '../phonogram_data';
import { Phonogram, CardStatus } from '../types';
import { Check, ClipboardList, RefreshCw, Undo2, Play, CheckSquare, Square } from 'lucide-react';

interface LessonSelectorProps {
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  randomize: boolean;
  setRandomize: (val: boolean) => void;
  cardStatuses: Record<string, CardStatus>;
  onStartSession: () => void;
  onRestoreRemoved: () => void;
}

export default function LessonSelector({
  selectedIds,
  setSelectedIds,
  randomize,
  setRandomize,
  cardStatuses,
  onStartSession,
  onRestoreRemoved,
}: LessonSelectorProps) {

  // Group phonograms by lesson
  const lessons = useMemo(() => {
    const list: Record<number, Phonogram[]> = {};
    allPhonograms.forEach((p) => {
      // Skip if the user has marked this card as 'Remove'
      if (cardStatuses[p.id] === 'Remove') {
        return;
      }
      if (!list[p.lesson]) {
        list[p.lesson] = [];
      }
      list[p.lesson].push(p);
    });
    return list;
  }, [cardStatuses]);

  // Total visible/active phonograms (not removed)
  const activePhonograms = useMemo(() => {
    return allPhonograms.filter((p) => cardStatuses[p.id] !== 'Remove');
  }, [cardStatuses]);

  const handleToggleCard = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next as Set<string>);
  };

  const handleToggleLesson = (lessonNum: number, selectAll: boolean) => {
    const lessonCards = lessons[lessonNum] || [];
    const next = new Set(selectedIds);
    lessonCards.forEach((card) => {
      if (selectAll) {
        next.add(card.id);
      } else {
        next.delete(card.id);
      }
    });
    setSelectedIds(next as Set<string>);
  };

  const handleSelectAll = (select: boolean) => {
    if (select) {
      setSelectedIds(new Set(activePhonograms.map((p) => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const isAllSelected = activePhonograms.length > 0 && selectedIds.size === activePhonograms.length;

  return (
    <div className="space-y-6">
      {/* Lesson Index Bento Grid */}
      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="font-display font-semibold text-slate-700 text-base">
            Available Lessons ({Object.keys(lessons).length})
          </h3>
          <span className="text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-full">
            {selectedIds.size} card{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.keys(lessons)
            .map(Number)
            .sort((a, b) => a - b)
            .map((lessonNum) => {
              const cards = lessons[lessonNum] || [];
              const allSelected = cards.every((c) => selectedIds.has(c.id));
              const someSelected = cards.some((c) => selectedIds.has(c.id));

              return (
                <div
                  key={lessonNum}
                  id={`lesson-card-${lessonNum}`}
                  className="bg-white border border-slate-100 rounded-2xl p-5 hover:border-slate-300 transition-all flex flex-col justify-between hover:shadow-xs"
                >
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <span className="font-display font-semibold text-slate-800 text-base">
                          Lesson {lessonNum}
                        </span>
                        <span className="text-xs text-slate-400 block">
                          {cards.length} cards active
                        </span>
                      </div>

                      <button
                        onClick={() => handleToggleLesson(lessonNum, !allSelected)}
                        className={`text-xs font-semibold px-3 py-1 rounded-full border transition ${
                          allSelected
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100'
                        }`}
                        id={`btn-toggle-lesson-${lessonNum}`}
                      >
                        {allSelected ? 'Deselect Lesson' : 'Select Lesson'}
                      </button>
                    </div>

                    {/* Chips Grid */}
                    <div className="flex flex-wrap gap-2">
                      {cards.map((card) => {
                        const isSelected = selectedIds.has(card.id);
                        const status = cardStatuses[card.id] || 'Needs Work';
                        
                        // Status colored indicator
                        let statusColor = 'bg-slate-100 text-slate-500';
                        if (status === 'Known') {
                          statusColor = 'bg-emerald-100 text-emerald-700';
                        } else if (status === 'Not Known') {
                          statusColor = 'bg-rose-100 text-rose-700';
                        } else if (status === 'Needs Work') {
                          statusColor = 'bg-amber-100 text-amber-700';
                        }

                        return (
                          <div
                            key={card.id}
                            onClick={() => handleToggleCard(card.id)}
                            id={`card-chip-${card.id}`}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium cursor-pointer select-none transition ${
                              isSelected
                                ? 'bg-indigo-900 border-indigo-950 text-white min-w-16 justify-center'
                                : 'bg-slate-50 border-slate-100 hover:border-slate-300 text-slate-700'
                            }`}
                          >
                            <div
                              className={`h-2 w-2 rounded-full ring-2 ring-white shrink-0 ${
                                isSelected ? 'bg-white' : status === 'Known' ? 'bg-emerald-500' : status === 'Not Known' ? 'bg-rose-500' : 'bg-amber-500'
                              }`}
                            />
                            <span className="font-display font-bold">{card.id}</span>
                            {!isSelected && (
                              <span className="text-[10px] text-slate-400 font-mono font-normal">
                                {status === 'Needs Work' ? 'Work' : status === 'Not Known' ? 'New' : 'Known'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
