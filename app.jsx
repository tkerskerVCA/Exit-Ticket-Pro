import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  onSnapshot, 
  query, 
  deleteDoc,
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  Users, 
  Send, 
  BookOpen, 
  BarChart3, 
  Sparkles, 
  Trash2, 
  LogOut,
  ChevronRight,
  ClipboardCheck,
  MessageSquare,
  Trophy,
  CheckCircle2,
  Circle,
  Square,
  CheckSquare,
  AlertTriangle,
  Loader2,
  Plus,
  X,
  Eye,
  EyeOff,
  Star,
  RefreshCcw
} from 'lucide-react';

// --- Firebase Configuration ---
// Using environment variables for the preview environment, with fallbacks for manual deployment
// const firebaseConfig = typeof __firebase_config !== 'undefined' 
//  ? JSON.parse(__firebase_config) 
//  : {
//      apiKey: "YOUR_FIREBASE_API_KEY",
//     authDomain: "YOUR_PROJECT.firebaseapp.com",
//      projectId: "YOUR_PROJECT_ID",
//      storageBucket: "YOUR_PROJECT.appspot.com",
//      messagingSenderId: "YOUR_SENDER_ID",
//      appId: "YOUR_APP_ID"
//    };
const firebaseConfig = {
  apiKey: "AIzaSyAx7dvrZPcZWZFoRsATNz61kEtsulROAns",
  authDomain: "gen-lang-client-0875595529.firebaseapp.com",
  projectId: "gen-lang-client-0875595529",
  storageBucket: "gen-lang-client-0875595529.firebasestorage.app",
  messagingSenderId: "726631748325",
  appId: "1:726631748325:web:e0527d9685c1fadc323a0c",
  measurementId: "G-SN4JM56Z4N"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'exit-ticket-pro-v2'; 

// --- Gemini API Helper ---
// Recommendation: Paste your key from aistudio.google.com here!
const apiKey = ""; 
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";

const fetchConfusionAnalysis = async (question, responses) => {
  if (!apiKey) {
    return "## API Key Missing\n- Please add your Gemini API Key to the code to see AI insights.";
  }

  const responsesText = responses.map(r => `- Student: ${r.studentName}, Answer: ${Array.isArray(r.answer) ? r.answer.join(', ') : r.answer}`).join('\n');
  const systemPrompt = `You are a pedagogical expert. Analyze these exit ticket responses and provide feedback in exactly three sections using clear bullet points:
  
  1. POINTS TO RETEACH: Identify specific concepts or skills where the class showed significant gaps.
  2. CELEBRATION POINTS: List what the class mastered or positive patterns observed.
  3. NEXT STEPS: A short 1-2 sentence recommendation for tomorrow's opening activity.

  Be encouraging, professional, and clear.`;
  
  const userQuery = `Question: "${question.text}" (Type: ${question.type})\nCorrect Answer(s): ${Array.isArray(question.correct) ? question.correct.join(', ') : question.correct}\n\nStudent Responses:\n${responsesText}`;

  let retries = 0;
  const maxRetries = 5;
  
  while (retries <= maxRetries) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userQuery }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] }
        })
      });
      
      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis generated.";
    } catch (err) {
      if (retries === maxRetries) throw err;
      const delay = Math.pow(2, retries) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      retries++;
    }
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); 
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // RULE 3: Auth Before Queries - Initialize Auth FIRST
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // RULE 3: Guard Firestore operations with 'if (!user) return;'
  useEffect(() => {
    if (!user) return;
    
    // RULE 1: Strict Paths
    const questionRef = doc(db, 'artifacts', appId, 'public', 'data', 'sessions', 'active');
    const responsesRef = collection(db, 'artifacts', appId, 'public', 'data', 'responses');

    const unsubQuestion = onSnapshot(questionRef, (docSnap) => {
      if (docSnap.exists()) {
        setCurrentQuestion(docSnap.data());
      } else {
        setCurrentQuestion(null);
      }
    }, (err) => console.error("Question snapshot error:", err));

    const unsubResponses = onSnapshot(responsesRef, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setResponses(data);
    }, (err) => console.error("Responses snapshot error:", err));

    return () => {
      unsubQuestion();
      unsubResponses();
    };
  }, [user]);

  const startNewQuestion = async (qData) => {
    if (!user) return;
    const sessionRef = doc(db, 'artifacts', appId, 'public', 'data', 'sessions', 'active');
    const responsesRef = collection(db, 'artifacts', appId, 'public', 'data', 'responses');
    
    const oldDocs = await getDocs(responsesRef);
    await Promise.all(oldDocs.docs.map(d => deleteDoc(d.ref)));

    await setDoc(sessionRef, {
      ...qData,
      active: true,
      createdAt: serverTimestamp(),
      analysis: ""
    });
    setHasSubmitted(false);
  };

  const endSession = async () => {
    if (!user) return;
    const sessionRef = doc(db, 'artifacts', appId, 'public', 'data', 'sessions', 'active');
    await deleteDoc(sessionRef);
  };

  const submitResponse = async (answer) => {
    if (!studentName.trim() || !user) return;
    const responsesRef = collection(db, 'artifacts', appId, 'public', 'data', 'responses');
    await addDoc(responsesRef, {
      answer,
      studentName,
      timestamp: serverTimestamp(),
      uid: user.uid
    });
    setHasSubmitted(true);
  };

  const runAnalysis = async () => {
    if (!user || !currentQuestion || responses.length === 0) return;
    setIsAnalyzing(true);
    try {
      const result = await fetchConfusionAnalysis(currentQuestion, responses);
      const sessionRef = doc(db, 'artifacts', appId, 'public', 'data', 'sessions', 'active');
      await setDoc(sessionRef, { ...currentQuestion, analysis: String(result) }, { merge: true });
    } catch (err) {
      console.error("Analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    </div>
  );

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="space-y-2">
            <div className="inline-block p-4 bg-indigo-600 text-white rounded-[2rem] mb-4 shadow-xl shadow-indigo-100">
              <Trophy className="w-10 h-10" />
            </div>
            <h1 className="text-5xl font-black text-slate-900 tracking-tight">Exit Ticket Pro</h1>
            <p className="text-slate-500 font-medium text-lg">Measure mastery in real-time.</p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <button onClick={() => setRole('teacher')} className="p-8 bg-white border-2 border-transparent hover:border-indigo-500 rounded-[2.5rem] shadow-sm transition-all text-left group">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors"><Users className="w-7 h-7" /></div>
                <div><h3 className="font-bold text-xl text-slate-900">Teacher</h3><p className="text-sm text-slate-400">Manage class and get AI feedback.</p></div>
              </div>
            </button>
            <button onClick={() => setRole('student')} className="p-8 bg-white border-2 border-transparent hover:border-emerald-500 rounded-[2.5rem] shadow-sm transition-all text-left group">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-colors"><BookOpen className="w-7 h-7" /></div>
                <div><h3 className="font-bold text-xl text-slate-900">Student</h3><p className="text-sm text-slate-400">Share your mastery insights.</p></div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${role === 'teacher' ? 'bg-indigo-600' : 'bg-emerald-600'} text-white`}><Sparkles className="w-5 h-5" /></div>
          <span className="font-black text-xl tracking-tight">ExitTicket</span>
          <span className={`ml-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${role === 'teacher' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>{role}</span>
        </div>
        <button onClick={() => setRole(null)} className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-sm font-bold transition-colors">
          <LogOut className="w-4 h-4" /> Switch Role
        </button>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        {role === 'teacher' ? (
          <TeacherView 
            currentQuestion={currentQuestion} 
            responses={responses} 
            startNewQuestion={startNewQuestion} 
            endSession={endSession} 
            runAnalysis={runAnalysis} 
            isAnalyzing={isAnalyzing} 
          />
        ) : (
          <StudentView 
            currentQuestion={currentQuestion} 
            submitResponse={submitResponse} 
            studentName={studentName} 
            setStudentName={setStudentName} 
            hasSubmitted={hasSubmitted} 
          />
        )}
      </main>
    </div>
  );
}

function TeacherView({ currentQuestion, responses, startNewQuestion, endSession, runAnalysis, isAnalyzing }) {
  const [qType, setQType] = useState('single');
  const [qText, setQText] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [correctIndices, setCorrectIndices] = useState([]);
  const [showNames, setShowNames] = useState(true);

  const masteryStats = useMemo(() => {
    if (!currentQuestion || responses.length === 0 || currentQuestion.type === 'open') return null;
    let correctCount = 0;
    responses.forEach(r => {
      if (currentQuestion.type === 'single') {
        if (r.answer === currentQuestion.correct[0]) correctCount++;
      } else {
        const isMatch = Array.isArray(r.answer) && 
                        r.answer.length === currentQuestion.correct.length &&
                        r.answer.every(val => currentQuestion.correct.includes(val));
        if (isMatch) correctCount++;
      }
    });
    const percentage = Math.round((correctCount / responses.length) * 100);
    return { percentage, count: correctCount };
  }, [currentQuestion, responses]);

  if (!currentQuestion) {
    return (
      <div className="max-w-3xl mx-auto bg-white rounded-[3rem] shadow-2xl shadow-slate-200/50 p-12 border border-slate-100">
        <h2 className="text-4xl font-black mb-10 text-slate-900 tracking-tight">Create Exit Ticket</h2>
        <div className="space-y-8">
          <div className="flex p-1.5 bg-slate-100 rounded-[1.5rem]">
            {['single', 'multiple', 'open'].map(t => (
              <button key={t} onClick={() => { setQType(t); setOptions(['', '']); setCorrectIndices([]); }} className={`flex-1 py-4 rounded-2xl text-sm font-black transition-all capitalize ${qType === t ? 'bg-white text-indigo-600 shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}>
                {t === 'single' ? 'Single Choice' : t === 'multiple' ? 'Multiple Choice' : 'Open Response'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] px-2">Prompt</label>
            <textarea value={qText} onChange={(e) => setQText(e.target.value)} placeholder="e.g., Explain the difference between weather and climate..." className="w-full h-32 p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-indigo-500 transition-all text-xl font-medium resize-none shadow-inner" />
          </div>

          {qType !== 'open' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between px-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Options & Keys</label>
                <button onClick={() => setOptions([...options, ''])} className="text-indigo-600 hover:text-indigo-700 p-2 bg-indigo-50 rounded-xl transition-all"><Plus className="w-5 h-5" /></button>
              </div>
              {options.map((opt, i) => (
                <div key={i} className="flex gap-4 items-center group">
                  <button 
                    onClick={() => {
                      if (qType === 'single') setCorrectIndices([i]);
                      else setCorrectIndices(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
                    }}
                    className={`p-4 rounded-2xl border-2 transition-all shadow-sm ${correctIndices.includes(i) ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-200' : 'bg-slate-50 border-slate-100 text-slate-300 hover:border-indigo-200'}`}
                  >
                    {correctIndices.includes(i) ? <CheckCircle2 className="w-6 h-6" /> : (qType === 'single' ? <Circle className="w-6 h-6" /> : <Square className="w-5 h-5" />)}
                  </button>
                  <input value={opt} onChange={(e) => { const n = [...options]; n[i] = e.target.value; setOptions(n); }} placeholder={`Option ${i+1}`} className="flex-1 p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all font-bold text-lg" />
                  {options.length > 2 && <button onClick={() => setOptions(options.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-500 p-2"><X className="w-6 h-6" /></button>}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => startNewQuestion({ text: qText, type: qType, options: qType === 'open' ? [] : options, correct: qType === 'open' ? [] : correctIndices.map(i => options[i]) })}
            disabled={!qText.trim() || (qType !== 'open' && correctIndices.length === 0)}
            className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white rounded-[2rem] font-black text-2xl flex items-center justify-center gap-3 transition-all shadow-2xl shadow-indigo-200 mt-6"
          >
            Go Live <ChevronRight className="w-7 h-7" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex flex-col lg:flex-row gap-8 items-stretch">
        <div className="flex-1 bg-white rounded-[3rem] shadow-sm border border-slate-100 p-10 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-lg uppercase tracking-widest">Live Session</span>
              <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold">
                <Users className="w-4 h-4" /> {responses.length} Active Students
              </div>
            </div>
            <h2 className="text-3xl font-black text-slate-900 leading-tight mb-8">{currentQuestion.text}</h2>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={endSession} className="px-6 py-3 bg-red-50 text-red-600 rounded-2xl text-xs font-black uppercase transition-all flex items-center gap-2 hover:bg-red-100">
              <Trash2 className="w-4 h-4" /> End Lesson
            </button>
            <button onClick={runAnalysis} className="px-6 py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase transition-all flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-100">
              <RefreshCcw className="w-4 h-4" /> Update Analysis
            </button>
          </div>
        </div>

        {masteryStats && (
          <div className={`w-full lg:w-96 rounded-[3rem] p-10 text-white flex flex-col items-center justify-center text-center transition-all duration-1000 transform hover:scale-105 ${masteryStats.percentage >= 80 ? 'bg-emerald-500 shadow-2xl shadow-emerald-200' : 'bg-slate-900 shadow-xl'}`}>
            <div className="text-7xl font-black mb-2 tracking-tighter">{masteryStats.percentage}%</div>
            <div className="text-sm font-black uppercase tracking-[0.2em] opacity-80 mb-6">Class Mastery</div>
            <div className="w-full bg-white/20 rounded-full h-3 mb-6 relative overflow-hidden">
               <div className="absolute top-0 left-0 h-full bg-white transition-all duration-1000" style={{ width: `${masteryStats.percentage}%` }} />
            </div>
            {masteryStats.percentage >= 80 ? (
              <div className="flex items-center gap-2 text-sm font-black bg-white text-emerald-600 px-6 py-3 rounded-2xl animate-bounce shadow-lg">
                <Trophy className="w-5 h-5" /> Goal Surpassed!
              </div>
            ) : (
              <p className="text-xs font-bold text-slate-400 italic">Target: 80%</p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        <div className="xl:col-span-2 space-y-6">
          <div className="flex items-center justify-between px-4">
            <h3 className="font-black text-2xl flex items-center gap-3 text-slate-800">
              <MessageSquare className="w-6 h-6 text-indigo-400" /> Responses
            </h3>
            <button 
              onClick={() => setShowNames(!showNames)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${showNames ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-600'}`}
            >
              {showNames ? <><Eye className="w-4 h-4" /> Showing Names</> : <><EyeOff className="w-4 h-4" /> Anonymous Mode</>}
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {responses.map((resp) => {
              const isCorrect = masteryStats && (currentQuestion.type === 'single' ? resp.answer === currentQuestion.correct[0] : (Array.isArray(resp.answer) && resp.answer.every(a => currentQuestion.correct.includes(a))));
              return (
                <div key={resp.id} className={`bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden transition-all hover:shadow-md hover:-translate-y-1`}>
                  {masteryStats && <div className={`absolute top-0 left-0 w-1.5 h-full ${isCorrect ? 'bg-emerald-500' : 'bg-red-400 opacity-30'}`} />}
                  <div className="mb-4">
                    <p className="text-slate-800 font-bold text-lg leading-relaxed">
                      {Array.isArray(resp.answer) ? resp.answer.join(', ') : resp.answer}
                    </p>
                  </div>
                  {showNames && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xs">
                        {resp.studentName.charAt(0)}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{resp.studentName}</span>
                    </div>
                  )}
                  {!showNames && (
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-300 italic">
                      Student Anonymous
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="font-black text-2xl px-4 flex items-center gap-3 text-slate-800">
            <Sparkles className="w-6 h-6 text-indigo-400" /> Teacher Insights
          </h3>
          <div className="bg-slate-900 rounded-[3rem] p-10 text-white min-h-[500px] shadow-2xl relative overflow-hidden">
            {isAnalyzing ? (
              <div className="h-full flex flex-col items-center justify-center space-y-6">
                <Loader2 className="w-20 h-20 animate-spin text-indigo-400" />
                <p className="text-indigo-200 font-black tracking-widest text-sm uppercase animate-pulse">De-coding student gaps...</p>
              </div>
            ) : currentQuestion?.analysis ? (
              <div className="space-y-8 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                {currentQuestion.analysis.split('\n').map((line, i) => {
                  const isHeader = line.includes('POINTS TO RETEACH') || line.includes('CELEBRATION POINTS') || line.includes('NEXT STEPS');
                  const isBullet = line.trim().startsWith('-') || line.trim().startsWith('*');
                  
                  if (isHeader) return <h4 key={i} className="text-indigo-400 font-black text-xs uppercase tracking-widest mt-6 first:mt-0">{line.replace(':', '')}</h4>;
                  if (isBullet) return <li key={i} className="text-slate-200 text-sm leading-relaxed mb-2 ml-4 list-disc marker:text-indigo-500 font-medium">{line.replace('-', '').replace('*', '').trim()}</li>;
                  return <p key={i} className="text-slate-300 text-sm leading-relaxed mb-4 font-medium">{line}</p>;
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <AlertTriangle className="w-16 h-16 text-indigo-400/50 mb-6" />
                <h4 className="font-black text-2xl mb-4 tracking-tight">Generate Map</h4>
                <button onClick={runAnalysis} disabled={responses.length === 0} className="w-full py-5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-20 text-white rounded-[1.5rem] font-black text-lg transition-all shadow-xl shadow-indigo-900/40">Analyze Feedback</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentView({ currentQuestion, submitResponse, studentName, setStudentName, hasSubmitted }) {
  const [answer, setAnswer] = useState(null);

  if (!currentQuestion) {
    return (
      <div className="max-w-2xl mx-auto mt-24 text-center">
        <div className="inline-block p-10 bg-white shadow-2xl shadow-indigo-100 rounded-[3rem] text-indigo-200 mb-8 animate-pulse">
          <BookOpen className="w-20 h-20" />
        </div>
        <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Class in Session</h2>
        <p className="text-slate-400 font-bold text-xl max-w-sm mx-auto leading-relaxed italic">Hang tight! Your teacher is getting the exit ticket ready.</p>
      </div>
    );
  }

  if (!studentName) {
    return (
      <div className="max-w-md mx-auto mt-20 bg-white rounded-[3rem] shadow-2xl p-12 border border-slate-100 transform hover:scale-[1.02] transition-all">
        <h2 className="text-3xl font-black mb-2 text-slate-900 tracking-tight">Welcome!</h2>
        <div className="space-y-6">
          <input autoFocus type="text" placeholder="Your Full Name" onKeyDown={(e) => e.key === 'Enter' && e.target.value.trim() && setStudentName(e.target.value)} className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] focus:border-emerald-500 transition-all text-xl font-bold shadow-inner" />
          <p className="text-[10px] text-slate-300 text-center uppercase tracking-[0.3em] font-black animate-pulse">Press Enter to Start</p>
        </div>
      </div>
    );
  }

  if (hasSubmitted) {
    return (
      <div className="max-w-2xl mx-auto mt-20 bg-white rounded-[3.5rem] shadow-2xl p-20 text-center border border-slate-100 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-3 bg-gradient-to-r from-emerald-400 to-emerald-600" />
        <div className="w-28 h-28 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-10 shadow-inner">
          <ClipboardCheck className="w-14 h-14" />
        </div>
        <h2 className="text-5xl font-black text-slate-900 mb-6 tracking-tight">Rock Solid!</h2>
        <p className="text-slate-500 mb-12 text-2xl font-bold leading-relaxed">Your mastery has been logged. You're ready for the next challenge!</p>
        <button onClick={() => window.location.reload()} className="px-10 py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-[1.5rem] font-black transition-all">Sign Out</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-10 duration-500">
      <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 p-12 mb-10">
        <div className="flex items-center gap-3 mb-6">
          <span className="px-4 py-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-xl uppercase tracking-[0.2em]">Final Challenge</span>
        </div>
        <h2 className="text-4xl font-black text-slate-900 leading-[1.15] tracking-tight">{currentQuestion.text}</h2>
      </div>

      <div className="space-y-5">
        {currentQuestion.type === 'open' ? (
          <textarea onChange={(e) => setAnswer(e.target.value)} placeholder="Type your explanation here..." className="w-full h-80 p-8 bg-white border-2 border-slate-100 rounded-[3rem] shadow-2xl focus:border-emerald-500 transition-all text-2xl font-medium resize-none leading-relaxed" />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {currentQuestion.options.map((opt, i) => {
              const isSelected = currentQuestion.type === 'single' ? answer === opt : (Array.isArray(answer) && answer.includes(opt));
              return (
                <button key={i} onClick={() => {
                  if (currentQuestion.type === 'single') setAnswer(opt);
                  else {
                    const current = Array.isArray(answer) ? answer : [];
                    setAnswer(current.includes(opt) ? current.filter(o => o !== opt) : [...current, opt]);
                  }
                }} className={`p-8 rounded-[2rem] border-2 text-left font-black text-xl transition-all flex items-center justify-between group ${isSelected ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xl shadow-emerald-200' : 'bg-white border-slate-100 text-slate-600 hover:border-emerald-200'}`}>
                  <span className="flex-1 pr-4">{opt}</span>
                  {isSelected ? <CheckCircle2 className="w-8 h-8 flex-shrink-0" /> : <div className="w-8 h-8 rounded-full border-2 border-slate-100 group-hover:border-emerald-200 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        )}

        <button onClick={() => submitResponse(answer)} disabled={!answer || (Array.isArray(answer) && answer.length === 0)} className="w-full py-8 bg-slate-900 hover:bg-black disabled:opacity-20 text-white rounded-[2.5rem] font-black text-3xl flex items-center justify-center gap-4 transition-all mt-10 shadow-2xl active:scale-[0.98]">
          Submit Ticket <ChevronRight className="w-10 h-10" />
        </button>
      </div>
    </div>
  );
}
