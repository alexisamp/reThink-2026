import React, { useState } from 'react';
import { signInWithEmail, signUpWithEmail } from '../services/supabase';
import { Lock, Mail, Loader } from '../components/Icon';

const LoginView: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        const { error } = await signUpWithEmail(email, password);
        if (error) throw error;
        setMessage("Check your email for the confirmation link!");
      } else {
        const { error } = await signInWithEmail(email, password);
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-[#37352F] font-sans p-6">
       <div className="w-full max-w-sm bg-white border border-[#E9E9E7] rounded-xl shadow-lg p-8">
           <div className="text-center mb-8">
               <div className="w-12 h-12 bg-black text-white rounded-lg flex items-center justify-center mx-auto mb-4">
                   <span className="font-serif font-bold text-xl">OS</span>
               </div>
               <h1 className="text-2xl font-serif font-bold mb-1">reThink 2026</h1>
               <p className="text-[#9B9A97] text-sm italic">Identity determines behavior.</p>
           </div>

           {error && (
             <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded border border-red-200">
               {error}
             </div>
           )}

           {message && (
             <div className="mb-4 p-3 bg-green-50 text-green-700 text-xs rounded border border-green-200">
               {message}
             </div>
           )}

           <form onSubmit={handleSubmit} className="space-y-4">
               <div>
                   <label className="block text-xs font-bold uppercase tracking-wider text-[#9B9A97] mb-1">Email</label>
                   <div className="relative">
                       <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                       <input 
                            type="email" 
                            required
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-[#E9E9E7] rounded-lg text-sm outline-none focus:border-black transition-all"
                            placeholder="you@example.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                       />
                   </div>
               </div>
               <div>
                   <label className="block text-xs font-bold uppercase tracking-wider text-[#9B9A97] mb-1">Password</label>
                   <div className="relative">
                       <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                       <input 
                            type="password" 
                            required
                            minLength={6}
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-[#E9E9E7] rounded-lg text-sm outline-none focus:border-black transition-all"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                       />
                   </div>
               </div>

               <button 
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white font-bold text-sm py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
               >
                   {loading ? <Loader className="w-4 h-4 animate-spin" /> : (isSignUp ? 'Sign Up' : 'Sign In')}
               </button>
           </form>

           <div className="mt-6 text-center">
               <button 
                onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
                className="text-xs text-[#9B9A97] hover:text-black hover:underline transition-colors"
               >
                   {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
               </button>
           </div>
       </div>
    </div>
  );
};

export default LoginView;
