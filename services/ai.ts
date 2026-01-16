import { GoogleGenAI } from "@google/genai";
import { AppData, GoalStatus } from "../types";

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const refineGoalWithAI = async (goalText: string): Promise<string> => {
  const ai = getAI();
  if (!ai) return goalText;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a productivity expert. Rewrite the following goal to be specific, measurable, and action-oriented (S.M.A.R.T), but keep it concise (under 10 words). Original: "${goalText}". Return ONLY the rewritten text.`,
    });
    return response.text.trim();
  } catch (error) {
    console.error("AI Error:", error);
    return goalText;
  }
};

export const getCoachFeedback = async (data: AppData): Promise<string> => {
  const ai = getAI();
  if (!ai) return "I need an API Key to speak.";

  // Summarize data to save tokens
  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE).map(g => g.text).join(", ");
  const recentReviews = data.reviews.slice(-3).map(r => r.text).join(". ");
  const habitsCount = data.habits.length;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        Act as a tough but motivating performance coach (Farnam Street style). 
        Analyze this user data:
        - Focus: ${activeGoals}
        - Habits tracked: ${habitsCount}
        - Recent logs: ${recentReviews}
        
        Give 3 short, punchy bullet points of feedback. 
        1. An observation.
        2. A hard truth or question.
        3. A motivation.
        
        Keep it under 60 words total. Do not use markdown symbols like * or #, just plain text suitable for speech synthesis.
      `,
    });
    return response.text.trim();
  } catch (error) {
    console.error("AI Error:", error);
    return "I couldn't analyze your data right now. Keep pushing.";
  }
};
