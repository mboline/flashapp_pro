import React, { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { collection, doc, getDocs, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { allPhonograms } from './phonogram_data';
import { CardStatus, PracticeSession, UserCardStatus } from './types';

// Icons for gorgeous navigation header & banner
import { 
  BookOpen, 
  BarChart2, 
  Sparkles, 
  Volume2, 
  LogOut, 
  LogIn, 
  CheckCircle, 
  Info,
  Clock,
  ShieldAlert,
  GraduationCap
} from 'lucide-react';

import LessonSelector from './components/LessonSelector';
import ReviewSession from './components/ReviewSession';
import PerformanceReport from './components/PerformanceReport';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lessons' | 'reports'>('lessons');
  const [isPlaying, setIsPlaying] = useState(false);

  // Card statuses state: ID -> 'Known', 'Needs Work', 'Not Known', 'Remove'
  const [cardStatuses, setCardStatuses] = useState<Record<string, CardStatus>>({});
  // Historical sessions lists
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  // Practice session card IDs selected
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [randomize, setRandomize] = useState(false);

  // Sync / Loader states
  const [syncingData, setSyncingData] = useState(false);
  const [errorNotification, setErrorNotification] = useState<string | null>(null);

  // 1. Monitor Authentication State Change
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      
      if (currentUser) {
        // Fetch cloud data & migrate if needed
        await loadCloudData(currentUser.uid);
      } else {
        // Load offline data from localStorage
        loadLocalOfflineData();
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Local SharedPreferences Emulator
  const loadLocalOfflineData = () => {
    try {
      const localStatuses = localStorage.getItem('phonogram_statuses');
      const localSessions = localStorage.getItem('phonogram_sessions');

      if (localStatuses) {
        setCardStatuses(JSON.parse(localStatuses));
      } else {
        setCardStatuses({});
      }

      if (localSessions) {
        setSessions(JSON.parse(localSessions));
      } else {
        setSessions([]);
      }
    } catch (e) {
      console.error('Error reading localStorage SharedPreferences:', e);
    }
  };

  // 3. Load Cloud State from Firestore and trigger migration if required
  const loadCloudData = async (uid: string) => {
    setSyncingData(true);
    setErrorNotification(null);
    try {
      // Fetch card classifications
      const cardsPath = `users/${uid}/cards`;
      const cardSnap = await getDocs(collection(db, cardsPath)).catch((err) => {
        handleFirestoreError(err, OperationType.LIST, cardsPath);
      });

      const dbStatuses: Record<string, CardStatus> = {};
      cardSnap.forEach((doc) => {
        const data = doc.data();
        if (data.status) {
          dbStatuses[doc.id] = data.status;
        }
      });

      // Fetch practice logs
      const sessionsPath = `users/${uid}/sessions`;
      const sessionSnap = await getDocs(collection(db, sessionsPath)).catch((err) => {
        handleFirestoreError(err, OperationType.LIST, sessionsPath);
      });

      const dbSessions: PracticeSession[] = [];
      sessionSnap.forEach((doc) => {
        const data = doc.data();
        // Handle conversion of timestamps safely
        const start = data.startTime instanceof Timestamp ? data.startTime.toDate().toISOString() : data.startTime;
        const end = data.endTime instanceof Timestamp ? data.endTime.toDate().toISOString() : data.endTime;
        
        dbSessions.push({
          id: doc.id,
          startTime: start,
          endTime: end,
          cardCount: data.cardCount || 0,
          results: data.results || {},
          score: data.score || 0
        });
      });

      // Sort sessions newest first
      dbSessions.sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());

      // Read local storage check for merging
      const localStatusesStr = localStorage.getItem('phonogram_statuses');
      const localSessionsStr = localStorage.getItem('phonogram_sessions');

      if (localStatusesStr || localSessionsStr) {
        // Seamless silent merge migration from offline guest back to Firebase Account
        const mergedStatuses = { ...dbStatuses };
        if (localStatusesStr) {
          const lStatuses = JSON.parse(localStatusesStr);
          Object.assign(mergedStatuses, lStatuses);
        }

        // Write merged card classifications back to Cloud
        for (const [cId, status] of Object.entries(mergedStatuses)) {
          if (dbStatuses[cId] !== status) {
            const cardRef = doc(db, 'users', uid, 'cards', cId);
            await setDoc(cardRef, {
              status,
              updatedAt: new Date()
            }).catch((err) => {
              handleFirestoreError(err, OperationType.CREATE, `users/${uid}/cards/${cId}`);
            });
          }
        }

        // Same for sessions
        const mergedSessions = [...dbSessions];
        if (localSessionsStr) {
          const lSessions: PracticeSession[] = JSON.parse(localSessionsStr);
          for (const sess of lSessions) {
            // Write local session back to Cloud
            const sessRef = doc(db, 'users', uid, 'sessions', sess.id);
            await setDoc(sessRef, {
              startTime: new Date(sess.startTime),
              endTime: new Date(sess.endTime),
              cardCount: sess.cardCount,
              results: sess.results,
              score: sess.score
            }).catch((err) => {
              handleFirestoreError(err, OperationType.CREATE, `users/${uid}/sessions/${sess.id}`);
            });
            mergedSessions.push(sess);
          }
        }

        mergedSessions.sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());

        // Clear local storage migration sources to ensure only single run
        localStorage.removeItem('phonogram_statuses');
        localStorage.removeItem('phonogram_sessions');

        setCardStatuses(mergedStatuses);
        setSessions(mergedSessions);
      } else {
        setCardStatuses(dbStatuses);
        setSessions(dbSessions);
      }
    } catch (e: any) {
      console.error('Failed to sync metadata with database:', e);
      setErrorNotification('Data loading completed with local limitations.');
      loadLocalOfflineData();
    } finally {
      setSyncingData(false);
    }
  };

  // 4. Save Card status safely (both local/remote depending on log context)
  const saveCardStatus = async (cardId: string, status: CardStatus) => {
    // 1. Update React Local state
    const nextStatuses = { ...cardStatuses, [cardId]: status };
    setCardStatuses(nextStatuses);

    // 2. Save depending on session auth context
    if (user) {
      try {
        const cardRef = doc(db, 'users', user.uid, 'cards', cardId);
        await setDoc(cardRef, {
          status,
          updatedAt: new Date()
        }).catch((err) => {
          handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/cards/${cardId}`);
        });
      } catch (e) {
        console.error('Error syncing individual card status to Firebase:', e);
      }
    } else {
      localStorage.setItem('phonogram_statuses', JSON.stringify(nextStatuses));
    }
  };

  // 5. Complete whole practice session & log metrics
  const handleSessionFinish = async (results: Record<string, CardStatus>, score: number) => {
    const sessionId = 'session_' + Math.random().toString(36).substring(2, 11);
    const endTimeStr = new Date().toISOString();
    const startTimeStr = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // simulate 5 min reviews

    const newSession: PracticeSession = {
      id: sessionId,
      startTime: startTimeStr,
      endTime: endTimeStr,
      cardCount: Object.keys(results).length,
      results,
      score
    };

    const nextSessions = [newSession, ...sessions];
    setSessions(nextSessions);

    if (user) {
      try {
        const sessRef = doc(db, 'users', user.uid, 'sessions', sessionId);
        await setDoc(sessRef, {
          startTime: new Date(newSession.startTime),
          endTime: new Date(newSession.endTime),
          cardCount: newSession.cardCount,
          results: newSession.results,
          score: newSession.score
        }).catch((err) => {
          handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/sessions/${sessionId}`);
        });
      } catch (e) {
        console.error('Error logging practice session in Cloud:', e);
      }
    } else {
      localStorage.setItem('phonogram_sessions', JSON.stringify(nextSessions));
    }

    // Terminate practice mode and route directly to active reports to let them see progress
    setIsPlaying(false);
    setActiveTab('reports');
    // Clear selections helper
    setSelectedCardIds(new Set());
  };

  // 6. Restore all cards currently marked "Remove" to "Known" status
  const handleRestoreRemoved = async () => {
    let count = 0;
    const nextStatuses = { ...cardStatuses };
    
    for (const card of allPhonograms) {
      if (nextStatuses[card.id] === 'Remove') {
        nextStatuses[card.id] = 'Known';
        count++;

        if (user) {
          try {
            const cardRef = doc(db, 'users', user.uid, 'cards', card.id);
            await setDoc(cardRef, {
              status: 'Known',
              updatedAt: new Date()
            }).catch((err) => {
              handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/cards/${card.id}`);
            });
          } catch (e) {
            console.error('Restore sync to Cloud failed:', e);
          }
        }
      }
    }

    if (count > 0) {
      setCardStatuses(nextStatuses);
      if (!user) {
        localStorage.setItem('phonogram_statuses', JSON.stringify(nextStatuses));
      }
      alert(`Restored ${count} phonograms back to "Known" review lists!`);
    } else {
      alert('No hidden/removed phonograms were identified to restore.');
    }
  };

  // 7. Quick load weak cards action
  const handleSelectWeakCards = (weakIds: string[]) => {
    setSelectedCardIds(new Set(weakIds));
    setActiveTab('lessons');
    // Scroll smoothly to selector
    window.scrollTo({ top: 350, behavior: 'smooth' });
  };

  // 8. Auth commands
  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error('Google Sign-In sequence rejected:', e);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setSessions([]);
      setCardStatuses({});
    } catch (e) {
      console.error('Sign-out failed:', e);
    }
  };

  // Get current active session cards
  const sessionActiveCards = allPhonograms.filter((p) => selectedCardIds.has(p.id));
  const randomizedSessionActiveCards = randomize ? [...sessionActiveCards].sort(() => Math.random() - 0.5) : sessionActiveCards;

  // Total visible/active phonograms (not removed)
  const activePhonograms = useMemo(() => {
    return allPhonograms.filter((p) => cardStatuses[p.id] !== 'Remove');
  }, [cardStatuses]);

  const isAllSelected = activePhonograms.length > 0 && selectedCardIds.size === activePhonograms.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCardIds(new Set(activePhonograms.map((p) => p.id)));
    } else {
      setSelectedCardIds(new Set());
    }
  };

  return (
    <div className="min-h-screen bg-white pb-16 font-sans antialiased text-slate-800">
      
      {/* 1. Sleek, unobtrusive Top Student Sync Bar */}
      <div className="bg-slate-50 border-b border-slate-200/80 py-2 px-4 sm:px-6 lg:px-8 text-xs">
        <div className="flex items-center justify-between font-medium text-slate-500 w-full">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="tracking-tight">Phonogram Student Portal</span>
            {syncingData && <span className="text-[10px] text-indigo-500 font-mono animate-pulse ml-2">(Syncing with Firestore...)</span>}
          </div>
          <div>
            {authLoading ? (
              <span className="text-slate-400">Verifying secure student access...</span>
            ) : user ? (
              <div className="flex items-center gap-3">
                <span className="text-slate-700 font-semibold">{user.displayName || 'Spelling Student'} ({user.email})</span>
                <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Sync Active</span>
                <button
                  onClick={handleSignOut}
                  id="btn-top-sign-out"
                  className="text-rose-600 hover:text-rose-800 font-semibold underline cursor-pointer"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                id="btn-top-sign-in"
                className="text-indigo-650 hover:text-indigo-850 font-bold underline cursor-pointer"
              >
                Sign in with Google to sync cards
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Full-bleed Brand Panoramic Education Banner */}
      {!isPlaying && (
        <div className="w-full overflow-hidden select-none relative bg-slate-100 border-b border-slate-200">
          <img
            src="https://phonogramuniversity.com/wp-content/uploads/2023/03/Banner1.webp"
            alt="Phonogram University Banner"
            className="w-full h-auto max-h-[150px] sm:max-h-[180px] md:max-h-[220px] object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      {/* 3. Streamlined Clean Header Container */}
      {!isPlaying && (
        <header className="bg-white border-b border-slate-100 py-6 px-4 sm:px-6 lg:px-8">
          <div className="w-full">
            <h1 className="font-sans font-bold text-[#0F172A] text-2xl sm:text-3xl tracking-tight">
              Phonogram Flashcards
            </h1>
            <span className="text-xs text-slate-500 block mt-0.5">
              Brought to you by <a href="https://www.phonogramuniversity.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-medium hover:underline">Phonogram University</a>
            </span>

            {/* Quick View Navigation Tabs */}
            <div className="flex gap-4 mt-4 border-b border-slate-100 pb-1 text-sm">
              <button
                onClick={() => setActiveTab('lessons')}
                className={`font-semibold pb-1.5 border-b-2 transition ${
                  activeTab === 'lessons' ? 'text-indigo-900 border-indigo-900 font-bold' : 'text-slate-400 border-transparent hover:text-slate-600'
                }`}
                id="tab-selector-grid"
              >
                Card Selector Grid
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`font-semibold pb-1.5 border-b-2 transition ${
                  activeTab === 'reports' ? 'text-indigo-900 border-indigo-900 font-bold' : 'text-slate-400 border-transparent hover:text-slate-600'
                }`}
                id="tab-selector-reports"
              >
                Performance Report Logs
              </button>
            </div>

            {/* Branded Section configurations from screenshot when on grid page */}
            {activeTab === 'lessons' && (
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-6 flex-wrap text-sm">
                  <button
                    disabled={selectedCardIds.size === 0}
                    onClick={() => setIsPlaying(true)}
                    id="btn-start-session"
                    className="px-6 py-2 bg-[#E2E8F0] hover:bg-[#CBD5E1] disabled:bg-[#E2E8F0]/80 text-[#334155] disabled:text-[#94A3B8] font-bold rounded-md transition cursor-pointer disabled:cursor-not-allowed text-xs sm:text-sm shadow-xs border border-transparent"
                  >
                    Start Session
                  </button>
                  
                  <label className="flex items-center gap-2 font-medium text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-650 accent-indigo-650 cursor-pointer"
                      id="checkbox-select-all"
                    />
                    <span>Select All</span>
                  </label>

                  <label className="flex items-center gap-2 font-medium text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={randomize}
                      onChange={(e) => setRandomize(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-650 accent-indigo-650 cursor-pointer"
                      id="checkbox-toggle-randomize"
                    />
                    <span>Randomize</span>
                  </label>
                </div>

                <div>
                  <button
                    onClick={handleRestoreRemoved}
                    className="text-[#2563EB] hover:text-[#1D4ED8] underline text-xs font-medium cursor-pointer transition"
                    id="btn-restore-removed"
                  >
                    Restore removed phonograms
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>
      )}

      {/* Warning/Notification Alert Bar */}
      {errorNotification && (
        <div className="w-full px-4 sm:px-6 lg:px-8 mt-4 animate-fade-in">
          <div className="bg-rose-50 border border-rose-100 p-3.5 rounded-xl text-rose-700 text-xs flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
            {errorNotification}
          </div>
        </div>
      )}

      {/* 4. Navigation View Body */}
      <main className="w-full px-4 sm:px-6 lg:px-8 mt-6">
        {isPlaying ? (
          /* ACTIVE Review sequence display */
          <ReviewSession
            cards={randomizedSessionActiveCards}
            cardStatuses={cardStatuses}
            onSaveStatus={saveCardStatus}
            onExit={() => setIsPlaying(false)}
            onSessionFinish={handleSessionFinish}
          />
        ) : (
          /* Normal Tab Displays */
          <div>
            {activeTab === 'lessons' ? (
              <LessonSelector
                selectedIds={selectedCardIds}
                setSelectedIds={setSelectedCardIds}
                randomize={randomize}
                setRandomize={setRandomize}
                cardStatuses={cardStatuses}
                onStartSession={() => setIsPlaying(true)}
                onRestoreRemoved={handleRestoreRemoved}
              />
            ) : (
              <PerformanceReport
                sessions={sessions}
                cardStatuses={cardStatuses}
                onSelectWeakCards={handleSelectWeakCards}
                onClearHistory={
                  !user 
                    ? () => {
                        localStorage.removeItem('phonogram_sessions');
                        setSessions([]);
                      } 
                    : undefined
                }
                isAuthenticated={!!user}
              />
            )}
          </div>
        )}
      </main>

    </div>
  );
}
