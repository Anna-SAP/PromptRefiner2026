import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { RefineRequest, Usage } from '../../shared/protocol';
import { streamRefine } from '../lib/refineClient';
import { RefineError } from '../lib/refineError';
import type { RefineStatus } from '../types';

interface RefineState {
  status: RefineStatus;
  /** The model's raw answer so far. */
  output: string;
  /** Claude's summarized reasoning so far. */
  thinking: string;
  error: string | null;
  /** The answer ran into the output-token ceiling. */
  truncated: boolean;
  /** Token counts of the finished request; null until it finishes, and for results from history. */
  usage: Usage | null;
}

type Action =
  | { type: 'start' }
  | { type: 'append'; text: string; thinking: string }
  | { type: 'finish'; truncated: boolean; usage: Usage | null }
  | { type: 'stop' }
  | { type: 'fail'; message: string; discardOutput: boolean }
  | { type: 'show'; output: string }
  | { type: 'reset' };

const initialState: RefineState = {
  status: 'idle',
  output: '',
  thinking: '',
  error: null,
  truncated: false,
  usage: null,
};

function reducer(state: RefineState, action: Action): RefineState {
  switch (action.type) {
    case 'start':
      return { ...initialState, status: 'generating' };
    case 'append':
      return {
        ...state,
        output: state.output + action.text,
        thinking: state.thinking + action.thinking,
      };
    case 'finish':
      return { ...state, status: 'complete', truncated: action.truncated, usage: action.usage };
    case 'stop':
      return { ...state, status: state.output ? 'stopped' : 'idle' };
    case 'fail':
      return {
        ...state,
        status: 'error',
        error: action.message,
        output: action.discardOutput ? '' : state.output,
      };
    case 'show':
      return { ...initialState, status: 'complete', output: action.output };
    case 'reset':
      return initialState;
  }
}

export interface RefineResult {
  output: string;
  model: string;
}

export function useRefine(onComplete: (result: RefineResult) => void) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const controllerRef = useRef<AbortController | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  // Abort any in-flight request when the component goes away.
  useEffect(() => stop, [stop]);

  const refine = useCallback(async (request: RefineRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    dispatch({ type: 'start' });

    // Tokens arrive far faster than the screen refreshes. Collect them and
    // commit once per animation frame, so React renders at most 60 times a
    // second however quickly the stream runs.
    let pendingText = '';
    let pendingThinking = '';
    let fullOutput = '';
    let frame = 0;
    const flush = () => {
      frame = 0;
      if (!pendingText && !pendingThinking) return;
      dispatch({ type: 'append', text: pendingText, thinking: pendingThinking });
      pendingText = '';
      pendingThinking = '';
    };
    const settle = () => {
      cancelAnimationFrame(frame);
      flush();
    };

    try {
      let model = '';
      let truncated = false;
      let usage: Usage | null = null;
      await streamRefine(
        request,
        (event) => {
          if (event.type === 'text') {
            pendingText += event.text;
            fullOutput += event.text;
          } else if (event.type === 'thinking') {
            pendingThinking += event.text;
          } else if (event.type === 'done') {
            model = event.model;
            truncated = event.truncated;
            usage = event.usage;
          }
          frame ||= requestAnimationFrame(flush);
        },
        controller.signal,
      );
      settle();
      dispatch({ type: 'finish', truncated, usage });
      if (fullOutput.trim()) onCompleteRef.current({ output: fullOutput, model });
    } catch (error) {
      settle();
      // A newer request has taken over; it owns the state now.
      if (controllerRef.current !== controller) return;
      if (controller.signal.aborted) {
        dispatch({ type: 'stop' });
        return;
      }
      console.error(error);
      dispatch({
        type: 'fail',
        message: error instanceof RefineError ? error.message : 'Something went wrong. Please try again.',
        // Text that arrived before a refusal is incomplete by definition.
        discardOutput: error instanceof RefineError && error.code === 'refusal',
      });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  /** Displays a previously saved result. */
  const show = useCallback(
    (output: string) => {
      stop();
      dispatch({ type: 'show', output });
    },
    [stop],
  );

  const reset = useCallback(() => {
    stop();
    dispatch({ type: 'reset' });
  }, [stop]);

  return { ...state, refine, stop, show, reset };
}
