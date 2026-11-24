/**
 * Per-field validation a11y helpers (pure, no React).
 *
 * Pattern: the visible error text keeps its own id (form-level errors stay in role="alert");
 * every input the error is about gets aria-invalid="true" + aria-describedby pointing at that id.
 * Validation logic itself lives in each form — these helpers only map an error code to the fields it concerns.
 */

export type FieldA11yProps = { 'aria-invalid'?: true; 'aria-describedby'?: string };

/** Props for one input. Empty object when the field is valid, so nothing stale leaks into the DOM. */
export function fieldErrorProps(invalid: boolean, errorId: string, extraDescribedBy?: string): FieldA11yProps {
  if (!invalid) return extraDescribedBy ? { 'aria-describedby': extraDescribedBy } : {};
  return { 'aria-invalid': true, 'aria-describedby': extraDescribedBy ? `${errorId} ${extraDescribedBy}` : errorId };
}

/** Paper order ticket fields. */
export type PaperOrderField = 'qty' | 'sl' | 'tp' | 'margin';

/** Map a paperMath OrderCheck failure reason to the ticket field(s) at fault. */
export function paperOrderReasonFields(reason: string): PaperOrderField[] {
  switch (reason) {
    case 'BAD_QTY':
      return ['qty'];
    case 'BAD_STOP':
      return ['sl'];
    case 'BAD_TP':
      return ['tp'];
    default:
      return [];
  }
}

/** Which of the optional numeric ticket fields failed to parse ('bad' sentinel from numOrNull). */
export function paperBadNumberFields(sl: unknown, tp: unknown, margin: unknown): PaperOrderField[] {
  const out: PaperOrderField[] = [];
  if (sl === 'bad') out.push('sl');
  if (tp === 'bad') out.push('tp');
  if (margin === 'bad') out.push('margin');
  return out;
}

/** Bar-replay practice order fields. */
export type ReplayOrderField = 'stop' | 'target' | 'contracts';

/** Map a replayEngine placeOrder error code to the field(s) at fault. */
export function replayErrorFields(code: string): ReplayOrderField[] {
  switch (code) {
    case 'STOP_TARGET_REQUIRED':
    case 'BAD_LEVELS':
      return ['stop', 'target'];
    case 'BAD_CONTRACTS':
      return ['contracts'];
    default:
      return [];
  }
}

/** Paper session create form: the session-name validator code means the name field, capital range the capital field. */
export type PaperSessionField = 'name' | 'capital';

/** Research-note validateDraft code -> input ids in ResearchNotebookView. */
export function noteErrorFieldIds(code: string): string[] {
  if (code.startsWith('instrument')) return ['nb-inst'];
  if (code.startsWith('title')) return ['nb-title'];
  if (code === 'bodyTooLong') return ['nb-body'];
  if (code === 'tooManyTags' || code === 'tagTooLong') return ['nb-tags'];
  if (code === 'badTimeframe') return ['nb-tf'];
  if (code === 'contractTooLong') return ['nb-contract'];
  if (code === 'rangeTooLong' || code === 'rangeOrder') return ['nb-from', 'nb-to'];
  return [];
}
