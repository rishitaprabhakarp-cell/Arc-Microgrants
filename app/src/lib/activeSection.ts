/**
 * Pure function: given viewport-relative section tops, a threshold, and an
 * atBottom flag, returns the id of the active section.
 *
 * Rule: the last section whose top is ≤ threshold. At the very bottom of the
 * page, the last section wins unconditionally.
 */
export interface SectionTop {
  id: string
  top: number // viewport-relative px (from getBoundingClientRect().top)
}

export function computeActiveSection(
  sections: SectionTop[],
  threshold: number,
  atBottom: boolean,
): string {
  if (sections.length === 0) return ''

  // At the very bottom → last section always wins
  if (atBottom) return sections[sections.length - 1].id

  let active = sections[0].id
  for (const section of sections) {
    if (section.top <= threshold) {
      active = section.id
    }
  }
  return active
}
