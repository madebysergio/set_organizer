# DST Command Manager

A React-based Set Organizer for managing Don't Starve console commands with intelligent categorization, tagging, and visual organization.

## Overview

The DST Command Manager is a powerful organizational tool that groups, arranges, labels, edits, and structures collections of Don't Starve console commands into coherent, searchable sets. It focuses on how commands are categorized, presented, and managed as structured groups without making assumptions about where or how they are deployed.

## Features

### Organization Systems

- **Categories**: Structural grouping by command purpose (Spawn, Give, Admin, etc.)
- **Tags**: Flexible, customizable labeling with color-coding for fine-grained organization
- **Favorites**: Quick access to frequently-used commands with dedicated filtering

### Command Management

- **Add Commands**: Create new command entries with name, executable code, images, and metadata
- **Edit Commands**: Modify any command property including code, tags, category, and image
- **Delete Commands**: Remove commands from your collection
- **Copy to Clipboard**: Quick-copy command syntax with visual feedback

### Image Integration

- **Auto-Fetch**: Automatically retrieves command images from the Don't Starve wiki
- **Manual Override**: Set custom images for any command
- **Caching**: 7-day image cache with localStorage support for offline access
- **Error Handling**: Graceful fallback for unavailable images

### Filtering & Discovery

- **Tag Filtering**: View commands by any applied tag
- **Category Filtering**: Filter commands by functional category
- **Favorites View**: Access starred commands instantly
- **Dynamic Counts**: Real-time updates showing command counts per filter

### User Experience

- **Responsive Grid**: Adapts from 1 column on mobile to 6 columns on ultra-wide displays
- **Interactive Cards**: Hover effects, visual feedback, and intuitive controls
- **Real-time Persistence**: All changes automatically saved to storage
- **Colorized UI**: Color-coded tags, categories, and visual indicators for quick scanning

## Technology Stack

- **React**: UI framework with hooks (useState, useEffect)
- **Lucide React**: Icon library for intuitive controls
- **Tailwind CSS**: Responsive utility-first styling
- **MediaWiki API**: Don't Starve wiki integration for image fetching
- **Browser Storage API**: Local persistence for commands, tags, and image cache

## Component Architecture

### Main Component: `DSTCommandManager`

Manages the complete application state including commands, tags, filtering, and editing modes.

### Key Functions

- `loadData()`: Initializes commands and tags from storage or defaults
- `fetchDSTImage()`: Retrieves and caches images from the Don't Starve wiki
- `handleEdit()`: Manages command editing workflow
- `handleDelete()`: Removes commands with confirmation
- `toggleFavorite()`: Stars/unstars commands for quick access

### State Management

- Commands array with CRUD operations
- Tags with custom colors
- Edit mode tracking
- Image cache (in-memory and localStorage)
- Active filter selection

## Data Structure

### Command Object

```javascript
{
  id: number,
  name: string,
  command: string,           // Executable code
  image: string,             // Image URL (manual)
  tags: string[],            // Applied tag names
  category: string,          // Category ID
  favorite: boolean          // Starred status
}
```

### Tag Object

```javascript
{
  id: number,
  name: string,
  color: string              // Hex color code
}
```

### Category Object

```javascript
{
  id: string,
  name: string,
  color: string              // Hex color code
}
```

## Default Data

The manager includes pre-configured default commands and tags for immediate use:

- **Commands**: God Mode, Spawn Spider, Give Gold
- **Categories**: Give, Spawn
- **Tags**: Admin, Spawning, Items

## Storage

Commands and tags persist via the browser storage API (`window.storage`):

- Commands stored with key prefix: `dst:`
- Tags stored with key prefix: `dsttag:`
- Image cache stored with key prefix: `dst_img_`

## Getting Started

1. Import the component into your React application
2. Ensure browser storage API is available
3. Component loads default data on first run
4. Begin adding, organizing, and filtering commands

## Usage Example

```jsx
import DSTCommandManager from "./dst-command-manager";

export default function App() {
  return <DSTCommandManager />;
}
```

## Key Features in Action

### Adding a Command

Click "Add New Command" and fill in the command details. Images auto-fetch from the wiki or set manually.

### Organizing with Tags

Apply multiple tags to commands for flexible categorization. Create custom tags with preferred colors.

### Filtering Results

Use tag buttons, category buttons, or favorites to view subsets of your command collection.

### Quick Copy

Click a command card to copy its code to clipboard with instant visual confirmation.

## Browser Compatibility

Requires support for:

- ES6+ JavaScript (fetch API, async/await)
- CSS Grid and Flexbox
- localStorage API
- React 16.8+ (Hooks)

## Dependencies

- `react`: Core UI framework
- `lucide-react`: Icon components
- `tailwindcss`: Styling framework

## Notes

- Image caching expires after 7 days
- All data is stored locally in the browser
- No server-side persistence included
- Wiki image fetching uses CORS-enabled endpoint

---

**Type**: Set Organizer Pattern  
**Use Case**: Game console command management and organization  
**Status**: Fully functional with persistence and external data integration
