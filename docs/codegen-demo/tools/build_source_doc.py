#!/usr/bin/env python3
"""Builds docs/codegen-process-from-source.html.

Every code excerpt in the walkthrough is sliced out of the repository at build time, so the
document cannot drift from the code it describes:

    python3 docs/codegen-demo/tools/build_source_doc.py

Placeholders (each expands to a <pre><code> block plus a file:line caption):

    {{SRC:file|start|end}}    generator/builder source, from `start` up to and including `end`
    {{SRCUT:file|start|cut}}  same, but stopping just before the first `cut` after `start`
    {{OUT:file|start|end}}    generated C, same rules
    {{OUTCUT:file|start|cut}} generated C, same rules
    {{FUNCS:file}}            inventory of function definitions with line numbers
    {{LINES:file}}            line count

`file` is relative to the repository root; `start`/`end`/`cut` are literal substrings that must
appear exactly once after the previous anchor (the builder fails loudly otherwise).
"""
import html
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(REPO, 'docs', 'codegen-process-from-source.html')


def read(rel):
    with open(os.path.join(REPO, rel), 'r') as handle:
        return handle.read()


def find_marker(lines, marker, first=0):
    """Returns the index of the `@k`-th occurrence (1-based, default 1) of `marker`, at or after `first`."""
    count = 1
    if '@' in marker:
        head, _, suffix = marker.rpartition('@')
        if suffix.isdigit() and int(suffix) >= 1:
            marker, count = head, int(suffix)
    hits = [i for i, line in enumerate(lines[first:], start=first) if marker in line]
    if len(hits) < count:
        return None
    return hits[count - 1]


def slice_lines(rel, start, end=None, cut=None, indent_trim=False):
    text = read(rel)
    lines = text.split('\n')
    start_index = find_marker(lines, start)
    if start_index is None:
        raise SystemExit('start marker not found in %s: %r' % (rel, start))
    end_index = len(lines)
    # the stop marker is searched for *below* the start line, so `start` and `end` may be identical
    if cut is not None:
        end_index = find_marker(lines, cut, start_index + 1)
        if end_index is None:
            raise SystemExit('cut marker not found in %s after %r: %r' % (rel, start, cut))
    elif end is not None:
        found = find_marker(lines, end, start_index + 1)
        if found is None:
            raise SystemExit('end marker not found in %s after %r: %r' % (rel, start, end))
        end_index = found + 1
    body = lines[start_index:end_index]
    if indent_trim:
        body = [line.rstrip() for line in body]
    return '\n'.join(body), start_index + 1, end_index


def code_block(rel, start, end=None, cut=None):
    body, first, last = slice_lines(rel, start, end, cut)
    caption = '%s:%d–%d' % (rel, first, last)
    # style generated artefacts differently from generator source
    kind = 'out' if rel.startswith('docs/codegen-demo/evidence/') else 'src'
    return (
        '<figure class="code %s">\n<pre><code>%s</code></pre>\n<figcaption>%s</figcaption>\n</figure>'
        % (kind, html.escape(body), caption)
    )


def function_inventory(rel):
    text = read(rel)
    rows = []
    for index, line in enumerate(text.split('\n'), start=1):
        match = re.match(r'^(?:static\s+)?(?:const\s+)?(?:void|bool|double|SM_\w+|uint\d+_t|int\d+_t)\s+(\w+)\s*\(', line)
        if match and line.rstrip().endswith(')'):
            rows.append((index, match.group(1)))
    body = '\n'.join('%-34s line %d' % (name, line) for line, name in rows)
    return (
        '<figure class="code"><pre><code>%s</code></pre><figcaption>%s — %d emitted definitions</figcaption></figure>'
        % (html.escape(body), rel, len(rows))
    )


def expand(document):
    def replace(block):
        kind, payload = block.group(1), block.group(2)
        parts = payload.split('|')
        rel = parts[0]
        if kind == 'SRC':
            return code_block(rel, parts[1], parts[2] if len(parts) > 2 else None)
        if kind == 'SRCUT':
            return code_block(rel, parts[1], cut=parts[2])
        if kind == 'OUT':
            return code_block(rel, parts[1], parts[2] if len(parts) > 2 else None)
        if kind == 'OUTCUT':
            return code_block(rel, parts[1], cut=parts[2])
        if kind == 'FUNCS':
            return function_inventory(rel)
        if kind == 'LINES':
            return '<code>%s</code> (%d lines)' % (rel, len(read(rel).split('\n')))
        raise SystemExit('unknown placeholder: ' + kind)

    # payloads may contain braces (C typedef lines), so match non-greedily up to the closing '}}'
    return re.sub(r'\{\{(\w+):(.*?)\}\}', replace, document, flags=re.S)


def main():
    parts = []
    for name in sorted(os.listdir(os.path.join(HERE, 'parts'))):
        if name.endswith('.html'):
            parts.append(open(os.path.join(HERE, 'parts', name), 'r').read())
    document = expand('\n'.join(parts))
    left = [m.start() for m in re.finditer(r'\{\{', document)]
    if left:
        snippets = [document[i:i + 90] for i in left[:3]]
        raise SystemExit('unexpanded placeholder markup at offsets %r:\n  %s' % (left[:3], '\n  '.join(snippets)))
    with open(OUT, 'w') as handle:
        handle.write(document)
    print('wrote %s (%d bytes, %d code blocks)' % (OUT, len(document), document.count('<figure class="code')))


if __name__ == '__main__':
    main()
