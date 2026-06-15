import { apiRequest } from './api';
import { readOfflineEvents, removeOfflineEvent } from './offline-queue';

export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  const events = await readOfflineEvents();

  let synced = 0;
  let failed = 0;

  for (const row of events) {
    try {
      if (row.event.type === 'WORD_REVIEW') {
        await apiRequest(`/user-words/${row.event.payload.progressId}/review`, {
          method: 'POST',
          body: JSON.stringify({
            known: row.event.payload.known,
            clientEventId: row.event.clientEventId
          })
        });
      }

      if (row.event.type === 'GRAMMAR_ATTEMPT') {
        await apiRequest(`/grammar/lessons/${row.event.payload.lessonId}/attempts`, {
          method: 'POST',
          body: JSON.stringify({
            answers: row.event.payload.answers,
            clientEventId: row.event.clientEventId
          })
        });
      }

      if (row.event.type === 'DICTATION_ATTEMPT') {
        await apiRequest('/dictation/attempts', {
          method: 'POST',
          body: JSON.stringify({
            wordResults: row.event.payload.wordResults,
            clientEventId: row.event.clientEventId
          })
        });
      }

      if (row.event.type === 'SPEAKING_ATTEMPT') {
        await apiRequest('/speaking/attempts', {
          method: 'POST',
          body: JSON.stringify({
            wordEntryId: row.event.payload.wordEntryId,
            targetText: row.event.payload.targetText,
            recognizedText: row.event.payload.recognizedText,
            similarityScore: row.event.payload.similarityScore,
            wordResults: row.event.payload.wordResults,
            totalWords: row.event.payload.totalWords,
            correctCount: row.event.payload.correctCount,
            practiceMode: row.event.payload.practiceMode,
            clientEventId: row.event.clientEventId
          })
        });
      }

      if (row.event.type === 'CLOZE_ATTEMPT') {
        await apiRequest('/cloze/attempts', {
          method: 'POST',
          body: JSON.stringify({
            wordEntryId: row.event.payload.wordEntryId,
            targetWord: row.event.payload.targetWord,
            sentence: row.event.payload.sentence,
            userAnswer: row.event.payload.userAnswer,
            correct: row.event.payload.correct,
            usedHint: row.event.payload.usedHint,
            skipped: row.event.payload.skipped,
            totalQuestions: row.event.payload.totalQuestions,
            correctCount: row.event.payload.correctCount,
            accuracy: row.event.payload.accuracy,
            clientEventId: row.event.clientEventId
          })
        });
      }

      await removeOfflineEvent(row.id);
      synced += 1;
    } catch (_error) {
      failed += 1;
    }
  }

  return { synced, failed };
}
