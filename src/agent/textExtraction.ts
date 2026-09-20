/**
 * Deterministic free-text extraction helpers shared by the workflow and the
 * request classifier. Ollama never authorizes identifiers: these regex-based
 * extractors are the authoritative text-analysis layer.
 */

const BEHAVIOR_KEYWORDS: Array<{ match: RegExp; behavior: string }> = [
  { match: /\b(pid|closed[- ]loop|feedback)\b/i, behavior: 'closed_loop_control' },
  { match: /\b(speed control|speed controller|velocity control)\b/i, behavior: 'speed_control' },
  { match: /\b(low[- ]?pass|lowpass|filter|smoothing)\b/i, behavior: 'low_pass_filter' },
  { match: /\b(thermal|temperature|heat|alarm)\b/i, behavior: 'thermal_alarm_logic' },
  { match: /\b(motor drive|motor control|three[- ]phase|inverter|pwm)\b/i, behavior: 'motor_drive' },
  { match: /\b(feed[- ]?forward|open[- ]?loop|signal chain|step response)\b/i, behavior: 'feed_forward' },
  { match: /\b(air[- ]?fryer|airfryer)\b/i, behavior: 'thermal_control' },
  { match: /\b(logic|interlock|sequen\w+|latch|flip[- ]?flop)\b/i, behavior: 'logical_sequencing' },
];

export function deriveBehaviorsFromText(text: string): string[] {
  const behaviors = new Set<string>();
  for (const { match, behavior } of BEHAVIOR_KEYWORDS) {
    if (match.test(text)) behaviors.add(behavior);
  }
  return [...behaviors].sort();
}

const BLOCK_MENTION_PATTERN = /\b([A-Z][A-Z0-9_]{2,}|[A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g;

export function extractBlockMentions(text: string): string[] {
  const mentions = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = BLOCK_MENTION_PATTERN.exec(text)) !== null) {
    mentions.add(m[1]);
  }
  return [...mentions].sort();
}

const QUANTITY_PATTERN =
  /\b(setpoint|set point|gain|kp|ki|kd|threshold|frequency|voltage|time constant|amplitude|resistance|load)\s*(?:of|:|=)?\s*(-?\d+(?:\.\d+)?)\s*(rpm|hz|khz|mhz|v|kv|a|ma|w|kw|ohm|ohms|s|ms|degc|°c|celsius)?/gi;

export function extractQuantities(text: string): Array<{ name: string; value: number; unit?: string; sourceText: string }> {
  const out: Array<{ name: string; value: number; unit?: string; sourceText: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = QUANTITY_PATTERN.exec(text)) !== null) {
    out.push({
      name: m[1].toLowerCase().replace(/\s+/g, '_'),
      value: Number(m[2]),
      unit: m[3]?.toLowerCase(),
      sourceText: m[0],
    });
  }
  return out;
}

