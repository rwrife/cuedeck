/**
 * Minimal `classnames`-style helper (#32 design-system foundation).
 *
 * Joins truthy class-name fragments with a single space, dropping falsy
 * values so call sites can inline conditionals (`cx('a', isOpen && 'b')`)
 * without producing `"a false"` or double spaces. Deliberately dependency-free
 * — the primitives only need this one small piece of `clsx`/`classnames`.
 */
export type ClassValue = string | false | null | undefined

export function cx(...values: ClassValue[]): string {
  return values.filter((v): v is string => Boolean(v)).join(' ')
}
