export function handleError(error: unknown, defaultMessage: string): string {
  console.error(defaultMessage, error)
  return error instanceof Error ? error.message : defaultMessage
}
