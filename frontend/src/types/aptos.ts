export type FQName = `${string}::${string}::${string}`;

/** Build a fully-qualified name and satisfy the template literal type */
export function toFQName(
  addr: `0x${string}`,
  moduleName: string,
  fnOrFQ: string
): FQName {
  return (fnOrFQ.includes("::")
    ? fnOrFQ
    : `${addr}::${moduleName}::${fnOrFQ}`) as FQName;
}