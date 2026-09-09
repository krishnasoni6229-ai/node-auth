export const Role = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  MODERATOR: 'MODERATOR',
} as const;

export type Role = (typeof Role)[keyof typeof Role];
