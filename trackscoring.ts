/**
 * TrackScoring Concept - AI Augmented Version
 */

import { skip } from 'node:test';
import { GeminiLLM } from './gemini-llm';
import {
  User, Track, VIBE, VibeType, Weights, Boost, Snooze, TagEntry, ScoreResult // necessary imports for trackscoring types
} from './trackscoring-types';

export class TrackScoring {
    // initialize weights for track scoring, as seen in concept state
    private weights: Weights[] = [];
    private boosts: Boost[] = [];
    private snoozes: Snooze[] = [];
    private tags: TagEntry[] = [];

    // NON-AUGMENTED FUNCTIONS
    score(user: User, track: Track): number {
      if (!track.available) return 0; // no available track? no score

      // Weight creation, grabbed by user's id
      const w = this.createWeights(user);

      const stalePlay = Math.min(track.lastPlayedDaysAgo / 365, 1); // Create a stale play score
      const staleLike = Math.min(track.likedDaysAgo / 365, 1); // Create a stale like socre
      const skipPentalty = Math.min(track.numSkipped * 0.1, 1); // Create a stale skip penalty

      // Calculate a score based off the weights
      let s = w.last_playedW * stalePlay + 
              w.liked_whenW * staleLike + 
              w.num_skippedW * skipPentalty;

      // If there is a boost, apply the boost factor to the score right now
      const b = this.boosts.find((x) => x.user.id === user.id && x.track.id === track.id);
      if (b) {
        const ageDays = (Date.now() - b.update_time) / 86_400_000; // Apparently Date.now() works for giving time in ms, so we divide by 86_400_400
        // seen here: https://stackoverflow.com/questions/36662473/why-does-java-sql-date-gettime-returns-82-800-000-for-1970-01-02-instead-of-86
        const decay = Math.exp(-ageDays / 14);
        s += b.amount * decay;
      }

      // If there is a current snooze, the user does't want the track! Score is 0
      const sn = this.snoozes.find((x) => x.user.id === user.id && x.track.id === track.id);
      if (sn) {
        const days = (Date.now() - sn.snooze_time) / 86_400_000;
        if (days < 14) s = 0;
      }

      return s;
    }

    preview(user: User, tracks: Track[], size?: number): ScoreResult[] {
      const rows = tracks.map<ScoreResult>((t) => ({
      track: t,
      score: this.score(user, t),
      rationale: `manual: stalePlay=${(Math.min(
          t.lastPlayedDaysAgo / 365,
          1
        )).toFixed(2)}, staleLike=${(Math.min(
          t.likedDaysAgo / 365,
          1
        )).toFixed(2)}, skips=${t.numSkipped}`,
      }));
      rows.sort((a, b) => b.score - a.score);
      return rows.slice(0, size ?? 10);
    }

    keep(user: User, track: Track): void {
      const now = Date.now()

      // Search the existing boosts to see if it exists
      const existing = this.boosts.find((x) => x.user.id == user.id && x.track.id === track.id);

      // If it exists, update the value by 0.1
      if (existing) {
        existing.amount = Math.min(existing.amount + 0.1, 1); // Ensure 1 baseline
        existing.update_time = now;
      } else { // If it doesn't exist, add it to the boost state
        this.boosts.push({user, track, amount:0.1, update_time: now})
      }
    }

    snooze(user: User, track: Track, until?: number): void { // LLM recommended using ? as an optional
      if (!until) { // No date? Set it to now
        until = Date.now();
      }
      let snooze_time = until
      this.snoozes.push({user, track, snooze_time}) // push the track to the snooze state
    }

    // LLM FUNCTIONS YAYA ASYNC

    async tag(user: User, track: Track, llm: GeminiLLM): Promise<{tags: VibeType[], rationale: string}> {
      const prompt = this.createTagPrompt(track);

      try {
        console.log('🤖 Requesting track score from Gemini AI...'); // From dayplanner

        const raw = await llm.executeLLM(prompt); // get the raw resonse
        
        let parsed: any;
        // try to parse the llm output as a json file
        try {
          parsed = JSON.parse(raw);
        } catch { // LLM helped with fixing any errors if the llm failed, 
          const m = raw.match(/\{[\s\S]*\}/);
          parsed = m ? JSON.parse(m[0]) : {};
        }

        // llm helped with optional parameters for ts
        const rawTags = Array.isArray(parsed?.tags) ? parsed.tags : [];
        const filtered: VibeType[] = rawTags.filter((t: string) => VIBE.includes(t as VibeType)) as VibeType[];
        const rationale: string = typeof parsed?.rationale === "string" ? parsed.rationale : "No rationale.";

        // get the tag entry
        const entry: TagEntry = {track, tags: filtered, rationale, updated_at: Date.now()}; // make the entry
        const existing = this.tags.find((e) => e.track.id === track.id); // look for existing entry
        if (existing) Object.assign(existing, entry); else this.tags.push(entry); // update existing entry
        return { tags: filtered, rationale }; // return the tag with rationale

        // Same error message as day planner
      } catch (error) {
        console.error(`tag() failed for ${track.title}:`, (error as Error).message);
        return {tags: [], rationale: "LLM error."};
      }
    }

    scoreAI(user: User, track: Track): number {
      const base = this.score(user, track);
      const te = this.tags.find((e) => e.track.id === track.id);
      if (!te) return base; // If not tag entry, revert to base score

      // Simple blend, 5% per tag
      const factor = 1 + Math.min(te.tags.length, 3) * 0.05;
      return base * factor;
    }

    previewAI(user: User, tracks: Track[], size?: number): ScoreResult[] {
      // LLM helped in formatting the results and ensuring correct syntactic sugar
      const rows = tracks.map<ScoreResult>((t) => {
        const base = this.score(user, t); // get base score
        const sAI = this.scoreAI(user, t); // get ai score
        const te = this.tags.find((e) => e.track.id === t.id); // find if ids align
        const tagStr = te ? te.tags.join(", ") : "—"; // convert to str
        return {track: t, score: sAI, rationale: `ai: base=${base.toFixed(3)}, tags=[${tagStr}] -> ${sAI.toFixed(3)}`}; // return as a nice string (thanks llm)
      });

      // Calculate the top score, return size amount, o.w. do 10
      rows.sort((a, b) => b.score - a.score);
      if (size) return rows.slice(0, size); else return rows.slice(0, 10)
    }

    /**
     * 
     * Very minimal helper functions
     * 
     */
    private createWeights(user: User): Weights {
      let w = this.weights.find((x) => x.user.id == user.id);
      if (!w) {
        w = { user, last_playedW: 0.5, liked_whenW: 0.3, num_skippedW: 0.2 };
        this.weights.push(w) 
      }
      return w;
    }

    // Wrote an LLM prompt and then had ChatGPT "yell" at it's friend :-(, refined prompt
    private createTagPrompt(track: Track): string {
      return `
        You label the MOOD/VIBE of a single song.

        ALLOWED_TAGS (choose only from this list):
        ${VIBE.join(", ")}

        RULES:
          - If energy >= 0.6 AND valence >= 0.6, prefer {upbeat, energetic, bright}. Avoid melancholic/dark unless audio contradicts.
          - If energy >= 0.6 AND valence <= 0.4, prefer {energetic, dark}. Avoid bright.
          - If uncertain, return exactly 1 best tag.

        TASK:
        - Pick 1–3 tags from ALLOWED_TAGS that best describe the song's vibe.
        - If you have more than 3 to describe a song, please pick the best 3.
        - If uncertain, pick exactly 1 tag (your best guess).
        - Write a SHORT rationale (≤ 160 characters). Do not mention this limit explicitly.

        INPUT:
        - Title: "${track.title}"
        - Artist: "${track.artist}"
        - Audio: tempo=${track.tempo} bpm, energy=${track.energy}, valence=${track.valence}

        OUTPUT (STRICT):
        Return ONLY a JSON object (no markdown, no extra text) with exactly these keys:
        {
          "tags": ["tag1","tag2"],  // subset of ALLOWED_TAGS, length 1..3
          "rationale": "short reason"
        }

        EXAMPLES (for format only):
        GOOD:
        {"tags":["upbeat","bright"],"rationale":"Fast feel and cheerful tone."}
        BAD:
        I think it's upbeat.   // (wrong: not JSON)
        {"labels":["upbeat"]}   // (wrong: key not allowed)
        {"tags":["happy"]}      // (wrong: tag not allowed)
        `.trim();
      }

      original_prompt = `
        You label the MOOD/VIBE of a single song.

        ALLOWED_TAGS:
        ${VIBE.join(", ")}

        TASK:
        - Pick tags from ALLOWED_TAGS that best describe the song's vibe.
        - If uncertain, pick your best guess.
        - Write a rationale.
        Return ONLY a JSON object (no markdown, no extra text) with the key "tags" and "rationale" corresponding to such.
        Ex:
          {
            "tags": ["tag1","tag2"],  // subset of ALLOWED_TAGS
            "rationale": "short reason"
          }
      `


      /**
       * tagging and rationale issues
       * An interesting issue is that ideally, we want to keep our tags and rationale to a limit. Sometimes less is more, meaning that a song is best described with minimal vibe tags
       * then trying to put all of them on it. Too many tags can be misleading/confusing, and we want to give the user a short and simple rationale. Brevity is important here
       * since the point of our app is that we give a streamlined way to sort through songs. Occasionally, we would get weird tags, overtagging, or even bad rationale (long). While,
       * this is an issue that can be fixed or mitigated in the code, it would be best to have the LLM handle the issue as much as it could when processing and giving an answer. As a
       * result, we tell the LLM that we want a SHORT rationale of <= 160 characters rather than saying something ambiguous like "one sentence" or "brief explanation". Additonally,
       * we ensure that we tell it 1-3 tags from ALLOWED_TAGS to minimize picking other tags. I can see it stll somehow messing this up so would be good to validate in the code.
       * 
       */
      private createTagPromptVariantA(track: Track): string {
        return `
          You label the MOOD/VIBE of a single song.

          ALLOWED_TAGS (choose only from this list):
          ${VIBE.join(", ")}

          TASK:
          - Pick 1–3 tags from ALLOWED_TAGS that best describe the song's vibe.
          - If you have more than 3 to describe a song, please pick the best 3.
          - If uncertain, pick exactly 1 tag (your best guess).
          - Write a SHORT rationale (≤ 160 characters). Do not mention this limit explicitly.

          Return ONLY a JSON object (no markdown, no extra text) with exactly these keys:
            {
              "tags": ["tag1","tag2"],  // subset of ALLOWED_TAGS, length 1..3
              "rationale": "short reason" // less than 160 chars
            }
        `
      }

      /**
       * 
       * an interesting issue brought up by llm is that we could potentially have a song title that throws off
       * vibe identification of the model. for example, if we have a song called "Party ANTHEM" and it's a completely
       * depressing song, then we wouldn't want to label the song as upbeat or positive. To fix this, we can give the LLM a
       * refined prompt, where we can tell it check the values of a song's track energy, valence, and tempo to ensure that
       * the answer it picked is valid. This is what it would look like to refine the problem. It worked in helping reduce it, however
       * even as a musician, I myself know that this is probably not the most efficient way and that we could definitely use some form
       * of signal processing to analyze a track or go beyond the parameters. It's a very basic safeguard but can still not work.
       * 
       */
      private createTagPromptVariantB(track: Track): string {
        return `
          You label the MOOD/VIBE of a song.

          ALLOWED_TAGS (choose only from this list):
          ${VIBE.join(", ")}

          RULES:
            - If energy >= 0.6 AND valence >= 0.6, prefer {upbeat, energetic, bright}. Avoid melancholic/dark unless audio contradicts.
            - If energy >= 0.6 AND valence <= 0.4, prefer {energetic, dark}. Avoid bright.
            - If uncertain, return exactly 1 best tag.

          
          TASK:
          - Pick 1–3 tags from ALLOWED_TAGS that best describe the song's vibe.
          - If you have more than 3 to describe a song, please pick the best 3.
          - If uncertain, pick exactly 1 tag (your best guess).
          - Write a SHORT rationale (≤ 160 characters). Do not mention this limit explicitly.

          INPUT:
            - Title: "${track.title}"
            - Artist: "${track.artist}"
            - Audio: tempo=${track.tempo} bpm, energy=${track.energy}, valence=${track.valence}

          OUTPUT (STRICT):
            Return ONLY a JSON object (no markdown, no extra text) with exactly these keys:
            {
              "tags": ["tag1","tag2"],  // subset of ALLOWED_TAGS, length 1..3
              "rationale": "short reason"
            }
        `.trim();
      }

      /**
       * 
       * an interesting output is that sometimes, we do not necessarily receive a correct JSON files and this can be for a multitude of reasons: wrong tags, wrong syntax, wrong key
       * As a result, we can better finetune the LLM prompt to minimize this issue and ensure a stronger "specification". I was already doing this already before but I added what
       * the inputs and outputs are so the model could understand, which could be a way of doing prompt variation to ensure it worked, however, to add even further onto this, I added
       * examples for the LLM to see what it is doing wrong. Even so, this can still fail if context gets insanely long and maybe it starts hallunicating. We can ensure this works even
       * more by potentiall adding another LLM that checks the output it gives
       * 
       */
      private createTagPromptVariantC(track: Track): string {
        return `
          You label the MOOD/VIBE of a song.

          ALLOWED_TAGS (choose only from this list):
          ${VIBE.join(", ")}

          RULES:
            - If energy >= 0.6 AND valence >= 0.6, prefer {upbeat, energetic, bright}. Avoid melancholic/dark unless audio contradicts.
            - If energy >= 0.6 AND valence <= 0.4, prefer {energetic, dark}. Avoid bright.
            - If uncertain, return exactly 1 best tag.

          INPUT:
            - Title: "${track.title}"
            - Artist: "${track.artist}"
            - Audio: tempo=${track.tempo} bpm, energy=${track.energy}, valence=${track.valence}

          OUTPUT (STRICT):
            Return ONLY a JSON object (no markdown, no extra text) with exactly these keys:
            {
              "tags": ["tag1","tag2"],  // subset of ALLOWED_TAGS, length 1..3
              "rationale": "short reason"
            }

          EXAMPLES (for format only):
            GOOD:
              {"tags":["upbeat","bright"],"rationale":"Fast feel and cheerful tone."}
            BAD:
              I think it's upbeat.   // (wrong: not JSON)
              {"labels":["upbeat"]}   // (wrong: key not allowed)
              {"tags":["happy"]}      // (wrong: tag not allowed)
          `.trim();
      }
}
