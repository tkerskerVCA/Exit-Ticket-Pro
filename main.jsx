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

/** * --- FIREBASE CONFIGURATION ---
 * Replace these values with the config from your Firebase Console
 * (Project Settings > General > Your Apps)
 */
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'exit-ticket-pro-v2'; 

/** * --- GEMINI API CONFIGURATION ---
 * Paste your key from aistudio.google.com here!
 */
const apiKey = ""; 
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";

/**
 * AI Helper Function
 */
const fetchConfusionAnalysis = async (question, responses) => {
  if (!apiKey) {
    return "## API Key Missing\n- Please add your Gemini API Key to the code to see AI insights.";
  }

  const responsesText = responses.map(r => `- Student: ${r.studentName}, Answer: ${Array.isArray(r.answer) ? r.answer.join(', ') : r.answer}`).join('\n');
  
  const systemPrompt = `You are a pedagogical expert. Analyze these exit ticket responses.
  Organize your response into exactly these sections using bullet points:
  
  1. POINTS TO RETEACH: Identify specific concepts or skills where the class showed significant gaps or misconceptions.
  2. CELEBRATION POINTS: List specific strengths, successful logic, or concepts the majority mastered.
  3. NEXT STEPS: A short recommendation for tomorrow's opening activity.

  Be concise, professional, and encouraging.`;
  
  const userQuery = `Question: "${question.text}"\nType: ${question.type}\nCorrect Answer(s): ${Array.isArray(question.correct) ? question.correct.join(', ') : question.correct}\n\nStudent Responses:\n${responsesText}`;

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
    console.error("Gemini API Error:", err);
    return "Error generating analysis. Please check your API key and connection.";
  }
};

/**
 * Main Application Component
 */
export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); 
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try {
          await signInAnonymously(auth);
        } catch (e) { console.error(e); }
      }
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const qRef = doc(db, 'artifacts', appId, 'public', 'data', 'sessions', 'active');
    const rRef = collection(db, 'artifacts', appId, 'public', 'data', 'responses');

    const unsubQ = onSnapshot(qRef, (snap) => setCurrentQuestion(snap.exists() ? snap.data() : null));
    const unsubR = onSnapshot(rRef, (snap) => {
      setResponses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubQ(); unsubR(); };
  }, [user]);

  const startNewQuestion = async (qData) => {
    const qRef = doc(db, 'artifacts', appId, 'public', 'data', 'sessions', 'active');
    const rRef = collection(db, 'artifacts', appId, 'public', 'data', 'responses');
    const oldDocs = await getDocs(rRef);
    await Promise.all(oldDocs.docs.map(d => deleteDoc(d.ref)));

    await setDoc(qRef, { ...qData, active: true, createdAt: serverTimestamp(), analysis: "" });
    setHasSubmitted(false);
  };

  const endSession = async () => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', 'active'));
  };

  const submitResponse = async (answer) => {
    if (!studentName.trim() || !user) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'responses'), {
      answer, studentName, timestamp: serverTimestamp(), uid: user.uid
    });
    setHasSubmitted(true);
  };

  const runAnalysis = async () => {
    if (!currentQuestion || responses.length === 0) return;
    setIsAnalyzing(true);
    const result = await fetchConfusionAnalysis(currentQuestion, responses);
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', 'active'), 
      { ...currentQuestion, analysis: String(result) }, { merge: true });
    setIsAnalyzing(false);
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-indigo-600" /></div>;

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <Trophy className="w-16 h-16 text-indigo-600 mb-6" />
        <h1 className="text-5xl font-black text-slate-900 mb-2">Exit Ticket Pro</h1>
        <p className="text-slate-500 text-lg mb-10">Real-time mastery tracking with AI insights.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          <button onClick={() => setRole('teacher')} className="p-10 bg-white rounded-3xl shadow-xl hover:border-indigo-500 border-2 border-transparent transition-all group">
            <Users className="w-10 h-10 text-indigo-600 mx-auto mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-2xl font-bold">Teacher</h3>
            <p className="text-slate-400">Manage class and view insights.</p>
          </button>
          <button onClick={() => setRole('student')} className="p-10 bg-white rounded-3xl shadow-xl hover:border-emerald-500 border-2 border-transparent transition-all group">
            <BookOpen className="w-10 h-10 text-emerald-600 mx-auto mb-4 group-hover:scale-110 transition-transform" />
            <h3 className="text-2xl font-bold">Student</h3>
            <p className="text-slate-400">Submit your final exit ticket.</p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b px-8 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Sparkles className="text-indigo-600" />
          <span className="font-black text-2xl tracking-tight">ExitTicket</span>
          <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 px-2 py-1 rounded ml-2">{role}</span>
        </div>
        <button onClick={() => setRole(null)} className="text-slate-400 font-bold text-sm flex items-center gap-1 hover:text-slate-600">
          <LogOut className="w-4 h-4" /> Change Role
        </button>
      </header>

      <main className="max-w-7xl mx-auto p-6">
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
  const [isAnonymous, setIsAnonymous] = useState(false);

  const masteryStats = useMemo(() => {
    if (!currentQuestion || responses.length === 0 || currentQuestion.type === 'open') return null;
    let correctCount = 0;
    responses.forEach(r => {
      const isCorrect = currentQuestion.type === 'single' 
        ? r.answer === currentQuestion.correct[0]
        : Array.isArray(r.answer) && r.answer.length === currentQuestion.correct.length && r.answer.every(v => currentQuestion.correct.includes(v));
      if (isCorrect) correctCount++;
    });
    return { percentage: Math.round((correctCount / responses.length) * 100), count: correctCount };
  }, [currentQuestion, responses]);

  if (!currentQuestion) {
    return (
      <div className="max-w-3xl mx-auto bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100">
        <h2 className="text-4xl font-black mb-8">Create Ticket</h2>
        <div className="space-y-6">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl">
            {['single', 'multiple', 'open'].map(t => (
              <button key={t} onClick={() => {setQType(t); setCorrectIndices([]);}} className={`flex-1 py-3 font-bold rounded-xl transition-all capitalize ${qType === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>
                {t === 'single' ? 'Single Choice' : t === 'multiple' ? 'Checkboxes' : 'Open Response'}
              </button>
            ))}
          </div>
          <textarea value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Question prompt..." className="w-full h-32 p-6 bg-slate-50 border-2 rounded-3xl text-xl font-medium focus:border-indigo-500 outline-none" />
          
          {qType !== 'open' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Options (Select the correct keys)</label>
                <button onClick={() => setOptions([...options, ''])} className="p-2 bg-indigo-50 rounded-xl text-indigo-600"><Plus className="w-4 h-4" /></button>
              </div>
              {options.map((opt, i) => (
                <div key={i} className="flex gap-4">
                  <button onClick={() => {
                    if (qType === 'single') setCorrectIndices([i]);
                    else setCorrectIndices(prev => prev.includes(i) ? prev.filter(v => v !== i) : [...prev, i]);
                  }} className={`p-4 rounded-2xl border-2 transition-all ${correctIndices.includes(i) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                    {correctIndices.includes(i) ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                  </button>
                  <input value={opt} onChange={(e) => {const n = [...options]; n[i] = e.target.value; setOptions(n);}} placeholder={`Option ${i+1}`} className="flex-1 p-4 bg-slate-50 border-2 rounded-2xl font-bold" />
                </div>
              ))}
            </div>
          )}
          <button onClick={() => startNewQuestion({ text: qText, type: qType, options, correct: correctIndices.map(i => options[i]) })} disabled={!qText.trim()} className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">Launch Live Ticket</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2 text-indigo-600">
              <RefreshCcw className="w-4 h-4 animate-spin-slow" />
              <span className="text-[10px] font-black uppercase tracking-widest">Live Question</span>
            </div>
            <h2 className="text-3xl font-black text-slate-900 leading-tight mb-8">{currentQuestion.text}</h2>
          </div>
          <button onClick={endSession} className="self-start text-red-500 font-black text-xs uppercase tracking-widest hover:bg-red-50 px-4 py-2 rounded-xl transition-all">End Session</button>
        </div>

        {masteryStats && (
          <div className={`w-full lg:w-96 p-10 rounded-[3rem] text-white flex flex-col items-center justify-center transition-all duration-1000 ${masteryStats.percentage >= 80 ? 'bg-emerald-500 shadow-2xl scale-105' : 'bg-slate-900 shadow-xl'}`}>
            <div className="text-7xl font-black mb-1">{masteryStats.percentage}%</div>
            <div className="text-xs font-black uppercase tracking-[0.2em] opacity-70">Mastery Rate</div>
            {masteryStats.percentage >= 80 && (
              <div className="mt-6 flex items-center gap-2 bg-white text-emerald-600 px-6 py-3 rounded-2xl font-black animate-bounce">
                <Trophy className="w-5 h-5" /> Goal Surpassed!
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        <div className="xl:col-span-2 space-y-6">
          <div className="flex justify-between items-center px-4">
            <h3 className="font-black text-2xl text-slate-800">Responses ({responses.length})</h3>
            <button onClick={() => setIsAnonymous(!isAnonymous)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${isAnonymous ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {isAnonymous ? <><EyeOff className="w-4 h-4" /> Anonymous On</> : <><Eye className="w-4 h-4" /> Anonymous Off</>}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {responses.map(r => (
              <div key={r.id} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 group">
                <p className="text-lg font-bold mb-4 text-slate-800 leading-relaxed">
                  {Array.isArray(r.answer) ? r.answer.join(', ') : r.answer}
                </p>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
                  <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 font-black">
                    {isAnonymous ? '?' : r.studentName.charAt(0)}
                  </div>
                  {isAnonymous ? 'Student Anonymous' : r.studentName}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="font-black text-2xl px-4 flex items-center gap-2">
            <Sparkles className="text-indigo-600" /> AI Insights
          </h3>
          <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl min-h-[500px] relative overflow-hidden">
            {isAnalyzing ? (
              <div className="flex flex-col items-center justify-center h-full space-y-6">
                <Loader2 className="w-16 h-16 animate-spin text-indigo-400" />
                <p className="text-indigo-200 font-black tracking-widest animate-pulse">Scanning Responses...</p>
              </div>
            ) : currentQuestion.analysis ? (
              <div className="space-y-8 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                {currentQuestion.analysis.split('\n').map((line, i) => {
                  const isHeader = line.includes('RETEACH') || line.includes('CELEBRATION') || line.includes('NEXT STEPS');
                  const isBullet = line.trim().startsWith('-') || line.trim().startsWith('*');
                  
                  if (isHeader) return <h4 key={i} className="text-indigo-400 font-black text-xs uppercase tracking-widest mt-8 first:mt-0 mb-4">{line.replace(':', '')}</h4>;
                  if (isBullet) return <li key={i} className="text-slate-200 text-sm leading-relaxed mb-3 ml-4 list-disc font-medium">{line.replace('-', '').replace('*', '').trim()}</li>;
                  return <p key={i} className="text-slate-300 text-sm leading-relaxed mb-4 font-medium">{line}</p>;
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                <Star className="w-16 h-16 text-indigo-400/30" />
                <h4 className="text-2xl font-black">Ready to Analyze?</h4>
                <p className="text-slate-400 text-sm leading-relaxed">Once enough students have responded, I'll generate your insights.</p>
                <button onClick={runAnalysis} disabled={responses.length === 0} className="w-full py-5 bg-indigo-500 rounded-[1.5rem] font-black text-lg shadow-xl shadow-indigo-900/50 hover:bg-indigo-400 disabled:opacity-30 transition-all">Generate Insights</button>
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
        <div className="inline-block p-10 bg-white rounded-[3rem] shadow-xl text-indigo-200 mb-8 animate-pulse">
          <BookOpen className="w-24 h-24" />
        </div>
        <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Hang Tight!</h2>
        <p className="text-slate-400 font-bold text-lg">Your teacher is getting the exit ticket ready.</p>
      </div>
    );
  }

  if (!studentName) {
    return (
      <div className="max-w-md mx-auto mt-20 bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100">
        <h2 className="text-3xl font-black mb-2 tracking-tight">Who's Joining?</h2>
        <p className="text-slate-400 mb-8 text-sm font-bold">Enter your name to start your exit ticket.</p>
        <input autoFocus placeholder="Your Full Name" onKeyDown={(e) => e.key === 'Enter' && e.target.value.trim() && setStudentName(e.target.value)} className="w-full p-6 bg-slate-50 border-2 rounded-2xl text-xl font-bold focus:border-emerald-500 outline-none" />
        <p className="mt-4 text-[10px] text-slate-300 text-center uppercase tracking-widest font-black animate-pulse">Press Enter to Start</p>
      </div>
    );
  }

  if (hasSubmitted) {
    return (
      <div className="max-w-2xl mx-auto mt-20 bg-white p-20 rounded-[4rem] shadow-2xl text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-3 bg-emerald-500" />
        <div className="w-28 h-28 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-10 shadow-inner">
          <ClipboardCheck className="w-14 h-14" />
        </div>
        <h2 className="text-5xl font-black text-slate-900 mb-6 tracking-tight">Great Work!</h2>
        <p className="text-slate-500 mb-12 text-2xl font-bold leading-relaxed">Your response has been logged. You're all set for the day!</p>
        <button onClick={() => window.location.reload()} className="px-10 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black">Sign Out</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-10 duration-500">
      <div className="bg-white p-12 rounded-[3rem] shadow-sm border border-slate-100 mb-10">
        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg mb-4 inline-block">Final Question</span>
        <h2 className="text-4xl font-black text-slate-900 leading-[1.2]">{currentQuestion.text}</h2>
      </div>

      <div className="space-y-4">
        {currentQuestion.type === 'open' ? (
          <textarea onChange={(e) => setAnswer(e.target.value)} placeholder="Type your explanation here..." className="w-full h-80 p-10 bg-white border-2 rounded-[3rem] text-2xl font-medium shadow-2xl focus:border-emerald-500 outline-none resize-none" />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {currentQuestion.options.map((opt, i) => {
              const isSel = currentQuestion.type === 'single' ? answer === opt : (Array.isArray(answer) && answer.includes(opt));
              return (
                <button key={i} onClick={() => {
                  if (currentQuestion.type === 'single') setAnswer(opt);
                  else {
                    const curr = Array.isArray(answer) ? answer : [];
                    setAnswer(curr.includes(opt) ? curr.filter(o => o !== opt) : [...curr, opt]);
                  }
                }} className={`p-8 rounded-[2rem] border-2 text-left font-black text-2xl transition-all flex justify-between items-center group ${isSel ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xl shadow-emerald-200' : 'bg-white border-slate-100 text-slate-600 hover:border-emerald-200'}`}>
                  {opt}
                  {isSel ? <CheckCircle2 className="w-8 h-8" /> : <div className="w-8 h-8 border-2 rounded-full border-slate-100 group-hover:border-emerald-200" />}
                </button>
              );
            })}
          </div>
        )}
        <button onClick={() => submitResponse(answer)} disabled={!answer || (Array.isArray(answer) && answer.length === 0)} className="w-full py-8 bg-slate-900 text-white rounded-[2.5rem] font-black text-3xl shadow-2xl mt-12 hover:bg-black transition-all">Submit My Response</button>
      </div>
    </div>
  );
}
