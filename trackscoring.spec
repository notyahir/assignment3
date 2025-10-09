<concept_spec>
    +: Indicates AI augmentation

    concept: TrackScoring+

    purpose: Compute a resurfacing score that blends staleness with semantic vibe and personal Keep/Snooze signals.

    principle:
    After fetching a user's liked catalog, the concept can operate manually or with an AI augmentation. 

    When augmented, the concept may call an LLM once per track to create a small set of "vibe" tags and a short rationale. These tags are cached (added to state), and if available, will be combined with the manual stateless score to produce an retuned score. If AI tags aren't present, it acts as standard without AI.

    state:
        - a set of Weights with
            a user          User
            a last_playedW  Float
            a liked_whenW   Float
            a num_skippedW  Float 
        - a set of Boosts with
            a user          User
            a track         Track
            a amount        Float
            a update_time   Float
        - a set of Snoozes with
            a user          User
            a track         Track
            a snooze_time   Float
        NEW:
        - a set of Tags with
            a track         Track
            a tags          Set<VIBE>, Enum -> VIBE
            a rationale     String
            a updated_at    Float

          
    actions:
        - score(user: User, track: Track): (s: Float)
            effects: computes a "staleness" score from a user's statistics and adds it to the weights, returns the score
        - preview(user: User, size: Integer [Optional]): (previewTracks: List<Track>)            
            requires: weight of scores exist, number of weights must be greater than or equal to size variable if specified
            effects: previews the tracks specified, amount equal to size if specified
        - keep(user: User, track: Track)
            effects: adds a track to the set of boosts or boosts the float amount that decays over time
        - snooze(user: User, track: Track, until: Float [Optional])
            effects: adds a track to the snooze set and keep its snoozed for 2 weeks unless otherwise specified
        NEW:
        - tag(user: User, track: Track): (tags: Set<VIBE>, rationale: String)
            requires: track is valid
            effects:
                - calls an LLM to infer a set of tags from the VIBE enum and a rationale
                - checks and rejects any unknown tags
                - writes updates to the set of Tags for a track that is tagged
                - returns the tags as a Set<VIBE> and a rationale as a string

        - scoreAI(user: User, track: Track): (s: Float)
            effects: gets the manual staleness score via score() and gets the tags from Tags, returns an adjusted score based off the tags (AI) and the staleness score (manual)

        - previewAI(user: User, size: Integer [Optional]): (previewTracks: List<Track>)
            effects: returns the top scores ranked by scoreAI
    note: 
        - we define a VIBE enum as: {upbeat, energetic, mellow, chill, melancholic, dark, bright} with these labels to categorize a song. 
        - the labels for the VIBE enum are not set in stone. can clearly be reworked. However, when deployed, if an LLM suggets a label (hallucinates) outside of the set, it will be rejected 

        - tag is an optional action, concept is usable without calling it
        - scoreAI doesn't decrease functionality, if tags are missing or invalid, behaves like score

        - scores are computed on the fly, might be useful to have a small cache but a function can recompute scores when needed
</concept_spec>