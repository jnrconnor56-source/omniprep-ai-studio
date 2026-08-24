import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as mammoth from "mammoth";
import {
  BookOpen, Workflow, PenTool, ClipboardList, Timer, Layers,
  Sun, Moon, Settings, X, Check, ChevronRight, ChevronDown, ChevronLeft,
  Search, Upload, FileText, Sparkles, Send, Loader2, AlertTriangle,
  Star, Flag, ZoomIn, ZoomOut, Maximize2, Copy, Plus, Minus, Play,
  Pause, RotateCcw, ArrowLeft, TrendingUp, GraduationCap, Brain,
  ListChecks, RefreshCw, Filter, Info, CheckCircle2, CircleDashed,
  MapPin, Grid3x3, LayoutTemplate, Link2, KeyRound, Trash2
} from "lucide-react";

/* ============================================================================
   OMNIPREP AI STUDIO
   Single-file React + Tailwind study / research / visual-learning hub,
   wired for the Gemini API with a full offline "study pack" fallback so
   every tab works immediately, with or without a live key.
============================================================================ */

/* ---------------------------- Design tokens ------------------------------ */
const THEME = {
  dark: {
    bg: "#0B1020",
    bgSoft: "#0F1526",
    panel: "#131B2E",
    panel2: "#171F35",
    border: "#232C46",
    borderSoft: "#1B2337",
    text: "#EDEFF5",
    textMuted: "#8B93A7",
    textFaint: "#5B6480",
    amber: "#E8A33D",
    amberSoft: "#3A2C16",
    teal: "#2DD4BF",
    tealSoft: "#0F2A28",
    rose: "#F2637B",
    roseSoft: "#341421",
    ruleLine: "#1A2138",
  },
  light: {
    bg: "#F2F4F9",
    bgSoft: "#EBEEF6",
    panel: "#FFFFFF",
    panel2: "#F7F9FC",
    border: "#E1E5EF",
    borderSoft: "#EAEDF5",
    text: "#161B2C",
    textMuted: "#5C6478",
    textFaint: "#8A91A6",
    amber: "#B9791A",
    amberSoft: "#FBF0DC",
    teal: "#0E8E82",
    tealSoft: "#E3F7F4",
    rose: "#CF3F5D",
    roseSoft: "#FBE7EB",
    ruleLine: "#E7EAF3",
  },
};

const DISPLAY_FONT = "'Fraunces', Georgia, 'Times New Roman', serif";
const MONO_FONT = "'Space Grotesk', 'IBM Plex Mono', ui-monospace, monospace";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Space+Grotesk:wght@400;500;600;700&display=swap');`;

/* ------------------------------- Utilities -------------------------------- */
let __uidCounter = 0;
const uid = (prefix = "id") => `${prefix}_${(++__uidCounter).toString(36)}_${Date.now().toString(36)}`;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function parseJSONLoose(text) {
  if (!text) return null;
  let t = text.trim();
  t = t.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const first = t.indexOf("{");
  const firstArr = t.indexOf("[");
  let start = first;
  if (firstArr !== -1 && (first === -1 || firstArr < first)) start = firstArr;
  if (start > 0) t = t.slice(start);
  try { return JSON.parse(t); } catch (e) {
    const lastCurly = t.lastIndexOf("}");
    const lastSquare = t.lastIndexOf("]");
    const end = Math.max(lastCurly, lastSquare);
    if (end > -1) {
      try { return JSON.parse(t.slice(0, end + 1)); } catch (e2) { return null; }
    }
    return null;
  }
}

function friendlyError(e) {
  const msg = String(e?.message || e || "");
  if (msg.includes("NO_KEY")) return "No Gemini API key set — running on the offline study pack.";
  if (msg.includes("API_ERROR")) return "Gemini API declined the request — falling back to the offline study pack.";
  if (msg.includes("EMPTY")) return "Gemini returned an empty response — using the offline study pack instead.";
  return "Couldn't reach Gemini — using the offline study pack instead.";
}

/* --------------------------- Gemini API engine ---------------------------- */
async function callGemini({ apiKey, system, prompt, json = false }) {
  if (!apiKey) throw new Error("NO_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: json ? { responseMimeType: "application/json", temperature: 0.6 } : { temperature: 0.7 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("API_ERROR_" + res.status);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
  if (!text) throw new Error("EMPTY_RESPONSE");
  return text;
}

/* ---------------------- System instructions (routing) ---------------------- */
function systemFor(mode, documentText) {
  if (mode === "document") {
    return `You are Omniprep's Document-Grounded Study assistant. You must answer strictly using the
supplied document content below and nothing else. If the answer is not present in the document, say so
plainly instead of guessing. When you use a fact, add a short bracketed citation like [Doc §n] referring
to an approximate section/paragraph number. Be precise, structured, and exam-focused.
--- DOCUMENT START ---
${(documentText || "").slice(0, 8000)}
--- DOCUMENT END ---`;
  }
  return `You are Omniprep AI, an expert multi-subject tutor and researcher (sciences, math, coding,
history, languages). Write clearly structured, comprehensive, exam-relevant explanations with headers,
short paragraphs, and concrete examples. Never pad with filler.`;
}

/* ============================================================================
   FALLBACK / OFFLINE "STUDY PACK" CONTENT GENERATORS
   These make the whole app fully functional with zero network access.
============================================================================ */

const QUICK_ACTION_LABELS = {
  overview: "Topic Overview",
  analogy: "Real-World Analogies",
  steps: "Step-by-Step Problem Solver",
  plan: "7-Day Study Plan",
};

function fallbackNotes(actionType, topic, mode, documentText) {
  const t = topic?.trim() || "your topic";
  if (mode === "document") {
    const words = (documentText || "").trim().split(/\s+/).filter(Boolean);
    const snippet = words.slice(0, 40).join(" ");
    return {
      title: `${QUICK_ACTION_LABELS[actionType] || "Summary"} — from your document`,
      source: "offline",
      body:
`## Grounded in your uploaded document

${words.length ? `The document opens with: "${snippet}${words.length > 40 ? "…" : ""}" [Doc §1]` : "No document text was detected yet — upload a file or paste text above."}

**Offline study pack note:** live Gemini grounding is unavailable right now, so this is a structural
placeholder built from what was actually detected in your document (word count: ${words.length}).

### What I'd normally extract here
- Key definitions and terms, each tagged with [Doc §n]
- The document's main argument or process, restated in plain language
- Any figures, dates, or formulas worth flashcarding

Add a Gemini API key in Settings to generate a fully grounded, cited breakdown of this exact document.`,
    };
  }

  const bodies = {
    overview:
`## ${t}: Topic Overview

**Big picture.** ${t} sits at the intersection of a few core ideas worth locking down before the details:
what it *is*, why it *matters*, and how it *connects* to neighboring topics.

### Core definition
${t} can be understood as a system or concept defined by its inputs, its mechanism, and its outputs —
that three-part lens (in → process → out) is usually the fastest way to hold a new topic in your head.

### Why it shows up on exams
1. It's foundational — later topics assume you already have this down.
2. It has clean cause-and-effect relationships that are easy to test.
3. It connects to at least one other high-yield topic, so examiners like to combine them.

### Key terms to lock down
- The core definition of ${t}
- The main mechanism or process involved
- At least one real-world example or application

*Offline study pack — add a Gemini API key in Settings for live, deeply researched notes on ${t}.*`,
    analogy:
`## ${t}: Real-World Analogies

**Analogy 1 — The factory.** Think of ${t} like a small factory: raw materials come in, a defined process
transforms them step by step, and a finished product comes out the other end. Whenever you get lost in
the details, come back to "what's the input, what's the transformation, what's the output?"

**Analogy 2 — The relay race.** Parts of ${t} often hand off to each other the way runners hand off a
baton — each stage has one job, does it well, and passes control onward. If one runner drops the baton,
the whole system stalls, which is a good way to reason about what happens when a step in ${t} fails.

**Analogy 3 — The recipe.** ${t} can also be read like a recipe: ingredients (starting conditions),
method (the steps in order), and the finished dish (the outcome). Missing an ingredient or step changes
the result predictably — that predictability is usually exactly what's being tested.

*Offline study pack — add a Gemini API key in Settings for analogies tailored precisely to ${t}.*`,
    steps:
`## ${t}: Step-by-Step Problem Solver

**Step 1 — Restate the problem.** Write down what's given and what's actually being asked, in your own
words, before touching ${t}'s formulas or rules.

**Step 2 — Identify the relevant rule or relationship.** For most ${t} problems, one core relationship
does 80% of the work. Find it first.

**Step 3 — Set up before you calculate.** Substitute known values into the relationship symbolically,
double-check units/labels, then simplify.

**Step 4 — Solve and sanity-check.** Compute the result, then ask: does the size and sign of the answer
make sense for ${t}?

**Step 5 — State the answer in context.** A correct number with no interpretation rarely earns full
marks — tie it back to the original question.

*Offline study pack — add a Gemini API key in Settings to walk through a live example problem in ${t}.*`,
    plan:
`## 7-Day Study Plan: ${t}

| Day | Focus | Output |
|---|---|---|
| 1 | Core definitions & vocabulary | Flashcard deck started |
| 2 | Main mechanism / process | One diagram sketched |
| 3 | Worked examples | 3 solved problems |
| 4 | Common exceptions & edge cases | Notes page |
| 5 | Practice questions (MCQ + short answer) | 80% high-yield quiz |
| 6 | Essay / long-form practice | 1 full essay outline |
| 7 | Timed mock exam + review | Diagnostic score |

**Daily rhythm:** 25 minutes focused study → 5 minute break → quick self-quiz on yesterday's material.

*Offline study pack — add a Gemini API key in Settings for a plan tuned to your exact timeline for ${t}.*`,
  };
  return { title: `${QUICK_ACTION_LABELS[actionType] || "Notes"}: ${t}`, source: "offline", body: bodies[actionType] || bodies.overview };
}

/* ----------------------------- Diagram fallback ---------------------------- */
function node(id, label, desc, children = []) { return { id, label, desc, children }; }

function fallbackDiagramTree(topic) {
  const t = topic?.trim() || "Topic";
  const lower = t.toLowerCase();
  if (lower.includes("cycle") || lower.includes("photosynthesis") || lower.includes("process")) {
    return node(uid("n"), t, `The overall process of ${t}, shown as its major stages in order.`, [
      node(uid("n"), "Stage 1: Input", `The starting conditions or raw materials that begin ${t}.`),
      node(uid("n"), "Stage 2: Transformation", `The core mechanism that converts inputs into intermediate products.`),
      node(uid("n"), "Stage 3: Regulation", `Feedback or control steps that keep ${t} balanced.`),
      node(uid("n"), "Stage 4: Output", `The end result or product of ${t}.`),
    ]);
  }
  return node(uid("n"), t, `A structural map of ${t}: its definition, parts, mechanism, and uses.`, [
    node(uid("n"), "Definition", `A precise working definition of ${t}.`, [
      node(uid("n"), "Formal definition", "The textbook-style statement."),
      node(uid("n"), "Plain-language version", "The same idea in everyday words."),
    ]),
    node(uid("n"), "Key Components", `The main parts or variables that make up ${t}.`, [
      node(uid("n"), "Component A", "First major building block."),
      node(uid("n"), "Component B", "Second major building block."),
    ]),
    node(uid("n"), "Mechanism", `How the components of ${t} interact step by step.`, [
      node(uid("n"), "Trigger / cause", "What sets the mechanism in motion."),
      node(uid("n"), "Result / effect", "What the mechanism produces."),
    ]),
    node(uid("n"), "Applications", `Where ${t} shows up in the real world or on exams.`, [
      node(uid("n"), "Example 1", "A concrete, testable example."),
      node(uid("n"), "Example 2", "A second, contrasting example."),
    ]),
  ]);
}

function layoutTree(root, spacingX = 132, spacingY = 108) {
  const out = { nodes: [], edges: [] };
  const xCounter = { val: 0 };
  function walk(n, depth, parentId) {
    if (!n.children || n.children.length === 0) {
      const x = xCounter.val * spacingX;
      xCounter.val += 1;
      out.nodes.push({ id: n.id, label: n.label, desc: n.desc, x, y: depth * spacingY, depth, leaf: true });
      if (parentId) out.edges.push({ from: parentId, to: n.id });
      return { minX: x, maxX: x };
    }
    let minX = Infinity, maxX = -Infinity;
    n.children.forEach((c) => {
      const r = walk(c, depth + 1, n.id);
      minX = Math.min(minX, r.minX);
      maxX = Math.max(maxX, r.maxX);
    });
    const x = (minX + maxX) / 2;
    out.nodes.push({ id: n.id, label: n.label, desc: n.desc, x, y: depth * spacingY, depth, leaf: false });
    if (parentId) out.edges.push({ from: parentId, to: n.id });
    return { minX, maxX };
  }
  walk(root, 0, null);
  return out;
}

/* --------------------------- Exam questions fallback ------------------------ */
function fallbackExamPack(topic, mode, documentText) {
  const t = (mode === "document" ? "the uploaded document" : topic?.trim() || "this topic");
  const short = topic?.trim() || "the topic";
  const mcq = [
    {
      id: uid("mcq"), likelihood: 92, tag: "Core Definition",
      q: `Which statement best defines ${short}?`,
      options: [
        `${short} is best defined by its input, mechanism, and output taken together.`,
        `${short} is only relevant to advanced, non-examinable material.`,
        `${short} has no measurable components.`,
        `${short} cannot be broken into smaller parts.`,
      ],
      answer: 0,
      rationale: `Definitions are usually testable as "input → process → output" — option A captures that structure, the rest are distractors that contradict basic characteristics of any well-defined system.`,
    },
    {
      id: uid("mcq"), likelihood: 87, tag: "Mechanism",
      q: `In the mechanism behind ${short}, what typically happens if an early step fails?`,
      options: [
        "Later steps proceed completely unaffected.",
        "The whole process usually stalls or produces an incorrect result downstream.",
        "The process reverses automatically with no consequence.",
        "It has no effect because steps are independent.",
      ],
      answer: 1,
      rationale: "Sequential mechanisms are usually dependency chains — an early failure propagates forward, which is exactly why examiners like to test this relationship.",
    },
    {
      id: uid("mcq"), likelihood: 78, tag: "Application",
      q: `Which scenario is the most realistic real-world application of ${short}?`,
      options: [
        "A scenario that shares its defining input/output structure",
        "A completely unrelated scenario with no shared structure",
        "A scenario that violates the topic's core definition",
        "A purely hypothetical scenario with undefined variables",
      ],
      answer: 0,
      rationale: "Application questions test whether you can recognise the same underlying structure in a new context — the correct answer always preserves the defining relationship.",
    },
    {
      id: uid("mcq"), likelihood: 65, tag: "Comparison",
      q: `${short} is most similar to which of the following in terms of structure?`,
      options: [
        "A process with clearly ordered, dependent stages",
        "A process with entirely random, unordered stages",
        "A static object with no process at all",
        "A concept with no components",
      ],
      answer: 0,
      rationale: "This tests whether you can abstract the topic's shape (ordered, dependent stages) away from its specific content.",
    },
  ];
  const shortDefs = [
    { id: uid("sd"), likelihood: 90, term: `Definition of ${short}`, answer: `A concise, testable statement of what ${short} is, expressed as input → mechanism → output.` },
    { id: uid("sd"), likelihood: 83, term: `Key component of ${short}`, answer: `One of the main building blocks that ${short} cannot function without.` },
    { id: uid("sd"), likelihood: 74, term: `Real-world example of ${short}`, answer: `A concrete situation where ${short}'s defining structure appears outside the textbook.` },
  ];
  const essays = [
    {
      id: uid("es"), likelihood: 88, totalMarks: 20,
      q: `Discuss ${short} in detail, covering its definition, mechanism, and at least one real-world application. Support your answer with examples.`,
      marking: [
        { point: `Clear, accurate definition of ${short}`, marks: 4 },
        { point: "Explanation of the underlying mechanism, in logical order", marks: 6 },
        { point: "At least one well-explained real-world application", marks: 6 },
        { point: "Clarity of structure, use of correct terminology, examples", marks: 4 },
      ],
    },
    {
      id: uid("es"), likelihood: 70, totalMarks: 15,
      q: `Compare and contrast ${short} with a closely related concept of your choice, evaluating strengths and limitations of each.`,
      marking: [
        { point: "Accurate description of both concepts", marks: 5 },
        { point: "At least two valid points of comparison", marks: 5 },
        { point: "A reasoned evaluation / conclusion", marks: 5 },
      ],
    },
  ];
  return { mcq, shortDefs, essays, source: "offline", scope: t };
}

/* ------------------------- Flashcards + cheat sheet ------------------------- */
function fallbackFlashcards(topic) {
  const t = topic?.trim() || "this topic";
  return [
    { id: uid("fc"), category: "Definitions", front: `What is ${t}?`, back: `${t} is best understood through its input, mechanism, and output — the three-part lens that unlocks most topics.`, mastered: false },
    { id: uid("fc"), category: "Mechanism", front: `What triggers the core mechanism of ${t}?`, back: `A defined starting condition or input that sets the process of ${t} in motion.`, mastered: false },
    { id: uid("fc"), category: "Application", front: `Give one real-world example of ${t}.`, back: `Any scenario that preserves ${t}'s defining input → process → output structure.`, mastered: true },
    { id: uid("fc"), category: "Comparison", front: `How is ${t} different from a purely random process?`, back: `${t} has ordered, dependent stages — order and dependency are what make it predictable and testable.`, mastered: false },
    { id: uid("fc"), category: "Common mistake", front: `What's a common mistake students make with ${t}?`, back: `Memorising the label without being able to explain the mechanism in your own words.`, mastered: false },
  ];
}

function fallbackCheatSheet(topic) {
  const t = topic?.trim() || "Topic";
  return [
    { id: uid("cs"), category: "Definition", term: t, expression: `${t} = input → mechanism → output`, description: "Core three-part structure to recall under pressure." },
    { id: uid("cs"), category: "Framework", term: "IPO Lens", expression: "Input / Process / Output", description: "Generic framework for describing almost any system or process." },
    { id: uid("cs"), category: "Exam tip", term: "Command word", expression: "Define ≠ Explain ≠ Discuss", description: "Define = state; Explain = state + why; Discuss = explain + evaluate both sides." },
    { id: uid("cs"), category: "Check", term: "Sanity check", expression: "Does the sign/size make sense?", description: "Always test whether your final answer is physically or logically reasonable." },
  ];
}

/* ----------------------------- Whiteboard presets --------------------------- */
const WHITEBOARD_PRESETS = {
  "Concept Map": () => node(uid("n"), "Central Idea", "Your main concept, radiating outward into related ideas.", [
    node(uid("n"), "Related idea A", "First branch."),
    node(uid("n"), "Related idea B", "Second branch."),
    node(uid("n"), "Related idea C", "Third branch."),
  ]),
  "Brainstorming Canvas": () => node(uid("n"), "Prompt / Problem", "Open question you're brainstorming around.", [
    node(uid("n"), "Idea 1", "First rough idea — don't filter yet."),
    node(uid("n"), "Idea 2", "Second rough idea."),
    node(uid("n"), "Idea 3", "Third rough idea."),
    node(uid("n"), "Wildcard", "One deliberately unconventional idea."),
  ]),
  "Process Flow": () => node(uid("n"), "Start", "Entry point of the process.", [
    node(uid("n"), "Step 1", "First action.", [
      node(uid("n"), "Step 2", "Second action.", [
        node(uid("n"), "Decision", "A branch point in the flow.", [
          node(uid("n"), "Outcome A", "First possible result."),
          node(uid("n"), "Outcome B", "Second possible result."),
        ]),
      ]),
    ]),
  ]),
};

function toFigmaEmbedUrl(raw) {
  if (!raw) return null;
  const match = raw.match(/figma\.com\/(?:file|design|board)\/([a-zA-Z0-9]+)/i);
  if (match) return `https://embed.figma.com/design/${match[1]}?embed-host=omniprep`;
  if (/^https?:\/\/embed\.figma\.com\//i.test(raw)) return raw;
  return null;
}

/* ============================================================================
   PRESENTATIONAL SUB-COMPONENTS
============================================================================ */

function SkeletonBlock({ c, lines = 4 }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 rounded-full" style={{ background: c.borderSoft, width: `${92 - i * 10}%` }} />
      ))}
    </div>
  );
}

function Badge({ c, tone = "amber", children }) {
  const map = {
    amber: { bg: c.amberSoft, fg: c.amber },
    teal: { bg: c.tealSoft, fg: c.teal },
    rose: { bg: c.roseSoft, fg: c.rose },
    muted: { bg: c.borderSoft, fg: c.textMuted },
  };
  const s = map[tone] || map.amber;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide"
      style={{ background: s.bg, color: s.fg, fontFamily: MONO_FONT }}
    >
      {children}
    </span>
  );
}

function LikelihoodTag({ c, pct }) {
  const tone = pct >= 85 ? "rose" : pct >= 70 ? "amber" : "teal";
  return <Badge c={c} tone={tone}>{pct}% Likely{pct >= 85 ? " · Core Topic" : ""}</Badge>;
}

function SectionHeading({ c, eyebrow, title, right }) {
  return (
    <div className="flex items-end justify-between mb-3 pb-2" style={{ borderBottom: `1px solid ${c.border}` }}>
      <div>
        {eyebrow && (
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: c.textFaint, fontFamily: MONO_FONT }}>
            {eyebrow}
          </div>
        )}
        <h2 className="text-xl font-semibold" style={{ color: c.text, fontFamily: DISPLAY_FONT }}>{title}</h2>
      </div>
      {right}
    </div>
  );
}

function RuledPanel({ c, children, className = "" }) {
  return (
    <div
      className={`relative rounded-2xl p-4 sm:p-5 ${className}`}
      style={{
        background: c.panel,
        border: `1px solid ${c.border}`,
        backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent 27px, ${c.ruleLine} 28px)`,
      }}
    >
      <div className="absolute left-6 top-0 bottom-0 w-px" style={{ background: c.amber, opacity: 0.35 }} />
      <div className="pl-4">{children}</div>
    </div>
  );
}

/* --------------------------------- Markdown-lite ---------------------------- */
function MarkdownLite({ c, text }) {
  const lines = (text || "").split("\n");
  const els = [];
  let tableRows = [];
  let inTable = false;

  function flushTable(key) {
    if (tableRows.length === 0) return;
    const [header, , ...rows] = tableRows;
    els.push(
      <div key={key} className="overflow-x-auto my-3 rounded-lg" style={{ border: `1px solid ${c.border}` }}>
        <table className="w-full text-sm" style={{ color: c.text }}>
          <thead>
            <tr style={{ background: c.panel2 }}>
              {header.map((h, i) => (
                <th key={i} className="text-left px-3 py-2 font-semibold" style={{ borderBottom: `1px solid ${c.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 align-top" style={{ borderTop: `1px solid ${c.borderSoft}`, color: c.textMuted }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("|")) {
      inTable = true;
      tableRows.push(trimmed.replace(/^\||\|$/g, "").split("|").map((s) => s.trim()));
      return;
    } else if (inTable) {
      flushTable("t" + idx);
      inTable = false;
    }
    if (trimmed.startsWith("### ")) {
      els.push(<h4 key={idx} className="font-semibold mt-3 mb-1" style={{ color: c.text }}>{trimmed.slice(4)}</h4>);
    } else if (trimmed.startsWith("## ")) {
      els.push(<h3 key={idx} className="text-lg font-semibold mt-4 mb-2" style={{ color: c.text, fontFamily: DISPLAY_FONT }}>{trimmed.slice(3)}</h3>);
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      els.push(
        <div key={idx} className="flex gap-2 my-1 text-sm leading-relaxed" style={{ color: c.textMuted }}>
          <span style={{ color: c.amber }}>—</span><span>{renderBold(trimmed.slice(2), c)}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      els.push(
        <div key={idx} className="flex gap-2 my-1 text-sm leading-relaxed" style={{ color: c.textMuted }}>
          <span style={{ color: c.amber, fontFamily: MONO_FONT }}>{trimmed.match(/^\d+/)[0]}.</span>
          <span>{renderBold(trimmed.replace(/^\d+\.\s/, ""), c)}</span>
        </div>
      );
    } else if (trimmed === "") {
      els.push(<div key={idx} className="h-2" />);
    } else {
      els.push(<p key={idx} className="text-sm leading-relaxed my-1" style={{ color: c.textMuted }}>{renderBold(trimmed, c)}</p>);
    }
  });
  if (inTable) flushTable("tend");
  return <div>{els}</div>;
}

function renderBold(str, c) {
  const parts = str.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} style={{ color: c.text }}>{p.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    )
  );
}

/* ================================ DIAGRAM CANVAS ============================ */
function DiagramCanvas({ c, tree, title }) {
  const layout = useMemo(() => layoutTree(tree), [tree]);
  const [view, setView] = useState({ scale: 1, tx: 40, ty: 40 });
  const [selected, setSelected] = useState(null);
  const dragRef = useRef(null);
  const wrapRef = useRef(null);

  const bounds = useMemo(() => {
    const xs = layout.nodes.map((n) => n.x);
    const ys = layout.nodes.map((n) => n.y);
    return {
      minX: Math.min(...xs) - 90, maxX: Math.max(...xs) + 90,
      minY: Math.min(...ys) - 40, maxY: Math.max(...ys) + 60,
    };
  }, [layout]);

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  function onPointerDown(e) {
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setView((v) => ({ ...v, tx: dragRef.current.tx + dx, ty: dragRef.current.ty + dy }));
  }
  function onPointerUp() { dragRef.current = null; }

  function zoom(delta) {
    setView((v) => ({ ...v, scale: clamp(+(v.scale + delta).toFixed(2), 0.4, 2.2) }));
  }
  function resetView() { setView({ scale: 1, tx: 40, ty: 40 }); setSelected(null); }

  const byId = useMemo(() => Object.fromEntries(layout.nodes.map((n) => [n.id, n])), [layout]);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${c.border}`, background: c.panel }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${c.border}` }}>
        <div className="flex items-center gap-2 min-w-0">
          <Workflow size={16} style={{ color: c.amber }} />
          <span className="text-sm font-semibold truncate" style={{ color: c.text }}>{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => zoom(-0.2)} className="p-1.5 rounded-lg" style={{ background: c.panel2, border: `1px solid ${c.border}` }} aria-label="Zoom out">
            <ZoomOut size={14} style={{ color: c.textMuted }} />
          </button>
          <button onClick={() => zoom(0.2)} className="p-1.5 rounded-lg" style={{ background: c.panel2, border: `1px solid ${c.border}` }} aria-label="Zoom in">
            <ZoomIn size={14} style={{ color: c.textMuted }} />
          </button>
          <button onClick={resetView} className="p-1.5 rounded-lg" style={{ background: c.panel2, border: `1px solid ${c.border}` }} aria-label="Reset view">
            <Maximize2 size={14} style={{ color: c.textMuted }} />
          </button>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="relative overflow-hidden touch-none select-none"
        style={{ height: 320, cursor: dragRef.current ? "grabbing" : "grab", background: c.bgSoft }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <svg
          width="100%" height="100%"
          viewBox={`0 0 ${width} ${height}`}
          style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`, transformOrigin: "0 0" }}
        >
          <g transform={`translate(${-bounds.minX}, ${-bounds.minY})`}>
            {layout.edges.map((e, i) => {
              const a = byId[e.from], b = byId[e.to];
              if (!a || !b) return null;
              const midY = (a.y + b.y) / 2;
              const d = `M ${a.x} ${a.y + 18} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y - 18}`;
              return <path key={i} d={d} fill="none" stroke={c.border} strokeWidth={2} />;
            })}
            {layout.nodes.map((n) => {
              const isSel = selected === n.id;
              const isRoot = n.depth === 0;
              return (
                <g key={n.id} transform={`translate(${n.x}, ${n.y})`} onClick={() => setSelected(n.id)} style={{ cursor: "pointer" }}>
                  <rect
                    x={-62} y={-18} width={124} height={36} rx={10}
                    fill={isRoot ? c.amber : isSel ? c.tealSoft : c.panel2}
                    stroke={isSel ? c.teal : c.border}
                    strokeWidth={isSel ? 2 : 1}
                  />
                  <text
                    x={0} y={5} textAnchor="middle"
                    fontSize={11} fontWeight={isRoot ? 700 : 600}
                    fill={isRoot ? "#1A1206" : c.text}
                    style={{ fontFamily: MONO_FONT }}
                  >
                    {n.label.length > 20 ? n.label.slice(0, 19) + "…" : n.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="px-4 py-3 text-xs" style={{ borderTop: `1px solid ${c.border}`, color: c.textMuted, minHeight: 56 }}>
        {selected && byId[selected] ? (
          <div>
            <span className="font-semibold" style={{ color: c.text }}>{byId[selected].label}: </span>
            {byId[selected].desc}
          </div>
        ) : (
          <span>Drag to pan · tap a node to read its detail · use the zoom controls above.</span>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   MAIN APP
============================================================================ */
export default function OmniprepAIStudio() {
  const [dark, setDark] = useState(true);
  const c = dark ? THEME.dark : THEME.light;

  const [activeTab, setActiveTab] = useState("study");
  const [mode, setMode] = useState("research"); // 'research' | 'document'
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");

  const [topic, setTopic] = useState("Photosynthesis");
  const [topicInput, setTopicInput] = useState("Photosynthesis");

  const [documentText, setDocumentText] = useState("");
  const [docName, setDocName] = useState("");
  const [docError, setDocError] = useState(null);
  const [pastedText, setPastedText] = useState("");

  const [notes, setNotes] = useState(() => fallbackNotes("overview", "Photosynthesis", "research", ""));
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState(null);

  const [diagramTree, setDiagramTree] = useState(() => fallbackDiagramTree("Photosynthesis"));
  const [diagramLoading, setDiagramLoading] = useState(false);
  const [diagramTopicInput, setDiagramTopicInput] = useState("");

  const [examPack, setExamPack] = useState(() => fallbackExamPack("Photosynthesis", "research", ""));
  const [examLoading, setExamLoading] = useState(false);
  const [revealedMcq, setRevealedMcq] = useState({});
  const [revealedSd, setRevealedSd] = useState({});
  const [revealedEs, setRevealedEs] = useState({});

  const [flashcards, setFlashcards] = useState(() => fallbackFlashcards("Photosynthesis"));
  const [flippedCards, setFlippedCards] = useState({});
  const [cardFilter, setCardFilter] = useState("all");
  const [cheatSheet, setCheatSheet] = useState(() => fallbackCheatSheet("Photosynthesis"));
  const [cheatSearch, setCheatSearch] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const [figmaUrlInput, setFigmaUrlInput] = useState("");
  const [figmaEmbed, setFigmaEmbed] = useState(null);
  const [whiteboardTree, setWhiteboardTree] = useState(null);
  const [activePreset, setActivePreset] = useState(null);

  const [mockDuration, setMockDuration] = useState(15);
  const [mockRunning, setMockRunning] = useState(false);
  const [mockRemaining, setMockRemaining] = useState(15 * 60);
  const [mockAnswers, setMockAnswers] = useState({});
  const [mockFlags, setMockFlags] = useState({});
  const [mockSubmitted, setMockSubmitted] = useState(false);
  const [mockIndex, setMockIndex] = useState(0);

  const fileInputRef = useRef(null);

  /* ------------------------------ Mock exam timer ------------------------------ */
  useEffect(() => {
    if (!mockRunning) return;
    if (mockRemaining <= 0) { setMockRunning(false); setMockSubmitted(true); return; }
    const t = setTimeout(() => setMockRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [mockRunning, mockRemaining]);

  function startMockExam() {
    setMockRemaining(mockDuration * 60);
    setMockAnswers({});
    setMockFlags({});
    setMockSubmitted(false);
    setMockIndex(0);
    setMockRunning(true);
  }
  function pauseMockExam() { setMockRunning((r) => !r); }
  function submitMockExam() { setMockRunning(false); setMockSubmitted(true); }

  const mockScore = useMemo(() => {
    if (!mockSubmitted) return null;
    const qs = examPack.mcq;
    let correct = 0;
    const byTag = {};
    qs.forEach((q) => {
      const got = mockAnswers[q.id];
      const isRight = got === q.answer;
      if (isRight) correct++;
      byTag[q.tag] = byTag[q.tag] || { right: 0, total: 0 };
      byTag[q.tag].total += 1;
      if (isRight) byTag[q.tag].right += 1;
    });
    return { correct, total: qs.length, pct: Math.round((correct / Math.max(1, qs.length)) * 100), byTag };
  }, [mockSubmitted, mockAnswers, examPack]);

  /* ------------------------------ Generation actions ------------------------------ */
  async function runQuickAction(actionType) {
    setNotesLoading(true); setNotesError(null);
    const sys = systemFor(mode, documentText || pastedText);
    const promptMap = {
      overview: `Give a comprehensive, well-structured topic overview of: ${topic}. Use markdown headers.`,
      analogy: `Explain "${topic}" using 2-3 vivid, distinct real-world analogies. Use markdown headers.`,
      steps: `Provide a step-by-step problem solving walkthrough for a representative problem in "${topic}". Use numbered steps.`,
      plan: `Create a detailed 7-day study plan for mastering "${topic}", formatted as a markdown table plus a short daily rhythm note.`,
    };
    try {
      const text = await callGemini({ apiKey, system: sys, prompt: promptMap[actionType] });
      setNotes({ title: `${QUICK_ACTION_LABELS[actionType]}: ${topic}`, body: text, source: "gemini" });
    } catch (e) {
      setNotesError(friendlyError(e));
      setNotes(fallbackNotes(actionType, topic, mode, documentText || pastedText));
    } finally {
      setNotesLoading(false);
    }
  }

  async function runDiagramGeneration(customTopic) {
    const t = customTopic || topic;
    setDiagramLoading(true);
    const sys = `You output ONLY strict JSON describing a tree diagram, no prose. Schema:
{"label": string, "desc": string, "children": [ {"label":string,"desc":string,"children":[...]} ] }
Keep it to 3 levels max and at most 4 children per node.`;
    try {
      const text = await callGemini({
        apiKey, system: sys,
        prompt: `Build a diagram tree for: ${t}${mode === "document" ? " using the grounded document context." : ""}`,
        json: true,
      });
      const parsed = parseJSONLoose(text);
      if (!parsed || !parsed.label) throw new Error("EMPTY_RESPONSE");
      const withIds = (n) => node(uid("n"), n.label, n.desc || "", (n.children || []).map(withIds));
      setDiagramTree(withIds(parsed));
    } catch (e) {
      setDiagramTree(fallbackDiagramTree(t));
    } finally {
      setDiagramLoading(false);
    }
  }

  async function runExamGeneration() {
    setExamLoading(true);
    setRevealedMcq({}); setRevealedSd({}); setRevealedEs({});
    const sys = `You output ONLY strict JSON for an exam question pack, no prose. Schema:
{"mcq":[{"q":string,"options":[string,string,string,string],"answer":number,"rationale":string,"likelihood":number,"tag":string}],
"shortDefs":[{"term":string,"answer":string,"likelihood":number}],
"essays":[{"q":string,"totalMarks":number,"likelihood":number,"marking":[{"point":string,"marks":number}]}]}
Provide 4 mcq, 3 shortDefs, 2 essays. likelihood is an integer 0-100 representing exam probability.`;
    try {
      const text = await callGemini({
        apiKey, system: systemFor(mode, documentText || pastedText),
        prompt: `Generate a high-yield exam question pack for: ${topic}.`,
        json: true,
      });
      const parsed = parseJSONLoose(text);
      if (!parsed || !parsed.mcq) throw new Error("EMPTY_RESPONSE");
      const withIds = {
        mcq: parsed.mcq.map((m) => ({ id: uid("mcq"), q: m.q, options: m.options, answer: m.answer, rationale: m.rationale, likelihood: m.likelihood ?? 75, tag: m.tag || "General" })),
        shortDefs: parsed.shortDefs.map((s) => ({ id: uid("sd"), term: s.term, answer: s.answer, likelihood: s.likelihood ?? 70 })),
        essays: parsed.essays.map((e) => ({ id: uid("es"), q: e.q, totalMarks: e.totalMarks ?? 20, likelihood: e.likelihood ?? 75, marking: e.marking || [] })),
        source: "gemini", scope: topic,
      };
      setExamPack(withIds);
    } catch (e) {
      setExamPack(fallbackExamPack(topic, mode, documentText || pastedText));
    } finally {
      setExamLoading(false);
    }
  }

  async function runFlashcardGeneration() {
    const sys = `Output ONLY strict JSON: {"cards":[{"category":string,"front":string,"back":string}], "cheatsheet":[{"category":string,"term":string,"expression":string,"description":string}]}. 6 cards, 5 cheatsheet rows.`;
    try {
      const text = await callGemini({ apiKey, system: systemFor(mode, documentText || pastedText), prompt: `Generate flashcards and a cheat sheet for: ${topic}.`, json: true });
      const parsed = parseJSONLoose(text);
      if (!parsed || !parsed.cards) throw new Error("EMPTY_RESPONSE");
      setFlashcards(parsed.cards.map((cd) => ({ id: uid("fc"), category: cd.category, front: cd.front, back: cd.back, mastered: false })));
      setCheatSheet((parsed.cheatsheet || []).map((r) => ({ id: uid("cs"), ...r })));
    } catch (e) {
      setFlashcards(fallbackFlashcards(topic));
      setCheatSheet(fallbackCheatSheet(topic));
    }
  }

  function applyTopic() {
    const t = topicInput.trim() || "Photosynthesis";
    setTopic(t);
    setNotes(fallbackNotes("overview", t, mode, documentText || pastedText));
    setDiagramTree(fallbackDiagramTree(t));
    setExamPack(fallbackExamPack(t, mode, documentText || pastedText));
    setFlashcards(fallbackFlashcards(t));
    setCheatSheet(fallbackCheatSheet(t));
  }

  async function handleFileUpload(file) {
    if (!file) return;
    setDocError(null);
    const ext = file.name.split(".").pop().toLowerCase();
    try {
      if (ext === "txt") {
        const text = await file.text();
        setDocumentText(text); setDocName(file.name);
      } else if (ext === "docx") {
        const buf = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buf });
        setDocumentText(result.value); setDocName(file.name);
      } else if (ext === "doc") {
        setDocError("Legacy .doc isn't supported in-browser — convert to .docx or paste the text below.");
      } else if (ext === "pdf") {
        setDocError("PDF text extraction needs a server step in this demo — please paste the text below, or upload .docx/.txt.");
      } else {
        setDocError("Unsupported file type. Use .txt, .docx, or paste text directly.");
      }
    } catch (e) {
      setDocError("Could not read that file: " + e.message);
    }
  }

  function copyToClipboard(id, text) {
    try {
      navigator.clipboard?.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1400);
    } catch (e) { /* clipboard unavailable — silently ignore */ }
  }

  const filteredCards = useMemo(() => {
    if (cardFilter === "mastered") return flashcards.filter((f) => f.mastered);
    if (cardFilter === "needs") return flashcards.filter((f) => !f.mastered);
    return flashcards;
  }, [flashcards, cardFilter]);

  const filteredCheat = useMemo(() => {
    const q = cheatSearch.trim().toLowerCase();
    if (!q) return cheatSheet;
    return cheatSheet.filter((r) => `${r.term} ${r.expression} ${r.description} ${r.category}`.toLowerCase().includes(q));
  }, [cheatSheet, cheatSearch]);

  const TABS = [
    { id: "study", label: "Study", icon: BookOpen },
    { id: "diagram", label: "Diagram", icon: Workflow },
    { id: "board", label: "Board", icon: PenTool },
    { id: "exam", label: "Exam Prep", icon: ClipboardList },
    { id: "mock", label: "Mock Test", icon: Timer },
    { id: "cards", label: "Cards", icon: Layers },
  ];

  const mm = String(Math.floor(mockRemaining / 60)).padStart(2, "0");
  const ss = String(mockRemaining % 60).padStart(2, "0");

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ background: c.bg, color: c.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`${FONT_IMPORT}
        .flip-card-inner { transition: transform 0.6s; transform-style: preserve-3d; position: relative; }
        .flip-card-front, .flip-card-back { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .flip-card-back { transform: rotateY(180deg); }
        .flip-card-flipped { transform: rotateY(180deg); }
        .perspective { perspective: 1200px; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
      `}</style>

      {/* ------------------------------- HEADER ------------------------------- */}
      <header className="sticky top-0 z-30 backdrop-blur px-4 pt-4 pb-3" style={{ background: dark ? "rgba(11,16,32,0.92)" : "rgba(242,244,249,0.92)", borderBottom: `1px solid ${c.border}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: c.amber }}>
              <GraduationCap size={19} color="#1A1206" />
            </div>
            <div>
              <div className="text-base font-bold leading-none" style={{ fontFamily: DISPLAY_FONT, color: c.text }}>Omniprep</div>
              <div className="text-xs tracking-widest uppercase" style={{ color: c.textFaint, fontFamily: MONO_FONT }}>AI Studio</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setDark((d) => !d)} className="p-2 rounded-lg" style={{ background: c.panel2, border: `1px solid ${c.border}` }} aria-label="Toggle theme">
              {dark ? <Sun size={16} style={{ color: c.amber }} /> : <Moon size={16} style={{ color: c.amber }} />}
            </button>
            <button onClick={() => setSettingsOpen(true)} className="p-2 rounded-lg relative" style={{ background: c.panel2, border: `1px solid ${c.border}` }} aria-label="Settings">
              <Settings size={16} style={{ color: c.textMuted }} />
              {!apiKey && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: c.rose }} />}
            </button>
          </div>
        </div>

        {/* Mode toggle + topic bar (shared across Study / Diagram / Exam / Cards) */}
        <div className="mt-3 flex items-center gap-2 rounded-xl p-1" style={{ background: c.panel2, border: `1px solid ${c.border}` }}>
          <button
            onClick={() => setMode("research")}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition"
            style={{ background: mode === "research" ? c.amber : "transparent", color: mode === "research" ? "#1A1206" : c.textMuted }}
          >
            <Sparkles size={13} /> Open Research
          </button>
          <button
            onClick={() => setMode("document")}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition"
            style={{ background: mode === "document" ? c.amber : "transparent", color: mode === "document" ? "#1A1206" : c.textMuted }}
          >
            <FileText size={13} /> Document Study
          </button>
        </div>

        {mode === "research" ? (
          <div className="mt-2 flex gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: c.panel, border: `1px solid ${c.border}` }}>
              <Search size={14} style={{ color: c.textFaint }} />
              <input
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyTopic()}
                placeholder="Type any topic — biology, calculus, world history…"
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: c.text }}
              />
            </div>
            <button onClick={applyTopic} className="px-3 rounded-xl text-xs font-semibold" style={{ background: c.teal, color: "#04211E" }}>
              Load
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                style={{ background: c.panel, border: `1px dashed ${c.border}`, color: c.textMuted }}
              >
                <Upload size={14} /> {docName ? docName : "Upload .txt / .docx"}
              </button>
              <input ref={fileInputRef} type="file" accept=".txt,.docx,.doc,.pdf" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0])} />
              {(documentText || docName) && (
                <button onClick={() => { setDocumentText(""); setDocName(""); setDocError(null); }} className="p-2 rounded-xl" style={{ background: c.panel2, border: `1px solid ${c.border}` }}>
                  <Trash2 size={14} style={{ color: c.rose }} />
                </button>
              )}
            </div>
            <textarea
              value={pastedText}
              onChange={(e) => { setPastedText(e.target.value); setDocumentText(e.target.value); }}
              placeholder="…or paste document text here"
              rows={2}
              className="w-full rounded-xl px-3 py-2 text-xs outline-none resize-none"
              style={{ background: c.panel, border: `1px solid ${c.border}`, color: c.text }}
            />
            {docError && (
              <div className="flex items-start gap-1.5 text-xs px-1" style={{ color: c.rose }}>
                <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {docError}
              </div>
            )}
          </div>
        )}
      </header>

      {/* -------------------------------- CONTENT ------------------------------ */}
      <main className="flex-1 px-4 py-4 pb-24 max-w-2xl w-full mx-auto">
        {activeTab === "study" && (
          <StudyTab
            c={c} mode={mode} topic={topic} notes={notes} notesLoading={notesLoading} notesError={notesError}
            onQuickAction={runQuickAction}
          />
        )}
        {activeTab === "diagram" && (
          <DiagramTab
            c={c} topic={topic} tree={diagramTree} loading={diagramLoading}
            topicOverride={diagramTopicInput} setTopicOverride={setDiagramTopicInput}
            onGenerate={() => runDiagramGeneration(diagramTopicInput)}
          />
        )}
        {activeTab === "board" && (
          <WhiteboardTab
            c={c} figmaUrlInput={figmaUrlInput} setFigmaUrlInput={setFigmaUrlInput}
            figmaEmbed={figmaEmbed} setFigmaEmbed={setFigmaEmbed}
            activePreset={activePreset} setActivePreset={setActivePreset}
            whiteboardTree={whiteboardTree} setWhiteboardTree={setWhiteboardTree}
          />
        )}
        {activeTab === "exam" && (
          <ExamTab
            c={c} topic={topic} examPack={examPack} loading={examLoading} onGenerate={runExamGeneration}
            revealedMcq={revealedMcq} setRevealedMcq={setRevealedMcq}
            revealedSd={revealedSd} setRevealedSd={setRevealedSd}
            revealedEs={revealedEs} setRevealedEs={setRevealedEs}
          />
        )}
        {activeTab === "mock" && (
          <MockExamTab
            c={c} examPack={examPack} duration={mockDuration} setDuration={setMockDuration}
            running={mockRunning} remaining={mockRemaining} mm={mm} ss={ss}
            answers={mockAnswers} setAnswers={setMockAnswers} flags={mockFlags} setFlags={setMockFlags}
            submitted={mockSubmitted} score={mockScore} index={mockIndex} setIndex={setMockIndex}
            onStart={startMockExam} onPause={pauseMockExam} onSubmit={submitMockExam}
          />
        )}
        {activeTab === "cards" && (
          <CardsTab
            c={c} cards={filteredCards} filter={cardFilter} setFilter={setCardFilter}
            flipped={flippedCards} setFlipped={setFlippedCards}
            onToggleMastered={(id) => setFlashcards((fs) => fs.map((f) => (f.id === id ? { ...f, mastered: !f.mastered } : f)))}
            cheatSheet={filteredCheat} cheatSearch={cheatSearch} setCheatSearch={setCheatSearch}
            copiedId={copiedId} onCopy={copyToClipboard} onRegenerate={runFlashcardGeneration}
          />
        )}
      </main>

      {/* ------------------------------ BOTTOM NAV ------------------------------ */}
      <nav className="fixed bottom-0 inset-x-0 z-30 px-2 pt-1" style={{ background: dark ? "rgba(11,16,32,0.97)" : "rgba(242,244,249,0.97)", borderTop: `1px solid ${c.border}` }}>
        <div className="grid grid-cols-6 gap-1 max-w-2xl mx-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const activeT = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="flex flex-col items-center gap-0.5 pt-2 pb-2 relative"
                style={{ color: activeT ? c.amber : c.textFaint }}
              >
                {activeT && <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-1 rounded-full" style={{ background: c.amber }} />}
                <div
                  className="w-9 h-7 rounded-t-lg flex items-center justify-center"
                  style={{ background: activeT ? c.panel2 : "transparent" }}
                >
                  <Icon size={16} />
                </div>
                <span className="text-xs font-medium leading-none">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ------------------------------ SETTINGS MODAL ------------------------------ */}
      {settingsOpen && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setSettingsOpen(false)}>
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5" style={{ background: c.panel, border: `1px solid ${c.border}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <KeyRound size={16} style={{ color: c.amber }} />
                <span className="font-semibold" style={{ fontFamily: DISPLAY_FONT }}>Gemini API Settings</span>
              </div>
              <button onClick={() => setSettingsOpen(false)}><X size={18} style={{ color: c.textMuted }} /></button>
            </div>
            <label className="text-xs" style={{ color: c.textMuted }}>Gemini API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your Gemini API key"
              className="w-full mt-1 mb-2 rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: c.panel2, border: `1px solid ${c.border}`, color: c.text }}
            />
            <p className="text-xs leading-relaxed" style={{ color: c.textFaint }}>
              Calls go directly from your browser to <code>generativelanguage.googleapis.com</code> using
              the <code>gemini-2.5-flash</code> model. Nothing is sent anywhere else. Without a key, every
              tab still works using the built-in offline study pack.
            </p>
            <button
              onClick={() => setSettingsOpen(false)}
              className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: c.amber, color: "#1A1206" }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   TAB: STUDY (Mode A / Mode B notes + quick actions)
============================================================================ */
function StudyTab({ c, mode, topic, notes, notesLoading, notesError, onQuickAction }) {
  const chips = [
    { id: "overview", label: "Topic Overview", icon: BookOpen },
    { id: "analogy", label: "Real-World Analogies", icon: Brain },
    { id: "steps", label: "Step-by-Step Solver", icon: ListChecks },
    { id: "plan", label: "Create Study Plan", icon: TrendingUp },
  ];
  return (
    <div className="space-y-4">
      <SectionHeading c={c} eyebrow={mode === "document" ? "Document-Grounded Study" : "Open Knowledge & Research"} title={topic} />
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {chips.map((chip) => {
          const Icon = chip.icon;
          return (
            <button
              key={chip.id}
              onClick={() => onQuickAction(chip.id)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold"
              style={{ background: c.panel2, border: `1px solid ${c.border}`, color: c.text }}
            >
              <Icon size={13} style={{ color: c.amber }} /> {chip.label}
            </button>
          );
        })}
      </div>

      {notesError && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: c.roseSoft, color: c.rose }}>
          <AlertTriangle size={13} /> {notesError}
        </div>
      )}

      <RuledPanel c={c}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm" style={{ color: c.text }}>{notes.title}</h3>
          <Badge c={c} tone={notes.source === "gemini" ? "teal" : "muted"}>
            {notes.source === "gemini" ? "AI-generated" : "Offline pack"}
          </Badge>
        </div>
        {notesLoading ? <SkeletonBlock c={c} lines={6} /> : <MarkdownLite c={c} text={notes.body} />}
      </RuledPanel>
    </div>
  );
}

/* ============================================================================
   TAB: DIAGRAM
============================================================================ */
function DiagramTab({ c, topic, tree, loading, topicOverride, setTopicOverride, onGenerate }) {
  return (
    <div className="space-y-4">
      <SectionHeading c={c} eyebrow="Interactive Visual Diagram" title="Mind Map & Process Visualizer" />
      <p className="text-xs" style={{ color: c.textMuted }}>
        Works in both Research and Document modes. Describe any process, cycle, or hierarchy and Omniprep
        renders it as a zoomable, pannable node map.
      </p>
      <div className="flex gap-2">
        <input
          value={topicOverride}
          onChange={(e) => setTopicOverride(e.target.value)}
          placeholder={`e.g. "${topic} cycle" or leave blank to use current topic`}
          className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: c.panel, border: `1px solid ${c.border}`, color: c.text }}
        />
        <button onClick={onGenerate} className="px-3 rounded-xl text-xs font-semibold flex items-center gap-1" style={{ background: c.amber, color: "#1A1206" }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Visualize
        </button>
      </div>
      {loading ? (
        <div className="rounded-2xl p-6" style={{ background: c.panel, border: `1px solid ${c.border}` }}>
          <SkeletonBlock c={c} lines={5} />
        </div>
      ) : (
        <DiagramCanvas c={c} tree={tree} title={tree.label} />
      )}
    </div>
  );
}

/* ============================================================================
   TAB: WHITEBOARD
============================================================================ */
function WhiteboardTab({ c, figmaUrlInput, setFigmaUrlInput, figmaEmbed, setFigmaEmbed, activePreset, setActivePreset, whiteboardTree, setWhiteboardTree }) {
  function loadFigma() {
    const embed = toFigmaEmbedUrl(figmaUrlInput.trim());
    setFigmaEmbed(embed);
    setActivePreset(null);
  }
  function loadPreset(name) {
    setActivePreset(name);
    setFigmaEmbed(null);
    setWhiteboardTree(WHITEBOARD_PRESETS[name]());
  }
  return (
    <div className="space-y-4">
      <SectionHeading c={c} eyebrow="Visual Whiteboard" title="Canvas & Figma Embed" />

      <RuledPanel c={c}>
        <div className="flex items-center gap-2 mb-1">
          <Link2 size={14} style={{ color: c.amber }} />
          <span className="text-sm font-semibold" style={{ color: c.text }}>Embed a Figma / FigJam board</span>
        </div>
        <div className="flex gap-2 mt-2">
          <input
            value={figmaUrlInput}
            onChange={(e) => setFigmaUrlInput(e.target.value)}
            placeholder="https://www.figma.com/design/…"
            className="flex-1 rounded-xl px-3 py-2 text-xs outline-none"
            style={{ background: c.panel2, border: `1px solid ${c.border}`, color: c.text }}
          />
          <button onClick={loadFigma} className="px-3 rounded-xl text-xs font-semibold" style={{ background: c.teal, color: "#04211E" }}>Embed</button>
        </div>
      </RuledPanel>

      <div>
        <div className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: c.textMuted }}>
          <LayoutTemplate size={13} /> Quick-switch preset templates
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Object.keys(WHITEBOARD_PRESETS).map((name) => (
            <button
              key={name}
              onClick={() => loadPreset(name)}
              className="shrink-0 px-3 py-2 rounded-full text-xs font-semibold"
              style={{
                background: activePreset === name ? c.amber : c.panel2,
                color: activePreset === name ? "#1A1206" : c.text,
                border: `1px solid ${c.border}`,
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {figmaEmbed ? (
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${c.border}` }}>
          <iframe title="Figma embed" src={figmaEmbed} className="w-full" style={{ height: 380, border: "none" }} allowFullScreen />
        </div>
      ) : figmaUrlInput && !figmaEmbed && !activePreset ? (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: c.roseSoft, color: c.rose }}>
          <AlertTriangle size={13} /> Couldn't parse that as a Figma URL — try a link like figma.com/design/&lt;key&gt;/…
        </div>
      ) : whiteboardTree ? (
        <DiagramCanvas c={c} tree={whiteboardTree} title={activePreset} />
      ) : (
        <div className="rounded-2xl p-8 text-center text-xs" style={{ background: c.panel, border: `1px dashed ${c.border}`, color: c.textFaint }}>
          <Grid3x3 size={22} className="mx-auto mb-2" />
          Pick a preset above, or embed a Figma link, to start brainstorming.
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   TAB: EXAM PREP (80% high-yield generator)
============================================================================ */
function ExamTab({ c, topic, examPack, loading, onGenerate, revealedMcq, setRevealedMcq, revealedSd, setRevealedSd, revealedEs, setRevealedEs }) {
  return (
    <div className="space-y-5">
      <SectionHeading
        c={c} eyebrow="80% High-Yield Generator" title={`Exam Prep: ${topic}`}
        right={
          <button onClick={onGenerate} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: c.amber, color: "#1A1206" }}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Generate
          </button>
        }
      />

      {/* Section A: MCQ */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: c.textFaint, fontFamily: MONO_FONT }}>Section A · Multiple Choice</div>
        <div className="space-y-3">
          {examPack.mcq.map((q, i) => {
            const revealed = !!revealedMcq[q.id];
            return (
              <div key={q.id} className="rounded-2xl p-4" style={{ background: c.panel, border: `1px solid ${c.border}` }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-sm font-medium" style={{ color: c.text }}>{i + 1}. {q.q}</span>
                  <LikelihoodTag c={c} pct={q.likelihood} />
                </div>
                <div className="space-y-1.5">
                  {q.options.map((opt, oi) => {
                    const isAns = oi === q.answer;
                    const showState = revealed && isAns;
                    return (
                      <button
                        key={oi}
                        onClick={() => setRevealedMcq((r) => ({ ...r, [q.id]: true }))}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg flex items-center gap-2"
                        style={{
                          background: showState ? c.tealSoft : c.panel2,
                          border: `1px solid ${showState ? c.teal : c.border}`,
                          color: showState ? c.teal : c.textMuted,
                        }}
                      >
                        {showState ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {revealed && (
                  <div className="mt-2 text-xs px-3 py-2 rounded-lg" style={{ background: c.amberSoft, color: c.amber }}>
                    <strong>Why:</strong> {q.rationale}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section B: Short defs */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: c.textFaint, fontFamily: MONO_FONT }}>Section B · Short Definitions</div>
        <div className="space-y-2">
          {examPack.shortDefs.map((s, i) => {
            const revealed = !!revealedSd[s.id];
            return (
              <button
                key={s.id}
                onClick={() => setRevealedSd((r) => ({ ...r, [s.id]: !r[s.id] }))}
                className="w-full text-left rounded-xl p-3"
                style={{ background: c.panel, border: `1px solid ${c.border}` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: c.text }}>{i + 1}. Define: {s.term}</span>
                  <LikelihoodTag c={c} pct={s.likelihood} />
                </div>
                {revealed && <p className="text-xs mt-2" style={{ color: c.textMuted }}>{s.answer}</p>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section C: Essay */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: c.textFaint, fontFamily: MONO_FONT }}>Section C · Long-Form Essay</div>
        <div className="space-y-3">
          {examPack.essays.map((e, i) => {
            const revealed = !!revealedEs[e.id];
            return (
              <div key={e.id} className="rounded-2xl p-4" style={{ background: c.panel, border: `1px solid ${c.border}` }}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: c.text }}>{i + 1}. {e.q}</span>
                  <LikelihoodTag c={c} pct={e.likelihood} />
                </div>
                <div className="text-xs mt-1" style={{ color: c.textFaint }}>{e.totalMarks} marks total</div>
                <button
                  onClick={() => setRevealedEs((r) => ({ ...r, [e.id]: !r[e.id] }))}
                  className="mt-2 text-xs font-semibold flex items-center gap-1"
                  style={{ color: c.teal }}
                >
                  {revealed ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Marking scheme
                </button>
                {revealed && (
                  <div className="mt-2 space-y-1">
                    {e.marking.map((m, mi) => (
                      <div key={mi} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg" style={{ background: c.panel2 }}>
                        <span style={{ color: c.textMuted }}>{m.point}</span>
                        <span className="font-semibold" style={{ color: c.amber, fontFamily: MONO_FONT }}>{m.marks} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   TAB: MOCK EXAM
============================================================================ */
function MockExamTab({ c, examPack, duration, setDuration, running, remaining, mm, ss, answers, setAnswers, flags, setFlags, submitted, score, index, setIndex, onStart, onPause, onSubmit }) {
  const qs = examPack.mcq;
  const q = qs[index];
  const started = running || submitted || Object.keys(answers).length > 0;

  if (!started) {
    return (
      <div className="space-y-4">
        <SectionHeading c={c} eyebrow="Timed Practice" title="Mock Exam Mode" />
        <RuledPanel c={c}>
          <p className="text-sm mb-3" style={{ color: c.textMuted }}>
            {qs.length} multiple-choice questions pulled from your current Exam Prep pack. Choose a timer
            length, then work through them with flag-for-review support.
          </p>
          <div className="flex gap-2">
            {[15, 30, 60].map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold"
                style={{ background: duration === d ? c.amber : c.panel2, color: duration === d ? "#1A1206" : c.textMuted, border: `1px solid ${c.border}` }}
              >
                {d} min
              </button>
            ))}
          </div>
          <button onClick={onStart} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: c.teal, color: "#04211E" }}>
            <Play size={14} /> Start Mock Exam
          </button>
        </RuledPanel>
      </div>
    );
  }

  if (submitted && score) {
    return (
      <div className="space-y-4">
        <SectionHeading c={c} eyebrow="Diagnostic Breakdown" title="Mock Exam Results" />
        <RuledPanel c={c}>
          <div className="text-center py-3">
            <div className="text-4xl font-bold" style={{ color: c.amber, fontFamily: DISPLAY_FONT }}>{score.pct}%</div>
            <div className="text-xs mt-1" style={{ color: c.textMuted }}>{score.correct} / {score.total} correct</div>
          </div>
          <div className="space-y-2 mt-3">
            {Object.entries(score.byTag).map(([tag, v]) => (
              <div key={tag} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg" style={{ background: c.panel2 }}>
                <span style={{ color: c.textMuted }}>{tag}</span>
                <span className="font-semibold" style={{ color: v.right === v.total ? c.teal : c.rose, fontFamily: MONO_FONT }}>{v.right}/{v.total}</span>
              </div>
            ))}
          </div>
        </RuledPanel>
        <button onClick={onStart} className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: c.panel2, border: `1px solid ${c.border}`, color: c.text }}>
          <RotateCcw size={14} /> Retake
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: c.panel, border: `1px solid ${c.border}` }}>
        <div className="flex items-center gap-2">
          <Timer size={16} style={{ color: remaining < 60 ? c.rose : c.amber }} />
          <span className="text-lg font-bold" style={{ fontFamily: MONO_FONT, color: remaining < 60 ? c.rose : c.text }}>{mm}:{ss}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onPause} className="p-2 rounded-lg" style={{ background: c.panel2, border: `1px solid ${c.border}` }}>
            {running ? <Pause size={14} style={{ color: c.textMuted }} /> : <Play size={14} style={{ color: c.textMuted }} />}
          </button>
          <button onClick={onSubmit} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: c.rose, color: "#2A0710" }}>Submit</button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {qs.map((qq, i) => (
          <button
            key={qq.id}
            onClick={() => setIndex(i)}
            className="w-8 h-8 rounded-lg text-xs font-semibold flex items-center justify-center relative"
            style={{
              background: i === index ? c.amber : answers[qq.id] !== undefined ? c.tealSoft : c.panel2,
              color: i === index ? "#1A1206" : answers[qq.id] !== undefined ? c.teal : c.textMuted,
              border: `1px solid ${c.border}`,
            }}
          >
            {i + 1}
            {flags[qq.id] && <Flag size={9} className="absolute -top-1 -right-1" style={{ color: c.rose }} fill={c.rose} />}
          </button>
        ))}
      </div>

      {q && (
        <RuledPanel c={c}>
          <div className="flex items-start justify-between gap-2 mb-3">
            <span className="text-sm font-medium" style={{ color: c.text }}>Q{index + 1}. {q.q}</span>
            <button onClick={() => setFlags((f) => ({ ...f, [q.id]: !f[q.id] }))}>
              <Flag size={16} style={{ color: flags[q.id] ? c.rose : c.textFaint }} fill={flags[q.id] ? c.rose : "none"} />
            </button>
          </div>
          <div className="space-y-1.5">
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                className="w-full text-left text-xs px-3 py-2 rounded-lg"
                style={{
                  background: answers[q.id] === oi ? c.amberSoft : c.panel2,
                  border: `1px solid ${answers[q.id] === oi ? c.amber : c.border}`,
                  color: answers[q.id] === oi ? c.amber : c.textMuted,
                }}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4">
            <button disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))} className="flex items-center gap-1 text-xs font-semibold disabled:opacity-30" style={{ color: c.textMuted }}>
              <ArrowLeft size={13} /> Prev
            </button>
            <button disabled={index === qs.length - 1} onClick={() => setIndex((i) => Math.min(qs.length - 1, i + 1))} className="flex items-center gap-1 text-xs font-semibold disabled:opacity-30" style={{ color: c.teal }}>
              Next <ChevronRight size={13} />
            </button>
          </div>
        </RuledPanel>
      )}
    </div>
  );
}

/* ============================================================================
   TAB: FLASHCARDS + CHEAT SHEET
============================================================================ */
function CardsTab({ c, cards, filter, setFilter, flipped, setFlipped, onToggleMastered, cheatSheet, cheatSearch, setCheatSearch, copiedId, onCopy, onRegenerate }) {
  return (
    <div className="space-y-6">
      <div>
        <SectionHeading
          c={c} eyebrow="Smart Flip Flashcards" title="Flashcard Deck"
          right={<button onClick={onRegenerate} className="p-1.5 rounded-lg" style={{ background: c.panel2, border: `1px solid ${c.border}` }}><RefreshCw size={13} style={{ color: c.textMuted }} /></button>}
        />
        <div className="flex gap-2 mb-3">
          {[["all", "All"], ["needs", "Needs Practice"], ["mastered", "Mastered"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: filter === id ? c.amber : c.panel2, color: filter === id ? "#1A1206" : c.textMuted, border: `1px solid ${c.border}` }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.map((card) => {
            const isFlipped = !!flipped[card.id];
            return (
              <div key={card.id} className="perspective" style={{ height: 150 }}>
                <div
                  className={`flip-card-inner w-full h-full cursor-pointer ${isFlipped ? "flip-card-flipped" : ""}`}
                  onClick={() => setFlipped((f) => ({ ...f, [card.id]: !f[card.id] }))}
                >
                  <div className="flip-card-front rounded-2xl p-4 flex flex-col justify-between" style={{ background: c.panel, border: `1px solid ${c.border}` }}>
                    <Badge c={c} tone="muted">{card.category}</Badge>
                    <p className="text-sm font-medium" style={{ color: c.text }}>{card.front}</p>
                    <span className="text-xs" style={{ color: c.textFaint }}>Tap to flip</span>
                  </div>
                  <div className="flip-card-back rounded-2xl p-4 flex flex-col justify-between" style={{ background: c.tealSoft, border: `1px solid ${c.teal}` }}>
                    <p className="text-xs" style={{ color: c.text }}>{card.back}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleMastered(card.id); }}
                      className="self-start flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
                      style={{ background: card.mastered ? c.amber : c.panel2, color: card.mastered ? "#1A1206" : c.textMuted }}
                    >
                      <Star size={11} fill={card.mastered ? "#1A1206" : "none"} /> {card.mastered ? "Mastered" : "Mark mastered"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <SectionHeading c={c} eyebrow="Auto-Generated Reference" title="Cheat Sheet" />
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3" style={{ background: c.panel, border: `1px solid ${c.border}` }}>
          <Search size={14} style={{ color: c.textFaint }} />
          <input
            value={cheatSearch}
            onChange={(e) => setCheatSearch(e.target.value)}
            placeholder="Search formulas, laws, units, definitions…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: c.text }}
          />
        </div>
        <div className="space-y-2">
          {cheatSheet.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2 rounded-xl p-3" style={{ background: c.panel, border: `1px solid ${c.border}` }}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge c={c} tone="teal">{row.category}</Badge>
                  <span className="text-xs font-semibold truncate" style={{ color: c.text }}>{row.term}</span>
                </div>
                <div className="text-xs mt-1 truncate" style={{ color: c.amber, fontFamily: MONO_FONT }}>{row.expression}</div>
                <div className="text-xs mt-0.5" style={{ color: c.textFaint }}>{row.description}</div>
              </div>
              <button onClick={() => onCopy(row.id, row.expression)} className="shrink-0 p-2 rounded-lg" style={{ background: c.panel2, border: `1px solid ${c.border}` }}>
                {copiedId === row.id ? <Check size={14} style={{ color: c.teal }} /> : <Copy size={14} style={{ color: c.textMuted }} />}
              </button>
            </div>
          ))}
          {cheatSheet.length === 0 && (
            <div className="text-center text-xs py-6" style={{ color: c.textFaint }}>No matches — try a different search term.</div>
          )}
        </div>
      </div>
    </div>
  );
}
