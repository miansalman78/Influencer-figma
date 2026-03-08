/**
 * Jest Setup File
 * 
 * Global test setup and mocks
 */

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = {};
  return {
    setItem: jest.fn((key, value) => {
      return new Promise((resolve) => {
        storage[key] = value;
        resolve();
      });
    }),
    getItem: jest.fn((key) => {
      return new Promise((resolve) => {
        resolve(storage[key] || null);
      });
    }),
    removeItem: jest.fn((key) => {
      return new Promise((resolve) => {
        delete storage[key];
        resolve();
      });
    }),
    multiRemove: jest.fn((keys) => {
      return new Promise((resolve) => {
        keys.forEach(key => delete storage[key]);
        resolve();
      });
    }),
    clear: jest.fn(() => {
      return new Promise((resolve) => {
        Object.keys(storage).forEach(key => delete storage[key]);
        resolve();
      });
    }),
    getAllKeys: jest.fn(() => {
      return new Promise((resolve) => {
        resolve(Object.keys(storage));
      });
    }),
  };
});

// Mock react-native-vector-icons
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcons');

// Suppress console warnings in tests (optional)
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock __DEV__ variable
global.__DEV__ = true;

