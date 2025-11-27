'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Edit2, Trash2, Save, X, Tag, FolderOpen, Star } from 'lucide-react';

// Constants
const CACHE_EXPIRY_DAYS = 7;
const MAX_IMAGE_SIZE = 3 * 1024 * 1024; // 3MB
const MAX_STORAGE_SIZE = 4800000; // ~4.8MB
const COPY_TOAST_DURATION = 2000; // 2 seconds
const SAVE_SUCCESS_DURATION = 1500; // 1.5 seconds
const DEV_MODE = false; // Set to true for development logging

const log = (message: string, data?: any) => {
  if (DEV_MODE) {
    console.log(`[DST]`, message, data || '');
  }
};

// ============================================================================
// IMAGE CACHE MANAGEMENT
// ============================================================================

interface CacheEntry {
  url: string;
  timestamp: number;
}

class ImageCacheManager {
  private memoryCache = new Map<string, string>();
  private maxCacheSize = 100; // Limit memory cache to 100 entries

  get(key: string): string | null {
    return this.memoryCache.get(key) || null;
  }

  set(key: string, value: string): void {
    // Implement LRU cache - remove oldest if cache is full
    if (this.memoryCache.size >= this.maxCacheSize) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }
    this.memoryCache.set(key, value);
  }

  clear(): void {
    this.memoryCache.clear();
  }
}

const imageCacheManager = new ImageCacheManager();

const fetchDSTImage = async (itemName: string): Promise<string | null> => {
  if (!itemName || itemName.trim() === '') return null;

  const cacheKey = itemName.toLowerCase().trim();

  // Check memory cache first
  const cached = imageCacheManager.get(cacheKey);
  if (cached) {
    log('Image found in memory cache:', cacheKey);
    return cached;
  }

  // Check localStorage cache
  try {
    const stored = localStorage.getItem(`dst_img_${cacheKey}`);
    if (stored) {
      const { url, timestamp } = JSON.parse(stored) as CacheEntry;
      const age = Date.now() - timestamp;
      const expiry = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      if (age < expiry) {
        imageCacheManager.set(cacheKey, url);
        log('Image restored from localStorage cache:', cacheKey);
        return url;
      } else {
        // Cache expired, remove it
        localStorage.removeItem(`dst_img_${cacheKey}`);
      }
    }
  } catch (error) {
    log('Cache read error:', error);
  }

  // Fetch from wiki
  const patterns = [
    `${itemName}_Build.png`,
    `${itemName}.png`,
    `${itemName}_Portrait.png`,
    `${itemName}_Icon.png`,
  ];

  for (const filename of patterns) {
    try {
      const encodedFilename = encodeURIComponent(`File:${filename}`);
      const apiUrl = `https://dontstarve.fandom.com/api.php?action=query&titles=${encodedFilename}&prop=imageinfo&iiprop=url&format=json&origin=*`;

      const response = await fetch(apiUrl);
      if (!response.ok) continue;

      const data = await response.json();
      const pages = data.query?.pages;

      if (pages) {
        const page = Object.values(pages)[0] as any;
        if (page?.imageinfo?.[0]?.url) {
          const imageUrl = page.imageinfo[0].url;

          // Cache the result
          imageCacheManager.set(cacheKey, imageUrl);
          try {
            localStorage.setItem(
              `dst_img_${cacheKey}`,
              JSON.stringify({
                url: imageUrl,
                timestamp: Date.now(),
              })
            );
          } catch (e) {
            log('Cache write error:', e);
          }

          log('Image fetched from wiki:', filename);
          return imageUrl;
        }
      }
    } catch (error) {
      log(`Error fetching image for ${filename}:`, error);
    }
  }

  return null;
};

// ============================================================================
// DATA TYPES & DEFAULTS
// ============================================================================

interface Command {
  id: number;
  name: string;
  command: string;
  image: string;
  tags: string[];
  category: string | null;
  favorite: boolean;
}

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
}

const DEFAULT_COMMANDS: Command[] = [
  {
    id: 1,
    name: 'God Mode',
    command: 'c_godmode()',
    image: 'https://static.wikia.nocookie.net/dont-starve-game/images/4/42/Wilson_Portrait.png/revision/latest?cb=20160723191003',
    tags: ['Admin'],
    favorite: false,
    category: null,
  },
  {
    id: 2,
    name: 'Spawn Spider',
    command: 'c_spawn("spider")',
    image: 'https://static.wikia.nocookie.net/dont-starve-game/images/1/14/Spider_Build.png/revision/latest?cb=20160723194014',
    tags: ['Spawning'],
    favorite: false,
    category: 'spawn',
  },
  {
    id: 3,
    name: 'Give Gold',
    command: 'c_give("goldnugget", 40)',
    image: 'https://static.wikia.nocookie.net/dont-starve-game/images/9/92/Gold_Nugget.png/revision/latest?cb=20160723185614',
    tags: ['Items'],
    favorite: true,
    category: 'give',
  },
];

const CATEGORIES: Category[] = [
  { id: 'give', name: 'Give', color: '#059669' },
  { id: 'spawn', name: 'Spawn', color: '#7c3aed' },
];

const DEFAULT_TAGS: Tag[] = [
  { id: 1, name: 'Admin', color: '#ef4444' },
  { id: 2, name: 'Spawning', color: '#8b5cf6' },
  { id: 3, name: 'Items', color: '#10b981' },
];

// ============================================================================
// TOAST NOTIFICATION COMPONENT
// ============================================================================

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration: number;
}

const Toast: React.FC<{ toast: Toast; onRemove: () => void }> = ({ toast, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(onRemove, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, onRemove]);

  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
  }[toast.type];

  return (
    <div className={`${bgColor} text-white px-6 py-3 rounded-lg shadow-lg`}>
      {toast.message}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DSTCommandManager() {
  // ---- State Management ----
  const [commands, setCommands] = useState<Command[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Edit mode
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editCommand, setEditCommand] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editCategory, setEditCategory] = useState<string | null>(null);
  const [showCommandEditor, setShowCommandEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Tag management
  const [showTagManager, setShowTagManager] = useState(false);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('#3b82f6');

  // UI State
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [activeTag, setActiveTag] = useState('all');
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});
  const [autoFetchedImages, setAutoFetchedImages] = useState<Record<number, string>>({});
  const [fetchingImages, setFetchingImages] = useState<Record<number, boolean>>({});

  // Refs for tracking mounted state
  const isMountedRef = useRef(true);

  // ---- Initialization ----

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  // ---- Image Auto-fetching ----

  useEffect(() => {
    if (!isMountedRef.current) return;

    const fetchImagesForCommands = async () => {
      for (const cmd of commands) {
        if (!isMountedRef.current) break;

        // Skip if already has image or already fetched
        if (cmd.image || autoFetchedImages[cmd.id] || fetchingImages[cmd.id]) {
          continue;
        }

        setFetchingImages((prev) => ({ ...prev, [cmd.id]: true }));

        const imageUrl = await fetchDSTImage(cmd.name);

        if (!isMountedRef.current) break;

        setFetchingImages((prev) => {
          const updated = { ...prev };
          delete updated[cmd.id];
          return updated;
        });

        if (imageUrl) {
          setAutoFetchedImages((prev) => ({ ...prev, [cmd.id]: imageUrl }));
        }
      }
    };

    if (commands.length > 0) {
      fetchImagesForCommands();
    }
  }, [commands]);

  // ---- Storage Operations ----

  const loadData = async () => {
    try {
      // Verify storage API is available
      if (!window.storage) {
        throw new Error('Storage API not available. Please refresh the page.');
      }

      log('Loading data...');

      // Load tags
      const tagResult = await window.storage.list('dsttag:');
      if (!tagResult?.keys || tagResult.keys.length === 0) {
        await initializeDefaultTags();
        if (isMountedRef.current) {
          setTags(DEFAULT_TAGS);
        }
      } else {
        const loadedTags: Tag[] = [];
        for (const key of tagResult.keys) {
          try {
            const data = await window.storage.get(key);
            if (data?.value) {
              loadedTags.push(JSON.parse(data.value));
            }
          } catch (err) {
            log(`Error loading tag ${key}:`, err);
          }
        }
        if (isMountedRef.current) {
          setTags(loadedTags.sort((a, b) => a.id - b.id));
        }
      }

      // Load commands
      const cmdResult = await window.storage.list('dst:');
      if (!cmdResult?.keys || cmdResult.keys.length === 0) {
        await initializeDefaults();
        if (isMountedRef.current) {
          setCommands(DEFAULT_COMMANDS);
        }
      } else {
        const loadedCommands: Command[] = [];
        for (const key of cmdResult.keys) {
          try {
            const data = await window.storage.get(key);
            if (data?.value) {
              loadedCommands.push(JSON.parse(data.value));
            }
          } catch (err) {
            log(`Error loading command ${key}:`, err);
          }
        }
        if (isMountedRef.current) {
          setCommands(loadedCommands.sort((a, b) => a.id - b.id));
        }
      }

      log('Data loaded successfully');
    } catch (error) {
      log('Error loading data:', error);
      addToast('Failed to load data. Using default commands.', 'error');

      if (isMountedRef.current) {
        await initializeDefaultTags();
        await initializeDefaults();
        setTags(DEFAULT_TAGS);
        setCommands(DEFAULT_COMMANDS);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const initializeDefaults = async () => {
    for (const cmd of DEFAULT_COMMANDS) {
      try {
        await window.storage.set(`dst:${cmd.id}`, JSON.stringify(cmd));
      } catch (err) {
        log('Error saving default command:', err);
      }
    }
  };

  const initializeDefaultTags = async () => {
    for (const tag of DEFAULT_TAGS) {
      try {
        await window.storage.set(`dsttag:${tag.id}`, JSON.stringify(tag));
      } catch (err) {
        log('Error saving default tag:', err);
      }
    }
  };

  // ---- Toast Notifications ----

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).slice(2);
    const duration = type === 'success' ? SAVE_SUCCESS_DURATION : 4000;

    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ---- Command Operations ----

  const addNewCommand = () => {
    const newId = commands.length > 0 ? Math.max(...commands.map((c) => c.id)) + 1 : 1;
    setEditingId(newId);
    setEditName('');
    setEditCommand('');
    setEditImage('');
    setEditTags([]);
    setEditCategory(null);
    setShowCommandEditor(true);
  };

  const handleEdit = (cmd: Command, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(cmd.id);
    setEditName(cmd.name);
    setEditCommand(cmd.command);
    setEditImage(cmd.image || '');
    setEditTags(cmd.tags || []);
    setEditCategory(cmd.category || null);
    setShowCommandEditor(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addToast('Please select an image file', 'error');
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      addToast('Image is too large. Please use an image smaller than 3MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      log('Image loaded, size:', Math.round(base64.length / 1024), 'KB');
      setEditImage(base64);
    };
    reader.onerror = () => {
      addToast('Failed to read image file', 'error');
    };
    reader.readAsDataURL(file);
  };

  const toggleTag = (tagName: string) => {
    setEditTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]
    );
  };

  const handleSave = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const trimmedName = editName.trim();
    const trimmedCommand = editCommand.trim();
    const trimmedImage = editImage.trim();

    if (!trimmedName || !trimmedCommand) {
      addToast('Both name and command are required!', 'error');
      return;
    }

    setSaving(true);
    setSaveSuccess(false);

    try {
      if (!window.storage) {
        throw new Error('Storage API not available');
      }

      const currentCmd = commands.find((c) => c.id === id);
      const updatedCommand: Command = {
        id,
        name: trimmedName,
        command: trimmedCommand,
        image: trimmedImage,
        tags: editTags,
        category: editCategory,
        favorite: currentCmd?.favorite || false,
      };

      const commandJson = JSON.stringify(updatedCommand);

      if (commandJson.length > MAX_STORAGE_SIZE) {
        addToast('Command data is too large. Try a smaller image.', 'error');
        setSaving(false);
        return;
      }

      log('Saving command, size:', Math.round(commandJson.length / 1024), 'KB');
      const result = await window.storage.set(`dst:${id}`, commandJson);

      if (!result) {
        throw new Error('Storage operation failed');
      }

      log('Command saved successfully');

      if (!isMountedRef.current) return;

      // Add or update command in list
      setCommands((prev) =>
        prev.find((c) => c.id === id) ? prev.map((c) => (c.id === id ? updatedCommand : c)) : [...prev, updatedCommand]
      );

      setSaving(false);
      setSaveSuccess(true);
      addToast('Command saved successfully', 'success');

      // Close editor after delay
      setTimeout(() => {
        if (isMountedRef.current) {
          setEditingId(null);
          setShowCommandEditor(false);
          setSaveSuccess(false);
          setImageErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors[id];
            return newErrors;
          });
        }
      }, SAVE_SUCCESS_DURATION);
    } catch (error) {
      log('Error saving command:', error);
      setSaving(false);
      addToast('Failed to save command. Please try again.', 'error');
    }
  };

  const handleCancel = (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingId(null);
    setShowCommandEditor(false);
    setEditName('');
    setEditCommand('');
    setEditImage('');
    setEditTags([]);
    setEditCategory(null);
  };

  const handleDelete = async (cmd: Command, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (!window.confirm(`Are you sure you want to delete "${cmd.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      if (!window.storage) {
        throw new Error('Storage API not available');
      }

      log('Deleting command:', cmd.name, 'ID:', cmd.id);

      await window.storage.delete(`dst:${cmd.id}`);
      log('✓ Command deleted successfully');

      if (!isMountedRef.current) return;

      setCommands((prev) => prev.filter((c) => c.id !== cmd.id));
      addToast(`"${cmd.name}" deleted successfully`, 'success');

      // Close editor if it was open for this command
      if (editingId === cmd.id) {
        setShowCommandEditor(false);
        setEditingId(null);
      }
    } catch (error) {
      log('Error deleting command:', error);
      addToast('Failed to delete command. Please try again.', 'error');
    }
  };

  const handleCardClick = async (cmd: Command) => {
    if (editingId === cmd.id) return;

    try {
      await navigator.clipboard.writeText(cmd.command);
      setCopiedId(cmd.id);
      addToast('Command copied to clipboard!', 'success');
      setTimeout(() => setCopiedId(null), COPY_TOAST_DURATION);
    } catch (error) {
      log('Failed to copy:', error);
      addToast('Failed to copy to clipboard', 'error');
    }
  };

  // ---- Tag Operations ----

  const addNewTag = () => {
    const newId = tags.length > 0 ? Math.max(...tags.map((t) => t.id)) + 1 : 1;
    setTags([...tags, { id: newId, name: '', color: '#3b82f6' }]);
    setEditingTagId(newId);
    setEditTagName('');
    setEditTagColor('#3b82f6');
  };

  const handleEditTag = (tag: Tag) => {
    setEditingTagId(tag.id);
    setEditTagName(tag.name);
    setEditTagColor(tag.color);
  };

  const handleSaveTag = async (id: number) => {
    const trimmedName = editTagName.trim();

    if (!trimmedName) {
      addToast('Tag name is required!', 'error');
      return;
    }

    if (tags.some((t) => t.id !== id && t.name.toLowerCase() === trimmedName.toLowerCase())) {
      addToast('A tag with this name already exists!', 'error');
      return;
    }

    try {
      if (!window.storage) {
        throw new Error('Storage API not available');
      }

      const oldTag = tags.find((t) => t.id === id);
      const updatedTag = { id, name: trimmedName, color: editTagColor };

      await window.storage.set(`dsttag:${id}`, JSON.stringify(updatedTag));

      // Update tag name in all commands that use it
      if (oldTag && oldTag.name !== trimmedName) {
        for (const cmd of commands) {
          if (cmd.tags?.includes(oldTag.name)) {
            const updatedTags = cmd.tags.map((t) => (t === oldTag.name ? trimmedName : t));
            const updatedCommand = { ...cmd, tags: updatedTags };
            await window.storage.set(`dst:${cmd.id}`, JSON.stringify(updatedCommand));
            setCommands((prev) => prev.map((c) => (c.id === cmd.id ? updatedCommand : c)));
          }
        }
      }

      if (isMountedRef.current) {
        setTags((prev) => prev.map((t) => (t.id === id ? updatedTag : t)));
        setEditingTagId(null);
        addToast('Tag saved successfully', 'success');
      }
    } catch (error) {
      log('Error saving tag:', error);
      addToast('Failed to save tag. Please try again.', 'error');
    }
  };

  const handleCancelTag = (id: number) => {
    const tag = tags.find((t) => t.id === id);
    if (!tag?.name) {
      setTags((prev) => prev.filter((t) => t.id !== id));
    }
    setEditingTagId(null);
  };

  const handleDeleteTag = async (id: number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const tag = tags.find((t) => t.id === id);
    if (!tag) return;

    if (!window.confirm(`Are you sure you want to delete the tag "${tag.name}"? It will be removed from all commands.`)) {
      return;
    }

    try {
      if (!window.storage) {
        throw new Error('Storage API not available');
      }

      log('Deleting tag:', tag.name, 'ID:', id);

      await window.storage.delete(`dsttag:${id}`);

      // Remove tag from all commands
      for (const cmd of commands) {
        if (cmd.tags?.includes(tag.name)) {
          const updatedTags = cmd.tags.filter((t) => t !== tag.name);
          const updatedCommand = { ...cmd, tags: updatedTags };
          await window.storage.set(`dst:${cmd.id}`, JSON.stringify(updatedCommand));
          setCommands((prev) => prev.map((c) => (c.id === cmd.id ? updatedCommand : c)));
        }
      }

      if (isMountedRef.current) {
        setTags((prev) => prev.filter((t) => t.id !== id));
        if (activeTag === tag.name) {
          setActiveTag('all');
        }
        addToast(`Tag "${tag.name}" deleted successfully`, 'success');
      }
    } catch (error) {
      log('Error deleting tag:', error);
      addToast('Failed to delete tag. Please try again.', 'error');
    }
  };

  const toggleFavorite = async (cmd: Command, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      if (!window.storage) {
        throw new Error('Storage API not available');
      }

      const updatedCommand = { ...cmd, favorite: !cmd.favorite };
      await window.storage.set(`dst:${cmd.id}`, JSON.stringify(updatedCommand));

      if (isMountedRef.current) {
        setCommands((prev) => prev.map((c) => (c.id === cmd.id ? updatedCommand : c)));
      }
    } catch (error) {
      log('Error toggling favorite:', error);
      addToast('Failed to update favorite status.', 'error');
    }
  };

  // ---- Filtering ----

  const filteredCommands =
    activeTag === 'all'
      ? commands
      : activeTag === 'favorites'
        ? commands.filter((cmd) => cmd.favorite)
        : CATEGORIES.find((cat) => cat.id === activeTag)
          ? commands.filter((cmd) => cmd.category === activeTag)
          : commands.filter((cmd) => cmd.tags?.includes(activeTag));

  // ---- Render ----

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading commands...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Toast Notifications */}
        <div className="fixed top-8 right-8 space-y-3 z-50">
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
          ))}
        </div>

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-white">DST Command Manager</h1>
          <div className="flex gap-3">
            <button
              onClick={() => setShowTagManager(!showTagManager)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors"
              title="Manage tags"
            >
              <Tag size={20} />
              Tags
            </button>
            <button
              onClick={addNewCommand}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors"
              title="Add a new command"
            >
              <Plus size={20} />
              Add Command
            </button>
          </div>
        </div>

        {/* Tag Manager Modal */}
        {showTagManager && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800">Manage Tags</h2>
                <button
                  onClick={() => setShowTagManager(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-3 mb-4">
                {tags.map((tag) => (
                  <div key={tag.id} className="flex items-center gap-2 bg-gray-50 p-3 rounded">
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    ></div>

                    {editingTagId === tag.id ? (
                      <>
                        <input
                          type="text"
                          value={editTagName}
                          onChange={(e) => setEditTagName(e.target.value)}
                          className="flex-1 px-2 py-1 border rounded"
                          placeholder="Tag name"
                        />
                        <input
                          type="color"
                          value={editTagColor}
                          onChange={(e) => setEditTagColor(e.target.value)}
                          className="w-10 h-10 rounded cursor-pointer"
                        />
                        <button
                          onClick={() => handleSaveTag(tag.id)}
                          className="text-green-600 hover:text-green-700"
                          title="Save tag"
                        >
                          <Save size={18} />
                        </button>
                        <button
                          onClick={() => handleCancelTag(tag.id)}
                          className="text-gray-600 hover:text-gray-700"
                          title="Cancel"
                        >
                          <X size={18} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-gray-800">{tag.name}</span>
                        <button
                          onClick={() => handleEditTag(tag)}
                          className="text-blue-600 hover:text-blue-700"
                          title="Edit tag"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteTag(tag.id, e)}
                          className="text-red-600 hover:text-red-700"
                          title="Delete tag"
                        >
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={addNewTag}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold transition-colors"
              >
                Add New Tag
              </button>
            </div>
          </div>
        )}

        {/* Command Editor Modal */}
        {showCommandEditor && editingId !== null && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                {commands.find((c) => c.id === editingId) ? 'Edit Command' : 'Add New Command'}
              </h2>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Command Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., God Mode"
                  />
                </div>

                {/* Command */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Command Code
                  </label>
                  <input
                    type="text"
                    value={editCommand}
                    onChange={(e) => setEditCommand(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    placeholder="e.g., c_godmode()"
                  />
                </div>

                {/* Image */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Image
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                  {editImage && (
                    <div className="mt-2 flex justify-center">
                      <img
                        src={editImage}
                        alt="Preview"
                        className="max-w-48 max-h-48 rounded object-contain"
                      />
                    </div>
                  )}
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={editCategory || ''}
                    onChange={(e) => setEditCategory(e.target.value || null)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.name)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                          editTags.includes(tag.name)
                            ? 'ring-2 ring-white'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: tag.color,
                          color: 'white',
                        }}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-6">
                <button
                  onClick={(e) => handleSave(editingId, e)}
                  disabled={saving}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-semibold transition-colors ${
                    saving
                      ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  <Save size={18} />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => handleCancel(editingId)}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 bg-gray-400 hover:bg-gray-500 text-white py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  <X size={18} />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tag Filter Buttons */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTag('all')}
            className={`px-4 py-2 rounded-full font-medium transition-all ${
              activeTag === 'all'
                ? 'bg-white text-gray-800 shadow-lg'
                : 'bg-slate-700 text-white hover:bg-slate-600'
            }`}
          >
            All ({commands.length})
          </button>
          <button
            onClick={() => setActiveTag('favorites')}
            className={`px-4 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${
              activeTag === 'favorites'
                ? 'bg-yellow-500 text-white shadow-lg'
                : 'bg-slate-700 text-white hover:bg-slate-600'
            }`}
          >
            <Star size={16} fill={activeTag === 'favorites' ? 'white' : 'none'} />
            Favorites ({commands.filter((cmd) => cmd.favorite).length})
          </button>
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveTag(category.id)}
              className={`px-4 py-2 rounded-full font-medium transition-all ${
                activeTag === category.id
                  ? 'bg-white text-gray-800 shadow-lg'
                  : 'bg-slate-700 text-white hover:bg-slate-600'
              }`}
            >
              {category.name} ({commands.filter((cmd) => cmd.category === category.id).length})
            </button>
          ))}
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => setActiveTag(tag.name)}
              className={`px-4 py-2 rounded-full font-medium transition-all ${
                activeTag === tag.name ? 'shadow-lg ring-2 ring-white' : 'hover:opacity-80'
              }`}
              style={{
                backgroundColor: tag.color,
                color: 'white',
              }}
            >
              {tag.name} (
              {commands.filter((cmd) => cmd.tags?.includes(tag.name)).length})
            </button>
          ))}
        </div>

        {/* Commands Grid */}
        {filteredCommands.length === 0 ? (
          <div className="text-center text-white text-xl mt-16">
            {activeTag === 'all'
              ? "No commands yet. Click 'Add Command' to get started!"
              : activeTag === 'favorites'
                ? "No favorite commands yet. Click the star icon on any command to add it to favorites!"
                : CATEGORIES.find((cat) => cat.id === activeTag)
                  ? `No commands in the "${CATEGORIES.find((cat) => cat.id === activeTag)?.name}" category.`
                  : `No commands with tag "${activeTag}".`}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
            {filteredCommands.map((cmd) => (
              <div
                key={cmd.id}
                onClick={() => handleCardClick(cmd)}
                className="bg-white rounded-lg shadow-lg p-6 transition-all cursor-pointer hover:shadow-xl hover:-translate-y-1 relative"
              >
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                  <button
                    onClick={(e) => toggleFavorite(cmd, e)}
                    className="text-yellow-500 hover:scale-110 transition-transform"
                    title={cmd.favorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star
                      size={20}
                      fill={cmd.favorite ? '#eab308' : 'none'}
                      stroke="#eab308"
                      strokeWidth={2}
                    />
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => handleEdit(cmd, e)}
                      className="text-blue-600 hover:text-blue-700 hover:scale-110 transition-all"
                      title="Edit command"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(cmd, e)}
                      className="text-red-600 hover:text-red-700 hover:scale-110 transition-all"
                      title="Delete command"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Image */}
                {(cmd.image || autoFetchedImages[cmd.id]) && !imageErrors[cmd.id] && (
                  <div className="flex justify-center mb-4 bg-gray-50 rounded p-2 relative">
                    {fetchingImages[cmd.id] && !cmd.image && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-50 bg-opacity-75">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    )}
                    <img
                      src={cmd.image || autoFetchedImages[cmd.id]}
                      alt={cmd.name}
                      className="w-40 h-40 object-contain"
                      onError={() => {
                        setImageErrors((prev) => ({ ...prev, [cmd.id]: true }));
                      }}
                    />
                  </div>
                )}
                {!cmd.image && !autoFetchedImages[cmd.id] && fetchingImages[cmd.id] && (
                  <div className="flex justify-center mb-4 bg-gray-50 rounded p-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                )}
                {!cmd.image && !autoFetchedImages[cmd.id] && !fetchingImages[cmd.id] && imageErrors[cmd.id] && (
                  <div className="flex justify-center mb-4 bg-gray-100 rounded p-4 text-gray-500 text-sm">
                    <div className="text-center">
                      <div>🖼️</div>
                      <div>No image</div>
                    </div>
                  </div>
                )}

                {/* Name */}
                <h3 className="text-xl font-semibold text-gray-800 mb-3">{cmd.name}</h3>

                {/* Tags */}
                {cmd.tags && cmd.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {cmd.tags.map((tagName) => {
                      const tag = tags.find((t) => t.name === tagName);
                      return tag ? (
                        <span
                          key={tagName}
                          className="px-2 py-1 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tagName}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}

                {/* Category */}
                {cmd.category && (
                  <div className="mb-3">
                    <span
                      className="px-2 py-1 rounded-full text-xs font-medium text-white"
                      style={{
                        backgroundColor: CATEGORIES.find((c) => c.id === cmd.category)?.color || '#6b7280',
                      }}
                    >
                      {CATEGORIES.find((c) => c.id === cmd.category)?.name || cmd.category}
                    </span>
                  </div>
                )}

                {/* Command Code */}
                <div className="bg-gray-100 rounded p-3 mb-4 font-mono text-xs text-gray-700 break-all">
                  {cmd.command}
                </div>

                {/* Copied Feedback */}
                {copiedId === cmd.id && (
                  <div className="text-green-600 text-sm font-semibold mb-2">✓ Copied!</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
