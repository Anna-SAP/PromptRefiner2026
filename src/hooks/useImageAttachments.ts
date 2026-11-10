import { useCallback, useEffect, useRef, useState } from 'react';
import { LIMITS } from '../../shared/protocol';
import { prepareImage } from '../lib/images';
import type { AttachedImage } from '../types';

function imageFiles(files: Iterable<File> | null | undefined): File[] {
  return [...(files ?? [])].filter((file) => file.type.startsWith('image/'));
}

export function useImageAttachments() {
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const countRef = useRef(0);
  countRef.current = images.length;

  const addFiles = useCallback(async (files: Iterable<File> | null | undefined) => {
    const candidates = imageFiles(files);
    if (candidates.length === 0) return;
    setError(null);

    const results = await Promise.allSettled(candidates.map(prepareImage));
    const prepared = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    const failure = results.find((result) => result.status === 'rejected');
    const room = Math.max(0, LIMITS.maxImages - countRef.current);

    setImages((previous) => [...previous, ...prepared].slice(0, LIMITS.maxImages));

    if (failure) {
      setError(failure.reason instanceof Error ? failure.reason.message : 'An image could not be added.');
    } else if (prepared.length > room) {
      setError(`Up to ${LIMITS.maxImages} images can be attached.`);
    }
  }, []);

  const remove = useCallback((id: string) => {
    setImages((previous) => previous.filter((image) => image.id !== id));
    setError(null);
  }, []);

  const clear = useCallback(() => {
    setImages([]);
    setError(null);
  }, []);

  // Paste an image anywhere on the page to attach it.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const clipboard = event.clipboardData;
      // Office apps put a picture of the selection on the clipboard next to
      // the text. When there is text, the user is pasting text — leave it be.
      if (!clipboard || clipboard.getData('text/plain')) return;
      const files = imageFiles(clipboard.files);
      if (files.length === 0) return;
      event.preventDefault();
      void addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  return { images, error, addFiles, remove, clear };
}
