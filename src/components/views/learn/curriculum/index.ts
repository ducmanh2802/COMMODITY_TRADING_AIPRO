import { LEVEL1 } from './level1';
import { LEVEL2 } from './level2';
import { LEVEL3 } from './level3';
import { LEVEL4 } from './level4';
import { LEVEL5 } from './level5';
import { LEVEL6 } from './level6';
import { LEVEL7 } from './level7';
import { LEVEL8 } from './level8';
import type { Level } from './types';

export type { Level, Lesson, QuizQuestion, Source, CalculatorId, ExampleCalc } from './types';
export const CURRICULUM: Level[] = [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7, LEVEL8];
