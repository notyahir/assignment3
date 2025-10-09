export interface User {
    id: string; // UserId = String;
    name: string;
    email: string;
}

export type Track = {
    id: string;
    title: string;
    artist: string;
    available: boolean;
    tempo: number; // BPM
    energy: number; // 0..1
    valence: number; // 0..1
    lastPlayedDaysAgo: number;
    likedDaysAgo: number;
    numSkipped: number;
}


// Hardcoded vibe tags
export const VIBE = [
    "upbeat",
    "energetic",
    "mellow",
    "chill",
    "melancholic",
    "dark",
    "bright",
]

// Get the value from the list
export type VibeType = typeof VIBE[number];

// A score result for scoring with the track, score, and rationale
export interface ScoreResult {
  track: Track;
  score: number;
  rationale: string;
}

//
// CONCEPT STATE
//

export interface Weights {
    user: User;
    last_playedW: number;
    liked_whenW: number; 
    num_skippedW: number; 
}

export interface Boost {
    user: User;
    track: Track;
    amount: number;
    update_time: number;
}

export interface Snooze {
    user: User;
    track: Track;
    snooze_time: number;
}

export interface TagEntry {
  track: Track;
  tags: VibeType[];
  rationale: string;
  updated_at: number;
}
