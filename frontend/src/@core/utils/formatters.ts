export function formatDuration(seconds: number): string {
  if (Number.isNaN(seconds)) return '00:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function formatDateTime(epoch: number): string {
  return new Date(epoch).toLocaleString('en-US');
}
