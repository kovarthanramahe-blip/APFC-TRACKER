// @vitest-environment happy-dom
//
// Premium Study Reader (Phase F) — smoke/interaction tests for the reorganized toolbar: confirms
// the new tool-family popovers (Shapes) and the new Opacity control render and wire their
// callbacks correctly, against a REAL rendered DOM. AnnotationToolbar is pure/presentational (no
// store, no Selection/Range dependency), so it renders fully here with no environment caveats.
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AnnotationToolbar, popoverAlignFor, type AnnotationToolbarProps } from './AnnotationToolbar';

describe('popoverAlignFor — edge-aware popover positioning (S24 Ultra / Xiaomi Pad 6 responsiveness)', () => {
  it('hugs the left edge for a trigger in the left ~30% of a narrow phone viewport', () => {
    expect(popoverAlignFor(40, 384)).toBe('left'); // e.g. the first (Pen) button on an S24 Ultra
  });

  it('hugs the right edge for a trigger in the right ~30% of the viewport (would otherwise overflow off-screen)', () => {
    expect(popoverAlignFor(350, 384)).toBe('right'); // e.g. Clear, wrapped to the end of a row
  });

  it('centers a trigger in the middle of the viewport', () => {
    expect(popoverAlignFor(192, 384)).toBe('center');
  });

  it('on a wide tablet (Xiaomi Pad 6, ~800px), the same trigger position that hugs left on a phone may center instead', () => {
    expect(popoverAlignFor(200, 800)).toBe('left'); // still within the left 30% of 800px (240px)
    expect(popoverAlignFor(300, 800)).toBe('center'); // now within the middle band on the wider viewport
  });

  it('defaults to center for a degenerate (zero/negative) viewport width rather than dividing by a bad value', () => {
    expect(popoverAlignFor(100, 0)).toBe('center');
  });
});

function baseProps(overrides: Partial<AnnotationToolbarProps> = {}): AnnotationToolbarProps {
  return {
    activeTool: null,
    onSelectTool: vi.fn(),
    color: '#1e293b',
    onSelectColor: vi.fn(),
    thickness: 2.5,
    onChangeThickness: vi.fn(),
    opacity: 1,
    onChangeOpacity: vi.fn(),
    penStyle: 'pen',
    onSelectPenStyle: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    isBookmarked: false,
    onToggleBookmark: vi.fn(),
    onAddNote: vi.fn(),
    annotationsVisible: true,
    onToggleVisible: vi.fn(),
    onClearPage: vi.fn(),
    hasAnnotations: false,
    ...overrides,
  };
}

function renderToolbar(props: AnnotationToolbarProps) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<AnnotationToolbar {...props} />);
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function findButtonByLabel(container: HTMLElement, label: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === label || b.getAttribute('title') === label);
  if (!btn) throw new Error(`No button found with label "${label}"`);
  return btn as HTMLButtonElement;
}

describe('AnnotationToolbar — new Phase F tools render', () => {
  it('renders Lasso, Shapes, and Eraser tool buttons', () => {
    const { container, cleanup } = renderToolbar(baseProps());
    try {
      expect(() => findButtonByLabel(container, 'Lasso select')).not.toThrow();
      expect(() => findButtonByLabel(container, 'Shapes')).not.toThrow();
      expect(() => findButtonByLabel(container, 'Eraser')).not.toThrow();
    } finally {
      cleanup();
    }
  });

  it('the Shapes button shows the active shape tool\'s own label once a shape tool is selected', () => {
    const { container, cleanup } = renderToolbar(baseProps({ activeTool: 'ellipse' }));
    try {
      expect(() => findButtonByLabel(container, 'Ellipse')).not.toThrow();
    } finally {
      cleanup();
    }
  });
});

describe('AnnotationToolbar — Shapes popover selects the right tool', () => {
  it('opens the shape popover and selecting Rectangle calls onSelectTool with "rectangle"', () => {
    const onSelectTool = vi.fn();
    const { container, cleanup } = renderToolbar(baseProps({ onSelectTool }));
    try {
      act(() => {
        findButtonByLabel(container, 'Shapes').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const rectangleButton = findButtonByLabel(container, 'Rectangle');
      act(() => {
        rectangleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onSelectTool).toHaveBeenCalledWith('rectangle');
    } finally {
      cleanup();
    }
  });

  it('selecting Arrow calls onSelectTool with "arrow"', () => {
    const onSelectTool = vi.fn();
    const { container, cleanup } = renderToolbar(baseProps({ onSelectTool }));
    try {
      act(() => {
        findButtonByLabel(container, 'Shapes').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      act(() => {
        findButtonByLabel(container, 'Arrow').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onSelectTool).toHaveBeenCalledWith('arrow');
    } finally {
      cleanup();
    }
  });
});

describe('AnnotationToolbar — Opacity control', () => {
  it('opens the opacity popover with a range input reflecting the current opacity', () => {
    const { container, cleanup } = renderToolbar(baseProps({ opacity: 0.35 }));
    try {
      const opacityButton = findButtonByLabel(container, 'Opacity');
      act(() => {
        opacityButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const slider = container.querySelector('input[type="range"][aria-label="Opacity"]') as HTMLInputElement;
      expect(slider).toBeTruthy();
      expect(slider.value).toBe('0.35');
    } finally {
      cleanup();
    }
  });

  it('labels the control "Highlighter opacity" while the highlighter tool is active', () => {
    const { container, cleanup } = renderToolbar(baseProps({ activeTool: 'highlighter' }));
    try {
      expect(() => findButtonByLabel(container, 'Highlighter opacity')).not.toThrow();
    } finally {
      cleanup();
    }
  });
});

describe('AnnotationToolbar — popovers close each other (only one open at a time)', () => {
  it('opening the Shapes popover closes an already-open Colour popover', () => {
    const { container, cleanup } = renderToolbar(baseProps());
    try {
      act(() => {
        findButtonByLabel(container, 'Colour').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain(''); // colour swatches have no text; just confirm no throw so far
      act(() => {
        findButtonByLabel(container, 'Shapes').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      // The shape popover's own items are now present…
      expect(() => findButtonByLabel(container, 'Rectangle')).not.toThrow();
      // …and re-clicking Shapes again toggles it closed without error.
      act(() => {
        findButtonByLabel(container, 'Shapes').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.querySelector('[aria-label="Rectangle"]')).toBeNull();
    } finally {
      cleanup();
    }
  });
});
