import { referenceLength } from './references';
import {
  LIMITS,
  TARGET_MODELS,
  type RefineImage,
  type RefineReference,
  type RefineRequest,
  isEffortLevel,
  isImageMediaType,
  isTargetModel,
} from './protocol';

export type ValidationResult =
  | { ok: true; value: RefineRequest }
  | { ok: false; message: string };

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function fail(message: string): ValidationResult {
  return { ok: false, message };
}

/** Size in bytes of the data a base64 string decodes to. */
function decodedSize(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Checks an untrusted request body and returns a clean RefineRequest. Anything
 * the Claude API would reject is caught here, so the user gets a specific
 * message instead of an upstream 400.
 */
export function validateRefineRequest(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null) {
    return fail('Request body must be a JSON object.');
  }
  const { inputText = '', images = [], references = [], effort, targetModel } = body as Record<string, unknown>;

  if (typeof inputText !== 'string') {
    return fail('"inputText" must be a string.');
  }
  if (inputText.length > LIMITS.maxInputChars) {
    return fail(`The draft is too long (limit: ${LIMITS.maxInputChars.toLocaleString('en-US')} characters).`);
  }
  if (!Array.isArray(images)) {
    return fail('"images" must be an array.');
  }
  if (images.length > LIMITS.maxImages) {
    return fail(`Too many images (limit: ${LIMITS.maxImages}).`);
  }
  if (!Array.isArray(references)) {
    return fail('"references" must be an array.');
  }
  if (references.length > LIMITS.maxReferences) {
    return fail(`Too many earlier sessions referenced (limit: ${LIMITS.maxReferences}).`);
  }
  if (effort !== undefined && !isEffortLevel(effort)) {
    return fail('"effort" must be one of: low, medium, high.');
  }
  if (targetModel !== undefined && !isTargetModel(targetModel)) {
    return fail(`"targetModel" must be one of: ${TARGET_MODELS.join(', ')}.`);
  }

  const cleanImages: RefineImage[] = [];
  let totalBytes = 0;
  for (const [index, image] of images.entries()) {
    const label = `Image ${index + 1}`;
    if (typeof image !== 'object' || image === null) {
      return fail(`${label} is malformed.`);
    }
    const { mediaType, data } = image as Record<string, unknown>;
    if (!isImageMediaType(mediaType)) {
      return fail(`${label} has an unsupported format. Use JPEG, PNG, GIF, or WebP.`);
    }
    if (typeof data !== 'string' || data.length === 0 || !BASE64.test(data)) {
      return fail(`${label} is not valid base64 data.`);
    }
    const bytes = decodedSize(data);
    if (bytes > LIMITS.maxImageBytes) {
      return fail(`${label} is larger than 5 MB.`);
    }
    totalBytes += bytes;
    cleanImages.push({ mediaType, data });
  }
  if (totalBytes > LIMITS.maxTotalImageBytes) {
    return fail('The attached images are too large in total (limit: 20 MB).');
  }

  const cleanReferences: RefineReference[] = [];
  let referenceChars = 0;
  for (const [index, reference] of references.entries()) {
    const label = `Earlier session ${index + 1}`;
    if (typeof reference !== 'object' || reference === null) {
      return fail(`${label} is malformed.`);
    }
    const { originalPrompt = '', analysis = '', refinedPrompt } = reference as Record<string, unknown>;
    if (typeof originalPrompt !== 'string' || typeof analysis !== 'string' || typeof refinedPrompt !== 'string') {
      return fail(`${label} is malformed.`);
    }
    if (refinedPrompt.trim().length === 0) {
      return fail(`${label} has no refined prompt to build on.`);
    }
    const clean = { originalPrompt, analysis, refinedPrompt };
    referenceChars += referenceLength(clean);
    cleanReferences.push(clean);
  }
  if (referenceChars > LIMITS.maxReferenceChars) {
    return fail(
      `The referenced sessions are too long in total (limit: ${LIMITS.maxReferenceChars.toLocaleString('en-US')} characters). Remove one and try again.`,
    );
  }

  // Earlier sessions are what a refinement builds on, not something to refine
  // by themselves: there still has to be new input.
  if (inputText.trim().length === 0 && cleanImages.length === 0) {
    return fail('Provide a draft prompt or at least one image.');
  }

  return {
    ok: true,
    value: { inputText, images: cleanImages, references: cleanReferences, effort, targetModel },
  };
}
