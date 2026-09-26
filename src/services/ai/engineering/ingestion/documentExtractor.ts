export interface ExtractedSection {
  heading: string;
  locator: string;
  content: string;
  order: number;
}

const FORBIDDEN_PATTERNS = [
  /<script\b[^>]*>/i,
  /<\/script>/i,
  /javascript:/i,
  /\bonerror\s*=/i,
  /\bonload\s*=/i,
  /\bSub\s+AutoOpen\b/i,
  /\bSub\s+Document_Open\b/i,
  /\bShell\s+["'][^"']+/i,
  /\bWScript\.Shell\b/i,
  /\bpowershell\.exe\b/i
];

export class DocumentExtractor {
  public extractSections(text: string): ExtractedSection[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    // Security check: reject active script, macros, and executable payloads
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        throw new Error(`SECURITY_VIOLATION: Active script, macro, or executable code detected in document content`);
      }
    }

    // Check for null bytes / binary markers
    if (text.includes('\0')) {
      throw new Error(`SECURITY_VIOLATION: Binary null byte detected in text document`);
    }

    const lines = text.split(/\r?\n/);
    const sections: ExtractedSection[] = [];
    let currentHeading = 'Document Header';
    let currentLines: string[] = [];
    let order = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        if (currentLines.length > 0) {
          sections.push({
            heading: currentHeading,
            locator: currentHeading,
            content: currentLines.join('\n').trim(),
            order: order++
          });
          currentLines = [];
        }
        currentHeading = headingMatch[2].trim();
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0 || sections.length === 0) {
      sections.push({
        heading: currentHeading,
        locator: currentHeading,
        content: currentLines.join('\n').trim(),
        order: order++
      });
    }

    return sections.filter(s => s.content.length > 0 || s.heading !== 'Document Header');
  }
}
