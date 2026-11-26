import { ImagePlus, Loader2, MessageSquarePlus, Square, Wand2 } from 'lucide-react';
import { type DragEvent, type KeyboardEvent, useCallback, useMemo, useRef, useState } from 'react';
import { DEFAULT_TARGET } from '../shared/defaults';
import { type EffortLevel, LIMITS, type TargetModel, isEffortLevel, isTargetModel } from '../shared/protocol';
import { referenceLength, toReference } from '../shared/references';
import ApiKeyDialog from './components/ApiKeyDialog';
import BuildStamp, { hasBuildStamp } from './components/BuildStamp';
import EffortSelect from './components/EffortSelect';
import Header from './components/Header';
import HistorySidebar from './components/HistorySidebar';
import ImageUploader, { ADD_ENTRY_CLASS } from './components/ImageUploader';
import ReferenceChips from './components/ReferenceChips';
import ReferencePicker from './components/ReferencePicker';
import RefineOutput from './components/RefineOutput';
import TargetSelect from './components/TargetSelect';
import { useApiKey } from './hooks/useApiKey';
import { useAppConfig } from './hooks/useAppConfig';
import { useHistory } from './hooks/useHistory';
import { useImageAttachments } from './hooks/useImageAttachments';
import { type RefineResult, useRefine } from './hooks/useRefine';
import { dataUrlToBase64 } from './lib/images';
import { DIRECT_MODE } from './lib/mode';
import type { HistoryItem } from './types';

const EFFORT_STORAGE_KEY = 'prompt_refiner_effort';
const TARGET_STORAGE_KEY = 'prompt_refiner_target';
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

function readStoredTarget(): TargetModel {
  try {
    const stored = localStorage.getItem(TARGET_STORAGE_KEY);
    return isTargetModel(stored) ? stored : DEFAULT_TARGET;
  } catch {
    return DEFAULT_TARGET;
  }
}

function readStoredEffort(): EffortLevel | null {
  try {
    const stored = localStorage.getItem(EFFORT_STORAGE_KEY);
    return isEffortLevel(stored) ? stored : null;
  } catch {
    return null;
  }
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes('Files');
}

export default function App() {
  const appConfig = useAppConfig();
  const [inputText, setInputText] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [effortChoice, setEffortChoice] = useState<EffortLevel | null>(readStoredEffort);
  const effort = effortChoice ?? appConfig.defaultEffort;
  const [targetModel, setTargetModel] = useState<TargetModel>(readStoredTarget);

  const attachments = useImageAttachments();
  const {
    history,
    add: addToHistory,
    remove,
    clear,
    importItems,
    problem: historyProblem,
    unsavedIds,
  } = useHistory();
  // The history entry the output panel is showing, so it can say when that
  // entry could not be saved.
  const [shownEntryId, setShownEntryId] = useState<string | null>(null);

  // Earlier sessions the next refinement builds on. Only ids are kept, and the
  // sessions are looked up in history, so one that is deleted there drops out
  // of the selection by itself. Oldest first: the order the model is told to expect.
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const referencedSessions = useMemo(() => {
    const chosen = new Set(referenceIds);
    return history.filter((item) => chosen.has(item.id)).sort((a, b) => a.timestamp - b.timestamp);
  }, [history, referenceIds]);
  const references = useMemo(() => referencedSessions.map(toReference), [referencedSessions]);
  const referenceChars = references.reduce((total, reference) => total + referenceLength(reference), 0);
  const referencesOverLimit = referenceChars > LIMITS.maxReferenceChars;

  const toggleReference = (id: string) => {
    const current = referencedSessions.map((session) => session.id);
    if (current.includes(id)) setReferenceIds(current.filter((other) => other !== id));
    else if (current.length < LIMITS.maxReferences) setReferenceIds([...current, id]);
  };
  const closePicker = useCallback(() => setIsPickerOpen(false), []);

  // The draft and the references as they were when "Refine" was pressed, so
  // later changes in the input panel do not change what gets saved alongside
  // the result.
  const submittedDraft = useRef('');
  const submittedReferenceIds = useRef<string[]>([]);
  const handleComplete = useCallback(
    ({ output, model }: RefineResult) => {
      const basedOn = submittedReferenceIds.current;
      const entry = addToHistory({
        originalPrompt: submittedDraft.current,
        refinedPrompt: output,
        model,
        ...(basedOn.length > 0 ? { basedOn } : {}),
      });
      setShownEntryId(entry.id);
    },
    [addToHistory],
  );
  const refiner = useRefine(handleComplete);

  const isGenerating = refiner.status === 'generating';
  const hasInput = inputText.trim().length > 0 || attachments.images.length > 0;
  const overLimit = inputText.length > LIMITS.maxInputChars;
  const canRefine = !isGenerating && hasInput && !overLimit && !referencesOverLimit;

  // Stop takes the place of the Refine button, so the second click of an
  // accidental double-click would land on it and cancel the request at once.
  const startedAt = useRef(0);
  const handleStop = () => {
    if (performance.now() - startedAt.current > 400) refiner.stop();
  };

  const submit = () => {
    submittedDraft.current = inputText;
    submittedReferenceIds.current = referencedSessions.map((session) => session.id);
    startedAt.current = performance.now();
    void refiner.refine({
      inputText,
      images: attachments.images.map((image) => ({
        mediaType: image.mediaType,
        data: dataUrlToBase64(image.dataUrl),
      })),
      references,
      effort,
      targetModel,
    });
  };

  // Browser-only build: the user's own key. If Refine is pressed before a key
  // exists, ask for it, then carry on with the refinement they asked for.
  const apiKey = useApiKey();
  const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false);
  const resumeAfterKey = useRef(false);
  const closeKeyDialog = useCallback(() => {
    resumeAfterKey.current = false;
    setIsKeyDialogOpen(false);
  }, []);
  const handleSaveKey = (key: string, remember: boolean) => {
    apiKey.save(key, remember);
    setIsKeyDialogOpen(false);
    if (resumeAfterKey.current) {
      resumeAfterKey.current = false;
      submit();
    }
  };

  const handleRefine = () => {
    if (!canRefine) return;
    if (DIRECT_MODE && !apiKey.hasKey) {
      resumeAfterKey.current = true;
      setIsKeyDialogOpen(true);
      return;
    }
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleRefine();
    }
  };

  const handleStartOver = () => {
    const hasWork =
      inputText || attachments.images.length > 0 || referencedSessions.length > 0 || refiner.output;
    if (hasWork && !window.confirm('Are you sure you want to clear everything and start over?')) return;
    setInputText('');
    attachments.clear();
    setReferenceIds([]);
    refiner.reset();
  };

  const handleSelectHistory = (item: HistoryItem) => {
    if (isGenerating) return;
    setInputText(item.originalPrompt);
    attachments.clear(); // History keeps text only; images are not saved.
    setReferenceIds(item.basedOn ?? []); // The sessions it was built on, as far as they still exist.
    refiner.show(item.refinedPrompt);
    setShownEntryId(item.id);
    setIsHistoryOpen(false);
  };

  const handleEffortChange = (value: EffortLevel) => {
    setEffortChoice(value);
    try {
      localStorage.setItem(EFFORT_STORAGE_KEY, value);
    } catch {
      // Preference just won't persist.
    }
  };

  const handleTargetChange = (value: TargetModel) => {
    setTargetModel(value);
    try {
      localStorage.setItem(TARGET_STORAGE_KEY, value);
    } catch {
      // Preference just won't persist.
    }
  };

  const closeHistory = useCallback(() => setIsHistoryOpen(false), []);

  // The line under the controls: what is attached to the draft.
  const inputSummary =
    [
      attachments.images.length > 0 ? `${attachments.images.length} image(s) attached` : '',
      referencedSessions.length > 0 ? `${referencedSessions.length} earlier session(s) referenced` : '',
      // References are what a refinement builds on; there still has to be something new to refine.
      referencedSessions.length > 0 && !hasInput ? 'add your new input above' : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'Paste or drop images directly';

  const handleDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setIsDragging(false);
    if (!isGenerating) void attachments.addFiles(event.dataTransfer.files);
  };

  return (
    <div className="relative min-h-dvh bg-dark-bg font-sans text-slate-200 selection:bg-brand-500/30 selection:text-brand-100">
      <Header
        modelLabel={appConfig.modelLabel}
        historyCount={history.length}
        onReset={handleStartOver}
        onOpenHistory={() => setIsHistoryOpen(true)}
        apiKey={DIRECT_MODE ? { hasKey: apiKey.hasKey, onOpen: () => setIsKeyDialogOpen(true) } : undefined}
      />

      {DIRECT_MODE && (
        <ApiKeyDialog
          isOpen={isKeyDialogOpen}
          hasKey={apiKey.hasKey}
          remembered={apiKey.remembered}
          onSave={handleSaveKey}
          onRemove={() => {
            apiKey.clear();
            closeKeyDialog();
          }}
          onClose={closeKeyDialog}
        />
      )}

      <ReferencePicker
        isOpen={isPickerOpen}
        history={history}
        selectedIds={referencedSessions.map((session) => session.id)}
        onToggle={toggleReference}
        onClear={() => setReferenceIds([])}
        onClose={closePicker}
      />

      <HistorySidebar
        isOpen={isHistoryOpen}
        history={history}
        onClose={closeHistory}
        onSelect={handleSelectHistory}
        onDelete={remove}
        onClearAll={clear}
        onImport={importItems}
        problem={historyProblem}
      />

      {/* From lg up the two panels fill the viewport. Between lg and xl the
          build stamp sits in a footer line, so the panels give up its height. */}
      <main
        className={`mx-auto max-w-7xl p-4 md:p-6 lg:p-8 ${
          hasBuildStamp ? 'lg:h-[calc(100dvh-7.25rem)] xl:h-[calc(100dvh-5rem)]' : 'lg:h-[calc(100dvh-5rem)]'
        }`}
      >
        <div className="grid grid-cols-1 gap-6 lg:h-full lg:grid-cols-2">
          {/* Input */}
          <section
            aria-label="Raw input"
            onDragOver={(event) => {
              if (!hasFiles(event)) return;
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
            }}
            onDrop={handleDrop}
            className="relative flex min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-dark-border bg-dark-surface p-6 shadow-xl transition-colors focus-within:border-slate-500 lg:min-h-0"
          >
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-xs text-white">
                1
              </span>
              Raw Input
            </h2>

            <div className="flex min-h-0 flex-1 flex-col">
              <textarea
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                onKeyDown={handleKeyDown}
                readOnly={isGenerating}
                autoFocus
                aria-label="Draft prompt"
                placeholder="Describe what you want the AI to do... (e.g., 'Write a blog post about coffee', 'Analyze this dashboard screenshot')"
                className="min-h-[4.5rem] w-full flex-1 resize-none bg-transparent p-0 text-base leading-relaxed text-slate-300 placeholder-slate-600 outline-none"
              />

              <ImageUploader
                images={attachments.images}
                error={attachments.error}
                disabled={isGenerating}
                onAddFiles={attachments.addFiles}
                onRemove={attachments.remove}
                attachments={
                  <ReferenceChips sessions={referencedSessions} disabled={isGenerating} onRemove={toggleReference} />
                }
                actions={
                  <button
                    type="button"
                    onClick={() => setIsPickerOpen(true)}
                    disabled={isGenerating}
                    aria-haspopup="dialog"
                    title="Build on earlier refinements from your history"
                    className={ADD_ENTRY_CLASS}
                  >
                    <MessageSquarePlus size={16} aria-hidden />
                    <span>Add Reference Session</span>
                  </button>
                }
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-dark-border pt-4">
              {/* Takes the room the button leaves, so a long effort description
                  wraps inside this column instead of pushing the button down. */}
              <div className="flex min-w-0 flex-[1_1_13rem] flex-col gap-3">
                <TargetSelect value={targetModel} disabled={isGenerating} onChange={handleTargetChange} />
                <EffortSelect value={effort} disabled={isGenerating} onChange={handleEffortChange} />
                <span className={`text-xs ${overLimit || referencesOverLimit ? 'text-red-400' : 'text-slate-500'}`}>
                  {overLimit
                    ? `Draft is too long (${inputText.length.toLocaleString()} / ${LIMITS.maxInputChars.toLocaleString()} characters)`
                    : referencesOverLimit
                      ? `Referenced sessions are too long together (${referenceChars.toLocaleString()} / ${LIMITS.maxReferenceChars.toLocaleString()} characters). Remove one.`
                      : inputSummary}
                </span>
              </div>

              {isGenerating ? (
                <button
                  type="button"
                  onClick={handleStop}
                  aria-label="Refining. Press to stop."
                  className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-700 px-6 py-3 font-semibold text-slate-200 shadow-lg transition-all hover:bg-slate-600"
                >
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Refining...
                  <span className="ml-1 flex items-center gap-1 text-xs font-normal opacity-80">
                    <Square size={10} fill="currentColor" aria-hidden />
                    Stop
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRefine}
                  disabled={!canRefine}
                  className="flex shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow-lg shadow-brand-900/20 transition-all hover:scale-[1.02] hover:bg-brand-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:hover:scale-100"
                >
                  <Wand2 className="h-5 w-5" aria-hidden />
                  Refine Prompt
                  <span className="ml-1 hidden text-xs font-normal opacity-70 xl:inline-block">
                    ({isMac ? '⌘' : 'Ctrl'} + Enter)
                  </span>
                </button>
              )}
            </div>

            {isDragging && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-brand-400 bg-dark-bg/85 text-brand-300">
                <ImagePlus size={32} aria-hidden />
                <p className="text-sm font-medium">Drop images to attach them</p>
              </div>
            )}
          </section>

          {/* Output */}
          <section
            aria-label="Refined result"
            className="relative flex min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-dark-border bg-dark-surface p-6 shadow-xl lg:min-h-0"
          >
            <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-brand-600 via-purple-500 to-brand-600 opacity-20" />
            <div className="min-h-0 flex-1">
              <RefineOutput
                status={refiner.status}
                output={refiner.output}
                thinking={refiner.thinking}
                error={refiner.error}
                truncated={refiner.truncated}
                usage={refiner.usage}
                notSaved={refiner.status === 'complete' && shownEntryId !== null && unsavedIds.has(shownEntryId)}
              />
            </div>
          </section>
        </div>
      </main>

      {/* The header has no room for the build stamp below xl, so show it here. */}
      {hasBuildStamp && (
        <footer className="flex h-9 items-start justify-center px-4 xl:hidden">
          <BuildStamp />
        </footer>
      )}
    </div>
  );
}
