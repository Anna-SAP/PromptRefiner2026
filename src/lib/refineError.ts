import type { RefineErrorCode } from '../../shared/protocol';

export class RefineError extends Error {
  readonly code: RefineErrorCode;

  constructor(code: RefineErrorCode, message: string) {
    super(message);
    this.name = 'RefineError';
    this.code = code;
  }
}
