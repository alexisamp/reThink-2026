
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "./supabase";

// Hardcoded API Key
const API_KEY = 'AIzaSyBVySdYTM1Uv1ffAIBfP4LqYWAgBsykl-c';

const getAI = () => {
  return new GoogleGenerativeAI(API_KEY);
};

export const refineGoalWithAI = async (goalText: string): Promise<string> => {
  const genAI = getAI();
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    const result = await model.generateContent(`You are a productivity expert. Rewrite the following goal to be specific, measurable, and action-oriented (S.M.A.R.T), but keep it concise (under 10 words). Original: "${goalText}". Return ONLY the rewritten text.`);
    return result.response.text().trim() || goalText;
  } catch (error) {
    console.error("AI Error:", error);
    return goalText;
  }
};

export const getCoachFeedback = async (userId: string): Promise<string> => {
  const genAI = getAI();
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  try {
    // Query the Database View (Last 14 days as requested)
    const { data: context, error } = await supabase
      .from('view_daily_context')
      .select('*')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(14);

    if (error) throw error;

    // Format the context for the LLM
    const contextStr = context?.map((c: any) => 
        `Date: ${c.log_date} | Habit: ${c.habit_name} (Value: ${c.intensity}) | Energy: ${c.energy_level ?? '-'} | Rating: ${c.day_rating ?? '-'} | Journal: ${c.journal_entry ?? ''}`
    ).join('\n') || "No recent activity found.";

    const result = await model.generateContent(`
        Act as a tough but motivating performance coach (Farnam Street style). 
        Analyze the user's last 14 days of performance based on this data log:
        
        ${contextStr}
        
        Provide 3 short, punchy bullet points of feedback:
        1. An observation (patterns in habits or energy).
        2. A hard truth or challenging question.
        3. A motivation for tomorrow.
        
        Keep it under 60 words total. Do not use markdown symbols like * or #, just plain text suitable for speech synthesis.
      `);
      
    return result.response.text().trim() || "Keep pushing. Consistency is key.";
  } catch (error) {
    console.error("AI Error:", error);
    return "I couldn't analyze your data right now. Check your connection and keep pushing.";
  }
};

export const embedText = async (text: string): Promise<number[] | null> => {
    if (!text || text.length < 5) return null;
    
    const genAI = getAI();
    // 'text-embedding-004' is the current standard for Gemini
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

    try {
        const result = await model.embedContent(text);
        const vector = result.embedding.values;
        
        // PAD VECTOR: Gemini returns 768 dims. DB might be 1536 (OpenAI std).
        // If DB is 1536, we must pad. If DB is 768, we slice or use as is.
        // Assuming DB is 1536 based on common PGVector setups:
        if (vector.length === 768) {
            return [...vector, ...new Array(768).fill(0)];
        }
        
        return vector;
    } catch (error) {
        console.error("Embedding Error:", error);
        return null;
    }
};
