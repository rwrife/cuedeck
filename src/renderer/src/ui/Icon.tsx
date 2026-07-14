import type { CSSProperties } from 'react'
import { getIcon, type IconName } from '@shared/icons'

export interface IconProps {
  /** Semantic icon name from the shared registry. */
  name: IconName
  /** Pixel size (width = height). Defaults to 16. */
  size?: number
  /** Stroke width on the 24×24 grid. Defaults to 2. */
  strokeWidth?: number
  /**
   * Accessible label. When the icon conveys meaning on its own (no adjacent
   * text) pass a label; it renders as `role="img"` + `aria-label`. When the
   * icon is purely decorative beside a text label, omit it (or pass `null`) and
   * it is hidden from assistive tech via `aria-hidden`.
   */
  label?: string | null
  className?: string
  style?: CSSProperties
}

/**
 * Single-color SVG icon (#32). Glyphs inherit `currentColor`, so an icon takes
 * the text color of whatever it sits in and re-themes for free. This replaces
 * the previous emoji affordances, which couldn't inherit color and were
 * announced inconsistently by screen readers.
 */
export function Icon({
  name,
  size = 16,
  strokeWidth = 2,
  label,
  className,
  style
}: IconProps): JSX.Element | null {
  const def = getIcon(name)
  if (!def) return null

  const decorative = label === undefined || label === null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : label}
      dangerouslySetInnerHTML={{ __html: def.body }}
    />
  )
}
