import { useState } from 'react';
import {
  PenLine,
  Pen,
  Pencil,
  Paintbrush,
  PenTool,
  Highlighter,
  Eraser,
  Lasso,
  Shapes,
  Square,
  Circle,
  Minus as LineIcon,
  ArrowRight,
  Undo2,
  Redo2,
  Bookmark,
  StickyNote,
  Eye,
  EyeOff,
  Trash2,
  Minus,
  Plus,
  Droplet,
} from 'lucide-react';
import type { AnnotationTool, PenStyle, ShapeKind } from '../../lib/annotations';
import { INK_COLORS, HIGHLIGHTER_COLORS, MIN_THICKNESS, MAX_THICKNESS, MIN_OPACITY, MAX_OPACITY, THICKNESS_PRESETS } from '../../lib/annotations';
import { cx } from '../../lib/utils';

const PEN_STYLE_META: Record<PenStyle, { label: string; icon: typeof Pen }> = {
  fine: { label: 'Fine Pen', icon: PenLine },
  ballpoint: { label: 'Ballpoint', icon: Pen },
  pencil: { label: 'Pencil', icon: Pencil },
  brush: { label: 'Brush', icon: Paintbrush },
  marker: { label: 'Marker', icon: PenTool },
};

type ShapeTool = ShapeKind | 'arrow';
const SHAPE_TOOL_META: Record<ShapeTool, { label: string; icon: typeof Square }> = {
  rectangle: { label: 'Rectangle', icon: Square },
  ellipse: { label: 'Ellipse', icon: Circle },
  line: { label: 'Line', icon: LineIcon },
  arrow: { label: 'Arrow', icon: ArrowRight },
};
const SHAPE_TOOLS: ShapeTool[] = ['rectangle', 'ellipse', 'line', 'arrow'];

/** Pure decision extracted for testability (real getBoundingClientRect()/innerWidth values can't
 * be produced deterministically in every test environment) — a trigger whose own horizontal center
 * sits in the left ~30% of the viewport hugs the popover to its LEFT edge, the right ~30% hugs
 * RIGHT, and the middle 40% centers it, so the popover never has to run off either edge of a
 * narrow phone viewport just because its trigger wrapped to one side of the toolbar. */
export function popoverAlignFor(triggerCenterX: number, viewportWidth: number): 'left' | 'center' | 'right' {
  if (viewportWidth <= 0) return 'center';
  if (triggerCenterX < viewportWidth * 0.3) return 'left';
  if (triggerCenterX > viewportWidth * 0.7) return 'right';
  return 'center';
}

// Compact, touch-first annotation toolbar (Phase 7, extended Phase F). Every control is a large
// (>=44px) tap target, labelled for accessibility, with a visually distinct active state. No
// control here is desktop-only or requires precise pointing; the same bar works unchanged on a
// narrow phone (S24 Ultra) and a wider tablet (Mi Pad 6) — it simply wraps onto more/fewer rows via
// flex-wrap. A tool FAMILY with several variants (pen style, shape kind) collapses into ONE button
// + an expandable popover — never one permanent button per variant — so the bar stays compact even
// as the tool count has grown to 15.

interface ToolButtonProps {
  label: string;
  active: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}

function ToolButton({ label, active, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
        active
          ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
      )}
    >
      {children}
    </button>
  );
}

export interface AnnotationToolbarProps {
  activeTool: AnnotationTool | null;
  onSelectTool: (tool: AnnotationTool | null) => void;
  color: string;
  onSelectColor: (color: string) => void;
  /** Most-recently-used colours (including ones picked via the custom colour input below), most
   * recent first — session-local, not persisted (see DocumentAnnotator's own recentColors state
   * for why: a lightweight per-visit convenience, not a new persistence surface). Empty until the
   * user has actually used a colour outside the fixed preset at least once. */
  recentColors: string[];
  thickness: number;
  onChangeThickness: (thickness: number) => void;
  opacity: number;
  onChangeOpacity: (opacity: number) => void;
  penStyle: PenStyle;
  onSelectPenStyle: (style: PenStyle) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onAddNote: () => void;
  annotationsVisible: boolean;
  onToggleVisible: () => void;
  onClearPage: () => void;
  hasAnnotations: boolean;
}

export function AnnotationToolbar({
  activeTool,
  onSelectTool,
  color,
  onSelectColor,
  recentColors,
  thickness,
  onChangeThickness,
  opacity,
  onChangeOpacity,
  penStyle,
  onSelectPenStyle,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isBookmarked,
  onToggleBookmark,
  onAddNote,
  annotationsVisible,
  onToggleVisible,
  onClearPage,
  hasAnnotations,
}: AnnotationToolbarProps) {
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [showThicknessPanel, setShowThicknessPanel] = useState(false);
  const [showOpacityPanel, setShowOpacityPanel] = useState(false);
  const [showPenStylePanel, setShowPenStylePanel] = useState(false);
  const [showShapePanel, setShowShapePanel] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Which edge a just-opened popover should hug, decided once per open from the trigger button's
  // OWN position in the viewport (not a fixed CSS side) — on a narrow phone (S24 Ultra), a control
  // that wraps to the right half of the toolbar would otherwise render its popover running off the
  // right edge of the screen; a control near the left would risk the same on the left. Shared
  // across every popover since only one is ever open at a time.
  const [popoverAlign, setPopoverAlign] = useState<'left' | 'center' | 'right'>('center');
  const popoverAlignClass = popoverAlign === 'left' ? 'left-0' : popoverAlign === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';

  const palette = activeTool === 'highlighter' ? HIGHLIGHTER_COLORS : INK_COLORS;
  const ActivePenIcon = PEN_STYLE_META[penStyle].icon;
  const activeShapeTool: ShapeTool | null = activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'line' || activeTool === 'arrow' ? activeTool : null;
  const ActiveShapeIcon = activeShapeTool ? SHAPE_TOOL_META[activeShapeTool].icon : Shapes;

  function closeAllPanels() {
    setShowColorPanel(false);
    setShowThicknessPanel(false);
    setShowOpacityPanel(false);
    setShowPenStylePanel(false);
    setShowShapePanel(false);
  }

  function selectTool(tool: AnnotationTool) {
    onSelectTool(activeTool === tool ? null : tool);
    closeAllPanels();
  }

  /** Toggles ONE panel open/closed while ensuring every other panel is closed — `current` is that
   * panel's own boolean state, captured fresh on each render (togglePanel is called inline in JSX
   * below, never memoized), so this never reads a stale value. On open, also measures the trigger
   * button's own position (a single, one-off getBoundingClientRect() read, not a resize/scroll
   * listener — the same "measure once, at the moment it's needed" approach
   * ContextualSelectionToolbar already uses for its own positioning) to decide which edge the
   * popover should hug. */
  function togglePanel(current: boolean, setter: (v: boolean) => void) {
    return (e: React.MouseEvent<HTMLButtonElement>) => {
      closeAllPanels();
      if (!current) {
        const rect = e.currentTarget.getBoundingClientRect();
        setPopoverAlign(popoverAlignFor(rect.left + rect.width / 2, window.innerWidth));
      }
      setter(!current);
    };
  }

  return (
    <div className="relative z-20 flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:gap-2">
      <div className="relative">
        <ToolButton label={`Pen (${PEN_STYLE_META[penStyle].label})`} active={activeTool === 'pen'} onClick={() => selectTool('pen')}>
          <ActivePenIcon className="h-5 w-5" />
        </ToolButton>
        {activeTool === 'pen' && (
          <button
            type="button"
            aria-label="Choose pen style"
            title="Choose pen style"
            onClick={togglePanel(showPenStylePanel, setShowPenStylePanel)}
            className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-slate-400 text-white dark:border-slate-900"
          >
            <span className="text-[9px] leading-none">▾</span>
          </button>
        )}
        {activeTool === 'pen' && showPenStylePanel && (
          <div className={cx('absolute top-full z-30 mt-1.5 flex gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800', popoverAlignClass)}>
            {(Object.keys(PEN_STYLE_META) as PenStyle[]).map((style) => {
              const meta = PEN_STYLE_META[style];
              const Icon = meta.icon;
              return (
                <button
                  key={style}
                  type="button"
                  aria-label={meta.label}
                  title={meta.label}
                  onClick={() => {
                    onSelectPenStyle(style);
                    setShowPenStylePanel(false);
                  }}
                  className={cx(
                    'inline-flex h-11 w-11 items-center justify-center rounded-lg border',
                    style === penStyle
                      ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </div>
        )}
      </div>
      <ToolButton label="Highlighter — draw with pen/stylus. To highlight text, just select it." active={activeTool === 'highlighter'} onClick={() => selectTool('highlighter')}>
        <Highlighter className="h-5 w-5" />
      </ToolButton>

      <div className="relative">
        <ToolButton label={activeShapeTool ? SHAPE_TOOL_META[activeShapeTool].label : 'Shapes'} active={!!activeShapeTool} onClick={togglePanel(showShapePanel, setShowShapePanel)}>
          <ActiveShapeIcon className="h-5 w-5" />
        </ToolButton>
        {showShapePanel && (
          <div className={cx('absolute top-full z-30 mt-1.5 flex gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800', popoverAlignClass)}>
            {SHAPE_TOOLS.map((tool) => {
              const meta = SHAPE_TOOL_META[tool];
              const Icon = meta.icon;
              return (
                <button
                  key={tool}
                  type="button"
                  aria-label={meta.label}
                  title={meta.label}
                  onClick={() => {
                    selectTool(tool);
                    setShowShapePanel(false);
                  }}
                  className={cx(
                    'inline-flex h-11 w-11 items-center justify-center rounded-lg border',
                    tool === activeShapeTool
                      ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ToolButton label="Lasso select" active={activeTool === 'lasso'} onClick={() => selectTool('lasso')}>
        <Lasso className="h-5 w-5" />
      </ToolButton>
      <ToolButton label="Eraser" active={activeTool === 'eraser'} onClick={() => selectTool('eraser')}>
        <Eraser className="h-5 w-5" />
      </ToolButton>

      <div className="mx-0.5 h-7 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

      <ToolButton label="Undo" active={false} onClick={onUndo}>
        <Undo2 className={cx('h-5 w-5', !canUndo && 'opacity-30')} />
      </ToolButton>
      <ToolButton label="Redo" active={false} onClick={onRedo}>
        <Redo2 className={cx('h-5 w-5', !canRedo && 'opacity-30')} />
      </ToolButton>

      <div className="mx-0.5 h-7 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

      <div className="relative">
        <ToolButton label="Colour" active={showColorPanel} onClick={togglePanel(showColorPanel, setShowColorPanel)}>
          <span className="h-5 w-5 rounded-full border border-slate-300 dark:border-slate-600" style={{ backgroundColor: color }} />
        </ToolButton>
        {showColorPanel && (
          <div className={cx('absolute top-full z-30 mt-1.5 flex max-w-64 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-lg dark:border-slate-700 dark:bg-slate-800', popoverAlignClass)}>
            <div className="flex flex-wrap gap-1.5">
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  onClick={() => {
                    onSelectColor(c);
                    setShowColorPanel(false);
                  }}
                  className={cx('h-9 w-9 shrink-0 rounded-full border-2', c === color ? 'border-brand-500' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                />
              ))}
              {/* Custom colour — a real <input type="color"> so the OS's own colour picker (with
                  hex entry, eyedropper, etc.) does the actual picking rather than a bespoke one
                  reimplementing that UI. Its own swatch shows `color` whenever the current colour
                  isn't one of the fixed presets, so the control always reflects the real state. */}
              <label
                className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-[conic-gradient(from_0deg,red,yellow,lime,cyan,blue,magenta,red)] dark:border-slate-600"
                title="Custom colour"
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => onSelectColor(e.target.value)}
                  aria-label="Custom colour"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>
            {recentColors.length > 0 && (
              <div className="flex items-center gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-700">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recent</span>
                {recentColors.map((c, i) => (
                  <button
                    key={`${c}-${i}`}
                    type="button"
                    aria-label={`Recent colour ${c}`}
                    onClick={() => {
                      onSelectColor(c);
                      setShowColorPanel(false);
                    }}
                    className={cx('h-7 w-7 shrink-0 rounded-full border-2', c === color ? 'border-brand-500' : 'border-transparent')}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative">
        <ToolButton label="Thickness" active={showThicknessPanel} onClick={togglePanel(showThicknessPanel, setShowThicknessPanel)}>
          <span className="flex h-5 w-5 items-center justify-center">
            <span className="rounded-full bg-current" style={{ width: Math.max(4, Math.min(18, thickness)), height: Math.max(4, Math.min(18, thickness)) }} />
          </span>
        </ToolButton>
        {showThicknessPanel && (
          <div className={cx('absolute top-full z-30 mt-1.5 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800', popoverAlignClass)}>
            <div className="flex items-center gap-1.5">
              {THICKNESS_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onChangeThickness(preset.value)}
                  className={cx(
                    'inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-medium',
                    thickness === preset.value
                      ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease thickness"
                onClick={() => onChangeThickness(thickness - 1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="range"
                min={MIN_THICKNESS}
                max={MAX_THICKNESS}
                value={thickness}
                onChange={(e) => onChangeThickness(Number(e.target.value))}
                className="h-9 w-28 accent-brand-600"
                aria-label="Stroke thickness"
              />
              <button
                type="button"
                aria-label="Increase thickness"
                onClick={() => onChangeThickness(thickness + 1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <ToolButton label={activeTool === 'highlighter' ? 'Highlighter opacity' : 'Opacity'} active={showOpacityPanel} onClick={togglePanel(showOpacityPanel, setShowOpacityPanel)}>
          <Droplet className="h-5 w-5" style={{ opacity: Math.max(0.25, opacity) }} />
        </ToolButton>
        {showOpacityPanel && (
          <div className={cx('absolute top-full z-30 mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800', popoverAlignClass)}>
            <input
              type="range"
              min={MIN_OPACITY}
              max={MAX_OPACITY}
              step={0.05}
              value={opacity}
              onChange={(e) => onChangeOpacity(Number(e.target.value))}
              className="h-9 w-32 accent-brand-600"
              aria-label={activeTool === 'highlighter' ? 'Highlighter opacity' : 'Opacity'}
            />
            <span className="w-9 shrink-0 text-right text-xs text-slate-500 dark:text-slate-400">{Math.round(opacity * 100)}%</span>
          </div>
        )}
      </div>

      <div className="mx-0.5 h-7 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

      <ToolButton label={isBookmarked ? 'Remove bookmark' : 'Bookmark this document'} active={isBookmarked} onClick={onToggleBookmark}>
        <Bookmark className={cx('h-5 w-5', isBookmarked && 'fill-current')} />
      </ToolButton>
      <ToolButton label="Add note" active={false} onClick={onAddNote}>
        <StickyNote className="h-5 w-5" />
      </ToolButton>
      <ToolButton label={annotationsVisible ? 'Hide annotations' : 'Show annotations'} active={!annotationsVisible} onClick={onToggleVisible}>
        {annotationsVisible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
      </ToolButton>

      {hasAnnotations && (
        <ToolButton
          label={confirmClear ? 'Tap again to confirm: clear all annotations on this document' : 'Clear all annotations on this document'}
          active={confirmClear}
          onClick={() => {
            if (confirmClear) {
              onClearPage();
              setConfirmClear(false);
            } else {
              setConfirmClear(true);
            }
          }}
        >
          <Trash2 className="h-5 w-5" />
        </ToolButton>
      )}
    </div>
  );
}
