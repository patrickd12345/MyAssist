const STRENGTH_RE = /\b(strong|great|excellent|impressed|culture|fit|exactly|love|perfect)\b/gi;
const GAP_RE = /\b(concern|risk|gap|lack|unclear|limited|not enough|hesitat)\b/gi;
const OBJ_RE = /\b(budget|compensation|salary|timeline|notice|visa|location)\b/gi;
const NEXT_RE = /\b(next step|follow up|send|schedule|will be in touch|looking forward)\b/gi;

export function extractTranscriptSignals(text: string): {
  strengths: string[];
  gaps: string[];
  objections: string[];
  next_actions: string[];
} {
  const sentences = text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  const pick = (re: RegExp) =>
    sentences.filter((s) => re.test(s)).slice(0, 5);
  return {
    strengths: pick(STRENGTH_RE),
    gaps: pick(GAP_RE),
    objections: pick(OBJ_RE),
    next_actions: pick(NEXT_RE),
  };
}
