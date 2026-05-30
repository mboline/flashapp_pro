import React, { useState, useEffect } from 'react';
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

  return (
    <div className="min-h-screen bg-slate-50/50 pb-16 font-sans antialiased text-slate-600">
      
      {/* 1. Header Hero Banner Backdrop */}
      <header className="relative bg-gradient-to-r from-indigo-950 to-indigo-900 border-b border-indigo-950 overflow-hidden py-10">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/10 rounded-2xl text-white outline-indigo-200">
              <GraduationCap className="h-8 w-8 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-extrabold uppercase bg-indigo-50/10 text-indigo-200 px-2 py-0.5 rounded-full tracking-wider">
                  Est. Phonogram University
                </span>
                {syncingData && (
                  <span className="flex items-center gap-1 text-[10px] bg-sky-500/10 text-sky-300 font-semibold px-2 py-0.5 rounded-full border border-sky-400/20">
                    <Clock className="h-2.5 w-2.5 animate-spin" /> Fetching Firestore...
                  </span>
                )}
              </div>
              <h1 className="font-display font-extrabold text-white text-3xl sm:text-4xl tracking-tight mt-1">
                Phonogram Flashcards
              </h1>
              <span className="text-xs text-indigo-200 block mt-1 py-0.5 font-medium underline">
                Brought to you by Phonogram University
              </span>
            </div>
          </div>

          {/* User Sign-In Account Card Section */}
          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex items-center justify-between gap-4 md:w-80 shadow-inner">
            {authLoading ? (
              <div className="flex justify-center items-center w-full py-1">
                <span className="text-xs text-indigo-200 font-mono">Verifying student account...</span>
              </div>
            ) : user ? (
              <div className="flex items-center justify-between w-full">
                <div className="space-y-0.5 max-w-44 overflow-hidden">
                  <span className="text-[10px] font-mono text-indigo-300 font-bold block uppercase tracking-wide">
                    Sync Enabled ✔
                  </span>
                  <span className="text-white font-bold text-xs block truncate">
                    {user.displayName || 'Spelling Student'}
                  </span>
                  <span className="text-indigo-200 text-[10px] block truncate font-mono">
                    {user.email}
                  </span>
                </div>
                <button
                  onClick={handleSignOut}
                  id="btn-sign-out"
                  className="p-2.5 bg-white/10 hover:bg-white/20 hover:text-rose-300 text-white rounded-xl transition duration-150"
                  title="Sign out / Close sync"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col w-full gap-2 items-start justify-center">
                <span className="text-[10px] font-mono text-indigo-200/80 leading-relaxed block">
                  Sign in with Google to enable real-time cloud sync across your devices!
                </span>
                <button
                  onClick={handleSignIn}
                  id="btn-sign-in"
                  className="w-full flex items-center justify-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white border-none rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  <LogIn className="h-3 w-3" /> Connect Account
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. Primary Navigation Mode Bar (Only visible when not playing review) */}
      {!isPlaying && (
        <section className="bg-white border-b border-slate-100 shadow-xs sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex gap-2 py-3 overflow-x-auto">
              
              <button
                onClick={() => setActiveTab('lessons')}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'lessons'
                    ? 'bg-indigo-900 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
                id="tab-lessons-selector"
              >
                <BookOpen className="h-4 w-4" />
                Card selector grid
              </button>

              <button
                onClick={() => setActiveTab('reports')}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'reports'
                    ? 'bg-indigo-900 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
                id="tab-reports"
              >
                <BarChart2 className="h-4 w-4" />
                Performance Report Logs
              </button>

            </div>
          </div>
        </section>
      )}

      {/* Warning/Notification Alert Bar */}
      {errorNotification && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-rose-50 border border-rose-100 p-3.5 rounded-xl text-rose-700 text-xs flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
            {errorNotification}
          </div>
        </div>
      )}

      {/* 3. Navigation View Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
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
