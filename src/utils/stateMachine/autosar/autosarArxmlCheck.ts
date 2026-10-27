/**
 * Pure-TypeScript structural check of an ARXML document (no DOM, runs in the browser and in Node):
 * well-formed XML, one AUTOSAR root, and every DEST reference resolves to an element of the
 * same file (or to /AUTOSAR_Platform/..., which the integrator's platform package provides).
 * It is NOT an XSD validation (no AUTOSAR schema ships with ADIA).
 */
export interface ArxmlCheckResult {
  errors: string[];
  elements: number;
  references: number;
}

interface XmlNode {
  tag: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const NAME = '[A-Za-z_][A-Za-z0-9_.:-]*';
const ATTRIBUTE = new RegExp(`(${NAME})\\s*=\\s*("([^"]*)"|'([^']*)')`, 'g');

const decode = (text: string): string => text
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
  .replace(/&amp;/g, '&');

const lineOf = (source: string, index: number): number => {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (source.charCodeAt(position) === 10) line += 1;
  }
  return line;
};

const parse = (source: string, errors: string[]): XmlNode | null => {
  const root: XmlNode = { tag: '#document', attributes: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  let index = 0;
  const fail = (message: string, at: number): null => {
    errors.push(`XML line ${lineOf(source, at)}: ${message}`);
    return null;
  };
  while (index < source.length) {
    const open = source.indexOf('<', index);
    const top = stack[stack.length - 1];
    if (open < 0) {
      top.text += source.slice(index);
      break;
    }
    top.text += source.slice(index, open);
    if (source.startsWith('<!--', open)) {
      const end = source.indexOf('-->', open + 4);
      if (end < 0) return fail('unterminated comment', open);
      index = end + 3;
    } else if (source.startsWith('<?', open)) {
      const end = source.indexOf('?>', open + 2);
      if (end < 0) return fail('unterminated processing instruction', open);
      index = end + 2;
    } else if (source.startsWith('<![CDATA[', open)) {
      const end = source.indexOf(']]>', open + 9);
      if (end < 0) return fail('unterminated CDATA section', open);
      top.text += source.slice(open + 9, end);
      index = end + 3;
    } else if (source.startsWith('</', open)) {
      const end = source.indexOf('>', open);
      if (end < 0) return fail('unterminated end tag', open);
      const tag = source.slice(open + 2, end).trim();
      if (stack.length < 2 || top.tag !== tag) {
        return fail(`end tag </${tag}> does not match ${stack.length < 2 ? 'any open element' : `<${top.tag}>`}`, open);
      }
      stack.pop();
      index = end + 1;
    } else {
      const end = source.indexOf('>', open);
      if (end < 0) return fail('unterminated start tag', open);
      const inside = source.slice(open + 1, end);
      const selfClosing = inside.endsWith('/');
      const body = selfClosing ? inside.slice(0, -1) : inside;
      const head = new RegExp(`^(${NAME})`).exec(body);
      if (head === null) return fail(`invalid start tag '<${inside}'`, open);
      const attributes: Record<string, string> = {};
      const rest = body.slice(head[1].length);
      ATTRIBUTE.lastIndex = 0;
      let consumed = 0;
      let match: RegExpExecArray | null;
      while ((match = ATTRIBUTE.exec(rest)) !== null) {
        if (rest.slice(consumed, match.index).trim() !== '') return fail(`malformed attributes in '<${head[1]}'`, open);
        if (match[1] in attributes) return fail(`duplicate attribute '${match[1]}' in '<${head[1]}'`, open);
        attributes[match[1]] = decode(match[3] ?? match[4] ?? '');
        consumed = match.index + match[0].length;
      }
      if (rest.slice(consumed).trim() !== '') return fail(`malformed attributes in '<${head[1]}'`, open);
      const node: XmlNode = { tag: head[1], attributes, children: [], text: '' };
      top.children.push(node);
      if (!selfClosing) stack.push(node);
      index = end + 1;
    }
  }
  if (stack.length > 1) return fail(`element <${stack[stack.length - 1].tag}> is never closed`, source.length);
  const elements = root.children;
  if (elements.length !== 1) return fail(`expected exactly one root element, found ${elements.length}`, 0);
  if (root.text.trim() !== '') return fail('text outside the root element', 0);
  return elements[0];
};

export const checkArxmlStructure = (source: string): ArxmlCheckResult => {
  const errors: string[] = [];
  const rootNode = parse(source, errors);
  if (rootNode === null) return { errors, elements: 0, references: 0 };
  if (rootNode.tag !== 'AUTOSAR') errors.push(`root element is <${rootNode.tag}>, expected <AUTOSAR>`);

  const targets = new Map<string, string[]>();
  const references: Array<{ node: XmlNode; path: string }> = [];
  let elements = 0;
  const walk = (node: XmlNode, prefix: string): void => {
    elements += 1;
    const nameNode = node.children.find((child) => child.tag === 'SHORT-NAME');
    const name = nameNode === undefined ? '' : decode(nameNode.text.trim());
    const path = name === '' ? prefix : `${prefix}/${name}`;
    if (name !== '') {
      const tags = targets.get(path) ?? [];
      tags.push(node.tag);
      targets.set(path, tags);
    }
    if ('DEST' in node.attributes) references.push({ node, path });
    for (const child of node.children) walk(child, path);
  };
  walk(rootNode, '');

  for (const [path, tags] of targets) {
    if (tags.length > 1) errors.push(`duplicate AUTOSAR path ${path}`);
  }
  for (const { node } of references) {
    const target = decode(node.text.trim());
    if (target.startsWith('/AUTOSAR_Platform/')) continue;
    const tags = targets.get(target);
    if (tags === undefined) {
      errors.push(`<${node.tag}> reference '${target}' does not resolve inside the file`);
    } else if (!tags.includes(node.attributes.DEST)) {
      errors.push(`<${node.tag}> reference '${target}' has DEST ${node.attributes.DEST} but the target is ${tags.join('/')}`);
    }
  }
  return { errors, elements, references: references.length };
};
