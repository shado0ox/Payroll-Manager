export const normalizeSearchText = (value: unknown): string => String(value ?? '')
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[\s\-_.\/]+/g, '');

export const matchesSearchText = (query: unknown, values: unknown[]): boolean => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return normalizeSearchText(values.join(' ')).includes(normalizedQuery);
};
