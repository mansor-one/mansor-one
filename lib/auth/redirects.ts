export function getSafeRedirectPath(path: string | null | undefined) {
  if (!path || !path.startsWith('/') || path.startsWith('//')) {
    return '/'
  }

  return path
}
