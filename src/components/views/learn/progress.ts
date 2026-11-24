import { useContext } from 'react';
import {
  AcademyContext,
  type AcademyContextValue,
  type LearnProgress,
  type LessonProgress,
} from '../../../contexts/AcademyContext';

export type { AcademyContextValue, LearnProgress, LessonProgress };

/** Consumes global Academy progress, checklist, and lesson-notes state from AcademyProvider. */
export function useAcademyProgress(): AcademyContextValue {
  const ctx = useContext(AcademyContext);
  if (!ctx) {
    throw new Error('useAcademyProgress must be used inside AcademyProvider');
  }
  return ctx;
}
