export function formatDate(dateString: string | undefined): string {
  if (!dateString) return ''
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch (error) {
    console.error('Error formatting date:', error)
    return ''
  }
}
