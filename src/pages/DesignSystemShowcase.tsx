import { useState } from 'react';
import { Flame, Trophy, Sparkles, BookOpen, Bell } from 'lucide-react';
import { cx } from '../lib/utils';
import {
  Card,
  Button,
  IconButton,
  Badge,
  StatTile,
  StatCard,
  ProgressBar,
  ProgressRing,
  PageHeader,
  SectionHeader,
  Tabs,
  Input,
  Select,
  Toggle,
  Modal,
  Toast,
  Tooltip,
  Skeleton,
  EmptyState,
  LoadingState,
  JarvisInsightCard,
  JarvisThinkingIndicator,
  type TabItem,
} from '../components/ui/Primitives';

// JARVIS Aura Design System (Phase 15) — a development-only visual reference for the new token/
// primitive system, NOT a user-facing feature. Reachable only via its own direct URL
// (/dev/design-system, registered in App.tsx) — deliberately absent from nav.ts/AppShell's
// sidebar and bottom nav, so it never appears anywhere a real user would find it. Every control
// here is a static demo (no business logic, no store reads beyond what AppShell itself already
// needs to render the page) — its only job is letting a human visually validate the design
// language in both themes and at multiple widths before it's applied to any real screen.

const SHOWCASE_TABS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'syllabus', label: 'Syllabus' },
  { id: 'analytics', label: 'Analytics' },
];

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={cx('h-12 w-12 rounded-xl border border-slate-200/60 dark:border-slate-700/60', className)} />
      <span className="text-[11px] text-slate-500 dark:text-slate-400">{name}</span>
    </div>
  );
}

export default function DesignSystemShowcase() {
  const [activeTab, setActiveTab] = useState('overview');
  const [modalOpen, setModalOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toggleOn, setToggleOn] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [sliderValue, setSliderValue] = useState(62);

  return (
    <div className="space-y-10 pb-20">
      <PageHeader
        eyebrow="Internal — not user-facing"
        title="JARVIS Aura Design System"
        description="Phase 15 showcase — every token and primitive in one place, for visual validation before it's applied to real screens."
      />

      <section>
        <SectionHeader title="Typography" description="display → page title → section title → card title → body → secondary → caption → metric → timer" />
        <Card className="p-6 space-y-3">
          <p className="font-display text-3xl font-bold text-slate-900 dark:text-white">Display</p>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white">Page title</p>
          <p className="font-display text-lg font-semibold text-slate-900 dark:text-white">Section title</p>
          <p className="font-display text-base font-semibold text-slate-900 dark:text-white">Card title</p>
          <p className="text-sm text-slate-700 dark:text-slate-300">Body text — the default size for most reading content across the app.</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Secondary text — slightly muted, for supporting detail.</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Caption — the smallest size, used sparingly.</p>
          <p className="font-display text-4xl font-bold tabular-nums text-slate-900 dark:text-white">128</p>
          <p className="text-[11px] text-slate-400 -mt-2">Metric</p>
          <p className="font-display text-4xl font-bold tabular-nums text-slate-900 dark:text-white">24:58</p>
          <p className="text-[11px] text-slate-400 -mt-2">Timer</p>
        </Card>
      </section>

      <section>
        <SectionHeader title="Colour tokens" description="Primary (sage), secondary (restrained blue), success, warning, danger, info, muted, JARVIS, APFC, PhD, gold." />
        <Card className="p-6">
          <div className="grid grid-cols-4 gap-4 sm:grid-cols-6 lg:grid-cols-11">
            <Swatch name="Primary" className="bg-primary-600" />
            <Swatch name="Secondary" className="bg-secondary-600" />
            <Swatch name="Success" className="bg-success-600" />
            <Swatch name="Warning" className="bg-warning-500" />
            <Swatch name="Danger" className="bg-danger-600" />
            <Swatch name="Info" className="bg-info-600" />
            <Swatch name="Muted" className="bg-muted-500" />
            <Swatch name="JARVIS" className="bg-jarvis-600" />
            <Swatch name="APFC" className="bg-apfc-600" />
            <Swatch name="PhD" className="bg-phd-600" />
            <Swatch name="Gold" className="bg-gold-600" />
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="Surfaces" description="Base → Surface → Elevated → Interactive → Selected → Focused" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="flex h-20 items-center justify-center rounded-2xl bg-bg text-xs text-fg border border-border">Base</div>
          <Card className="flex h-20 items-center justify-center text-xs">Surface</Card>
          <Card elevated className="flex h-20 items-center justify-center text-xs">
            Elevated
          </Card>
          <Card className="flex h-20 items-center justify-center text-xs cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">Interactive</Card>
          <Card className="flex h-20 items-center justify-center text-xs ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-500/10">Selected</Card>
          <Card className="flex h-20 items-center justify-center text-xs ring-2 ring-focus">Focused</Card>
        </div>
      </section>

      <section>
        <SectionHeader title="Card variants" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <p className="font-display font-semibold text-slate-900 dark:text-white">Default surface</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The everyday card — used for most content.</p>
          </Card>
          <Card elevated className="p-5">
            <p className="font-display font-semibold text-slate-900 dark:text-white">Elevated surface</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Reserved for a page's single most important card.</p>
          </Card>
        </div>
      </section>

      <section>
        <SectionHeader title="Buttons &amp; IconButton" />
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <IconButton icon={Bell} label="Notifications" variant="secondary" />
            <IconButton icon={Sparkles} label="JARVIS" variant="primary" />
            <IconButton icon={Flame} label="Streak" variant="ghost" />
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="Badges" description="Including the new JARVIS tone." />
        <Card className="p-6 flex flex-wrap gap-2">
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="brand">Brand</Badge>
          <Badge tone="gold">Gold</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="danger">Danger</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="jarvis">JARVIS</Badge>
        </Card>
      </section>

      <section>
        <SectionHeader title="StatCard / StatTile" />
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={Flame} label="Current streak" value="12 days" trend={{ value: 8, label: 'vs last week' }} accentClassName="text-warning-600 dark:text-warning-400" />
          <StatCard icon={BookOpen} label="Topics revised" value="47" trend={{ value: -4, label: 'vs last week' }} />
          <StatTile label="Legacy StatTile" value="96%" tone="success" />
        </div>
      </section>

      <section>
        <SectionHeader title="ProgressBar / ProgressRing" />
        <Card className="p-6 flex flex-wrap items-center gap-8">
          <div className="w-64">
            <ProgressBar value={68} />
          </div>
          <ProgressRing value={68} radius={28} strokeWidth={6} colorClassName="text-primary-600" className="h-20 w-20" />
          <ProgressRing value={84} radius={28} strokeWidth={6} colorClassName="text-jarvis-600" className="h-20 w-20" />
        </Card>
      </section>

      <section>
        <SectionHeader title="Tabs" />
        <Card className="p-6">
          <Tabs tabs={SHOWCASE_TABS} activeId={activeTab} onChange={setActiveTab} />
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Active tab: {activeTab}</p>
        </Card>
      </section>

      <section>
        <SectionHeader title="Input / Select / Toggle" />
        <Card className="p-6 grid gap-4 sm:grid-cols-3">
          <Input label="Topic name" placeholder="e.g. Provident Fund Act" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
          <Select label="Subject" defaultValue="general">
            <option value="general">General study</option>
            <option value="apfc-act">APFC Act</option>
          </Select>
          <div className="flex items-center gap-3">
            <Toggle checked={toggleOn} onChange={setToggleOn} label="Enable reminders" />
            <span className="text-sm text-slate-600 dark:text-slate-300">{toggleOn ? 'On' : 'Off'}</span>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="Modal / Toast / Tooltip" />
        <Card className="p-6 flex flex-wrap items-center gap-3">
          <Button onClick={() => setModalOpen(true)}>Open Modal</Button>
          <Button variant="secondary" onClick={() => setToastOpen(true)}>
            Show Toast
          </Button>
          <Tooltip label="This is a tooltip">
            <Button variant="ghost">Hover / focus me</Button>
          </Tooltip>
        </Card>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Example Modal">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This is the shared Modal primitive — Escape or the backdrop closes it, and it accepts any content.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setModalOpen(false)}>Confirm</Button>
          </div>
        </Modal>
        <Toast open={toastOpen} onClose={() => setToastOpen(false)} icon={Trophy} title="Toast example" message="This demonstrates the Toast primitive." tone="success" />
      </section>

      <section>
        <SectionHeader title="Skeleton / LoadingState / EmptyState" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <Skeleton className="h-6 w-2/3 mb-2" />
            <Skeleton className="h-4 w-full" />
          </Card>
          <Card className="p-4">
            <LoadingState label="Loading analytics…" />
          </Card>
          <EmptyState icon={BookOpen} title="No notes yet" description="Import a document to get started." action={<Button size="sm">Import document</Button>} />
        </div>
      </section>

      <section>
        <SectionHeader title="JARVIS visual language" description="Insight card and thinking indicator." />
        <div className="grid gap-4 sm:grid-cols-2">
          <JarvisInsightCard
            icon={Sparkles}
            title="Suggested next step"
            description="You have 3 overdue topics in Administration of the Act. Revise these first to stay on track."
            action={<Button size="sm">Start revision</Button>}
          />
          <Card className="p-5 flex items-center justify-center">
            <JarvisThinkingIndicator />
          </Card>
        </div>
      </section>

      <section>
        <SectionHeader title="Focus states" description="Tab to the controls below to see the shared focus ring." />
        <Card className="p-6 flex flex-wrap gap-3">
          <Button>Tab to me</Button>
          <Input placeholder="Tab to me too" value={sliderValue.toString()} onChange={(e) => setSliderValue(Number(e.target.value) || 0)} />
        </Card>
      </section>
    </div>
  );
}
