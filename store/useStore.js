/**
 * Global State Management using Zustand
 * 
 * Lightweight state management solution
 * Install: npm install zustand
 * 
 * This provides a foundation for global state management
 * Can be extended with more stores as needed
 */

// Zustand is optional - this file provides the structure
// Install with: npm install zustand

let create;
try {
  create = require('zustand');
} catch (e) {
  // Fallback if Zustand is not installed
  create = null;
  console.warn('[Store] Zustand not installed. Install with: npm install zustand');
}

/**
 * Application Store
 * 
 * Manages global application state
 */
export const useAppStore = create
  ? create((set, get) => ({
      // State
      isInitialized: false,
      currentScreen: null,
      networkStatus: 'online',
      notifications: [],

      // Actions
      setInitialized: (value) => set({ isInitialized: value }),
      setCurrentScreen: (screen) => set({ currentScreen: screen }),
      setNetworkStatus: (status) => set({ networkStatus: status }),
      addNotification: (notification) =>
        set((state) => ({
          notifications: [...state.notifications, notification],
        })),
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
      clearNotifications: () => set({ notifications: [] }),
    }))
  : () => ({
      // Fallback if Zustand is not installed
      isInitialized: false,
      currentScreen: null,
      networkStatus: 'online',
      notifications: [],
      setInitialized: () => {},
      setCurrentScreen: () => {},
      setNetworkStatus: () => {},
      addNotification: () => {},
      removeNotification: () => {},
      clearNotifications: () => {},
    });

/**
 * UI Store
 * 
 * Manages UI-related global state (modals, toasts, loading states)
 */
export const useUIStore = create
  ? create((set) => ({
      // State
      loading: false,
      loadingMessage: '',
      activeModal: null,
      toast: null,

      // Actions
      setLoading: (loading, message = '') =>
        set({ loading, loadingMessage: message }),
      openModal: (modalName, props = {}) =>
        set({ activeModal: { name: modalName, props } }),
      closeModal: () => set({ activeModal: null }),
      showToast: (message, type = 'info', duration = 3000) =>
        set({ toast: { message, type, duration } }),
      hideToast: () => set({ toast: null }),
    }))
  : () => ({
      // Fallback if Zustand is not installed
      loading: false,
      loadingMessage: '',
      activeModal: null,
      toast: null,
      setLoading: () => {},
      openModal: () => {},
      closeModal: () => {},
      showToast: () => {},
      hideToast: () => {},
    });

/**
 * Cache Store
 * 
 * Manages client-side caching
 */
export const useCacheStore = create
  ? create((set, get) => ({
      // State
      cache: {},

      // Actions
      set: (key, value, ttl = null) => {
        const cacheItem = {
          value,
          timestamp: Date.now(),
          ttl: ttl ? Date.now() + ttl : null,
        };
        set((state) => ({
          cache: {
            ...state.cache,
            [key]: cacheItem,
          },
        }));
      },

      get: (key) => {
        const state = get();
        const item = state.cache[key];
        
        if (!item) return null;
        
        // Check if expired
        if (item.ttl && Date.now() > item.ttl) {
          get().remove(key);
          return null;
        }
        
        return item.value;
      },

      remove: (key) => {
        set((state) => {
          const newCache = { ...state.cache };
          delete newCache[key];
          return { cache: newCache };
        });
      },

      clear: () => set({ cache: {} }),
    }))
  : () => ({
      // Fallback if Zustand is not installed
      cache: {},
      set: () => {},
      get: () => null,
      remove: () => {},
      clear: () => {},
    });

// Export all stores
export default {
  useAppStore,
  useUIStore,
  useCacheStore,
};

