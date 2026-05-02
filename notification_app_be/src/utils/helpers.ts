// small helper functions used across the app

export function isValidUUID(id: string): boolean {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(id);
}

export function formatDate(date: Date): string {
  return date.toISOString();
}
