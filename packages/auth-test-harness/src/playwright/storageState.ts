import path from 'path';
export const storageStatePaths = {
  user: '.auth/user.json',
  admin: '.auth/admin.json',
  vendor: '.auth/vendor.json',
  operator: '.auth/operator.json',
};
export function getStorageStatePath(role: keyof typeof storageStatePaths, appRoot: string): string {
  return path.join(appRoot, storageStatePaths[role]);
}
