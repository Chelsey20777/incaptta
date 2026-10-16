import { create } from 'zustand';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { initializeNotifications } from '../lib/notifications';

interface UserState {
  user: User | null;
  profile: any | null;
  loading: boolean;
  initialized: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: any | null) => void;
  setLoading: (loading: boolean) => void;
  initialize: () => void;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<UserState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  initialized: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  initialize: () => {
    if (get().initialized) return;
    
    onAuthStateChanged(auth, async (user) => {
      set({ user, loading: true, initialized: true });
      
      if (user) {
        // Fetch user profile from Firestore
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          set({ profile: docSnap.data() });
        }
        
        // Initialize notifications for authenticated user
        try {
          await initializeNotifications(user.uid);
        } catch (error) {
          console.error('Failed to initialize notifications:', error);
        }
      } else {
        set({ profile: null });
      }
      
      set({ loading: false });
    });
  },
  hasRole: (role: string) => {
    const profile = get().profile;
    if (!profile || !profile.roles) return false;
    return Array.isArray(profile.roles) 
      ? profile.roles.includes(role) 
      : profile.roles === role;
  }
}));
