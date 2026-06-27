Proposed Component Structure

1. Directory Layout

src/routes/providers/
├── +page.svelte (main page - minimal)
├── components/
│ ├── ProviderTable.svelte
│ ├── ProviderRow.svelte
│ ├── ProviderHeader.svelte
│ ├── CreateProviderModal.svelte
│ ├── EditProviderModal.svelte
│ ├── ProviderForm.svelte
│ ├── CacheNotice.svelte
│ └── types.ts (shared types)
└── providers-store.ts (logic file) 2. Component Breakdown
Core Components:

ProviderTable.svelte - The main table container with header
ProviderRow.svelte - Individual provider row with all its content
ProviderHeader.svelte - Page header with title and actions
CacheNotice.svelte - Message/error display component
Modal Components:

CreateProviderModal.svelte - Create dialog (reuses ProviderForm)
EditProviderModal.svelte - Edit dialog (reuses ProviderForm)
ProviderForm.svelte - Shared form content for both modals
Supporting Files:

types.ts - Shared TypeScript types
providers-store.ts - API logic and state management 3. Component Responsibilities
ProviderTable.svelte

Table structure and headers
Iterates over providers
Handles empty state
Exports: providers, loadingProviders, error, message
ProviderRow.svelte

Single provider display
Shows name, endpoint, kind, default status
WOL details
Model cache info
Action buttons (edit, delete)
Exports: provider, onEdit, onDelete
ProviderHeader.svelte

Page title and description
Clear cache button
New provider button
Cache notice display
Exports: onClearCache, onCreateProvider, message, error
CreateProviderModal.svelte

Dialog structure
Binds to form state
Handles modal open/close
Calls addProvider function
Exports: show, onClose, onSave
EditProviderModal.svelte

Dialog structure
Binds to form state
Handles modal open/close
Calls saveProviderEdits function
Exports: show, onClose, onSave, provider
ProviderForm.svelte

Form fields for provider creation/editing
Shared between create and edit modals
Exports: formData, onFieldChange, isEdit
CacheNotice.svelte

Displays success/error messages
Auto-dismisses
Exports: message, error, onDismiss
types.ts

Provider interface
ProviderModelCache interface
Form data types
providers-store.ts

loadProviders()
refreshProviderData()
clearModelCache()
addProvider()
removeProvider()
saveProviderEdits()
Helper functions (formatDuration, modelPreview, cacheTooltip)
Lifecycle hooks (onMount, onDestroy) 4. Benefits of This Approach
✅ Reusable components - Can be used in other pages
✅ Separation of concerns - Logic, types, and UI are separated
✅ Testable - Each component can be tested independently
✅ Maintainable - Changes to one area don't affect others
✅ Consistent styling - CSS modules provide organized styling
✅ Type safety - Shared types ensure consistency

Would you like me to proceed with implementing this plan? I can start by creating the directory structure and extracting the components one by one.
