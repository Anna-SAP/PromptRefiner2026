import { ImagePlus, X } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import type { AttachedImage } from '../types';

interface ImageUploaderProps {
  images: AttachedImage[];
  error: string | null;
  disabled: boolean;
  onAddFiles: (files: Iterable<File> | null) => void;
  onRemove: (id: string) => void;
  /** Other reference material attached to the draft, listed under the thumbnails. */
  attachments?: ReactNode;
  /** Other "add" entries, shown beside the image one. */
  actions?: ReactNode;
}

/** The look of an "add reference material" entry under the draft. */
export const ADD_ENTRY_CLASS =
  'flex items-center gap-2 text-sm text-brand-400 transition-colors hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-50';

export default function ImageUploader({
  images,
  error,
  disabled,
  onAddFiles,
  onRemove,
  attachments,
  actions,
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mt-4 flex min-h-0 flex-col">
      {/* What is attached scrolls when there is more of it than room, so the
          draft above keeps a few lines and the entries below stay in view. */}
      <div className="min-h-0 overflow-y-auto">
        {images.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-3">
            {images.map((image, index) => (
              <li
                key={image.id}
                className="group relative h-20 w-20 overflow-hidden rounded-lg border border-dark-border"
              >
                <img src={image.dataUrl} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onRemove(image.id)}
                  disabled={disabled}
                  aria-label={`Remove reference image ${index + 1}`}
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white transition-opacity hover:bg-red-500 disabled:hidden pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
                >
                  <X size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {attachments}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          onAddFiles(event.target.files);
          // Reset so choosing the same file again still fires a change event.
          event.target.value = '';
        }}
      />
      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className={ADD_ENTRY_CLASS}
        >
          <ImagePlus size={16} aria-hidden />
          <span>Add Reference Image (paste or drop)</span>
        </button>
        {actions}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
