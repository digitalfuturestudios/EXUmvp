import { Circle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Question } from '../../../core/types/database.types';

interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  selectedAnswer: string | undefined;
  onAnswer: (questionId: string, answer: string) => void;
}

export function QuestionCard({
  question, questionNumber, totalQuestions, selectedAnswer, onAnswer,
}: QuestionCardProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as 'es' | 'en';
  const questionText = question.content[lang] || question.content.en;

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-bold text-indigo-300">
          {questionNumber}
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-widest text-white/40">
            {t('exam.question_of', { current: questionNumber, total: totalQuestions })}
          </p>
          <h3 className="mt-1 text-lg font-semibold leading-snug text-white">
            {questionText}
          </h3>
        </div>
      </div>

      <div className="ml-14">
        {question.type === 'multiple_choice' && question.options && (
          <MultipleChoiceOptions
            question={question}
            lang={lang}
            selectedAnswer={selectedAnswer}
            onAnswer={onAnswer}
          />
        )}
        {question.type === 'true_false' && (
          <TrueFalseOptions
            question={question}
            selectedAnswer={selectedAnswer}
            onAnswer={onAnswer}
          />
        )}
        {question.type === 'short_answer' && (
          <ShortAnswerInput
            question={question}
            selectedAnswer={selectedAnswer}
            onAnswer={onAnswer}
          />
        )}
      </div>
    </div>
  );
}

interface OptionProps {
  question: Question;
  lang: 'es' | 'en';
  selectedAnswer: string | undefined;
  onAnswer: (id: string, answer: string) => void;
}

function MultipleChoiceOptions({ question, lang, selectedAnswer, onAnswer }: OptionProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {question.options?.map((option) => {
        const isSelected = selectedAnswer === option.id;
        const label = option.label[lang] || option.label.en;
        return (
          <button
            key={option.id}
            onClick={() => onAnswer(question.id, option.id)}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-all active:scale-95 ${
              isSelected
                ? 'border-indigo-500 bg-indigo-500/20 text-white'
                : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:bg-white/10 hover:text-white'
            }`}
          >
            {isSelected
              ? <CheckCircle2 className="size-5 shrink-0 text-indigo-400" />
              : <Circle className="size-5 shrink-0 opacity-40" />
            }
            <span className="leading-snug">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TrueFalseOptions({
  question, selectedAnswer, onAnswer,
}: Omit<OptionProps, 'lang'>): JSX.Element {
  const { t } = useTranslation();
  const options = [
    { id: 'true', label: t('exam.true') },
    { id: 'false', label: t('exam.false') },
  ];

  return (
    <div className="flex gap-4">
      {options.map((option) => {
        const isSelected = selectedAnswer === option.id;
        return (
          <button
            key={option.id}
            onClick={() => onAnswer(question.id, option.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-6 py-4 text-sm font-semibold transition-all active:scale-95 ${
              isSelected
                ? 'border-indigo-500 bg-indigo-500/20 text-white'
                : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:text-white'
            }`}
          >
            {isSelected
              ? <CheckCircle2 className="size-5 text-indigo-400" />
              : <Circle className="size-5 opacity-40" />
            }
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ShortAnswerInput({
  question, selectedAnswer, onAnswer,
}: Omit<OptionProps, 'lang'>): JSX.Element {
  const { t } = useTranslation();
  return (
    <textarea
      value={selectedAnswer ?? ''}
      onChange={(e) => onAnswer(question.id, e.target.value)}
      placeholder={t('exam.answer_placeholder')}
      rows={4}
      className="w-full resize-none rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
    />
  );
}