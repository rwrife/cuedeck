import type { SVGProps } from 'react'

/**
 * Shared SVG icon set (#32 design-system foundation).
 *
 * One consistent, accessible icon approach replacing the raw functional emoji
 * (🔍 ⚙ ✕ 🎛 📌 ⚠ …) previously used for app actions and navigation. Icons
 * are purely decorative — `aria-hidden` + `focusable="false"` — so the
 * accessible name always comes from the control that hosts them (an
 * `aria-label` on an {@link ./IconButton}, or adjacent visible text on a
 * labeled {@link ./Button}). Never wrap one of these in a button without a
 * name; that's exactly the pattern this foundation replaces.
 *
 * Deliberately hand-rolled rather than pulling in an icon library: the set is
 * small, stays tree-shakeable, and keeps the "lightweight primitives" goal.
 */

export type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export function SearchIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </Icon>
  )
}

export function SettingsIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </Icon>
  )
}

export function SlidersIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </Icon>
  )
}

export function PinIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 17v5" />
      <path d="M8 3h8l-1 7 3 3H6l3-3-1-7z" />
    </Icon>
  )
}

export function WarningIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Icon>
  )
}

export function ChevronDownIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  )
}

export function ChevronRightIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  )
}

export function ArrowLeftIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </Icon>
  )
}

export function ArrowRightIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="M12 5l7 7-7 7" />
    </Icon>
  )
}

export function ArrowUpRightIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M7 17L17 7" />
      <path d="M7 7h10v10" />
    </Icon>
  )
}

export function PlayIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M6 4l14 8-14 8V4z" />
    </Icon>
  )
}

export function GripIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="8" cy="6" r="1" />
      <circle cx="8" cy="12" r="1" />
      <circle cx="8" cy="18" r="1" />
      <circle cx="16" cy="6" r="1" />
      <circle cx="16" cy="12" r="1" />
      <circle cx="16" cy="18" r="1" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M20 6L9 17l-5-5" />
    </Icon>
  )
}

export function TrashIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </Icon>
  )
}

export function ClapperboardIcon(props: IconProps): JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 8.5l17-3 .7 3.9-17 3z" />
      <path d="M3.7 9.4L20 6.4" />
      <rect x="3" y="9" width="18" height="12" rx="1.5" />
    </Icon>
  )
}
