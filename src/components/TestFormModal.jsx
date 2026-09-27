import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpenCheck,
  Plus,
  Trash2,
  Bell,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import Modal from './ui/Modal';

const normalizeOptions = (options = []) => [0, 1, 2, 3].map((index) => options[index] || '');

const createQuestion = (id, source) => ({
  id,
  questionText: source?.questionText || '',
  options: normalizeOptions(source?.options),
  correctAnswer:
    Number.isInteger(source?.correctAnswer) && source.correctAnswer >= 0 && source.correctAnswer < 4
      ? source.correctAnswer
      : 0
});

const buildInitialForm = (initial, nextQuestionIdRef, defaultYear = '1st Year', defaultDeptId = 'all') => {
  nextQuestionIdRef.current = 1;
  const sourceQuestions =
    Array.isArray(initial?.questions) && initial.questions.length > 0
      ? initial.questions
      : [null];
  const questions = sourceQuestions.map((question) => {
    const id = nextQuestionIdRef.current;
    nextQuestionIdRef.current += 1;
    return createQuestion(id, question);
  });
  return {
    title: initial?.title || '',
    year: initial?.year || defaultYear || '1st Year',
    departmentId: initial?.departmentId || defaultDeptId || 'all',
    testType: initial?.testType || 'quiz',
    passMark: initial?.passMark || 40,
    unitNumber: Number(initial?.unitNumber) || 1,
    subject: initial?.subject || 'Tamil',
    testDate: initial?.testDate || new Date().toISOString().split('T')[0],
    testTime: initial?.testTime || '10:00 AM',
    duration: initial?.duration || '30',
    description: initial?.description || '',
    targetType: initial?.targetType || 'all',
    targetSection: initial?.targetSection || 'all',
    notifyStudents: true,
    questions
  };
};

const QuestionBlock = React.memo(function QuestionBlock({
  question,
  index,
  totalQuestions,
  onQuestionTextChange,
  onOptionChange,
  onCorrectChange,
  onDeleteQuestion
}) {
  return (
    <div
      style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        position: 'relative'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              background: 'var(--color-primary)',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 700,
              width: 24,
              height: 24,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {index + 1}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
            Question {index + 1}
          </span>
        </div>

        {totalQuestions > 1 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--color-danger)', padding: '4px 8px' }}
            onClick={() => onDeleteQuestion(question.id)}
            title="Delete this question"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <input
        className="input"
        placeholder={`Enter question ${index + 1} in Tamil or English...`}
        value={question.questionText}
        onChange={(e) => onQuestionTextChange(question.id, e.target.value)}
        style={{ fontWeight: 500 }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {question.options.map((option, optionIndex) => {
          const isCorrect = question.correctAnswer === optionIndex;
          return (
            <div
              key={optionIndex}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: isCorrect ? 'rgba(34, 197, 94, 0.08)' : 'var(--color-card)',
                border: isCorrect ? '1.5px solid var(--color-success)' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                transition: 'all 0.15s ease'
              }}
            >
              <input
                type="radio"
                id={`q_${question.id}_opt_${optionIndex}`}
                name={`correct-${question.id}`}
                checked={isCorrect}
                onChange={() => onCorrectChange(question.id, optionIndex)}
                style={{ cursor: 'pointer' }}
              />
              <input
                className="input"
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: '6px 4px',
                  boxShadow: 'none',
                  fontSize: 13
                }}
                placeholder={`Option ${optionIndex + 1}`}
                value={option}
                onChange={(e) => onOptionChange(question.id, optionIndex, e.target.value)}
              />
              {isCorrect && (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', flexShrink: 0 }}>
                  Correct
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

const TestFormModal = ({
  open,
  onClose,
  onSave,
  initial,
  year,
  departments = [],
  selectedDepartmentId = 'all'
}) => {
  const nextQuestionIdRef = useRef(1);
  const [form, setForm] = useState(() => buildInitialForm(initial, nextQuestionIdRef, year, selectedDepartmentId));
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(initial, nextQuestionIdRef, year, selectedDepartmentId));
      setError('');
    }
  }, [initial, open, year, selectedDepartmentId]);

  const onFieldChange = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const addQuestion = useCallback(() => {
    const newId = nextQuestionIdRef.current;
    nextQuestionIdRef.current += 1;
    setForm((prev) => ({
      ...prev,
      questions: [...prev.questions, createQuestion(newId)]
    }));
  }, []);

  const deleteQuestion = useCallback((questionId) => {
    setForm((prev) => {
      if (prev.questions.length <= 1) return prev;
      return {
        ...prev,
        questions: prev.questions.filter((q) => q.id !== questionId)
      };
    });
  }, []);

  const onQuestionTextChange = useCallback((questionId, value) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((question) =>
        question.id === questionId ? { ...question, questionText: value } : question
      )
    }));
  }, []);

  const onOptionChange = useCallback((questionId, optionIndex, value) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((question) => {
        if (question.id !== questionId) return question;
        const nextOptions = [...question.options];
        nextOptions[optionIndex] = value;
        return { ...question, options: nextOptions };
      })
    }));
  }, []);

  const onCorrectChange = useCallback((questionId, optionIndex) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((question) =>
        question.id === questionId ? { ...question, correctAnswer: optionIndex } : question
      )
    }));
  }, []);

  const onSaveClick = useCallback(() => {
    if (!form.title.trim()) {
      setError('Please provide an assessment title.');
      return;
    }
    const hasEmptyQuestions = form.questions.some((q) => !q.questionText.trim());
    if (hasEmptyQuestions) {
      setError('Please fill in the question text for all questions.');
      return;
    }

    onSave({
      title: form.title,
      year: form.year,
      departmentId: form.departmentId,
      testType: form.testType,
      passMark: Number(form.passMark) || 40,
      unitNumber: form.unitNumber,
      subject: form.subject,
      testDate: form.testDate,
      testTime: form.testTime,
      duration: form.duration,
      description: form.description,
      targetType: form.year && form.year !== 'All Years' ? 'year' : (form.targetType || 'all'),
      targetSection: form.targetSection,
      notifyStudents: form.notifyStudents,
      questions: form.questions.map(({ id, ...question }) => question)
    });
  }, [form, onSave]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={initial?.id ? 'Update Assessment & Quiz' : 'Create Assessment & Quiz'}
      subtitle={`Configure test questions, timing, target academic year, and automated student notifications`}
      icon={BookOpenCheck}
      iconVariant="primary"
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={addQuestion}
            style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} /> Add Question
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onSaveClick}>
            {initial?.id ? 'Update Assessment' : 'Publish Assessment'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div className="alert error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Assessment Title *</label>
          <input
            className="input"
            placeholder="e.g. தமிழ் இலக்கியச் சுருக்கம் - Unit 1 Assessment"
            value={form.title}
            onChange={(e) => onFieldChange('title', e.target.value)}
          />
        </div>

        {/* Academic Year & Target Department Selection */}
        <div className="grid grid-3" style={{ gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Target Academic Year *</label>
            <select
              className="input"
              value={form.year}
              onChange={(e) => onFieldChange('year', e.target.value)}
              style={{ fontWeight: 600, color: 'var(--color-primary)' }}
            >
              <option value="All Years">All Years (அனைத்து ஆண்டுகள்)</option>
              <option value="1st Year">1st Year (முதலாம் ஆண்டு)</option>
              <option value="2nd Year">2nd Year (இரண்டாம் ஆண்டு)</option>
              <option value="3rd Year">3rd Year (மூன்றாம் ஆண்டு)</option>
              <option value="4th Year">4th Year (நான்காம் ஆண்டு)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Target Class / Department</label>
            <select
              className="input"
              value={form.departmentId}
              onChange={(e) => onFieldChange('departmentId', e.target.value)}
            >
              <option value="all">All Classes / Departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name} {dept.year ? `(${dept.year})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Assessment Type</label>
            <select
              className="input"
              value={form.testType}
              onChange={(e) => onFieldChange('testType', e.target.value)}
            >
              <option value="quiz">Quiz Test</option>
              <option value="unit_test">Unit Test</option>
              <option value="mock_test">Mock / Semester Exam</option>
            </select>
          </div>
        </div>

        <div className="grid grid-2" style={{ gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Syllabus Unit</label>
            <select
              className="input"
              value={form.unitNumber}
              onChange={(e) => onFieldChange('unitNumber', Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  Unit {n} (அலகு {n})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Subject / Topic Name</label>
            <input
              className="input"
              placeholder="e.g. Tamil Literature"
              value={form.subject}
              onChange={(e) => onFieldChange('subject', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-3" style={{ gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Test Date</label>
            <input
              type="date"
              className="input"
              value={form.testDate}
              onChange={(e) => onFieldChange('testDate', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Start Time</label>
            <input
              type="text"
              className="input"
              placeholder="10:00 AM"
              value={form.testTime}
              onChange={(e) => onFieldChange('testTime', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Duration (Minutes)</label>
            <input
              type="text"
              className="input"
              placeholder="30"
              value={form.duration}
              onChange={(e) => onFieldChange('duration', e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Instructions / Description</label>
          <textarea
            className="input"
            rows={2}
            placeholder="Brief instructions for students taking this test..."
            value={form.description}
            onChange={(e) => onFieldChange('description', e.target.value)}
          />
        </div>

        {/* Real-time Notification Banner */}
        <div
          style={{
            background: 'rgba(34, 197, 94, 0.08)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12
          }}
        >
          <input
            type="checkbox"
            id="notifyStudentsCheck"
            checked={form.notifyStudents}
            onChange={(e) => onFieldChange('notifyStudents', e.target.checked)}
            style={{ marginTop: 3, cursor: 'pointer' }}
          />
          <div>
            <label
              htmlFor="notifyStudentsCheck"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-success)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Bell size={15} /> Send Instant Push Alert (FCM) to Students
            </label>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-light)' }}>
              Enrolled students will receive a notification on the student portal informing them of this test.
            </p>
          </div>
        </div>

        {/* Questions Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)' }}>
              Questions & Answer Keys ({form.questions.length})
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={addQuestion}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> Add Question
            </button>
          </div>

          {form.questions.map((question, index) => (
            <QuestionBlock
              key={question.id}
              question={question}
              index={index}
              totalQuestions={form.questions.length}
              onQuestionTextChange={onQuestionTextChange}
              onOptionChange={onOptionChange}
              onCorrectChange={onCorrectChange}
              onDeleteQuestion={deleteQuestion}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default TestFormModal;
