export function keepDeepestResponseContainers(containers: Element[]): Element[] {
  return containers.filter(candidate => {
    return !containers.some(other => other !== candidate && candidate.contains(other))
  })
}
