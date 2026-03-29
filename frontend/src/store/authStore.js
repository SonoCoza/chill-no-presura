import { create } from 'zustand';

function readStored() {
  if (typeof localStorage === 'undefined') {
    return { token: null, currentUser: null };
  }
  const token = localStorage.getItem('accessToken');
  let currentUser = null;
  try {
    const raw = localStorage.getItem('user');
    if (raw) currentUser = JSON.parse(raw);
  } catch {
    currentUser = null;
  }
  return { token, currentUser };
}

export const useAuthStore = create((set) => ({
  ...readStored(),
  sync: () => set((prev) => ({ ...prev, ...readStored() })),
}));
