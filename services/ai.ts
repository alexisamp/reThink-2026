import { GoogleGenAI } from "@google/genai";

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const refineGoalWithAI = async (goalText: string): Promise<string> => {
  const ai = getAI();
  if (!ai) {
    console.warn("No API Key found");
    return goalText;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a productivity expert. Rewrite the following goal to be specific, measurable, and action-oriented (S.M.A.R.T), but keep it concise (under 10 words). 
      
      Original Goal: "${goalText}"
      
      Return ONLY the rewritten goal text, no quotes or explanations.`,
    });
    
    return response.text.trim();
  } catch (error) {
    console.error("AI Error:", error);
    return goalText; // Fallback
  }
};
