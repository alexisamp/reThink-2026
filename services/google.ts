
// Helper to safely access environment variables across different bundlers (Vite/Webpack)
const getEnvVar = (key: string): string => {
  // 1. Try Vite standard (import.meta.env)
  try {
    const meta = import.meta as any;
    if (meta.env && meta.env[key]) {
      return meta.env[key];
    }
  } catch (e) {
    // Ignore access errors
  }

  // 2. Try Process env (Standard Node/Webpack)
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {
    // Ignore
  }

  return '';
};

const API_KEY = getEnvVar('VITE_GOOGLE_API_KEY');
const CLIENT_ID = getEnvVar('VITE_GOOGLE_CLIENT_ID');

const SCOPES = 'https://www.googleapis.com/auth/calendar.events';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

// Dynamic Script Loader
const loadScript = (src: string, onLoad: () => void) => {
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.defer = true;
  script.onload = onLoad;
  document.body.appendChild(script);
};

export const initGoogleClient = () => {
  if (!API_KEY || !CLIENT_ID) {
    console.warn("Google API Keys missing in environment variables (VITE_GOOGLE_API_KEY, VITE_GOOGLE_CLIENT_ID).");
    return;
  }

  // Load GAPI (API Client)
  loadScript('https://apis.google.com/js/api.js', () => {
    window.gapi.load('client', async () => {
      await window.gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [DISCOVERY_DOC],
      });
      gapiInited = true;
    });
  });

  // Load GIS (Identity Services)
  loadScript('https://accounts.google.com/gsi/client', () => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: '', // Defined at request time
    });
    gisInited = true;
  });
};

export const createCalendarEvent = async (title: string, timeStr: string): Promise<string | boolean> => {
  if (!gapiInited || !gisInited) {
    // If not ready, try to init (lazy init fallback)
    if (!API_KEY || !CLIENT_ID) {
        alert("Google API Keys not configured.");
        return false;
    }
    // If keys exist but scripts aren't loaded, user clicked too fast or init failed.
    if (!window.gapi || !window.google) {
        alert("Google Services loading... please try again in a few seconds.");
        initGoogleClient(); // Retry init
        return false;
    }
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = async (resp: any) => {
      if (resp.error) {
        console.error("Auth Error", resp);
        reject(resp);
      }
      await makeCalendarRequest(title, timeStr, resolve);
    };

    // Check if we have a valid token, or request one
    if (window.gapi.client.getToken() === null) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  });
};

const makeCalendarRequest = async (title: string, timeStr: string, resolve: (val: string | boolean) => void) => {
  try {
    // Calculate Time
    const [hours, minutes] = timeStr.split(':').map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setMinutes(startDate.getMinutes() + 30); // Default 30 mins

    const event = {
      'summary': `⚓ ${title}`, // Anchor icon for Habit
      'description': 'Habit scheduled via reThink OS.',
      'start': {
        'dateTime': startDate.toISOString(),
        'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      'end': {
        'dateTime': endDate.toISOString(),
        'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      'reminders': {
        'useDefault': false,
        'overrides': [
          {'method': 'popup', 'minutes': 10}
        ]
      }
    };

    const request = window.gapi.client.calendar.events.insert({
      'calendarId': 'primary',
      'resource': event
    });

    const response = await request;
    if (response.result.htmlLink) {
      resolve(response.result.htmlLink);
    } else {
      resolve(true);
    }
  } catch (err) {
    console.error("Error creating event", err);
    resolve(false);
  }
};

// Types for Window
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}
