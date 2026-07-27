import { SttJobCard } from '../stt/SttJobCard'
import { TtsJobCard } from '../tts/TtsJobCard'
import type { HistoryJob } from './historyTypes'

const ignorePollingRetry = () => undefined

interface HistoryJobCardProps {
  job: HistoryJob
  onRefreshHistory: () => void
}

export function HistoryJobCard({
  job,
  onRefreshHistory,
}: HistoryJobCardProps) {
  return job.type === 'TTS' ? (
    <TtsJobCard
      job={job}
      onRetryPolling={ignorePollingRetry}
      onRefreshJob={onRefreshHistory}
    />
  ) : (
    <SttJobCard
      job={job}
      onRetryPolling={ignorePollingRetry}
      onRefreshJob={onRefreshHistory}
    />
  )
}
