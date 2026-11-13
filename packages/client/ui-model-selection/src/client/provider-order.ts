/** Shared provider display order and headings for the composer and command model pickers. */

/**
 * Put the account and official providers first, preserving every other relative order.
 * @param groups - Provider groups in catalog order.
 * @returns a sorted copy; model order within each group is unchanged.
 */
export function orderModelProviders<T extends { readonly id: string }>(groups: readonly T[]): T[] {
  return groups.toSorted((left, right) =>
    (left.id === 'deepseek-account' ? 0 : left.id === 'deepseek-official' ? 1 : 2)
      - (right.id === 'deepseek-account' ? 0 : right.id === 'deepseek-official' ? 1 : 2))
}

/** Provider groups shown under one heading. */
export interface ProviderSection<T> {
  /** Stable key: the first group's id. */
  readonly key: string
  /** Heading text shared by every group in the section. */
  readonly name: string
  readonly groups: readonly T[]
}

/**
 * Put consecutive provider groups that show the same name under one heading, as when one product serves its models
 * through several routes. Group and model order stay unchanged, and each model keeps its own provider.
 * @param groups - provider groups in display order.
 * @param nameOf - heading text of a group.
 * @returns sections in display order.
 */
export function providerSections<T extends { readonly id: string }>(
  groups: readonly T[],
  nameOf: (group: T) => string,
): ProviderSection<T>[] {
  const sections: { key: string; name: string; groups: T[] }[] = []
  for (const group of groups) {
    const name = nameOf(group)
    const last = sections.at(-1)
    if (last !== undefined && last.name === name) last.groups.push(group)
    else sections.push({ key: group.id, name, groups: [group] })
  }
  return sections
}
