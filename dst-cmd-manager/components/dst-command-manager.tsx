import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Tag, FolderOpen, Star, Shield, Eye } from 'lucide-react';

// localStorage-based storage utility
const STORAGE_KEY = 'dst-command-manager-data';
const VIEWER_FAVORITES_KEY = 'dst-viewer-favorites';

const storage = {
  _getData: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : { commands: {}, tags: {} };
    } catch (e) {
      console.error('Error reading from localStorage:', e);
      return { commands: {}, tags: {} };
    }
  },

  _saveData: (data) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Error writing to localStorage:', e);
      return false;
    }
  },

  get: async (key) => {
    const data = storage._getData();
    const [prefix, id] = key.split(':');
    const store = prefix === 'dsttag' ? data.tags : data.commands;
    return store[id] ? { value: store[id] } : null;
  },

  set: async (key, value) => {
    const data = storage._getData();
    const [prefix, id] = key.split(':');
    const store = prefix === 'dsttag' ? 'tags' : 'commands';
    data[store][id] = value;
    return storage._saveData(data);
  },

  delete: async (key) => {
    const data = storage._getData();
    const [prefix, id] = key.split(':');
    const store = prefix === 'dsttag' ? 'tags' : 'commands';
    if (data[store][id]) {
      delete data[store][id];
      return storage._saveData(data);
    }
    return true;
  },

  list: async (prefix) => {
    const data = storage._getData();
    const store = prefix === 'dsttag:' ? data.tags : data.commands;
    const keys = Object.keys(store).map(id => `${prefix}${id}`);
    return { keys };
  }
};

// Viewer favorites stored separately in browser localStorage
const viewerFavoritesStorage = {
  get: () => {
    try {
      const data = localStorage.getItem(VIEWER_FAVORITES_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error('Error reading viewer favorites:', e);
      return {};
    }
  },

  set: (favorites) => {
    try {
      localStorage.setItem(VIEWER_FAVORITES_KEY, JSON.stringify(favorites));
      return true;
    } catch (e) {
      console.error('Error saving viewer favorites:', e);
      return false;
    }
  },

  toggle: (commandId) => {
    const favorites = viewerFavoritesStorage.get();
    if (favorites[commandId]) {
      delete favorites[commandId];
    } else {
      favorites[commandId] = true;
    }
    viewerFavoritesStorage.set(favorites);
    return favorites;
  }
};

// MediaWiki API utility for fetching DST images
const IMAGE_CACHE = {};

const fetchDSTImage = async (itemName) => {
  if (!itemName || itemName.trim() === '') return null;

  // Check cache first
  const cacheKey = itemName.toLowerCase().trim();
  if (IMAGE_CACHE[cacheKey]) {
    return IMAGE_CACHE[cacheKey];
  }

  // Check localStorage cache
  try {
    const cached = localStorage.getItem(`dst_img_${cacheKey}`);
    if (cached) {
      const { url, timestamp } = JSON.parse(cached);
      // Cache for 7 days
      if (Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000) {
        IMAGE_CACHE[cacheKey] = url;
        return url;
      }
    }
  } catch (e) {
    console.error('Cache read error:', e);
  }

  // Convert item name to potential filenames
  const formatFilename = (name) => {
    // Common DST wiki filename patterns
    const cleaned = name.trim();
    const patterns = [
      `${cleaned}_Build.png`,
      `${cleaned}.png`,
      `${cleaned}_Portrait.png`,
      `${cleaned}_Icon.png`
    ];
    return patterns;
  };

  const filenames = formatFilename(itemName);

  // Try each filename pattern
  for (const filename of filenames) {
    try {
      const encodedFilename = encodeURIComponent(`File:${filename}`);
      const apiUrl = `https://dontstarve.fandom.com/api.php?action=query&titles=${encodedFilename}&prop=imageinfo&iiprop=url&format=json&origin=*`;

      const response = await fetch(apiUrl);
      const data = await response.json();

      const pages = data.query?.pages;
      if (pages) {
        const page = Object.values(pages)[0];
        if (page.imageinfo && page.imageinfo[0]?.url) {
          const imageUrl = page.imageinfo[0].url;

          // Cache the result
          IMAGE_CACHE[cacheKey] = imageUrl;
          try {
            localStorage.setItem(`dst_img_${cacheKey}`, JSON.stringify({
              url: imageUrl,
              timestamp: Date.now()
            }));
          } catch (e) {
            console.error('Cache write error:', e);
          }

          return imageUrl;
        }
      }
    } catch (error) {
      console.error(`Error fetching image for ${filename}:`, error);
    }
  }

  // Return fallback
  return null;
};

const DEFAULT_COMMANDS = [
  { id: 1, name: "God Mode", command: "c_godmode()", image: "https://static.wikia.nocookie.net/dont-starve-game/images/4/42/Wilson_Portrait.png/revision/latest?cb=20160723191003", tags: ["Admin"], favorite: false, category: null },
  { id: 2, name: "Spawn Spider", command: 'c_spawn("spider")', image: "https://static.wikia.nocookie.net/dont-starve-game/images/1/14/Spider_Build.png/revision/latest?cb=20160723194014", tags: ["Spawning"], favorite: false, category: "spawn" },
  { id: 3, name: "Give Gold", command: 'c_give("goldnugget", 40)', image: "https://static.wikia.nocookie.net/dont-starve-game/images/9/92/Gold_Nugget.png/revision/latest?cb=20160723185614", tags: ["Items"], favorite: true, category: "give" }
];

const CATEGORIES = [
  { id: "give", name: "Give", color: "#059669" },
  { id: "spawn", name: "Spawn", color: "#7c3aed" }
];

const DEFAULT_TAGS = [
  { id: 1, name: "Admin", color: "#ef4444" },
  { id: 2, name: "Spawning", color: "#8b5cf6" },
  { id: 3, name: "Items", color: "#10b981" }
];

export default function DSTCommandManager() {
  const [commands, setCommands] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCommand, setEditCommand] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editTags, setEditTags] = useState([]);
  const [editCategory, setEditCategory] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [imageErrors, setImageErrors] = useState({});
  const [activeTag, setActiveTag] = useState('all');
  const [showTagManager, setShowTagManager] = useState(false);
  const [showCommandEditor, setShowCommandEditor] = useState(false);
  const [editingTagId, setEditingTagId] = useState(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('#3b82f6');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [autoFetchedImages, setAutoFetchedImages] = useState({});
  const [fetchingImages, setFetchingImages] = useState({});
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [viewerFavorites, setViewerFavorites] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, type: null, item: null, deleting: false, error: null });

  useEffect(() => {
    loadData();
    // Load viewer favorites from browser localStorage
    setViewerFavorites(viewerFavoritesStorage.get());
  }, []);

  // Auto-fetch images for commands that don't have manual images
  useEffect(() => {
    const fetchImagesForCommands = async () => {
      for (const cmd of commands) {
        // Skip if already has manual image or already fetched
        if (cmd.image || autoFetchedImages[cmd.id] || fetchingImages[cmd.id]) {
          continue;
        }

        setFetchingImages(prev => ({ ...prev, [cmd.id]: true }));

        const imageUrl = await fetchDSTImage(cmd.name);

        setFetchingImages(prev => {
          const updated = { ...prev };
          delete updated[cmd.id];
          return updated;
        });

        if (imageUrl) {
          setAutoFetchedImages(prev => ({ ...prev, [cmd.id]: imageUrl }));
        }
      }
    };

    if (commands.length > 0) {
      fetchImagesForCommands();
    }
  }, [commands]);

  const loadData = async () => {
    try {
      // Load tags
      const tagResult = await storage.list('dsttag:');
      if (!tagResult || !tagResult.keys || tagResult.keys.length === 0) {
        await initializeDefaultTags();
        setTags(DEFAULT_TAGS);
      } else {
        const loadedTags = [];
        for (const key of tagResult.keys) {
          try {
            const data = await storage.get(key);
            if (data && data.value) {
              loadedTags.push(JSON.parse(data.value));
            }
          } catch (err) {
            console.error(`Error loading ${key}:`, err);
          }
        }
        setTags(loadedTags.sort((a, b) => a.id - b.id));
      }

      // Load commands
      const cmdResult = await storage.list('dst:');
      if (!cmdResult || !cmdResult.keys || cmdResult.keys.length === 0) {
        await initializeDefaults();
        setCommands(DEFAULT_COMMANDS);
      } else {
        const loadedCommands = [];
        for (const key of cmdResult.keys) {
          try {
            const data = await storage.get(key);
            if (data && data.value) {
              loadedCommands.push(JSON.parse(data.value));
            }
          } catch (err) {
            console.error(`Error loading ${key}:`, err);
          }
        }
        setCommands(loadedCommands.sort((a, b) => a.id - b.id));
      }
    } catch (error) {
      console.error('Error loading data:', error);
      await initializeDefaultTags();
      await initializeDefaults();
      setTags(DEFAULT_TAGS);
      setCommands(DEFAULT_COMMANDS);
    } finally {
      setLoading(false);
    }
  };

  const initializeDefaults = async () => {
    for (const cmd of DEFAULT_COMMANDS) {
      try {
        await storage.set(`dst:${cmd.id}`, JSON.stringify(cmd));
      } catch (err) {
        console.error('Error saving default:', err);
      }
    }
  };

  const initializeDefaultTags = async () => {
    for (const tag of DEFAULT_TAGS) {
      try {
        await storage.set(`dsttag:${tag.id}`, JSON.stringify(tag));
      } catch (err) {
        console.error('Error saving default tag:', err);
      }
    }
  };

  const addNewCommand = () => {
    const newId = commands.length > 0 ? Math.max(...commands.map(c => c.id)) + 1 : 1;
    setEditingId(newId);
    setEditName('');
    setEditCommand('');
    setEditImage('');
    setEditTags([]);
    setEditCategory(null);
    setShowCommandEditor(true);
  };

  const handleEdit = (cmd, e) => {
    e.stopPropagation();
    setEditingId(cmd.id);
    setEditName(cmd.name);
    setEditCommand(cmd.command);
    setEditImage(cmd.image || '');
    setEditTags(cmd.tags || []);
    setEditCategory(cmd.category || null);
    setShowCommandEditor(true);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Accept all image types including webp, gif, apng, etc.
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }

      // 3MB limit for animated images (GIF, WebP, APNG)
      if (file.size > 3000000) {
        alert('Image is too large. Please use an image smaller than 3MB.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        console.log('Image loaded, size:', Math.round(base64.length / 1024), 'KB', 'type:', file.type);
        setEditImage(base64);
      };
      reader.onerror = () => {
        alert('Failed to read image file');
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleTag = (tagName) => {
    if (editTags.includes(tagName)) {
      setEditTags(editTags.filter(t => t !== tagName));
    } else {
      setEditTags([...editTags, tagName]);
    }
  };

  const handleSave = async (id, e) => {
    if (e) e.stopPropagation();

    const trimmedName = editName.trim();
    const trimmedCommand = editCommand.trim();
    const trimmedImage = editImage.trim();

    if (!trimmedName || !trimmedCommand) {
      alert('Both name and command are required!');
      return;
    }

    setSaving(true);
    setSaveSuccess(false);

    try {
      const currentCmd = commands.find(c => c.id === id);
      const updatedCommand = {
        id,
        name: trimmedName,
        command: trimmedCommand,
        image: trimmedImage,
        tags: editTags,
        category: editCategory,
        favorite: currentCmd?.favorite || false
      };
      const commandJson = JSON.stringify(updatedCommand);

      // Check if the data is too large (approaching 5MB limit)
      // Note: Base64 encoding increases size by ~33%
      if (commandJson.length > 4800000) {
        alert('Command data is too large. Try compressing your image or using a smaller file.');
        setSaving(false);
        return;
      }

      console.log('Saving command, total size:', Math.round(commandJson.length / 1024), 'KB');
      const result = await storage.set(`dst:${id}`, commandJson);

      if (!result) {
        throw new Error('Storage operation returned null');
      }

      console.log('Command saved successfully');

      // Add to commands list if it's a new command
      if (!commands.find(c => c.id === id)) {
        setCommands([...commands, updatedCommand]);
      } else {
        setCommands(commands.map(c => c.id === id ? updatedCommand : c));
      }

      setSaving(false);
      setSaveSuccess(true);

      // Show success message for 1.5 seconds before closing
      setTimeout(() => {
        setEditingId(null);
        setShowCommandEditor(false);
        setSaveSuccess(false);
        setImageErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[id];
          return newErrors;
        });
      }, 1500);
    } catch (error) {
      console.error('Error saving command:', error);
      setSaving(false);
      alert('Failed to save command. The image might be too large. Please try a smaller image.');
    }
  };

  const handleCancel = async (id, e) => {
    if (e) e.stopPropagation();

    setEditingId(null);
    setShowCommandEditor(false);
    setEditName('');
    setEditCommand('');
    setEditImage('');
    setEditTags([]);
    setEditCategory(null);
  };

  const handleDelete = async (cmdOrId, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    // Handle both command object and ID
    const cmd = typeof cmdOrId === 'object' ? cmdOrId : commands.find(c => c.id === cmdOrId);
    if (!cmd) {
      console.error('Command not found for deletion');
      return;
    }

    console.log('Opening delete confirmation for:', cmd.name, 'ID:', cmd.id);
    setDeleteConfirm({ show: true, type: 'command', item: cmd, deleting: false, error: null });
  };

  const confirmDelete = async () => {
    const { type, item } = deleteConfirm;

    if (type === 'command') {
      await executeDeleteCommand(item);
    } else if (type === 'tag') {
      await executeDeleteTag(item);
    }
  };

  const executeDeleteCommand = async (cmd) => {
    setDeleteConfirm(prev => ({ ...prev, deleting: true, error: null }));

    try {
      console.log('Deleting from storage...');

      const result = await storage.delete(`dst:${cmd.id}`);
      console.log('Storage delete result:', result);

      // Validate that the delete operation succeeded
      if (!result) {
        throw new Error('Failed to save changes to storage');
      }

      // Update state only after successful deletion
      setCommands(prevCommands => {
        const updated = prevCommands.filter(c => c.id !== cmd.id);
        console.log('Commands before delete:', prevCommands.length, 'after:', updated.length);
        return updated;
      });

      // Close editor modal if it was open for this command
      if (editingId === cmd.id) {
        console.log('Closing editor modal');
        setShowCommandEditor(false);
        setEditingId(null);
      }

      console.log('✓ Command deleted successfully');
      setDeleteConfirm({ show: false, type: null, item: null, deleting: false, error: null });
    } catch (error) {
      console.error('Error deleting command:', error);
      console.error('Error details:', error.message, error.stack);
      setDeleteConfirm(prev => ({ ...prev, deleting: false, error: `Failed to delete command: ${error.message}` }));
    }
  };

  const handleCardClick = async (cmd) => {
    if (editingId === cmd.id) return;

    try {
      await navigator.clipboard.writeText(cmd.command);
      setCopiedId(cmd.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy to clipboard');
    }
  };

  // Tag management
  const addNewTag = () => {
    const newId = tags.length > 0 ? Math.max(...tags.map(t => t.id)) + 1 : 1;
    const newTag = { id: newId, name: '', color: '#3b82f6' };
    setTags([...tags, newTag]);
    setEditingTagId(newId);
    setEditTagName('');
    setEditTagColor('#3b82f6');
  };

  const handleEditTag = (tag) => {
    setEditingTagId(tag.id);
    setEditTagName(tag.name);
    setEditTagColor(tag.color);
  };

  const handleSaveTag = async (id) => {
    const trimmedName = editTagName.trim();

    if (!trimmedName) {
      alert('Tag name is required!');
      return;
    }

    // Check for duplicate tag names
    if (tags.some(t => t.id !== id && t.name.toLowerCase() === trimmedName.toLowerCase())) {
      alert('A tag with this name already exists!');
      return;
    }

    try {
      const oldTag = tags.find(t => t.id === id);
      const updatedTag = { id, name: trimmedName, color: editTagColor };
      await storage.set(`dsttag:${id}`, JSON.stringify(updatedTag));

      // Update tag name in all commands that use it
      if (oldTag && oldTag.name !== trimmedName) {
        for (const cmd of commands) {
          if (cmd.tags && cmd.tags.includes(oldTag.name)) {
            const updatedTags = cmd.tags.map(t => t === oldTag.name ? trimmedName : t);
            const updatedCommand = { ...cmd, tags: updatedTags };
            await storage.set(`dst:${cmd.id}`, JSON.stringify(updatedCommand));
            setCommands(prev => prev.map(c => c.id === cmd.id ? updatedCommand : c));
          }
        }
      }

      setTags(tags.map(t => t.id === id ? updatedTag : t));
      setEditingTagId(null);
    } catch (error) {
      console.error('Error saving tag:', error);
      alert('Failed to save tag. Please try again.');
    }
  };

  const handleCancelTag = (id) => {
    const tag = tags.find(t => t.id === id);
    if (!tag.name) {
      setTags(tags.filter(t => t.id !== id));
    }
    setEditingTagId(null);
  };

  const handleDeleteTag = async (id, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const tag = tags.find(t => t.id === id);
    if (!tag) {
      console.error('Tag not found for deletion');
      return;
    }

    console.log('Opening delete confirmation for tag:', tag.name, 'ID:', id);
    setDeleteConfirm({ show: true, type: 'tag', item: tag, deleting: false, error: null });
  };

  const executeDeleteTag = async (tag) => {
    setDeleteConfirm(prev => ({ ...prev, deleting: true, error: null }));

    try {
      console.log('Deleting tag from storage...');
      const result = await storage.delete(`dsttag:${tag.id}`);
      console.log('Tag storage delete result:', result);

      // Remove tag from all commands
      for (const cmd of commands) {
        if (cmd.tags && cmd.tags.includes(tag.name)) {
          const updatedTags = cmd.tags.filter(t => t !== tag.name);
          const updatedCommand = { ...cmd, tags: updatedTags };
          await storage.set(`dst:${cmd.id}`, JSON.stringify(updatedCommand));
          setCommands(prev => prev.map(c => c.id === cmd.id ? updatedCommand : c));
        }
      }

      setTags(prevTags => {
        const updated = prevTags.filter(t => t.id !== tag.id);
        console.log('Tags after delete:', updated.length);
        return updated;
      });

      if (activeTag === tag.name) {
        setActiveTag('all');
      }

      console.log('Tag deleted successfully');
      setDeleteConfirm({ show: false, type: null, item: null, deleting: false, error: null });
    } catch (error) {
      console.error('Error deleting tag:', error);
      setDeleteConfirm(prev => ({ ...prev, deleting: false, error: 'Failed to delete tag. Please try again.' }));
    }
  };

  const toggleFavorite = async (cmd, e) => {
    e.stopPropagation();

    if (isAdminMode) {
      // Admin mode: save to main storage
      const starElement = e.currentTarget;
      const originalTitle = starElement.title;
      starElement.title = 'Saving...';

      try {
        const updatedCommand = { ...cmd, favorite: !cmd.favorite };
        await storage.set(`dst:${cmd.id}`, JSON.stringify(updatedCommand));
        setCommands(commands.map(c => c.id === cmd.id ? updatedCommand : c));

        starElement.title = 'Saved!';
        setTimeout(() => {
          starElement.title = updatedCommand.favorite ? 'Remove from favorites' : 'Add to favorites';
        }, 1000);
      } catch (error) {
        console.error('Error toggling favorite:', error);
        starElement.title = originalTitle;
      }
    } else {
      // Viewer mode: save to browser localStorage separately
      const newViewerFavorites = viewerFavoritesStorage.toggle(cmd.id);
      setViewerFavorites(newViewerFavorites);
    }
  };

  // Helper function to check if a command is favorited (considers both admin and viewer favorites)
  const isFavorited = (cmd) => {
    if (isAdminMode) {
      return cmd.favorite;
    } else {
      // In viewer mode, show viewer's personal favorites OR admin-set favorites
      return viewerFavorites[cmd.id] || cmd.favorite;
    }
  };

  // Get favorites count based on mode
  const getFavoritesCount = () => {
    if (isAdminMode) {
      return commands.filter(cmd => cmd.favorite).length;
    } else {
      return commands.filter(cmd => viewerFavorites[cmd.id] || cmd.favorite).length;
    }
  };

  const filteredCommands = activeTag === 'all'
    ? commands
    : activeTag === 'favorites'
      ? commands.filter(cmd => isFavorited(cmd))
      : CATEGORIES.find(cat => cat.id === activeTag)
        ? commands.filter(cmd => cmd.category === activeTag)
        : commands.filter(cmd => cmd.tags && cmd.tags.includes(activeTag));

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
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-xl font-bold text-white">▬</h1>
          <div className="flex gap-3 items-center">
            {/* Admin/Viewer Mode Toggle */}
            <button
              onClick={() => setIsAdminMode(!isAdminMode)}
              className={`px-4 py-3 rounded-lg flex items-center gap-2 transition-colors shadow-lg cursor-pointer ${isAdminMode
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-slate-600 hover:bg-slate-700 text-white'
                }`}
              title={isAdminMode ? 'Switch to Viewer Mode' : 'Switch to Admin Mode'}
            >
              {isAdminMode ? <Shield size={20} /> : <Eye size={20} />}
              {isAdminMode ? 'Admin' : 'Viewer'}
            </button>

            {/* Admin-only buttons */}
            {isAdminMode && (
              <>
                <button
                  onClick={() => setShowTagManager(!showTagManager)}
                  className="bg-slate-600 hover:bg-slate-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors shadow-lg cursor-pointer"
                >
                  <Tag size={20} />
                  Tags
                </button>
                <button
                  onClick={addNewCommand}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors shadow-lg cursor-pointer"
                >
                  <Plus size={20} />
                  Command
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tag Manager Modal */}
        {showTagManager && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                <h2 className="text-2xl font-bold text-gray-800">Manage Tags</h2>
                <button
                  onClick={() => setShowTagManager(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6">
                <button
                  onClick={addNewTag}
                  className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors mb-4"
                >
                  <Plus size={20} />
                  Add New Tag
                </button>
                <div className="space-y-3">
                  {tags.map(tag => (
                    <div key={tag.id} className="bg-gray-50 rounded-lg p-4">
                      {editingTagId === tag.id ? (
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={editTagName}
                            onChange={(e) => setEditTagName(e.target.value)}
                            placeholder="Tag name"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex items-center gap-3">
                            <label className="text-sm font-medium text-gray-700">Color:</label>
                            <input
                              type="color"
                              value={editTagColor}
                              onChange={(e) => setEditTagColor(e.target.value)}
                              className="w-16 h-10 rounded cursor-pointer"
                            />
                            <div
                              className="flex-1 px-3 py-2 rounded text-white text-center font-medium"
                              style={{ backgroundColor: editTagColor }}
                            >
                              Preview
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveTag(tag.id)}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center justify-center gap-2 transition-colors"
                            >
                              <Save size={16} />
                              Save
                            </button>
                            <button
                              onClick={() => handleCancelTag(tag.id)}
                              className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md flex items-center justify-center gap-2 transition-colors"
                            >
                              <X size={16} />
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span
                              className="px-4 py-2 rounded-full text-white font-medium"
                              style={{ backgroundColor: tag.color }}
                            >
                              {tag.name}
                            </span>
                            <span className="text-sm text-gray-500">
                              ({commands.filter(cmd => cmd.tags && cmd.tags.includes(tag.name)).length} commands)
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditTag(tag)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md flex items-center gap-2 transition-colors"
                            >
                              <Edit2 size={16} />
                              Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                console.log('Tag delete button clicked');
                                handleDeleteTag(tag.id, e);
                              }}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md flex items-center gap-2 transition-colors"
                            >
                              <Trash2 size={16} />
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Command Editor Modal */}
        {showCommandEditor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                <h2 className="text-2xl font-bold text-gray-800">
                  {commands.find(c => c.id === editingId) ? 'Edit Command' : 'Add New Command'}
                </h2>
                <div className="flex gap-2">
                  {commands.find(c => c.id === editingId) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('Modal delete clicked');
                        handleDelete(commands.find(c => c.id === editingId), e);
                      }}
                      className="text-red-600 hover:text-red-700 p-2"
                      title="Delete command"
                    >
                      <Trash2 size={24} />
                    </button>
                  )}
                  <button
                    onClick={(e) => handleCancel(editingId, e)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Command Name *
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g., God Mode"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Custom Image (optional)
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Leave blank to auto-fetch from Don't Starve Wiki based on command name
                  </p>
                  <input
                    type="file"
                    accept="image/*,.webp"
                    onChange={handleImageUpload}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  {editImage && (
                    <div className="mt-3 flex justify-center">
                      <img
                        src={editImage}
                        alt="Preview"
                        className="w-40 h-40 object-contain bg-gray-50 rounded p-2 border border-gray-200"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setEditCategory(null)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${editCategory === null
                        ? 'bg-gray-300 ring-2 ring-offset-2 ring-gray-400'
                        : 'bg-gray-200 opacity-50 hover:opacity-100'
                        }`}
                    >
                      None
                    </button>
                    {CATEGORIES.map(category => (
                      <button
                        key={category.id}
                        onClick={() => setEditCategory(category.id)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${editCategory === category.id
                          ? 'ring-2 ring-offset-2 ring-gray-400'
                          : 'opacity-50 hover:opacity-100'
                          }`}
                        style={{
                          backgroundColor: category.color,
                          color: 'white'
                        }}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {tags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.name)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${editTags.includes(tag.name)
                          ? 'ring-2 ring-offset-2 ring-gray-400'
                          : 'opacity-50 hover:opacity-100'
                          }`}
                        style={{
                          backgroundColor: tag.color,
                          color: 'white'
                        }}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Command Code *
                  </label>
                  <textarea
                    value={editCommand}
                    onChange={(e) => setEditCommand(e.target.value)}
                    placeholder='e.g., c_godmode()'
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={(e) => handleSave(editingId, e)}
                    disabled={saving || saveSuccess}
                    className={`flex-1 px-6 py-3 rounded-md flex items-center justify-center gap-2 transition-colors font-medium ${saveSuccess
                      ? 'bg-green-600 text-white cursor-default'
                      : saving
                        ? 'bg-gray-400 text-white cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                  >
                    {saveSuccess ? (
                      <>
                        <span className="text-xl">✓</span>
                        Saved Successfully!
                      </>
                    ) : saving ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={20} />
                        Save
                      </>
                    )}
                  </button>
                  <button
                    onClick={(e) => handleCancel(editingId, e)}
                    disabled={saving}
                    className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-md flex items-center justify-center gap-2 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <X size={20} />
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-md w-full overflow-hidden">
              <div className="p-6 border-b border-gray-200 bg-red-50">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                    <Trash2 size={24} className="text-red-600" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-800">Confirm Delete</h2>
                </div>
              </div>
              <div className="p-6">
                <p className="text-gray-700 mb-2">
                  Are you sure you want to delete {deleteConfirm.type === 'command' ? 'the command' : 'the tag'}{' '}
                  <span className="font-semibold">"{deleteConfirm.item?.name}"</span>?
                </p>
                {deleteConfirm.type === 'command' ? (
                  <p className="text-gray-500 text-sm">This action cannot be undone.</p>
                ) : (
                  <p className="text-gray-500 text-sm">It will be removed from all commands. This action cannot be undone.</p>
                )}
                {deleteConfirm.error && (
                  <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm">
                    {deleteConfirm.error}
                  </div>
                )}
              </div>
              <div className="p-6 bg-gray-50 flex gap-3">
                <button
                  onClick={() => setDeleteConfirm({ show: false, type: null, item: null, deleting: false, error: null })}
                  disabled={deleteConfirm.deleting}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleteConfirm.deleting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteConfirm.deleting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={18} />
                      {deleteConfirm.error ? 'Retry' : 'Delete'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tag Filter */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTag('all')}
            className={`px-4 py-2 rounded-full font-medium transition-all ${activeTag === 'all'
              ? 'bg-white text-gray-800 shadow-lg'
              : 'bg-slate-700 text-white hover:bg-slate-600'
              }`}
          >
            All ({commands.length})
          </button>
          <button
            onClick={() => setActiveTag('favorites')}
            className={`px-4 py-2 rounded-full font-medium transition-all flex items-center gap-2te ${activeTag === 'favorites'
              ? 'bg-yellow-500 text-white shadow-lg'
              : 'bg-slate-700 text-white hover:bg-slate-600'
              }`}
          >
            <Star size={16} fill={activeTag === 'favorites' ? 'white' : 'none'} />
            Favorites ({getFavoritesCount()})
          </button>
          {CATEGORIES.map(category => (
            <button
              key={category.id}
              onClick={() => setActiveTag(category.id)}
              className={`px-4 py-2 rounded-full font-medium transition-all ${activeTag === category.id
                ? 'bg-white text-gray-800 shadow-lg'
                : 'bg-slate-700 text-white hover:bg-slate-600'
                }`}
            >
              {category.name} ({commands.filter(cmd => cmd.category === category.id).length})
            </button>
          ))}
          {tags.map(tag => (
            <button
              key={tag.id}
              onClick={() => setActiveTag(tag.name)}
              className={`px-4 py-2 rounded-full font-medium transition-all ${activeTag === tag.name
                ? 'shadow-lg ring-2 ring-white'
                : 'hover:opacity-80'
                }`}
              style={{
                backgroundColor: tag.color,
                color: 'white'
              }}
            >
              {tag.name} ({commands.filter(cmd => cmd.tags && cmd.tags.includes(tag.name)).length})
            </button>
          ))}
        </div>

        {filteredCommands.length === 0 ? (
          <div className="text-center text-white text-xl mt-16">
            {activeTag === 'all'
              ? isAdminMode
                ? "No commands yet. Click 'Add New Command' to get started!"
                : "No commands yet."
              : activeTag === 'favorites'
                ? "No favorite commands yet. Click the star icon on any command to add it to favorites!"
                : CATEGORIES.find(cat => cat.id === activeTag)
                  ? isAdminMode
                    ? `No commands in the "${CATEGORIES.find(cat => cat.id === activeTag).name}" category. Add or edit commands to assign this category.`
                    : `No commands in the "${CATEGORIES.find(cat => cat.id === activeTag).name}" category.`
                  : isAdminMode
                    ? `No commands with tag "${activeTag}". Try a different tag or add new commands.`
                    : `No commands with tag "${activeTag}".`}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-6">
            {filteredCommands.map(cmd => (
              <div
                key={cmd.id}
                onClick={() => handleCardClick(cmd)}
                className="bg-white rounded-lg shadow-lg p-6 transition-all cursor-pointer hover:shadow-xl hover:-translate-y-1 relative"
              >
                {/* Header row with favorite and action buttons */}
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => toggleFavorite(cmd, e)}
                      className="text-yellow-500 hover:scale-110 transition-transform hover:animate-spin"
                      title={isFavorited(cmd) ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Star size={20} fill={isFavorited(cmd) ? '#eab308' : 'none'} stroke="#eab308" strokeWidth={2} />
                    </button>
                    {cmd.category && (
                      <span
                        className="px-2 py-1 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: CATEGORIES.find(c => c.id === cmd.category)?.color || '#6b7280' }}
                      >
                        {CATEGORIES.find(c => c.id === cmd.category)?.name || cmd.category}
                      </span>
                    )}
                  </div>
                  {isAdminMode && (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleEdit(cmd, e);
                        }}
                        className="text-blue-600 hover:text-blue-700 hover:scale-110 transition-all"
                        title="Edit command"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          console.log('Delete button clicked for:', cmd.name);
                          handleDelete(cmd, e);
                        }}
                        className="text-red-600 hover:text-red-700 hover:scale-110 transition-all"
                        title="Delete command"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Image display - use manual image if available, otherwise auto-fetched */}
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
                      onLoad={() => console.log('Image displayed successfully for:', cmd.name)}
                      onError={(e) => {
                        console.error('Image display error for:', cmd.name);
                        setImageErrors(prev => ({ ...prev, [cmd.id]: true }));
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
                      <div>Image unavailable</div>
                    </div>
                  </div>
                )}
                <h3 className="text-xl font-semibold text-gray-800 mb-3">
                  {cmd.name}
                </h3>
                {cmd.tags && cmd.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {cmd.tags.map(tagName => {
                      const tag = tags.find(t => t.name === tagName);
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
                <div className="bg-gray-100 rounded p-3 mb-4 font-mono text-sm text-gray-700 break-all">
                  {cmd.command}
                </div>
                {copiedId === cmd.id && (
                  <div className="text-green-600 text-sm font-semibold mb-2">
                    ✓ Copied!
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}