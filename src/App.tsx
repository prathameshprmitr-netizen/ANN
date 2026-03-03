/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  BookOpen, 
  BrainCircuit, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Download,
  Copy,
  LayoutDashboard,
  FileSearch,
  PenTool,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import Markdown from 'react-markdown';
import mammoth from 'mammoth';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface FileData {
  id: string;
  file: File;
  type: 'pdf' | 'docx' | 'image';
  name: string;
  content?: string; // For text-based files like docx
  base64?: string; // For multimodal files like pdf/images
}

interface GeneratedAnswer {
  title: string;
  content: string;
}

// --- Components ---

const FileIcon = ({ type }: { type: FileData['type'] }) => {
  switch (type) {
    case 'pdf': return <FileText className="w-5 h-5 text-red-500" />;
    case 'docx': return <FileText className="w-5 h-5 text-blue-500" />;
    case 'image': return <ImageIcon className="w-5 h-5 text-emerald-500" />;
  }
};

export default function App() {
  const [question, setQuestion] = useState('');
  const [notes, setNotes] = useState<FileData[]>([]);
  const [studyMaterials, setStudyMaterials] = useState<FileData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [answers, setAnswers] = useState<GeneratedAnswer[]>([]);
  const [activeAnswerIndex, setActiveAnswerIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  const notesInputRef = useRef<HTMLInputElement>(null);
  const materialsInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: 'notes' | 'materials') => {
    const files = Array.from(e.target.files || []);
    const newFiles: FileData[] = [];

    for (const file of files) {
      const type = file.type.includes('pdf') ? 'pdf' : 
                   file.type.includes('word') || file.name.endsWith('.docx') ? 'docx' : 
                   file.type.includes('image') ? 'image' : null;

      if (!type) continue;

      const fileData: FileData = {
        id: Math.random().toString(36).substring(7),
        file,
        type: type as FileData['type'],
        name: file.name
      };

      if (type === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        fileData.content = result.value;
      } else {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(file);
        });
        fileData.base64 = await base64Promise;
      }

      newFiles.push(fileData);
    }

    if (category === 'notes') {
      setNotes(prev => [...prev, ...newFiles]);
    } else {
      setStudyMaterials(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (id: string, category: 'notes' | 'materials') => {
    if (category === 'notes') {
      setNotes(prev => prev.filter(f => f.id !== id));
    } else {
      setStudyMaterials(prev => prev.filter(f => f.id !== id));
    }
  };

  const generateAnswers = async () => {
    if (!question.trim()) {
      setError('Please enter a question or topic to analyze.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setAnswers([]);
    setStatus('Analyzing inputs...');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      // Prepare multimodal parts
      const parts: any[] = [
        { text: `You are an Academic AI Assistant optimized for SPEED and ACCURACY.
        
        TASK:
        Generate a concise, high-fidelity academic response based DIRECTLY on the provided notes and materials.
        
        QUESTION:
        ${question}
        
        INSTRUCTIONS:
        1. Stick strictly to the information provided in the notes. "Same information from notes as notes have."
        2. Prioritize speed and directness. Avoid unnecessary fluff.
        3. Identify key topics in the question and extract the EXACT relevant content from the notes.
        4. Maintain academic formatting but be concise.
        5. Generate TWO distinct versions:
           - Version 1: Direct Extraction/Summary (High fidelity to notes)
           - Version 2: Structured Synthesis (Organized for study)
        
        OUTPUT FORMAT:
        Return a JSON array of objects, each with 'title' and 'content' (Markdown) properties.
        ` }
      ];

      // Add Notes
      if (notes.length > 0) {
        parts.push({ text: "\n--- PROVIDED NOTES ---\n" });
        notes.forEach(f => {
          if (f.type === 'docx') {
            parts.push({ text: `File: ${f.name}\nContent: ${f.content}\n` });
          } else {
            parts.push({
              inlineData: {
                mimeType: f.file.type || (f.type === 'pdf' ? 'application/pdf' : 'image/jpeg'),
                data: f.base64!
              }
            });
          }
        });
      }

      // Add Study Materials
      if (studyMaterials.length > 0) {
        parts.push({ text: "\n--- ADDITIONAL STUDY MATERIALS ---\n" });
        studyMaterials.forEach(f => {
          if (f.type === 'docx') {
            parts.push({ text: `File: ${f.name}\nContent: ${f.content}\n` });
          } else {
            parts.push({
              inlineData: {
                mimeType: f.file.type || (f.type === 'pdf' ? 'application/pdf' : 'image/jpeg'),
                data: f.base64!
              }
            });
          }
        });
      }

      setStatus('Synthesizing responses quickly...');
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING }
              },
              required: ["title", "content"]
            }
          }
        }
      });

      const result = JSON.parse(response.text || '[]');
      setAnswers(result);
      setActiveAnswerIndex(0);
      setStatus('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast here
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <BrainCircuit className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900">ScholarSync</h1>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-widest">Academic AI Assistant</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <nav className="flex items-center gap-4 text-sm font-medium text-gray-600">
              <a href="#" className="hover:text-indigo-600 transition-colors">Dashboard</a>
              <a href="#" className="hover:text-indigo-600 transition-colors">Library</a>
              <a href="#" className="hover:text-indigo-600 transition-colors">Settings</a>
            </nav>
            <div className="h-8 w-[1px] bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                JD
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Input */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2 mb-1">
                <PenTool className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">The Question</h2>
              </div>
              <p className="text-xs text-gray-500">Enter the academic prompt or question you need to answer.</p>
            </div>
            <div className="p-6">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g., Analyze the impact of the Industrial Revolution on urban social structures in 19th-century Britain."
                className="w-full h-32 p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none text-sm leading-relaxed"
              />
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-2 mb-1">
                <FileSearch className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">Source Materials</h2>
              </div>
              <p className="text-xs text-gray-500">Upload your notes, textbooks, or reference images.</p>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Notes Upload */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Your Notes</label>
                <div 
                  onClick={() => notesInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer group"
                >
                  <Upload className="w-8 h-8 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                  <span className="text-sm font-medium text-gray-500 group-hover:text-indigo-600">Click to upload notes</span>
                  <span className="text-[10px] text-gray-400">PDF, DOCX, or Images</span>
                  <input 
                    type="file" 
                    ref={notesInputRef} 
                    onChange={(e) => handleFileUpload(e, 'notes')} 
                    multiple 
                    className="hidden" 
                    accept=".pdf,.docx,image/*"
                  />
                </div>
                {notes.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {notes.map(file => (
                      <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 group">
                        <div className="flex items-center gap-3">
                          <FileIcon type={file.type} />
                          <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">{file.name}</span>
                        </div>
                        <button 
                          onClick={() => removeFile(file.id, 'notes')}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <AlertCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Study Materials Upload */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Additional Materials</label>
                <div 
                  onClick={() => materialsInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer group"
                >
                  <BookOpen className="w-8 h-8 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                  <span className="text-sm font-medium text-gray-500 group-hover:text-indigo-600">Add reference materials</span>
                  <span className="text-[10px] text-gray-400">Textbooks, research papers, etc.</span>
                  <input 
                    type="file" 
                    ref={materialsInputRef} 
                    onChange={(e) => handleFileUpload(e, 'materials')} 
                    multiple 
                    className="hidden" 
                    accept=".pdf,.docx,image/*"
                  />
                </div>
                {studyMaterials.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {studyMaterials.map(file => (
                      <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 group">
                        <div className="flex items-center gap-3">
                          <FileIcon type={file.type} />
                          <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">{file.name}</span>
                        </div>
                        <button 
                          onClick={() => removeFile(file.id, 'materials')}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <AlertCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-gray-50/50 border-t border-gray-100">
              <button
                onClick={generateAnswers}
                disabled={isGenerating}
                className={cn(
                  "w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg",
                  isGenerating 
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed" 
                    : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98] shadow-indigo-200"
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{status || 'Processing...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Generate Academic Answers</span>
                  </>
                )}
              </button>
              {error && (
                <p className="mt-3 text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {error}
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {!isGenerating && answers.length === 0 ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="h-full min-h-[600px] flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl border border-gray-200 border-dashed"
              >
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                  <LayoutDashboard className="w-10 h-10 text-gray-300" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Ready to Analyze</h3>
                <p className="text-gray-500 max-w-sm leading-relaxed">
                  Upload your materials and enter a question to generate comprehensive academic responses.
                </p>
              </motion.div>
            ) : isGenerating ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full min-h-[600px] flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-gray-200"
              >
                <div className="relative mb-8">
                  <div className="w-24 h-24 border-4 border-indigo-100 rounded-full" />
                  <div className="absolute inset-0 w-24 h-24 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin" />
                  <BrainCircuit className="absolute inset-0 m-auto w-10 h-10 text-indigo-600 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Synthesizing Knowledge</h3>
                <div className="space-y-3 w-full max-w-xs">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-indigo-600"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 15, ease: "linear" }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 text-center font-mono tracking-tighter uppercase">
                    {status}
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="results"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                {/* Answer Tabs */}
                <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                  {answers.map((ans, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveAnswerIndex(idx)}
                      className={cn(
                        "flex-1 py-3 px-4 rounded-lg text-sm font-bold transition-all",
                        activeAnswerIndex === idx 
                          ? "bg-white text-indigo-600 shadow-sm" 
                          : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Answer {idx + 1}
                    </button>
                  ))}
                </div>

                {/* Active Answer Content */}
                <motion.div 
                  key={activeAnswerIndex}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                      </div>
                      <h2 className="text-lg font-bold text-gray-900">{answers[activeAnswerIndex].title}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => copyToClipboard(answers[activeAnswerIndex].content)}
                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Copy to clipboard"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                      <button 
                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Download as PDF"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-8 prose prose-indigo max-w-none prose-headings:font-bold prose-p:leading-relaxed prose-p:text-gray-700">
                    <Markdown>
                      {answers[activeAnswerIndex].content}
                    </Markdown>
                  </div>

                  <div className="p-6 bg-indigo-50/50 border-t border-indigo-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-medium text-indigo-700">
                      <BrainCircuit className="w-4 h-4" />
                      <span>Generated using ScholarSync Academic Engine</span>
                    </div>
                    <div className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest">
                      Word Count: ~{answers[activeAnswerIndex].content.split(/\s+/).length}
                    </div>
                  </div>
                </motion.div>

                {/* Next Steps / Suggestions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-200 transition-colors cursor-pointer group">
                    <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-emerald-100 transition-colors">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                    </div>
                    <h4 className="text-xs font-bold text-gray-900 mb-1">Refine Tone</h4>
                    <p className="text-[10px] text-gray-500">Make it more formal or conversational.</p>
                  </div>
                  <div className="p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-200 transition-colors cursor-pointer group">
                    <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-amber-100 transition-colors">
                      <ChevronRight className="w-4 h-4 text-amber-600" />
                    </div>
                    <h4 className="text-xs font-bold text-gray-900 mb-1">Add Citations</h4>
                    <p className="text-[10px] text-gray-500">Generate APA or MLA bibliography.</p>
                  </div>
                  <div className="p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-200 transition-colors cursor-pointer group">
                    <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-100 transition-colors">
                      <FileText className="w-4 h-4 text-purple-600" />
                    </div>
                    <h4 className="text-xs font-bold text-gray-900 mb-1">Summary</h4>
                    <p className="text-[10px] text-gray-500">Create a 1-page executive summary.</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-200 py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 opacity-50">
            <BrainCircuit className="w-5 h-5" />
            <span className="text-sm font-bold tracking-tighter">ScholarSync</span>
          </div>
          <p className="text-xs text-gray-400">© 2026 ScholarSync Academic. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs font-medium text-gray-400">
            <a href="#" className="hover:text-indigo-600 transition-colors">Privacy</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Terms</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
