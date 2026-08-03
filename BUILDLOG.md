Day 1 - Kickoff and ToolChain - June 29, 2026
		I completed all steps of Day 1.
		
Day 2 - Game-Loop: XP economy - June 30, 2026
		I completed a draft of the Gameloop for the app. I went a bit ahead and did work for the following days to flesh out the gamification, but some improvements and changes can be made in the following days. Keeping ahead of schedule will likely prove useful down the line.

Day 3 + 4 - Game-Loop: Roughing Everything Out - July 1, 2026, July 2, 2026
		Because I had gotten ahead of schedule for the game design dog, I simply took some time to rough out edges.
		
Day 5 - Took Off - July 3

Day 6 - Brand + curriculum + Setup for Screen Lists - July 6

Day 7 and 8 - Screen Lists for Account + AI, Progress + Connect - July 7, 8
		I completed the Screen List document to outline what the app will be framed like.

Day 9 - Wireframes - July 9
		I drew 6 wireframes for some of the most important screens, those being --- Onboarding, Learn Home, Lesson Page, Pathway View, Workout Preview, Active Workout.

Day 10 - Architecture/SPEC.md + data model
		I imported the wireframes in and had Claude input them into the screenList doc where I can review over the coming days and make changes. Then I assembled the spec doc to make a "bible," and had Claude generate an SQL schema for the database.

Day 11 - ExpoGo and VS Setup - July 13
        app runs on my phone, live updates work, pushed to GitHub.

Day 12 - Supabase Setup and Expo Testing - July 14
		Supabase project live, schema ran clean, app reads content_items on my phone. Bug of the day: unsaved .env.

Day 13 - Sign-in Testing - July 15-17 
		Temp domain authenticated, OTP emails flowing both templates. Under-13 locks until consent granted. Bug of the day: unsaved template edits. TODOs: Apple Sign-In (EAS), real consent email (Edge Function), legal review pre-launch.

Day 14 - Onboarding Flow - July 17
		Claude wrote the onboarding and authorization code for me, I tested in Expo. The database was properly updated, signifying that everything worked.

Day 15 - Navigation Shell + Theme Testing - July 20
		Five bottom tabs, theme tokens file with demo-site palette, all screens restyled. App looks like one product now.

Day 16 - Training/Timer Setup - July 20
		Claude wrote code to create a mock timer for First Bell. I ensured that all content can be changed and restructured as we go on with development.

Day 17 - TTS Setup - July 21
		TTS callouts on cadence, spoken transitions, summary screen writes to xp_events via complete_activity — anti-grind confirmed in-app. Voice + pacing are placeholders pending client.

Day 18 - Mark as Complete - July 22
		(light day — pipeline pre-built Day 10). Learn tab marks lessons complete via the same RPC as workouts; XP/level chip live. Mixed event types verified in xp_events.

Day 19 - Progress and Level Bars - July 23
		Dashboard live — bar moves on completion, level computed from level_curve table, streak and recent activity showing real data. LEVEL UP overlay fired crossing 250 XP → LV 3.

Day 20 - Freeze Banking - July 24
		refresh_daily engine live — quests auto-ticking from the event stream, all-3 bonus pays, freeze simulation verified end-to-end (streak survived a missed day, freeze consumed, no re-grant until Monday). Supabase connector now lets Claude run migrations directly. Timezones recalibrated.

Day 21 - Belts and Ranks - July 27
		Rank ladder live end-to-end. Ladder is data (rank_tiers + rank_degrees pointing at pathways), so retuning it is a row edit not a code change. New rank_status() RPC returns the whole screen in one call; try_rank_up() still does the actual promoting server-side. Prospect → Novice I → II → III seeded with placeholder pathways. Dry-ran the promotion in a rolled-back transaction: rank-up succeeded, second attempt correctly blocked on the two unfinished Footwork items. Ethics arrays deliberately empty — the gate goes on tomorrow. Design catch of the day: a degree pointing at an empty pathway would have handed out a free belt, so the migration now refuses to apply if that's ever true.

Day 22+23 - Ethics Gate + Lesson Pages (merged) - July 27
		The spine of the product is in: rank-up now requires words first. Novice II demands the "Cool Down the Room" LESSON; try blocked with boxing done green words-first prompt linking straight to the lesson. Built the lesson page while I was at it — video player (sample clip), key steps, and the D9 scroll-to-the-end gate on Mark Complete. Learn tab now opens lesson pages instead of inline buttons. Merged the two days because Day 22's "link to the missing LESSON" needed Day 23's page to link to. Verified the block-then-unlock loop in a rolled-back DB transaction before touching the app. Phase 3 debt flagged: ethics completes via the lesson button until the real scenario flow exists.

Day 24 - Pathways Engine (The Journey) - July 27
		D1 built as designed: pathways are a prerequisite graph, not a checklist. pathway_nodes grew prerequisite_node_ids; a node is OPEN when its prereqs are done, kids choose order wherever the graph branches. Seeded "The First Week" — 8 steps, two branch points (words or gloves after Stance; footwork or defense after First Bell), one closing ethics checkpoint that needs every line finished. New pathway_map() RPC computes done/open/locked server-side. Learn tab now leads with pathway cards; /pathway/[id] draws the journey. Migration refuses prereq cycles and cross-pathway prereqs. Also added "Hold the Door" ethics LESSON to Novice III so the words-first block can be seen live (I completed the ethics lesson before trying to rank up last time, so the gate never had anything to refuse).
		Evening addendum: found and fixed a real bug from Jigar's live test — the lesson screen is one reused instance inside the tab navigator, so opening a second lesson kept the first lesson's "completed" state on screen. Hold the Door looked done without ever being completed; the server rightly kept refusing the rank-up. Fix: reset page state whenever the lesson id changes. Also rebuilt the Journey per Jigar's direction: Learn tab now categorized (The Journey / Belt pathways / Optional, each with difficulty — all data columns), and the pathway view is a spider-web of connected nodes (SVG threads, depth rows, gold = open = your choice) instead of a list.

Day 25 - Articles + Library Search - July 30 (same day as 24 — running a day ahead)
		Light day as promised. Two placeholder articles seeded (Eat Like You Train / nutrition, Breathe First / conflict) — the pillar check constraint from Day 3 rejected my invented "mindset" pillar and it was right to; breathing went under conflict where it belongs. Learn tab's flat list became a Library: grouped by the four pillars, title search on top, typing hides the pathway shelves to focus results. Lesson page can now carry an optional article hero image. Articles reuse the whole lesson-page machinery — no new screens, no new routes.

Day 26 - First Interactive Scenario - July 31
		The signature feature is alive. Built the scenario player: situation, choices, per-choice consequences (green when the discipline holds, red when the hallway wins), multi-step branching, every path ending in the TRUTHFUL reflection before completion. Wrote "The Longest Ten Seconds" — the lunch-line provocation with fight/talk/walk paths and a second decision under "talk." Wired as the ethics gate on Amateur I (boxing side = the whole First Week pathway). Ethics items with a scenario no longer complete through the reading page — the scenario IS the path, per D9. Bad choices still complete the LESSON: consequences are the teacher, not the grade. "Run it back" replays free; XP dedupe stops farming. Dry-ran in a rolled-back transaction: blocked on the scenario, promoted to Amateur I after playing it.
