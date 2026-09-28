// @vitest-environment happy-dom
//
// Architecture Deduplication Phase 1 — focused tests for the shared MarkdownPreview, extracted from
// three near-identical copies (see this component's own header). Uses the same real-DOM rendering
// convention already established for annotation components (react-dom/client + act + happy-dom —
// see components/annotations/DocumentAnnotator.clear.test.tsx), since markdown-to-jsx's actual
// output is what needs verifying here, not just prop plumbing.
import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MarkdownPreview } from './MarkdownPreview';

function render(content: string, props: Partial<{ className: string; emptyText: string }> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<MarkdownPreview content={content} {...props} />);
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('MarkdownPreview', () => {
  it('renders a heading', () => {
    const { container, cleanup } = render('# Hello');
    try {
      expect(container.querySelector('h1')?.textContent).toBe('Hello');
    } finally {
      cleanup();
    }
  });

  it('renders bold and italic', () => {
    const { container, cleanup } = render('**bold** and *italic*');
    try {
      expect(container.querySelector('strong')?.textContent).toBe('bold');
      expect(container.querySelector('em')?.textContent).toBe('italic');
    } finally {
      cleanup();
    }
  });

  it('renders a bulleted list', () => {
    const { container, cleanup } = render('- one\n- two');
    try {
      const items = Array.from(container.querySelectorAll('li')).map((li) => li.textContent);
      expect(items).toEqual(['one', 'two']);
    } finally {
      cleanup();
    }
  });

  it('renders a link', () => {
    const { container, cleanup } = render('[example](https://example.com)');
    try {
      const link = container.querySelector('a');
      expect(link?.getAttribute('href')).toBe('https://example.com');
      expect(link?.textContent).toBe('example');
    } finally {
      cleanup();
    }
  });

  it('renders a fenced code block', () => {
    const { container, cleanup } = render('```\nconst x = 1;\n```');
    try {
      expect(container.querySelector('pre code')?.textContent?.trim()).toBe('const x = 1;');
    } finally {
      cleanup();
    }
  });

  it('renders a table', () => {
    const { container, cleanup } = render('| A | B |\n| --- | --- |\n| 1 | 2 |');
    try {
      expect(container.querySelector('table')).not.toBeNull();
      expect(container.querySelectorAll('th')).toHaveLength(2);
      expect(container.querySelectorAll('td')).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it('renders a horizontal rule', () => {
    const { container, cleanup } = render('above\n\n---\n\nbelow');
    try {
      expect(container.querySelector('hr')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it('never parses raw HTML — it renders as inert literal text', () => {
    const { container, cleanup } = render('<script>window.__pwned = true</script>');
    try {
      expect(container.querySelector('script')).toBeNull();
      expect(container.textContent).toContain('<script>');
    } finally {
      cleanup();
    }
  });

  it('shows the empty-state message for blank content, defaulting sensibly', () => {
    const { container, cleanup } = render('   ');
    try {
      expect(container.textContent).toBe('Nothing to preview yet.');
    } finally {
      cleanup();
    }
  });

  it('accepts a custom empty-state message', () => {
    const { container, cleanup } = render('', { emptyText: 'No source content.' });
    try {
      expect(container.textContent).toBe('No source content.');
    } finally {
      cleanup();
    }
  });

  it('merges a caller-supplied className with the shared base classes', () => {
    const { container, cleanup } = render('text', { className: 'p-4' });
    try {
      const root = container.firstElementChild!;
      expect(root.className).toContain('p-4');
      expect(root.className).toContain('text-sm');
    } finally {
      cleanup();
    }
  });
});
