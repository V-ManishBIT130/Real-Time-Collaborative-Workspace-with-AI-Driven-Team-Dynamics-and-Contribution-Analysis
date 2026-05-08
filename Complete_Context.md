# Team Cognition Analysis Platform (CollabLens)
## Complete Project Context Document — Updated Reference

> This document is the single source of truth for the CollabLens project.
> It reflects all design decisions, architectural choices, research grounding,
> clarifications, and competitive positioning as of the latest project discussions.
> Any AI, team member, evaluator, or reviewer should be able to fully understand
> the project from this document alone.

---

## Table of Contents

1. What Is This Project?
2. Why Does This Project Exist?
3. The Problem We Are Solving
4. What Makes This Different From Existing Tools?
5. How Does The System Work? (Simple Explanation)
6. How Does The System Work? (Technical Explanation)
7. System Architecture
8. Input Channels — Text, Voice, Whiteboard, Code
9. Detailed Feature Breakdown
10. The AI Engine — What It Analyzes
11. The Team Intelligence Report
12. Problem Design Philosophy
13. Sample Problems
14. Technology Stack
15. Database Design
16. User Flow (Step by Step)
17. API Design
18. AI Models Used — Important Clarification
19. Evaluation & Testing Plan
20. Research Foundation
21. Comparison With Existing Tools (Full)
22. Key Differentiators
23. Future Scope
24. One-Liner Definitions (For Viva)
25. Glossary of Terms

---

## 1. What Is This Project?

### For a Child (Simple Explanation)

Imagine 4 friends sit together to solve a puzzle.
One friend has lots of ideas. One friend is quiet.
One friend keeps repeating the same thing.
One friend says something brilliant that solves everything.

After they finish, our AI teacher looks at everything
they said and draws a report card — not about WHO was
right, but about HOW they worked TOGETHER.

Did they listen to each other?
Did they try many different ideas?
Did they get stuck? How did they unstick?
Whose idea became the final answer?

That's what our project does. It watches teams
collaborate and then tells them HOW they collaborated.

### For a Professional (Formal Explanation)

The Team Cognition Analysis Platform (CollabLens) is a real-time
collaborative workspace integrated with an AI-powered analytics engine
that measures collective intelligence patterns in small teams.

Teams of 3-5 members join a shared session containing a chat interface,
voice input channel, collaborative whiteboard, and shared code editor.
They work together on a structured problem for 10-12 minutes.

Upon session completion, the AI engine performs semantic analysis,
communication network analysis, temporal pattern detection, and
contribution quality assessment to generate a comprehensive
Team Intelligence Report.

The system does NOT assist teams during collaboration.
It observes, analyzes, and reports — functioning as a
cognitive microscope for team collaboration.

### For a Professor (Academic Explanation)

This project implements a multi-user real-time collaboration platform
with an integrated NLP-based analytics pipeline that operationalizes
Woolley et al.'s (2010) collective intelligence construct.

Using sentence embeddings (Sentence-BERT), zero-shot classification,
density-based clustering (DBSCAN), social network analysis (NetworkX),
and temporal pattern detection, the system produces quantitative metrics for:

- Contribution equity
- Idea diversity (exploration vs fixation)
- Communication network topology
- Cognitive stuck states and recovery patterns
- Semantic idea evolution over time

Input is multi-modal: text chat, voice (transcribed via Web Speech API / Whisper),
whiteboard activity, and code editor activity — all unified into a single
analysis pipeline.

The platform bridges the gap between collaboration tools (which enable teamwork)
and collaboration analytics (which measure teamwork quality) — a gap identified
in Kasepalu et al. (2022) and the broader CSCL literature.

---

## 2. Why Does This Project Exist?

### The Real-World Context

In every organization, school, and company:
- Teams work together to solve problems
- Some teams are brilliant together
- Some teams fail despite having smart individuals
- Nobody knows WHY some teams click and others don't
- There's no tool to measure HOW a team thinks together

**GOOGLE** discovered this in 2012 (Project Aristotle):
> "Who is on a team matters less than HOW the team works together."

They found that the #1 predictor of team success is NOT individual talent —
it's psychological safety, communication equality, and collective problem-solving patterns.

**WOOLLEY et al. (2010, Science)** proved that groups have a measurable
"collective intelligence" (c factor) that predicts team performance —
just like IQ predicts individual performance.

But here's the problem:
- Google's findings are based on surveys and interviews
- Woolley's research is based on controlled lab experiments
- NEITHER provides a real-time, automated tool that teams can use in practice
- There is NO product that measures collective intelligence during actual collaboration

That is the gap. That is why this project exists.

### Who Benefits From This?

**Students:**
- Understand their collaboration patterns
- Learn that "being smart" isn't enough — HOW you communicate matters
- Get feedback on teamwork (not just code quality)
- Develop better team skills before entering industry

**Teachers / Professors:**
- See which student teams collaborate well
- Identify struggling teams before it's too late
- Evidence-based assessment of teamwork quality
- Research data on collaboration patterns

**Companies:**
- Measure team dynamics during hackathons
- Identify collaboration bottlenecks
- Data-driven team formation
- Training teams to collaborate better

**Researchers:**
- Automated data collection for CSCL research
- Quantitative metrics for collaboration quality
- Reproducible, scalable team cognition measurement
- Platform for running controlled experiments

---

## 3. The Problem We Are Solving

**PROBLEM STATEMENT:**

Current collaboration tools (Slack, Google Docs, Microsoft Teams, Otter.ai,
Fireflies.ai, Microsoft Facilitator) measure ACTIVITY — message counts,
transcripts, edit history, time spent online, action items.

They do NOT measure COGNITION — how ideas form, evolve, compete, merge,
and become solutions in team discussions.

There is no existing system that:
1. Provides a structured multi-modal collaboration environment (text + voice + whiteboard + code)
2. Captures and unifies multi-modal team interaction data
3. Performs real-time semantic analysis of team discourse
4. Generates quantitative metrics for collaboration quality
5. Produces an actionable Team Intelligence Report focused on cognitive patterns

This project bridges that gap.

**FORMAL PROBLEM STATEMENT (for report/paper):**

> "How can we design and implement a system that captures real-time
> multi-modal team collaboration data (text, voice, whiteboard, code)
> and applies NLP-based semantic analysis, communication network analysis,
> and temporal pattern detection to produce quantitative, interpretable
> metrics of collective intelligence in small team problem-solving sessions?"

---

## 4. What Makes This Different From Existing Tools?

### The Core Difference

**EXISTING TOOLS measure ACTIVITY:**
- "Rahul sent 45 messages"
- "Priya edited 12 lines"
- "Meeting lasted 47 minutes"
- "Rahul spoke for 4 minutes" (Fireflies)
- "Action items assigned to Rahul" (Microsoft Facilitator)

**OUR SYSTEM measures COGNITION:**
- "Rahul proposed 3 unique approaches, 2 were adopted"
- "Priya's message at 5:45 broke a 75-second stuck period"
- "Team explored 5 idea clusters but fixated on 1 after 4 minutes"
- "Communication network shows Amit was systematically isolated"
- "Collective exploration score: 0.34 (low). Team converged too early."

**ACTIVITY tells you WHAT happened.**
**COGNITION tells you HOW the team THOUGHT.**

We measure cognition. Nobody else does.

### Detailed Comparison Table

| FEATURE | Slack | Google Docs | Otter.ai | Fireflies.ai | MS Facilitator | MS Teams | Replit | OURS |
|---|---|---|---|---|---|---|---|---|
| Real-time chat | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Voice transcription | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Shared whiteboard | ❌ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ❌ | ✅ |
| Shared code editor | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| All tools integrated | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Structured problems | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Timed sessions | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Meeting summary/notes | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Action items | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Talk time % | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ (deeper) |
| Semantic idea tracking | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Idea cluster detection | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Contribution QUALITY | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Stuck detection | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Exploration vs fixation | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Communication network | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Temporal cognitive map | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Team Intelligence Report | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Measures HOW team thought | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Specific Competitor Positioning

**vs Microsoft Facilitator Agent:**

Microsoft Facilitator is a smart secretary. It sits in your meeting, takes notes,
manages agendas, moderates discussions, and sends a post-meeting recap with action items.
It helps teams DURING the meeting. It is a productivity tool.

Our project is a sports analyst. It silently watches the team work, and AFTER the session,
tells you HOW the team thought — not just what they decided. It is a cognition measurement tool.

| Dimension | Microsoft Facilitator | CollabLens |
|---|---|---|
| Purpose | Help team work better during meeting | Analyze how team thought after session |
| Output | Notes, action items, summaries | Cognitive metrics, influence networks, stuck detection |
| Measures | What was decided | How thinking evolved |
| Intervenes during session? | Yes, actively | No, purely observes |
| Target use case | Enterprise meetings | Structured problem-solving sessions |
| Research grounding | None (productivity tool) | Woolley et al. (2010), Project Aristotle |

**vs Otter.ai / Fireflies.ai:**

Both are transcription and meeting summarization tools. They tell you WHAT was said.
We tell you HOW the team thought. Fireflies has a "conversation intelligence" feature
that measures talk time and interruptions — but that is still activity measurement,
not cognitive pattern measurement.

Neither tool detects stuck periods, exploration breadth, idea clusters,
or communication influence networks. Those are our differentiators.

**One-line pitch when someone mentions these tools:**

> "Does Otter.ai tell you when a team got stuck and who broke the deadlock?
> Does it give you an exploration score? Does it show you who was isolated
> in the communication network? No. Conversation closed."

---

## 5. How Does The System Work? (Simple Explanation)

**STEP 1: CREATE A ROOM**
One person creates a room. They get a 6-digit room code (like "482910").
They share this code with their team (3-5 people).

**STEP 2: EVERYONE JOINS**
Team members open the website, enter the room code and their name.
They're now in the same room.

**STEP 3: SEE THE PROBLEM**
Everyone sees the same problem on screen.
Example: "Your e-commerce app crashed during a flash sale. As a team, diagnose the issue and propose a fix."
The timer starts (10 or 12 minutes).

**STEP 4: COLLABORATE**
The workspace has 4 input channels:
- Chat panel (left side) — type messages
- Voice input — speak, your device transcribes and sends it as text
- Whiteboard (center) — draw diagrams
- Code editor (center, tabbed) — write pseudocode

Everything is real-time — you see each other's messages, drawings, and edits instantly.

**STEP 5: TIME'S UP**
Timer hits zero. Session ends. All collaboration data is saved.

**STEP 6: AI ANALYZES**
Our AI engine receives ALL the data:
- Every chat message (who said what, when)
- Every voice transcript (who said what, when)
- Whiteboard activity (when things were drawn)
- Editor activity (when code was written)
- Timing data (gaps, bursts, patterns)

The AI runs analysis in ~10-30 seconds.

**STEP 7: TEAM INTELLIGENCE REPORT**
Everyone sees a report showing:
- Contribution breakdown (who said/did what, quality of contributions)
- Communication network (who influenced whom)
- Idea clusters (what approaches were discussed)
- Stuck moments (when thinking stalled and who broke the deadlock)
- Exploration score (variety of ideas explored)
- Session timeline (minute-by-minute story)
- Key insights and recommendations

---

## 6. How Does The System Work? (Technical Explanation)

### Data Flow (End to End)

**1. User sends a message (text or voice)**
```
User types in chat OR speaks into mic
        ↓
React emits Socket.IO event:
{ type: "message", userId, text, timestamp, roomCode, source: "text"|"voice" }
        ↓
Node.js Socket.IO server receives event
  ├── Broadcasts message to all users in room
  └── Saves message to MongoDB
        ↓
All users see the message in real-time
```

**2. Voice transcription flow (per device)**
```
User speaks on THEIR device
        ↓
Web Speech API captures audio (browser-native)
        ↓
Transcribed text produced (tagged to this user automatically)
        ↓
Emitted as Socket.IO message with source: "voice"
        ↓
Treated identically to text chat in analysis pipeline
```

**Why no speaker diarization is needed:**
Each user is on their own device. Their microphone captures only their own voice.
The userId is known from the session context — it comes from whoever is logged into
that device. Speaker diarization (figuring out WHO spoke from a shared recording)
is only needed when one microphone captures multiple speakers in a room.
Our architecture sidesteps this problem entirely because input is device-isolated.

**3. Session ends — analysis triggered**
```
Node.js marks session as "completed" in MongoDB
        ↓
Node.js sends POST request to Python ML service with all session data
        ↓
Python runs full analysis pipeline (10-30 seconds)
        ↓
Report JSON returned to Node.js
        ↓
Node.js saves report to MongoDB
        ↓
Socket.IO emits "report_ready" → all users navigate to Report page
```

---

## 7. System Architecture

### Three-Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   FRONTEND (React)                       │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌─────────┐  │
│  │  Chat    │ │  Voice   │ │ Whiteboard │ │  Code   │  │
│  │  Panel   │ │  Input   │ │(Excalidraw)│ │ Editor  │  │
│  │          │ │(Web      │ │            │ │(Monaco) │  │
│  │          │ │Speech    │ │            │ │         │  │
│  └────┬─────┘ │API)      │ └─────┬──────┘ └────┬────┘  │
│       │       └────┬─────┘       │              │       │
│       └────────────┼─────────────┴──────────────┘       │
│                    │                                      │
│              Socket.IO Connection                        │
└────────────────────┼─────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              BACKEND (Node.js + Express)                 │
│                                                          │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │  Socket.IO   │  │   REST API    │  │   Session    │  │
│  │  Server      │  │   Endpoints   │  │   Manager    │  │
│  └──────┬───────┘  └───────┬───────┘  └──────────────┘  │
│         └──────────────────┘                             │
└────────────────────┬────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
┌──────────────────┐  ┌─────────────────────────────────┐
│    MongoDB       │  │    PYTHON ML SERVICE (Flask)     │
│                  │  │                                  │
│  - sessions      │  │  1. Semantic Encoding (SBERT)    │
│  - messages      │  │  2. Message Classification      │
│  - reports       │  │  3. Sentiment Analysis          │
│  - problems      │  │  4. Idea Clustering (DBSCAN)    │
│                  │  │  5. Network Analysis (NetworkX) │
│                  │  │  6. Stuck Detection             │
│                  │  │  7. Exploration Scoring         │
│                  │  │  8. Temporal Timeline           │
│                  │  │  9. Report Generation           │
└──────────────────┘  └─────────────────────────────────┘
```

### SERVICE 1: React Frontend
- **Responsibility:** User interface
- **Port:** 5173 (Vite dev server)
- **Pages:** Landing, Lobby, Session, Report, History

### SERVICE 2: Node.js Backend
- **Responsibility:** Real-time communication, data management, API
- **Port:** 3001
- **Components:** Express REST API, Socket.IO Server, Session Manager

### SERVICE 3: Python ML Service
- **Responsibility:** AI analysis of session data
- **Port:** 5000
- **Note:** This service uses PRE-TRAINED models — we are NOT training any models.
  See Section 18 for full clarification.

---

## 8. Input Channels — Text, Voice, Whiteboard, Code

This is a critical design decision updated from the original spec based on
the valid observation that real teams talk, they don't only type.

### The Four Input Channels

**Channel 1: Text Chat**
- Traditional typed messages
- Each message: userId, text, timestamp, roomCode
- Primary channel in MVP

**Channel 2: Voice Input (NEW)**
- Each user speaks on their own device
- Browser's Web Speech API transcribes speech to text locally
- Transcript emitted as a message tagged to that user
- No speaker diarization needed — device = user identity
- Falls into same analysis pipeline as text messages
- Source field added: `source: "voice"` to distinguish origin

**Why voice doesn't need speaker diarization:**
This is a key architectural insight. Speaker diarization (the hard problem of
figuring out who said what from a shared recording) only applies when one
microphone captures multiple speakers. Since each team member is on their
own device with their own microphone, their speech is automatically attributed
to them by session context. Our architecture makes diarization unnecessary.

**Implementation options (in order of complexity):**
1. **Web Speech API** — browser-native, free, no backend needed, Chrome support excellent
2. **Whisper (OpenAI, open source)** — runs locally via Python, better accuracy, slightly more setup

For MVP, Web Speech API is sufficient and adds no infrastructure overhead.

**Channel 3: Collaborative Whiteboard (Excalidraw)**
- Shared drawing canvas
- Activity tracked with timestamps and userId
- Content not analyzed (out of scope — would need computer vision)
- Temporal correlation with chat/voice activity is analyzed

**Channel 4: Shared Code Editor (Monaco)**
- Full code editor with syntax highlighting
- Edit events tracked with userId and timestamp
- Content snapshot saved at session end
- Temporal correlation with other channels analyzed

### Unified Message Stream

All four channels feed into a single unified message stream in the analysis pipeline:

```
text message   ──┐
voice transcript ─┤──→ unified message stream ──→ ML analysis pipeline
whiteboard event ─┤         (tagged by userId,
editor event   ──┘          timestamp, source)
```

---

## 9. Detailed Feature Breakdown

### Feature 1: Room Management

**CREATE ROOM:**
- Host clicks "Create Room"
- System generates unique 6-digit room code
- Host selects a problem from problem bank
- Host sets timer (10 or 12 minutes)
- Host enters their name
- Room created in "waiting" state

**JOIN ROOM:**
- User enters room code + name
- System validates room exists, is in "waiting" state, and has space
- Max 5 users per room enforced
- All existing users see new user join in real-time

**LOBBY:**
- Shows all current participants
- Shows selected problem title
- Host sees "Start Session" button
- Non-hosts see "Waiting for host to start..."
- Minimum 3 participants to start

### Feature 2: Real-Time Chat

**DATA CAPTURED PER MESSAGE:**
- userId, userName, text, timestamp, roomCode, sessionId, source (text/voice)

**WHY THIS DATA MATTERS:**
- text → semantic analysis (ideas, sentiment)
- userId → contribution tracking
- timestamp → temporal analysis (stuck detection)
- Sequence → reply detection (who responds to whom)
- source → distinguishing voice vs text input patterns

### Feature 3: Voice Input

**HOW IT WORKS:**
- Web Speech API runs in browser on each user's device
- Continuous transcription during session
- Interim results shown to user before finalizing
- Final transcript emitted via Socket.IO as a message
- Visually distinguished in chat (mic icon vs text icon)

**KEY INSIGHT:** Because each device belongs to one user, voice input is
automatically speaker-attributed with no additional complexity.

### Feature 4: Collaborative Whiteboard (Excalidraw)

Drawing canvas, real-time sync, color-coded per user, export as image.
We track WHEN drawing happens and correlate with chat activity.
We do NOT analyze what is drawn (computer vision is out of scope).

### Feature 5: Shared Code Editor (Monaco)

Full VS Code-quality editor, collaborative, real-time sync.
Edit events tracked for temporal analysis.
Conflict resolution: last-write-wins (sufficient for MVP).

### Feature 6: Timer

Server-controlled countdown, synchronized across all clients.
Visual warnings at 2 minutes and 30 seconds.
Auto-ends session at 0:00. Host can end early.

### Feature 7: Problem Display

Structured problem visible to all participants.
Always includes: scenario, 3 options (A/B/C), discussion prompts.
See Section 12 for Problem Design Philosophy.

---

## 10. The AI Engine — What It Analyzes

### IMPORTANT CLARIFICATION: We Are NOT Building/Training Models

This is a frequent point of confusion. The project does NOT involve:
- Training any neural networks
- Fine-tuning any pre-existing models
- Building any ML models from scratch

We are using **pre-trained models** that already exist and applying them
to a new problem domain. Our actual technical contribution is:

1. The **analysis pipeline** that connects all these tools
2. The **stuck detection algorithm** (our own logic using outputs from pre-trained models)
3. The **exploration score formula** (our own entropy calculation)
4. The **real-time collaboration platform** itself
5. The **report generation** and visualization logic

Think of it this way: we didn't build the kitchen, we didn't grow the ingredients.
We are the chef who combines existing ingredients into something nobody has cooked before.
This is completely standard and valid in applied ML / final year projects.

---

### Module 1: Semantic Encoding

**WHAT:** Convert every message (text or voice transcript) into a numerical vector

**HOW:** Sentence-BERT (`all-MiniLM-L6-v2` — pre-trained, we just call it)

**WHY:** Vectors enable mathematical comparison of meaning

```
INPUT:  "What if we use a message queue for the notifications?"
OUTPUT: [0.023, -0.156, 0.891, ..., 0.045]  ← 384 numbers
```

Messages with similar meaning are close together in vector space.
Messages with different meaning are far apart.

This is the foundation of all semantic analysis. Everything else builds on these vectors.

---

### Module 2: Message Classification (Zero-Shot)

**WHAT:** Classify each message by its TYPE

**HOW:** Zero-shot classification (HuggingFace pipeline — pre-trained, no fine-tuning needed)

**CATEGORIES:**
- `new idea` — proposing something the team hasn't discussed
- `building on idea` — extending or refining someone else's idea
- `agreement` — supporting what someone said
- `disagreement` — challenging an idea
- `question` — asking for clarification or input
- `off-topic` — not related to the problem
- `coordination` — logistics ("let me draw it", "I'll type the code")

**WHY ZERO-SHOT:** No training data needed. Categories can be changed without retraining.
Works on voice transcripts exactly the same as text. Accuracy: ~75-85%.

---

### Module 3: Sentiment Analysis

**WHAT:** Detect emotional tone of each message

**HOW:** Sentiment analysis pipeline (HuggingFace — pre-trained)

**OUTPUT:** positive / neutral / negative score (0-1 each) per message

**USAGE:**
- Sentiment drops → possible stuck period
- Sentiment spikes → possible breakthrough
- Per-person sentiment → who's frustrated? who's enthusiastic?

**MODEL:** `cardiffnlp/twitter-roberta-base-sentiment-latest`
(TextBlob as fallback for MVP — simpler, faster, sufficient)

---

### Module 4: Idea Clustering (DBSCAN)

**WHAT:** Group messages into distinct "idea clusters"

**HOW:** DBSCAN clustering on Sentence-BERT embeddings (scikit-learn — just calling the algorithm)

**WHY:** Shows how many different approaches the team explored

**WHY DBSCAN OVER K-MEANS:**
- K-Means requires specifying K (number of clusters) in advance — we don't know how many ideas a team will discuss
- DBSCAN finds K automatically based on density
- DBSCAN handles noise (off-topic messages)
- DBSCAN works well with cosine distance

**EXAMPLE OUTPUT:**
```
Cluster 0: "Database optimization" (12 messages)
Cluster 1: "Caching layer" (8 messages)
Cluster 2: "Code optimization" (5 messages)
Noise: 3 messages (off-topic/coordination)

RESULT: 3 idea clusters. Team explored 3 distinct approaches.
```

---

### Module 5: Communication Network Analysis

**WHAT:** Build and analyze the team's communication graph

**HOW:** NetworkX (Python graph library — calling standard functions)

**BUILDING THE GRAPH:**
- Each participant = a node
- If Person A sends message and Person B responds within 60 seconds → directed edge A→B
- Edge weight = number of such response pairs

**METRICS COMPUTED:**
1. **Degree Centrality** — how many people did this person communicate with?
2. **Betweenness Centrality** — how much information flows THROUGH this person?
3. **Graph Density** — how interconnected is the team? (1.0 = everyone talks to everyone)
4. **Clustering Coefficient** — do people talk in sub-groups?
5. **Reciprocity** — when A talks to B, does B talk back?
6. **Isolated Nodes** — is anyone being ignored?

**NETWORK PATTERNS DETECTED:**
- Healthy Mesh: everyone connected, high density ✅
- Hub-and-Spoke: one person mediates all communication ⚠️
- Fragmented: sub-groups don't communicate ❌
- Broadcast: one person talks, others listen ❌
- Isolated Member: someone cut off ❌

---

### Module 6: Stuck Detection

**WHAT:** Detect periods where the team's thinking stalls

**HOW:** Multi-signal temporal analysis (our own algorithm, built on top of pre-trained model outputs)

**WHAT "STUCK" MEANS:**
- Team is repeating the same ideas
- No new approaches being proposed
- Sentiment is dropping (frustration)
- Messages are semantically very similar
- Long gaps between messages

**DETECTION ALGORITHM (our own design):**
```
Sliding window: look at messages in each 60-second window

Signal 1: Semantic Similarity Spike
  → Average pairwise cosine similarity within window
  → If > 0.75 → messages saying same things
  → Score: 0-1

Signal 2: Sentiment Drop
  → Average sentiment vs previous window
  → Score: 0-1

Signal 3: No New Clusters
  → Did any message start a new DBSCAN cluster?
  → Binary: 0 or 1

Signal 4: Message Gap
  → Average time between messages in this window
  → Score: 0-1

Combined Stuck Score:
stuck_score = (0.35 × similarity_spike +
               0.25 × sentiment_drop +
               0.25 × no_new_clusters +
               0.15 × message_gap)

If stuck_score > 0.6 → flag this window as STUCK
```

**Note on weights:** The weights (0.35, 0.25, 0.25, 0.15) are initial estimates
and will need empirical tuning based on real session data. This is acknowledged
as a limitation in the evaluation section.

**RECOVERY ANALYSIS:**
- WHO sent the recovery message?
- WHAT did they say? (classified by Module 2)
- Was it a "new idea"? A "question"? A "reframing"?
- This tells us HOW the team recovered from being stuck

---

### Module 7: Exploration vs Fixation Score

**WHAT:** Measure how broadly the team explored different approaches

**HOW:** Shannon entropy over idea cluster distribution (our own formula)

**FORMULA:**
```
exploration_score = entropy(cluster_distribution) / log(N_clusters)
Normalized to 0-1 range.
0 = complete fixation on one idea
1 = perfectly balanced exploration of all ideas
```

**INTERPRETATION:**
- 0.0 - 0.3: HIGH FIXATION ⚠️ — locked onto one approach too early
- 0.3 - 0.6: MODERATE EXPLORATION — discussed a few approaches
- 0.6 - 0.8: GOOD EXPLORATION ✅ — healthy divergent then convergent thinking
- 0.8 - 1.0: HIGH EXPLORATION ✅ — thorough exploration of many approaches

---

### Module 8: Temporal Timeline

**WHAT:** Minute-by-minute story of how the session unfolded

**HOW:** Divide session into 30-second windows, aggregate metrics per window

**PHASES DETECTED:**
- Brainstorming: many new ideas, high activity, high exploration
- Debate: disagreements, competing ideas
- Convergence: agreements increasing, discussion narrowing
- Stuck: repetitive messages, sentiment dropping
- Breakthrough: new idea after stuck period, sentiment spike
- Building: editor/whiteboard active, coordination messages
- Wrapping up: summary messages, agreements

---

## 11. The Team Intelligence Report

### Report Structure

```
┌─────────────────────────────────────────────┐
│         TEAM INTELLIGENCE REPORT            │
│  Session: Room 482910                       │
│  Date: March 3, 2026                        │
│  Duration: 10 minutes                       │
│  Problem: "The E-Commerce Crash"            │
│  Participants: 4 | Total Messages: 47       │
└─────────────────────────────────────────────┘
```

**SECTION 1: CONTRIBUTION ANALYSIS**
- Message count per member
- New ideas count
- Building on others count
- Quality score
- Key insight (e.g., who generated most novel ideas despite fewer messages)

**SECTION 2: COMMUNICATION NETWORK**
- Force-directed graph visualization
- Network density, pattern classification
- Highest betweenness centrality member
- Strongest link between members
- Isolated members if any
- Recommendations

**SECTION 3: IDEA EXPLORATION**
- Cluster visualization
- Exploration score with interpretation
- Idea origin tracking (who introduced which cluster, when)

**SECTION 4: STUCK ANALYSIS**
- Timeline with stuck periods highlighted
- Per stuck period: duration, severity, cause, recovery details
- Recovery message text, type, and post-recovery sentiment

**SECTION 5: SESSION TIMELINE**
- Interactive minute-by-minute phase visualization

**SECTION 6: OVERALL INSIGHTS**
- Team strengths
- Areas for improvement
- Collective Intelligence Indicators:
  - Contribution Equity
  - Communication Density
  - Exploration Score
  - Stuck Recovery rate
  - Overall Team Score

---

## 12. Problem Design Philosophy

### Why Not Pure Coding Problems

Pure coding problems (e.g., "Two Sum") have one correct answer.
One person solves it, others watch. Chat has 5 messages total.
No exploration, no debate, no stuck moments. AI gets almost no data.
**Result: terrible for our project.**

### Why Not Pure Abstract Problems

Too vague, no structure, no convergence point, students won't engage.
**Result: too unstructured for our project.**

### Our Approach: Coding-Adjacent Discussion Problems

Real CS scenario + multiple valid approaches + explicit options + discussion prompts
+ pseudocode/design output (not full running code) + every team member can contribute
regardless of DSA skill level + no single correct answer = tradeoffs exist.

**The DISCUSSION is the deliverable, not the code.**

This generates rich, meaningful collaborative discourse that our AI can analyze.

---

## 13. Sample Problems

### Problem 1: The Autocomplete Debate
- **Difficulty:** Medium | **Time:** 12 minutes | **Category:** Algorithm Choice
- **Scenario:** Choose between Trie, HashMap, and Sorted Array for search autocomplete with 1M words
- **Prompts:** Time vs space tradeoffs, scaling, edge cases, pseudocode

### Problem 2: The E-Commerce Crash
- **Difficulty:** Hard | **Time:** 12 minutes | **Category:** Debugging/Diagnosis
- **Scenario:** App crashed during flash sale — 50K concurrent users, DB exhausted, 3 microservices down
- **Options:** A) Database optimization, B) Memory leak fix, C) Architecture overhaul
- **Prompts:** Root cause, immediate fix, long-term solution, prevention, whiteboard architecture

### Problem 3: The Food Delivery API
- **Difficulty:** Easy | **Time:** 10 minutes | **Category:** API Design
- **Scenario:** Design REST API for food delivery app — users, restaurants, orders
- **Prompts:** HTTP methods, request/response bodies, authentication, real-time tracking

### Problem 4: The Database Dilemma
- **Difficulty:** Medium | **Time:** 10 minutes | **Category:** Database Design
- **Scenario:** Social media platform for 5K students — posts, comments, likes, friend graph, real-time chat
- **Options:** A) MySQL, B) MongoDB, C) Hybrid
- **Prompts:** Tradeoffs, data modeling, scaling, real-time chat suitability

### Problem 5: The Performance Crisis
- **Difficulty:** Medium | **Time:** 10 minutes | **Category:** Performance Optimization
- **Scenario:** Web app loads in 8 seconds, need to get under 2 seconds
- **Given:** 15 API calls on load, 3MB JS bundle, 5MB images, no caching, 3s DB queries
- **Options:** A) Frontend optimization, B) Backend optimization, C) Infrastructure

---

## 14. Technology Stack

| CATEGORY | TECHNOLOGY | PURPOSE |
|---|---|---|
| **Frontend** | React | User interface |
| | Vite | Build tool, fast HMR |
| | Socket.IO Client | Real-time communication |
| | Web Speech API | Browser-native voice transcription |
| | Excalidraw | Collaborative whiteboard |
| | Monaco Editor | Code editor (VS Code engine) |
| | Recharts | Charts (bar, pie, line) |
| | react-force-graph | Network graph visualization |
| | React Router | Page navigation |
| | Tailwind CSS | Styling |
| **Backend** | Node.js | Server runtime |
| | Express.js | REST API framework |
| | Socket.IO Server | WebSocket management |
| | Mongoose | MongoDB ODM |
| | cors, dotenv | CORS, environment config |
| **Database** | MongoDB | Data storage (flexible schema, JSON-native) |
| | MongoDB Atlas | Cloud hosting (free tier) |
| **ML Service** | Python 3.10+ | ML runtime |
| | Flask + flask-cors | Lightweight API wrapper |
| | sentence-transformers | Sentence-BERT embeddings |
| | transformers | Zero-shot + sentiment (HuggingFace) |
| | scikit-learn | DBSCAN clustering |
| | NetworkX | Graph analysis |
| | NumPy, SciPy | Numerical computation, entropy |
| | TextBlob | Backup sentiment analysis |
| **Optional/Future** | Whisper (OpenAI) | Improved voice transcription accuracy |
| | Ollama + Llama 3.1 | LLM-generated narrative reports |
| | Yjs | CRDT conflict-free collaborative editing |
| | Docker | Containerization |
| | Redis | Socket.IO scaling |

---

## 15. Database Design

```javascript
// COLLECTION: sessions
{
  _id: ObjectId,
  roomCode: "482910",
  hostUserId: ObjectId,
  problemId: ObjectId,
  status: "waiting" | "active" | "completed",
  participants: [{ userId, name, joinedAt, color }],
  settings: { timerDuration: 600, maxParticipants: 5 },
  startedAt: ISODate,
  endedAt: ISODate,
  createdAt: ISODate
}

// COLLECTION: messages
{
  _id: ObjectId,
  sessionId: ObjectId,
  roomCode: "482910",
  userId: ObjectId,
  userName: "Rahul",
  text: "What if we use Redis for caching?",
  timestamp: ISODate,
  sequenceNumber: 14,
  source: "text" | "voice"   // NEW FIELD — tracks input channel
}

// COLLECTION: whiteboardEvents
{
  _id: ObjectId,
  sessionId: ObjectId,
  userId: ObjectId,
  action: "draw" | "erase" | "move",
  elementData: { ... },
  timestamp: ISODate
}

// COLLECTION: editorEvents
{
  _id: ObjectId,
  sessionId: ObjectId,
  userId: ObjectId,
  changeType: "insert" | "delete" | "replace",
  content: "function rateLimit() { ... }",
  timestamp: ISODate
}

// COLLECTION: problems
{
  _id: ObjectId,
  title: "The E-Commerce Crash",
  description: "...",
  options: [{ label, name, brief }],
  discussionPrompts: ["..."],
  timeLimit: 720,
  difficulty: "hard",
  category: "debugging"
}

// COLLECTION: reports
{
  _id: ObjectId,
  sessionId: ObjectId,
  generatedAt: ISODate,
  contributions: {
    byMember: [{ userId, name, messageCount, newIdeas, buildingOnOthers,
                 agreements, disagreements, questions, offTopic, qualityScore,
                 voiceMessages, textMessages }],  // NEW: voice vs text breakdown
    equity: 0.68
  },
  ideaClusters: [{ clusterId, label, messageCount, percentage,
                   originatorUserId, originatorName, firstMentionTime }],
  explorationScore: 0.74,
  communicationNetwork: {
    density: 0.67, reciprocity: 0.72, pattern: "slightly hub-and-spoke",
    nodes: [{ userId, name, degreeCentrality, betweennessCentrality }],
    edges: [{ from, to, weight }],
    isolatedMembers: ["Amit"]
  },
  stuckPeriods: [{
    startTime: 270, endTime: 345, duration: 75, severity: 0.68,
    semanticSimilarity: 0.82, sentimentDuring: 0.31,
    recoveryUserId, recoveryUserName, recoveryMessage, recoveryType
  }],
  timeline: [{ startTime, endTime, phase, activity, sentiment,
               newClusters, activeParticipants }],
  overallScore: 0.72,
  insights: { strengths: [...], improvements: [...] }
}
```

---

## 16. User Flow (Step by Step)

**FLOW 1: HOST CREATES A SESSION**
1. Opens website → Landing Page
2. Clicks "Create Room", enters name
3. Selects problem, sets timer
4. Gets 6-digit room code, shares with team

**FLOW 2: MEMBER JOINS**
1. Enters room code + name
2. System validates room
3. Lands on Lobby, sees other participants in real-time

**FLOW 3: SESSION BEGINS**
1. Host clicks "Start Session"
2. All users moved to Session Page simultaneously
3. Problem visible, timer starts, all tools active
4. Voice input available immediately

**FLOW 4: DURING SESSION**
1. Users chat (text or voice)
2. Users draw on whiteboard
3. Users write in editor
4. Timer counts down, visual warnings at 2min and 30sec
5. All data saved to MongoDB continuously

**FLOW 5: SESSION ENDS**
1. Timer hits 0:00 or host ends early
2. All inputs become read-only
3. "Analyzing your session..." loading screen
4. Python ML service runs full pipeline (10-30 seconds)
5. Report saved, all users redirected to Report Page

**FLOW 6: VIEWING THE REPORT**
1. All users see Team Intelligence Report simultaneously
2. Interactive visualizations, all sections scrollable
3. Report permanently saved — accessible via History page

---

## 17. API Design

### REST API Endpoints (Node.js)

```
POST   /api/sessions/create          → { sessionId, roomCode }
POST   /api/sessions/join            → { sessionId, userId, participants }
GET    /api/sessions/:sessionId      → { session object }
POST   /api/sessions/:sessionId/end  → { status: "ending" }
GET    /api/sessions/:sessionId/report → { complete report JSON }
GET    /api/sessions/:sessionId/messages → { messages array }
GET    /api/problems                 → { problems array }
GET    /api/problems/:problemId      → { problem object }
GET    /api/users/:userId/history    → { sessions array }
```

### Socket.IO Events

**CLIENT → SERVER:**
```
user:join            { roomCode, userName }
message:send         { roomCode, text, source: "text"|"voice" }
whiteboard:update    { roomCode, elements }
editor:update        { roomCode, content }
typing:start         { roomCode }
typing:stop          { roomCode }
session:start        { roomCode }  (host only)
session:end          { roomCode }  (host only)
```

**SERVER → CLIENT:**
```
user:joined          { userName, participants }
user:left            { userName, participants }
message:received     { userId, userName, text, timestamp, source }
whiteboard:synced    { elements }
editor:synced        { content }
typing:update        { userName, isTyping }
session:started      { problem, timerEnd }
timer:tick           { remainingSeconds }
session:ended        { }
report:ready         { sessionId }
```

### ML Service API (Python Flask)

```
POST /analyze
  Input:  { sessionId, messages[], whiteboardEvents[], editorEvents[], participants[], problem }
  Output: { complete report JSON }
  Time:   10-30 seconds

GET /health
  Output: { status: "ok", models_loaded: true }
```

---

## 18. AI Models Used — Important Clarification

### We Are Using Pre-Trained Models, Not Building Them

All three models used are downloaded from HuggingFace and called directly.
Zero training. Zero fine-tuning. Standard applied ML practice.

### Model 1: all-MiniLM-L6-v2 (Sentence-BERT)
- **Type:** Sentence embedding | **Source:** sentence-transformers
- **Size:** 80MB | **Speed:** ~4000 sentences/sec on CPU | **Output:** 384-dim vector
- **GPU required:** No
- **Usage:** Encoding all messages, cosine similarity, input to DBSCAN, stuck detection

### Model 2: valhalla/distilbart-mnli-12-3 (Zero-Shot Classification)
- **Type:** Zero-shot classifier | **Source:** HuggingFace Transformers
- **Size:** ~500MB | **Speed:** ~50-100 sentences/sec on CPU
- **GPU required:** No
- **Usage:** Classifying messages as new idea / agreement / question / etc.
- **Accuracy:** ~75-85% for our categories (acknowledged limitation)

### Model 3: cardiffnlp/twitter-roberta-base-sentiment-latest
- **Type:** Sentiment analysis | **Source:** HuggingFace Transformers
- **Size:** ~500MB | **Speed:** ~100-200 sentences/sec on CPU
- **GPU required:** No
- **Usage:** Sentiment per message, mood trajectory, stuck/breakthrough detection
- **Alternative:** TextBlob (simpler, faster, less accurate — good for MVP)

### Key Points for Viva

> "We are not building or training any models. We are using pre-trained models
> from HuggingFace and combining their outputs with our own algorithms
> (stuck detection, exploration scoring) to build a novel analysis pipeline
> for team cognition measurement. This is standard practice in applied ML."

Total model size: ~1.1GB. All load once at Flask startup. No GPU required.
Analysis of 50 messages: ~10-30 seconds on CPU.

---

## 19. Evaluation & Testing Plan

### Quantitative Evaluation

**EXPERIMENT DESIGN:**
- **Participants:** 40 students → 10 teams of 4 (realistic: 15-20 students → 5 teams)
- **Procedure:** Each team uses platform for 2 sessions, 12 minutes each, different problems
- **Post-session survey (ground truth):**
  - "Who contributed the most ideas?" (rank members)
  - "Did the team feel stuck? When?" (yes/no + time)
  - "How many different approaches did the team explore?" (number)
  - "Were all members equally involved?" (1-5 scale)
  - "Who influenced the final solution most?" (name)
  - "Rate overall collaboration quality" (1-10)

**COMPARE AI METRICS vs HUMAN PERCEPTION:**

| AI Metric | Survey Metric | Target |
|---|---|---|
| Contribution ranking | Survey ranking | Spearman's ρ > 0.5 |
| Stuck detection (yes/no, when) | Self-reported stuck moments | >70% agreement |
| Exploration score | Self-reported approach count | MAE ±1 |
| Equity score | Self-reported equity perception | r > 0.6 |
| Overall team score | Self-reported quality rating | r > 0.6 |

### Technical Testing

**Unit Tests:** All analysis modules tested on synthetic data with known outputs

**Integration Tests:** End-to-end flow from React → Socket.IO → MongoDB → Flask → Report

**Load Tests:** 5 simultaneous users, 50 messages/minute sustained for 10 minutes

**Edge Cases:**
- Session with only 3 messages (minimal data)
- Session with 200+ messages (heavy data)
- One person sends 90% of messages
- Nobody talks for 2 minutes
- User disconnects and reconnects
- All voice messages, no text
- Mix of voice and text

---

## 20. Research Foundation

**CORE FOUNDATIONAL PAPERS:**

1. **Woolley et al. (2010)** — "Evidence for a Collective Intelligence Factor in the Performance of Human Groups" — *Science* (3000+ citations)
   → Proves groups have measurable collective intelligence. Our project operationalizes this.

2. **Google Project Aristotle (2016)**
   → HOW teams work together predicts success more than WHO is on the team. We measure the "how."

**TECHNICAL METHODOLOGY PAPERS (2021-2025):**

3. Kasepalu et al. (2022) — Collaboration Analytics systematic review — *Computers & Education (Elsevier)*
4. IEEE Transactions on Learning Technologies (2022-2023) — NLP for collaboration analysis
5. Reimers & Gurevych (2019) — Sentence-BERT — Foundation of embedding approach
6. Grootendorst (2022) — BERTopic — Neural topic modeling methodology
7. ACM CSCW (2023) — Collaboration analytics dashboards
8. ACM LAK (2023) — Measuring participation equality
9. IEEE Access (2023) — Social network analysis for teams
10. Taylor & Francis journals — Divergent thinking in teams, computational measurement of ideation

**Total papers in literature review:** 35-40
**Journals:** IEEE, ACM, Elsevier, Springer, Taylor & Francis
**Years:** Primarily 2021-2025 (with 2-3 foundational exceptions)
**All SCOPUS indexed:** Yes

---

## 21. Comparison With Existing Tools (Full)

| | Our Project | Microsoft Facilitator | Otter.ai | Fireflies.ai | Slack/Teams | Google Docs | Replit |
|---|---|---|---|---|---|---|---|
| **Category** | Cognition measurement | Meeting assistant | Transcription | Transcription + CRM | Messaging | Collaboration | Collaborative coding |
| **During session** | Observes silently | Actively assists | Records | Records | Messaging | Editing | Coding |
| **Primary output** | Team Intelligence Report | Notes + action items | Transcript + summary | Transcript + summary | Messages | Document | Code |
| **Measures activity** | ✅ (as input) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Measures cognition** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Idea clustering** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Stuck detection** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Exploration score** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Influence networks** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Research grounding** | Woolley 2010, Project Aristotle | None | None | None | None | None | None |
| **Structured problems** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 22. Key Differentiators

1. **Cognition, not activity** — we track how ideas form, evolve, compete, and merge using sentence embeddings and clustering

2. **Stuck detection** — no existing tool detects when a team's thinking stalls; we use multi-signal temporal analysis

3. **Exploration scoring** — we quantify how broadly a team explored approaches using entropy over idea clusters

4. **Integrated multi-tool workspace** — chat + voice + whiteboard + code editor, all analyzed together

5. **Influence networks, not message counts** — who influenced whom using social network analysis; we detect isolated members and communication hubs

6. **Contribution quality** — distinguishing "new idea" from "yeah I agree" using zero-shot classification

7. **Temporal narrative** — minute-by-minute story of how the session unfolded, not just final numbers

8. **Voice input without diarization** — multi-device architecture makes speaker attribution automatic; we get voice data without the hard speaker separation problem

---

## 23. Future Scope

1. **LLM-Generated Narrative Report** — Ollama + Llama 3.1 to write natural language analysis instead of template text

2. **Real-Time Facilitator Dashboard** — instructor view with live metrics; does NOT show to team (avoids influencing behavior)

3. **Whisper Integration** — upgrade from Web Speech API to Whisper for better transcription accuracy on difficult speech

4. **Video Analysis** — camera feeds for engagement signals (facial expression, attention) — research frontier

5. **Team Formation Recommendation** — suggest optimal team compositions based on past session data

6. **Longitudinal Tracking** — same team across sessions, track improvement in collaboration patterns

7. **Yjs CRDT Integration** — proper conflict-free collaborative editing for code editor

8. **Export & Integration** — PDF reports, Google Classroom / Canvas integration, API for third-party tools

9. **Mobile Support** — responsive design for phone/tablet participation

10. **Gamification** — team badges, improvement streaks, optional leaderboard for classes

---

## 24. One-Liner Definitions (For Viva)

**WHAT DOES YOUR PROJECT DO?**
> "Teams collaborate on a structured problem using shared chat, voice, whiteboard, and code editor.
> Our AI silently analyzes the collaboration and generates a Team Intelligence Report showing
> contribution patterns, idea exploration, stuck moments, and communication networks —
> measuring HOW the team thinks together, not just WHAT they produce."

**HOW IS THIS DIFFERENT FROM SLACK?**
> "Slack tells you Rahul sent 45 messages. Our system tells you Rahul proposed 3 unique ideas,
> 2 were adopted by the team, and his message at 5:45 broke a 75-second stuck period.
> We measure cognition, not activity."

**HOW IS THIS DIFFERENT FROM MICROSOFT FACILITATOR?**
> "Facilitator is a smart secretary — it helps teams during the meeting with notes and action items.
> We're a sports analyst — we silently watch, then tell you HOW the team thought.
> Facilitator is a productivity tool. We're a cognition measurement tool."

**HOW IS THIS DIFFERENT FROM OTTER.AI / FIREFLIES.AI?**
> "Otter transcribes what was said. Fireflies tells you who spoke how long.
> We tell you when the team got stuck, who broke the deadlock, whether they
> explored enough ideas, and who was isolated in the communication network.
> They measure activity. We measure cognition."

**WHAT AI DO YOU USE?**
> "Sentence-BERT for semantic embeddings, zero-shot classification for message typing,
> DBSCAN for idea clustering, NetworkX for communication graph analysis, and temporal
> pattern detection for stuck moments. All models are pre-trained — we use them,
> we don't build them. All run on CPU, no GPU required."

**ARE YOU BUILDING/TRAINING MODELS?**
> "No. We use pre-trained models from HuggingFace and combine their outputs with
> our own algorithms — stuck detection, exploration scoring — to build a novel
> analysis pipeline. Building the pipeline and the platform is our contribution."

**HOW DO YOU HANDLE VOICE WITHOUT DIARIZATION?**
> "Diarization — figuring out who said what from a shared recording — is only a problem
> when one microphone captures multiple people. Since each team member is on their
> own device, their microphone captures only their voice, attributed to them automatically
> by session context. Our architecture makes diarization unnecessary."

**WHAT'S THE RESEARCH BASIS?**
> "Woolley et al. proved in Science (2010) that groups have measurable collective intelligence.
> Google's Project Aristotle confirmed that HOW teams work together predicts success better
> than WHO is on the team. Our system is the first tool that automatically measures
> these collaboration patterns in real-time."

**WHY NOT JUST USE GPT/CHATGPT?**
> "ChatGPT helps teams work. Our system studies how teams work. We're not an AI assistant —
> we're an AI observer that produces quantitative, traceable analytics about collaboration
> quality. These are fundamentally different purposes."

**WHAT'S UNIQUE ABOUT YOUR PROJECT?**
> "Three things no existing tool does: First, we track IDEAS semantically, not just message counts.
> Second, we detect when a team's thinking gets STUCK and how they recover. Third, we quantify
> exploration versus fixation — whether a team considered many approaches or locked onto one too early."

---

## 25. Glossary of Terms

| TERM | DEFINITION |
|---|---|
| Collective Intelligence | A group's general ability to perform well on a variety of tasks. Analogous to IQ for individuals. Proven to be measurable by Woolley et al. (2010). |
| Sentence Embedding | A numerical vector representation of a sentence's meaning. Similar sentences have similar vectors. |
| Sentence-BERT | A pre-trained neural network model that converts sentences into 384-dimensional vectors. We use it, we don't build it. |
| Cosine Similarity | A measure of how similar two vectors are. 1 = identical, 0 = unrelated, -1 = opposite. |
| DBSCAN | Density-Based Spatial Clustering. Finds clusters automatically without needing to specify number of clusters. Handles noise (outliers). |
| Zero-Shot Classification | Classifying text into categories the model was never explicitly trained on. Works out of the box for custom label sets. |
| Sentiment Analysis | Detecting emotional tone of text as positive, neutral, or negative. |
| Speaker Diarization | The problem of figuring out who said what from a shared audio recording. NOT needed in our project because each device = one user. |
| Web Speech API | Browser-native speech-to-text API. No backend required. Chrome support excellent. Used for voice input in our platform. |
| Whisper | OpenAI's open-source speech recognition model. More accurate than Web Speech API. Future upgrade path. |
| Social Network Analysis | Studying relationships and information flow in a group by modeling it as a graph (nodes = people, edges = communication). |
| Betweenness Centrality | How much information flows THROUGH a particular person in the communication network. High = communication hub. |
| Degree Centrality | How many direct communication connections a person has. High = talks to many people. |
| Graph Density | Ratio of actual connections to possible connections. 1.0 = everyone talks to everyone. |
| Shannon Entropy | Measure of randomness/diversity in a distribution. Used to compute exploration score. High entropy = messages spread across many idea clusters. |
| Exploration Score | 0-1 metric measuring how broadly a team explored different approaches. Based on entropy over cluster distribution. Our own formula. |
| Fixation | When a team locks onto one approach too early without considering alternatives. Indicated by low exploration score. |
| Stuck Period | Time window where team's thinking stalls — repetitive messages, no new ideas, declining sentiment. Detected by our multi-signal algorithm. |
| Recovery Message | The first message that breaks a stuck period. We analyze who sent it and what type it was. |
| Contribution Quality | Distinguishing "new idea" messages from "yeah I agree" messages. We measure quality, not just quantity. |
| Temporal Narrative | Minute-by-minute story of how a session unfolded — phases like brainstorming, debate, stuck, breakthrough. |
| Socket.IO | JavaScript library enabling real-time bidirectional communication between browser and server. |
| MERN Stack | MongoDB + Express + React + Node.js. Our full-stack JavaScript foundation. |
| Flask | Lightweight Python web framework. Used to expose our ML analysis pipeline as an API. |
| Excalidraw | Open-source virtual whiteboard. Used for collaborative drawing in our platform. |
| Monaco Editor | The code editor powering VS Code. Used as web component in our platform. |
| NetworkX | Python library for creating and analyzing complex networks and graphs. |
| CSCL | Computer-Supported Collaborative Learning. The research field our project contributes to. |
| HuggingFace | Open-source AI platform hosting pre-trained ML models. We download our models from here. |
| Pre-trained Model | A model already trained on large datasets by researchers. We use these directly without training. |
| Activity Measurement | Counting what happened (message counts, time spent, talk time). What existing tools do. |
| Cognition Measurement | Measuring how thinking evolved (idea flow, stuck moments, exploration breadth). What our project does. |

---

## Final Summary

**PROJECT NAME:** Team Cognition Analysis Platform (CollabLens)

**ONE-LINE SUMMARY:**
A real-time multi-modal collaboration platform (text + voice + whiteboard + code)
with AI-powered cognitive analysis that studies HOW teams think together —
tracking ideas, communication patterns, stuck moments, and exploration breadth
to generate a Team Intelligence Report.

**CORE INNOVATION:**
Measuring team COGNITION (idea flow, thinking patterns, collective intelligence)
instead of team ACTIVITY (message counts, time spent, edits made, transcripts).

**WHAT WE BUILD:**
- Real-time multi-modal collaboration platform (React + Node.js + Socket.IO)
- Analysis pipeline connecting pre-trained models with our own algorithms
- Stuck detection algorithm (our design)
- Exploration scoring formula (our design)
- Team Intelligence Report with visualizations

**WHAT WE DON'T BUILD:**
- Any ML models (we use pre-trained ones)
- Any new ML architectures
- Speaker diarization (not needed — device = user)

**TECH STACK:**
React + Node.js + Socket.IO + MongoDB + Python Flask +
Sentence-BERT + Zero-Shot Classification + DBSCAN +
NetworkX + Sentiment Analysis + Web Speech API

**INPUT CHANNELS:** Text chat, Voice (Web Speech API), Whiteboard, Code Editor

**TARGET USERS:**
Students, educators, researchers, and organizations who want to
understand and improve team collaboration.

**RESEARCH FOUNDATION:**
Woolley et al. (2010, Science) — Collective Intelligence
Google Project Aristotle (2016) — Team Effectiveness
35+ papers from IEEE, ACM, Elsevier, Springer (2021-2025)

**COMPETITIVE POSITION:**
Microsoft Facilitator = productivity tool (helps teams work).
Otter.ai / Fireflies.ai = transcription tools (records what was said).
CollabLens = cognition measurement tool (studies how teams thought).

Nothing like this exists. We are building it.

---

*This document reflects all design decisions and discussions as of March 2026.
Last updated to incorporate: voice input channel, Web Speech API integration,
diarization clarification, pre-trained model clarification,
and full competitive positioning against Microsoft Facilitator, Otter.ai, and Fireflies.ai.*
