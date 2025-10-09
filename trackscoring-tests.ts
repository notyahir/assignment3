/**
 * TrackScoring Test Cases
 * 
 * Demonstrates both manual scheduling and LLM-assisted scheduling
 */

import { TrackScoring } from './trackscoring';
import { GeminiLLM, Config } from './gemini-llm';
import { User, Track } from './trackscoring-types';

/**
 * Load configuration from config.json
 */
function loadConfig(): Config {
    try {
        const config = require('../config.json');
        return config;
    } catch (error) {
        console.error('❌ Error loading config.json. Please ensure it exists with your API key.');
        console.error('Error details:', (error as Error).message);
        process.exit(1);
    }
}

/**
 * CONSTANT GLOBAL VARIABLES
 */

// test user: aka me
const user: User = {
  id: 'u1',
  name: 'Yahir Tester',
  email: 'yahirh@mit.edu',
};

// test sample tracks: make some random data llm
// tests prompt variant a and c for correct outputs
function sampleTracks(): Track[] {
  return [
    {
      id: 't1',
      title: 'Electric Feel',
      artist: 'MGMT',
      available: true,
      tempo: 98,
      energy: 0.63,
      valence: 0.74,
      lastPlayedDaysAgo: 200,
      likedDaysAgo: 400,
      numSkipped: 2,
    },
    {
      id: 't2',
      title: 'Hearts on Fire',
      artist: 'Cut Copy',
      available: true,
      tempo: 130,
      energy: 0.72,
      valence: 0.66,
      lastPlayedDaysAgo: 100,
      likedDaysAgo: 500,
      numSkipped: 1,
    },
    {
      id: 't3',
      title: 'Nightlight',
      artist: 'Illenium',
      available: true,
      tempo: 150,
      energy: 0.82,
      valence: 0.31,
      lastPlayedDaysAgo: 300,
      likedDaysAgo: 800,
      numSkipped: 0,
    },
  ];
}

// the user inputs their track called "PARTY" by "Till We Drop". They want to use the AI tags so they check the AI marker and now the LLM is
// mislabelling this track to be super upbeat and high tempo! Uh oh! How can we fix this? See promptvariantb
const llmTrap: Track = {
  id: 'b1',
  title: "PARTY",
  artist: "Till we Drop",
  available: true,
  tempo: 140,
  energy: 0.99,
  valence: 0.30,
  lastPlayedDaysAgo: 80,
  likedDaysAgo: 350,
  numSkipped: 2
}

/**
 * Test case 1: Manual resurfacing (no AI)
 * Shows basic scoring plus keep/snooze without any LLM calls.
 */
export async function testManualScoring(): Promise<void> {
  console.log('\n🧪 TEST CASE 1: Manual Resurfacing (No AI)');
  console.log('==========================================');

  console.log('\nGrabbing tracks!')
  const concept = new TrackScoring();
  const tracks = sampleTracks();

  console.log('\nManual preview (staleness):');
  // Table preview before actions, use console.table to make look nice (cool shortcut)
  console.table(
    concept.preview(user, tracks).map((r) => ({Track: r.track.title, Score: r.score, Why: r.rationale}))
  );

  console.log('\nUser actions: keep "Electric Feel", snooze "Nightlight"');
  concept.keep(user, tracks[0]);      // boost t1
  concept.snooze(user, tracks[2]);    // snooze t3 for ~14 days

  // Table preview after user actions
  console.log('\nManual preview after actions:');
  console.table(
    concept.preview(user, tracks).map((r) => ({Track: r.track.title, Score: r.score, Why: r.rationale}))
  );
}

/**
 * Test case 2: LLM-assisted tagging
 * Calls Gemini to tag each track, then scores.
 */
export async function testLLMScoring(): Promise<void> {
  console.log('\n🧪 TEST CASE 2: LLM-Assisted Tagging');
  console.log('====================================');

  console.log('\nGrabbing tracks!')
  const concept = new TrackScoring();
  const tracks = sampleTracks();

  // Show baseline (no AI) for contrast
  console.log('\nBaseline (no AI):');
  console.table(
    concept.preview(user, tracks).map((r) => ({Track: r.track.title, Score: r.score, Why: r.rationale}))
  );

  const config = loadConfig();
  const llm = new GeminiLLM(config); // configure llm with api key

  console.log('\n🤖 Tagging tracks with Gemini (AI)...');
  for (const t of tracks) { // for the tracks in users tracks
    const res = await concept.tag(user, t, llm); // use LLM to tag
    console.log(`• ${t.title}: [${res.tags.join(', ')}] — ${res.rationale}`); // llm handled logging with syntactic sugar
  }

  console.log('\nPreviewAI (uses AI to blend score):');
  console.table(
    concept.previewAI(user, tracks).map((r) => ({Track: r.track.title, ScoreAI: r.score, Why: r.rationale}))
  );
}

/**
 * Test case 3: Mixed Scoring
 * Mixes manual actions (keep/snooze) with selective AI tagging.
 */
export async function testMixedScoring(): Promise<void> {
  console.log('\n🧪 TEST CASE 3: Mixed Scoring (Manual + AI)');
  console.log('========================================');

  console.log('\nGrabbing tracks!')
  const concept = new TrackScoring();
  const tracks = sampleTracks();

  const config = loadConfig();
  const llm = new GeminiLLM(config); // configure llm with api key

  console.log('Baseline preview:');
  console.table(
    concept.preview(user, tracks).map((r) => ({Track: r.track.title, Score: r.score, Why: r.rationale}))
  );

  console.log('\nManual actions: keep "Hearts on Fire", snooze "Electric Feel"');
  concept.keep(user, tracks[1]);     // boost t2
  concept.snooze(user, tracks[0]);   // snooze t1

  console.log('\n🤖 Tagging a subset with AI (t2 only):');
  const res2 = await concept.tag(user, tracks[1], llm);
  console.log(`- ${tracks[1].title}: [${res2.tags.join(', ')}] — ${res2.rationale}`);

  console.log('\nPreviewAI after mixed actions:');
  console.table(
    concept.previewAI(user, tracks).map((r) => ({Track: r.track.title, ScoreAI: r.score, Why: r.rationale}))
  );

  // THIS BELOW IS TO SHOW WHAT THE FULL AI OUTPUT WOULD LOOK LIKE TO SHOW DIFFERENCE

  console.log('\n🤖 Tagging remaining tracks (t1, t3) to complete coverage:');
  const res1 = await concept.tag(user, tracks[0], llm);
  console.log(`- ${tracks[0].title}: [${res1.tags.join(', ')}] — ${res1.rationale}`);
  const res3 = await concept.tag(user, tracks[2], llm);
  console.log(`- ${tracks[2].title}: [${res3.tags.join(', ')}] — ${res3.rationale}`);

  console.log('\nFinal PreviewAI:');
  console.table(
    concept.previewAI(user, tracks).map((r) => ({Track: r.track.title, ScoreAI: r.score, Why: r.rationale}))
  );
}

export async function testBreaker1(): Promise<void> {
  await Promise<void>;
}

export async function testBreaker2(): Promise<void> {
  await Promise<void>;
}

export async function testBreaker3(): Promise<void> {
  await Promise<void>;
}
/**
 * Main function to run all test cases
 */
async function main(): Promise<void> {
    console.log('TrackScore Test Suite');
    console.log('========================\n');
    
    try {
        // Run manual scoring test
        await testManualScoring();
        
        // Run LLM scoring test
        await testLLMScoring();
        
        // Run mixed scoring test
        await testMixedScoring();
        
        console.log('\n🎉 All test cases completed successfully!');
        
    } catch (error) {
        console.error('❌ Test error:', (error as Error).message);
        process.exit(1);
    }
}

// Run the tests if this file is executed directly
if (require.main === module) {
    main();
}