export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

export function getWordCount(html: string): number {
  const text = stripHtml(html)
  return text.split(/\s+/).filter(Boolean).length
}

export function getReadingTime(wordCount: number): number {
  return Math.ceil(wordCount / 200)
}
