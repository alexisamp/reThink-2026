import { AppData } from '../types';

const STORAGE_KEY = 'rethink-app-v3';

const INITIAL_DATA: AppData = {
  goals: [],
  habits: [],
  todos: [],
  reviews: [],
  strategy: [],
  globalRules: { prescriptions: [], antiGoals: [] },
  workbookReviews: {} // New multi-year structure
};

export const loadData = (): AppData => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...INITIAL_DATA, ...parsed };
    }
  } catch (e) {
    console.error("Failed to load data", e);
  }
  return INITIAL_DATA;
};

export const saveData = (data: AppData) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save data", e);
  }
};

// Helper for date keys
export const getTodayKey = (): string => {
  return new Date().toISOString().split('T')[0];
};

export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};