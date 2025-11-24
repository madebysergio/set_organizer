/**
 * LocalStorage Adapter
 * Provides an async storage interface compatible with the DST Command Manager
 * Handles key-value persistence with error handling and validation
 */

export interface StorageResult {
  keys: string[];
}

export interface StorageData {
  value: string | null;
}

class StorageAdapter {
  private static instance: StorageAdapter;
  private prefix: string = 'dst_app_';
  
  private constructor() {
    this.validateStorageAvailability();
  }

  static getInstance(): StorageAdapter {
    if (!StorageAdapter.instance) {
      StorageAdapter.instance = new StorageAdapter();
    }
    return StorageAdapter.instance;
  }

  /**
   * Validates that localStorage is available and working
   */
  private validateStorageAvailability(): void {
    try {
      const testKey = this.prefix + 'test_' + Date.now();
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
    } catch (error) {
      console.warn('localStorage is not available:', error);
    }
  }

  /**
   * Lists all keys matching a prefix
   */
  async list(prefix: string): Promise<StorageResult> {
    try {
      const keys: string[] = [];
      const fullPrefix = this.prefix + prefix;
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(fullPrefix)) {
          // Return key without the full prefix, just the custom prefix
          keys.push(key.substring(this.prefix.length));
        }
      }
      
      return { keys };
    } catch (error) {
      console.error('Error listing keys:', error);
      return { keys: [] };
    }
  }

  /**
   * Gets a value by key
   */
  async get(key: string): Promise<StorageData> {
    try {
      const fullKey = this.prefix + key;
      const value = localStorage.getItem(fullKey);
      return { value };
    } catch (error) {
      console.error(`Error getting key ${key}:`, error);
      return { value: null };
    }
  }

  /**
   * Sets a key-value pair
   */
  async set(key: string, value: string): Promise<boolean> {
    try {
      if (!value || typeof value !== 'string') {
        throw new Error('Value must be a non-empty string');
      }

      // Check size before storing (localStorage has ~5-10MB limit)
      const estimatedSize = new Blob([value]).size;
      if (estimatedSize > 4800000) { // ~4.8MB
        console.error('Value too large to store:', estimatedSize);
        return false;
      }

      const fullKey = this.prefix + key;
      localStorage.setItem(fullKey, value);
      return true;
    } catch (error) {
      console.error(`Error setting key ${key}:`, error);
      return false;
    }
  }

  /**
   * Deletes a key
   */
  async delete(key: string): Promise<boolean> {
    try {
      const fullKey = this.prefix + key;
      localStorage.removeItem(fullKey);
      return true;
    } catch (error) {
      console.error(`Error deleting key ${key}:`, error);
      return false;
    }
  }

  /**
   * Clears all data for this app
   */
  async clear(): Promise<boolean> {
    try {
      const keysToDelete: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keysToDelete.push(key);
        }
      }
      
      keysToDelete.forEach(key => localStorage.removeItem(key));
      return true;
    } catch (error) {
      console.error('Error clearing storage:', error);
      return false;
    }
  }

  /**
   * Gets storage usage info
   */
  getStorageInfo(): { used: number; available: number; percentage: number } {
    let used = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key || '');
      if (key && key.startsWith(this.prefix) && value) {
        used += new Blob([key, value]).size;
      }
    }
    
    // Estimated localStorage limit (5-10MB, we use 5MB for safety)
    const available = 5 * 1024 * 1024;
    const percentage = Math.round((used / available) * 100);
    
    return { used, available, percentage };
  }
}

// Export singleton instance
export const storageAdapter = StorageAdapter.getInstance();

// Make it available globally for the component
if (typeof window !== 'undefined') {
  (window as any).storage = storageAdapter;
}
