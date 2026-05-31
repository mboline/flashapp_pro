import React, { useState } from 'react';
import { PracticeSession, CardStatus } from '../types';
import { allPhonograms } from '../phonogram_data';
import { Calendar, BarChart2, Star, HelpCircle, AlertCircle, CheckCircle, Flame, EyeOff, CircleAlert, ChevronDown, ChevronUp, RefreshCw, Trophy, Trash2 } from 'lucide-react';

interface PerformanceReportProps {
  sessions: PracticeSession[];
  cardStatuses: Record<string, CardStatus>;
  onSelectWeakCards: (weakIds: string[]) => void;
  onClearHistory?: () => void;
  onDeleteSession?: (sessionId: string) => void;
  isAuthenticated: boolean;
}

export default function PerformanceReport({
  sessions,
  cardStatuses,
  onSelectWeakCards,
  onClearHistory,
  onDeleteSession,
  isAuthenticated
}: PerformanceReportProps) {
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // Compute status aggregates
  const totalCardsCount = allPhonograms.length;
  let knownCount = 0;
  let needsWorkCount = 0;
  let notKnownCount = 0;
  let removedCount = 0;
  let untouchedCount = 0;

  allPhonograms.forEach((c) => {
    const status = cardStatuses[c.id];
    if (!status) {
      untouchedCount++;
    } else if (status === 'Known') {
      knownCount++;
    } else if (status === 'Needs Work') {
      needsWorkCount++;
    } else if (status === 'Not Known') {
      notKnownCount++;
    } else if (status === 'Remove') {
      removedCount++;
    }
  });

  const totalEvaluated = knownCount + needsWorkCount + notKnownCount + removedCount;
  const masteryPercentage = totalCardsCount > 0 ? Math.round((knownCount / (totalCardsCount - removedCount)) * 100) : 0;

  // Weakest cards finder (Not Known or Needs Work)
  const weakCards = allPhonograms.filter((p) => {
    const s = cardStatuses[p.id];
    return s === 'Not Known' || s === 'Needs Work';
  });

  const toggleSessionExpand = (id: string) => {
    setExpandedSessionId(expandedSessionId === id ? null : id);
  };

  // Format helper for relative time / date
  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  const hasSessions = sessions.length > 0;

  return (
    <div className="space-y-6">
      
      {/* Overview Dashboard Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        {/* Card 1: Mastery Rating */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-semibold block">Phonographic Mastery</span>
            <span className="font-display font-extrabold text-3xl text-slate-800">
              {masteryPercentage}%
            </span>
            <span className="text-[10px] text-emerald-600 font-semibold block bg-emerald-50 px-2 py-0.5 rounded-full w-max">
              {knownCount} of {totalCardsCount - removedCount} studied
            </span>
          </div>
          <div className="h-14 w-14 rounded-full border-4 border-slate-100 border-t-indigo-600 flex items-center justify-center font-display font-bold text-xs text-slate-600">
            M
          </div>
        </div>

        {/* Card 2: Streak or Consistency */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-semibold block">Practice Consistency</span>
            <span className="font-display font-extrabold text-3xl text-slate-800 flex items-center gap-1">
              {sessions.length}
              <span className="text-sm font-normal text-slate-500">sessions</span>
            </span>
            <span className="text-[10px] text-slate-500 font-medium block">
              {sessions.length > 0 ? 'Consistent logging' : 'No records yet'}
            </span>
          </div>
          <div className="p-3.5 bg-orange-50 text-orange-600 rounded-2xl">
            <Flame className="h-6 w-6 fill-current animate-pulse" />
          </div>
        </div>

        {/* Card 3: Saved Progress Indicators */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-semibold block">Sync Status</span>
            <span className="font-display font-bold text-lg text-slate-800 block">
              {isAuthenticated ? 'Cloud Synced' : 'Offline Mode'}
            </span>
            <span className="text-[10px] text-indigo-600 font-semibold block">
              {isAuthenticated ? 'Data loaded from Firebase' : 'Saved locally in SharedPreferences'}
            </span>
          </div>
          <div className={`p-3.5 rounded-2xl ${isAuthenticated ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
            <CheckCircle className="h-6 w-6" />
          </div>
        </div>

      </div>

      {/* Visual Classification Chart Donut Bar */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
        <h3 className="font-display font-semibold text-slate-800 text-base mb-4">
          Card Status Classifications
        </h3>

        {/* Horizontal layered stacked bar */}
        <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex mb-6">
          <div 
            style={{ width: `${(knownCount / totalCardsCount) * 100}%` }} 
            className="bg-emerald-500 h-full transition-all"
            title={`Known: ${knownCount}`}
          />
          <div 
            style={{ width: `${(needsWorkCount / totalCardsCount) * 100}%` }} 
            className="bg-amber-400 h-full transition-all"
            title={`Needs Work: ${needsWorkCount}`}
          />
          <div 
            style={{ width: `${(notKnownCount / totalCardsCount) * 100}%` }} 
            className="bg-rose-400 h-full transition-all"
            title={`Not Known: ${notKnownCount}`}
          />
          <div 
            style={{ width: `${(removedCount / totalCardsCount) * 100}%` }} 
            className="bg-slate-400 h-full transition-all"
            title={`Removed: ${removedCount}`}
          />
          <div 
            style={{ width: `${(untouchedCount / totalCardsCount) * 100}%` }} 
            className="bg-slate-200 h-full transition-all"
            title={`Untouched: ${untouchedCount}`}
          />
        </div>

        {/* Labels legend row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500 shrink-0" />
            <div>
              <span className="text-xs text-slate-500 font-semibold block">Known</span>
              <span className="text-base font-bold text-slate-800">{knownCount} <span className="text-xs text-slate-400 font-normal">cards</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-amber-400 shrink-0" />
            <div>
              <span className="text-xs text-slate-500 font-semibold block">Needs Work</span>
              <span className="text-base font-bold text-slate-800">{needsWorkCount} <span className="text-xs text-slate-400 font-normal">cards</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-rose-400 shrink-0" />
            <div>
              <span className="text-xs text-slate-500 font-semibold block">Not Known</span>
              <span className="text-base font-bold text-slate-800">{notKnownCount} <span className="text-xs text-slate-400 font-normal">cards</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-slate-400 shrink-0" />
            <div>
              <span className="text-xs text-slate-500 font-semibold block">Removed (Hidden)</span>
              <span className="text-base font-bold text-slate-800">{removedCount} <span className="text-xs text-slate-400 font-normal">cards</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-slate-200 shrink-0" />
            <div>
              <span className="text-xs text-slate-500 font-semibold block">Untouched</span>
              <span className="text-base font-bold text-slate-800">{untouchedCount} <span className="text-xs text-slate-400 font-normal">cards</span></span>
            </div>
          </div>
        </div>

        {/* Targeted action trigger for weak elements */}
        {weakCards.length > 0 && (
          <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div className="flex gap-2.5 items-start">
              <CircleAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-900">Target Weak Phonograms ({weakCards.length})</h4>
                <p className="text-xs text-amber-700">Practice your custom-classified difficult cards to improve speed.</p>
              </div>
            </div>
            <button
              onClick={() => onSelectWeakCards(weakCards.map((c) => c.id))}
              id="btn-practice-weak-words"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 transition text-white border-0 text-xs font-semibold rounded-lg text-center"
            >
              Choose Weak Cards for Practice
            </button>
          </div>
        )}
      </div>

      {/* Practice Log List */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-slate-800 text-base">
              Interactive Practice Logs
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Chronological record of how you did</p>
          </div>
          
          {onClearHistory && hasSessions && (
            <button
              onClick={onClearHistory}
              className="text-xs font-semibold text-slate-400 hover:text-rose-600 transition"
              id="btn-clear-history"
            >
              Clear Session Logs
            </button>
          )}
        </div>

        {!hasSessions ? (
          <div className="text-center py-10 bg-slate-50 rounded-xl border-dashed border border-slate-200">
            <Trophy className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <h4 className="font-display font-bold text-sm text-slate-600">No session reports yet</h4>
            <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
              Select cards, click "Start Practice Session", then click "Wrap up" to see your logs!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sessions.map((sess) => {
              const isExpanded = expandedSessionId === sess.id;
              
              // Calculate result tags count
              let sessKnown = 0;
              let sessNeedsWork = 0;
              let sessNotKnown = 0;
              let sessRemoved = 0;

              Object.values(sess.results || {}).forEach((s) => {
                if (s === 'Known') sessKnown++;
                if (s === 'Needs Work') sessNeedsWork++;
                if (s === 'Not Known') sessNotKnown++;
                if (s === 'Remove') sessRemoved++;
              });

              return (
                <div key={sess.id} className="py-4 first:pt-0 last:pb-0" id={`session-row-${sess.id}`}>
                  
                  {/* Row Header */}
                  <div 
                    onClick={() => toggleSessionExpand(sess.id)}
                    className="flex justify-between items-center cursor-pointer select-none group"
                    id={`session-header-${sess.id}`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-800 font-semibold text-sm">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        {formatDate(sess.endTime || sess.startTime)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                          {sess.cardCount} cards
                        </span>
                        <div className="flex gap-1.5 text-[10px] text-slate-400">
                          {sessKnown > 0 && <span className="font-semibold text-emerald-600">{sessKnown} Known</span>}
                          {sessNeedsWork > 0 && <span className="font-semibold text-amber-600">{sessNeedsWork} Needs Work</span>}
                          {sessNotKnown > 0 && <span className="font-semibold text-rose-600">{sessNotKnown} Not Known</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-sm font-display font-extrabold text-slate-800 block">
                          Score: {sess.score}%
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal mr-1">accuracy</span>
                      </div>
                      {onDeleteSession && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(sess.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                          title="Delete this practice session log"
                          id={`btn-delete-session-${sess.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400 group-hover:text-slate-600 shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-slate-600 shrink-0" />
                      )}
                    </div>
                  </div>

                  {/* Expandable Session Cards list details */}
                  {isExpanded && (
                    <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100 grid grid-cols-1 gap-2.5 transition-all">
                      <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                        Reported responses details:
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(sess.results || {}).map(([cId, res]) => {
                          let badgeBg = 'bg-slate-200 text-slate-700';
                          if (res === 'Known') badgeBg = 'bg-emerald-100 text-emerald-700 border border-emerald-200';
                          if (res === 'Needs Work') badgeBg = 'bg-amber-100 text-amber-700 border border-amber-200';
                          if (res === 'Not Known') badgeBg = 'bg-rose-100 text-rose-700 border border-rose-200';
                          if (res === 'Remove') badgeBg = 'bg-slate-100 text-slate-400 border border-slate-200';

                          return (
                            <span key={cId} className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-xl font-bold ${badgeBg}`}>
                              <span className="font-display text-slate-900 font-extrabold mr-0.5">{cId}</span>
                              <span className="font-mono text-[9px] uppercase font-normal">{res === 'Needs Work' ? 'Needs Work' : res === 'Not Known' ? 'Not Known' : res === 'Known' ? 'Known' : 'Removed'}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
