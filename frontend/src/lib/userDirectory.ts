// Display metadata (full name + avatar) for the analyst accounts, keyed by
// login username. Falls back to the raw username when an account isn't listed.
// Login/auth is still by username; this is presentation only.

export interface UserMeta {
  name: string;
  avatar?: string;
}

const DIRECTORY: Record<string, UserMeta> = {
  CCX:  { name: "Chun Xian", avatar: "/images/user/CCX.jpg" },
  Hong: { name: "Mun Hong",  avatar: "/images/user/Hong.jpg" },
  Sam:  { name: "Sam",       avatar: "/images/user/Sam.jpg" },
  Siew: { name: "Yat Fei",   avatar: "/images/user/Siew.jpg" },
};

export function userMeta(username: string): UserMeta {
  if (DIRECTORY[username]) return DIRECTORY[username];
  const key = Object.keys(DIRECTORY).find((k) => k.toLowerCase() === username.toLowerCase());
  return key ? DIRECTORY[key] : { name: username };
}

// Initials for the fallback avatar, e.g. "Chun Xian" → "CX", "Sam" → "SA".
export function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
