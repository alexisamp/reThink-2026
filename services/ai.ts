import { GoogleGenAI } from "@google/genai";
import { AppData, GoalStatus } from "../types";

// Hardcoded API Key as requested
const API_KEY = 'AIzaSyBVySdYTM1Uv1ffAIBfP4LqYWAgBsykl-c';

const getAI = () => {
  return new GoogleGenAI({ apiKey: API_KEY });
};

export const refineGoalWithAI = async (goalText: string): Promise<string> => {
  const ai = getAI();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `You are a productivity expert. Rewrite the following goal to be specific, measurable, and action-oriented (S.M.A.R.T), but keep it concise (under 10 words). Original: "${goalText}". Return ONLY the rewritten text.`,
    });
    return response.text?.trim() || goalText;
  } catch (error) {
    console.error("AI Error:", error);
    return goalText;
  }
};

export const getCoachFeedback = async (data: AppData): Promise<string> => {
  const ai = getAI();

  // Summarize data to save tokens
  const activeGoals = data.goals.filter(g => g.status === GoalStatus.ACTIVE).map(g => g.text).join(", ");
  const recentReviews = data.reviews.slice(-3).map(r => r.text).join(". ");
  const habitsCount = data.habits.length;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
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
    return response.text?.trim() || "Keep pushing.";
  } catch (error) {
    console.error("AI Error:", error);
    return "I couldn't analyze your data right now. Keep pushing.";
  }
};