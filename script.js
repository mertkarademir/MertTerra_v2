// DOM Elements
const foldersList = document.getElementById('foldersList');
const photosGrid = document.getElementById('photosGrid');
const newFolderBtn = document.getElementById('newFolderBtn');
const newSubfolderBtn = document.getElementById('newSubfolderBtn');
const folderModal = document.getElementById('folderModal');
const descriptionModal = document.getElementById('descriptionModal');
const deleteModal = document.getElementById('deleteModal');
const folderNameInput = document.getElementById('folderName');
const photoDescriptionInput = document.getElementById('photoDescription');
const createFolderBtn = document.getElementById('createFolderBtn');
const saveDescriptionBtn = document.getElementById('saveDescriptionBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const photoUpload = document.getElementById('photoUpload');
const uploadBtn = document.getElementById('uploadBtn');

// Global variables
let db;
let folders = [];
let currentFolder = null;
let isCreatingSubfolder = false;

// Database functions
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('PhotoBlogV4', 1);

        request.onerror = () => {
            console.error('Error opening database');
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('Database opened successfully');
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create folders store with visual parent ID
            if (!db.objectStoreNames.contains('folders')) {
                const foldersStore = db.createObjectStore('folders', { keyPath: 'id' });
                foldersStore.createIndex('visualParentId', 'visualParentId', { unique: false });
            }
            
            // Create photos store with folder ID and path
            if (!db.objectStoreNames.contains('photos')) {
                const photosStore = db.createObjectStore('photos', { keyPath: 'id' });
                photosStore.createIndex('folderId', 'folderId', { unique: false });
                photosStore.createIndex('folderPath', 'folderPath', { unique: false });
            }
        };
    });
}

function saveFolders() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['folders'], 'readwrite');
        const store = transaction.objectStore('folders');
        
        // Clear existing folders
        store.clear();
        
        // Add new folders
        folders.forEach(folder => {
            console.log('Saving folder:', {
                id: folder.id,
                name: folder.name,
                visualParentId: folder.visualParentId
            });
            store.add(folder);
        });
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

function loadFolders() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['folders'], 'readonly');
        const store = transaction.objectStore('folders');
        const request = store.getAll();
        
        request.onsuccess = () => {
            folders = request.result;
            console.log('Loaded folders:', folders);
            resolve(folders);
        };
        
        request.onerror = () => reject(request.error);
    });
}

function savePhotos(folderId, photos) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['photos'], 'readwrite');
        const store = transaction.objectStore('photos');
        
        // Clear existing photos for this specific folder only
        const index = store.index('folderId');
        const request = index.openCursor(IDBKeyRange.only(folderId));
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            } else {
                // Add new photos
                photos.forEach(photo => {
                    store.add(photo);
                });
                resolve();
            }
        };
        
        request.onerror = () => reject(request.error);
    });
}

function loadPhotos(folderId) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        const transaction = db.transaction(['photos'], 'readonly');
        const store = transaction.objectStore('photos');
        const index = store.index('folderId');
        const request = index.getAll(IDBKeyRange.only(folderId));
        
        request.onsuccess = () => {
            const photos = request.result;
            console.log(`Loaded ${photos.length} photos for folder ID ${folderId}`);
            resolve(photos);
        };
        
        request.onerror = () => {
            console.error('Error loading photos:', request.error);
            reject(request.error);
        };
    });
}

// Event handlers
async function createFolder() {
    const folderName = folderNameInput.value.trim();
    if (!folderName) {
        alert('Please enter a folder name');
        return;
    }

    const newFolder = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: folderName,
        visualParentId: isCreatingSubfolder ? currentFolder.id : null,
        photos: []
    };

    console.log('Creating new folder:', {
        id: newFolder.id,
        name: newFolder.name,
        visualParentId: newFolder.visualParentId
    });

    folders.push(newFolder);
    await saveFolders();
    updateFoldersList();
    folderModal.style.display = 'none';
    isCreatingSubfolder = false;
}

async function handleUpload() {
    console.log('Starting upload process...');
    const files = photoUpload.files;
    if (!files.length) {
        alert('Please select photos to upload');
        return;
    }

    if (!currentFolder) {
        alert('Please select a folder first');
        return;
    }

    // Check if this is a subfolder
    if (!currentFolder.visualParentId) {
        alert('Please select a subfolder to upload photos. You cannot upload directly to parent folders.');
        return;
    }

    console.log('Uploading to subfolder:', {
        folderId: currentFolder.id,
        folderName: currentFolder.name,
        parentId: currentFolder.visualParentId
    });

    try {
        for (const file of files) {
            console.log('Processing file:', file.name);
            const reader = new FileReader();
            
            await new Promise((resolve, reject) => {
                reader.onload = async (e) => {
                    try {
                        console.log('File read successfully, creating photo object...');
                        const photo = {
                            id: Date.now() + Math.floor(Math.random() * 1000),
                            name: file.name,
                            url: e.target.result,
                            description: '',
                            folderId: currentFolder.id
                        };

                        console.log('Saving photo to database:', photo);
                        const transaction = db.transaction(['photos'], 'readwrite');
                        const store = transaction.objectStore('photos');
                        
                        await new Promise((resolveStore, rejectStore) => {
                            const request = store.add(photo);
                            request.onsuccess = () => {
                                console.log('Photo saved successfully:', photo.id);
                                resolveStore();
                            };
                            request.onerror = (error) => {
                                console.error('Error saving photo:', error);
                                rejectStore(request.error);
                            };
                        });

                        resolve();
                    } catch (error) {
                        console.error('Error in reader.onload:', error);
                        reject(error);
                    }
                };

                reader.onerror = (error) => {
                    console.error('Error reading file:', error);
                    reject(reader.error);
                };
                reader.readAsDataURL(file);
            });
        }

        console.log('All files processed, reloading photos...');
        // Reload photos for the current subfolder
        currentFolder.photos = await loadPhotos(currentFolder.id);
        updatePhotosGrid();
        
    } catch (error) {
        console.error('Upload error:', error);
        alert('Error uploading photos. Please try again.');
    }

    photoUpload.value = '';
}

// Disable buttons initially
newFolderBtn.disabled = true;
newSubfolderBtn.disabled = true;
uploadBtn.disabled = true;

// Event Listeners
newFolderBtn.addEventListener('click', () => {
    isCreatingSubfolder = false;
    folderModal.style.display = 'block';
    folderNameInput.value = '';
});

newSubfolderBtn.addEventListener('click', () => {
    if (!currentFolder) {
        alert('Please select a parent folder first');
        return;
    }
    isCreatingSubfolder = true;
    folderModal.style.display = 'block';
    folderNameInput.value = '';
});

document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
        folderModal.style.display = 'none';
        descriptionModal.style.display = 'none';
        deleteModal.style.display = 'none';
    });
});

createFolderBtn.addEventListener('click', createFolder);
saveDescriptionBtn.addEventListener('click', saveDescription);
uploadBtn.addEventListener('click', handleUpload);
confirmDeleteBtn.addEventListener('click', confirmDelete);
cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.style.display = 'none';
    folderToDelete = null;
});

// Functions
function updateFoldersList() {
    foldersList.innerHTML = '';
    // Get root level folders
    const rootFolders = folders.filter(folder => !folder.visualParentId);
    rootFolders.forEach(folder => {
        const folderElement = createFolderElement(folder);
        foldersList.appendChild(folderElement);
    });
}

function createFolderElement(folder) {
    const div = document.createElement('div');
    div.className = 'folder-item';
    div.dataset.id = folder.id;
    div.dataset.isSubfolder = folder.visualParentId ? 'true' : 'false';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'folder-name';
    nameSpan.textContent = folder.name;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-folder';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        folderToDelete = folder;
        deleteModal.style.display = 'block';
    });

    div.appendChild(nameSpan);
    div.appendChild(deleteBtn);

    // Add click handler for folder selection
    div.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent event bubbling
        
        // Remove active class from all folders
        document.querySelectorAll('.folder-item').forEach(item => {
            item.classList.remove('active');
        });
        
        currentFolder = folder;
        div.classList.add('active');
        
        try {
            // Load photos for the selected folder
            const photos = await loadPhotos(folder.id);
            currentFolder.photos = photos;
            updatePhotosGrid();
            
            // Update the upload button state
            const uploadBtn = document.getElementById('uploadBtn');
            const photoUpload = document.getElementById('photoUpload');
            
            if (!folder.visualParentId) {
                uploadBtn.disabled = true;
                uploadBtn.title = 'Please select a subfolder to upload photos';
                uploadBtn.style.opacity = '0.5';
                uploadBtn.style.cursor = 'not-allowed';
            } else {
                uploadBtn.disabled = false;
                uploadBtn.title = 'Upload photos to this subfolder';
                uploadBtn.style.opacity = '1';
                uploadBtn.style.cursor = 'pointer';
            }
            
            // Save current folder ID to localStorage
            localStorage.setItem('currentFolderId', folder.id);
            
            // Update the current folder path display
            const folderPath = document.getElementById('currentFolderPath');
            if (folder.visualParentId) {
                const parentFolder = folders.find(f => f.id === folder.visualParentId);
                folderPath.textContent = `${parentFolder.name} > ${folder.name}`;
            } else {
                folderPath.textContent = folder.name;
            }
            
            console.log('Selected folder:', {
                id: folder.id,
                name: folder.name,
                photoCount: photos.length,
                isSubfolder: folder.visualParentId !== null
            });
        } catch (error) {
            console.error('Error loading folder:', error);
            alert('Error loading folder contents. Please try again.');
        }
    });

    // Add visual subfolders
    const subfolders = folders.filter(f => f.visualParentId === folder.id);
    if (subfolders.length > 0) {
        const subfolderList = document.createElement('div');
        subfolderList.className = 'subfolders';
        subfolders.forEach(subfolder => {
            const subfolderElement = createFolderElement(subfolder);
            subfolderList.appendChild(subfolderElement);
        });
        div.appendChild(subfolderList);
    }

    return div;
}

function updatePhotosGrid() {
    photosGrid.innerHTML = '';
    if (!currentFolder || !currentFolder.photos) return;

    // Add folder header
    const header = document.createElement('div');
    header.className = 'folder-header';
    header.innerHTML = `
        <h3>${currentFolder.name}</h3>
        <p>${currentFolder.photos.length} photos</p>
    `;
    photosGrid.appendChild(header);

    // Create photo grid container
    const gridContainer = document.createElement('div');
    gridContainer.className = 'photo-grid-container';

    // Only show photos that belong to this specific folder
    const folderPhotos = currentFolder.photos.filter(photo => photo.folderId === currentFolder.id);
    folderPhotos.forEach(photo => {
        const photoElement = createPhotoElement(photo);
        gridContainer.appendChild(photoElement);
    });

    photosGrid.appendChild(gridContainer);
}

function createPhotoElement(photo) {
    const div = document.createElement('div');
    div.className = 'photo-item';
    div.dataset.folderId = photo.folderId;

    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = photo.name;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-photo';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this photo?')) {
            await deletePhoto(photo.id);
        }
    });

    const description = document.createElement('div');
    description.className = 'photo-description';
    description.textContent = photo.description || 'Click to add description';

    div.appendChild(img);
    div.appendChild(deleteBtn);
    div.appendChild(description);

    div.addEventListener('click', () => {
        descriptionModal.style.display = 'block';
        photoDescriptionInput.value = photo.description || '';
        saveDescriptionBtn.dataset.photoId = photo.id;
    });

    return div;
}

async function saveDescription() {
    const photoId = parseInt(saveDescriptionBtn.dataset.photoId);
    const description = photoDescriptionInput.value.trim();
    
    const photo = currentFolder.photos.find(p => p.id === photoId);
    if (photo) {
        photo.description = description;
        updatePhotosGrid();
    }
    
    descriptionModal.style.display = 'none';
}

async function confirmDelete() {
    if (!folderToDelete) return;

    // Remove the folder and all its subfolders
    const removeFolderAndSubfolders = async (folderId) => {
        const folderIndex = folders.findIndex(f => f.id === folderId);
        if (folderIndex !== -1) {
            const folder = folders[folderIndex];
            
            // Delete all photos in this folder
            const transaction = db.transaction(['photos'], 'readwrite');
            const store = transaction.objectStore('photos');
            const index = store.index('folderId');
            const request = index.openCursor(IDBKeyRange.only(folderId));
            
            await new Promise((resolve) => {
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
            });

            // Remove all subfolders first
            const subfolders = folders.filter(f => f.visualParentId === folderId);
            for (const subfolder of subfolders) {
                await removeFolderAndSubfolders(subfolder.id);
            }
            
            // Remove the folder itself
            folders.splice(folderIndex, 1);
        }
    };

    await removeFolderAndSubfolders(folderToDelete.id);

    // Reset current folder if it was deleted
    if (currentFolder && currentFolder.id === folderToDelete.id) {
        currentFolder = null;
        photosGrid.innerHTML = '';
    }

    updateFoldersList();
    deleteModal.style.display = 'none';
    folderToDelete = null;
    await saveFolders();
}

async function deletePhoto(photoId) {
    if (!currentFolder) return;
    
    const photoIndex = currentFolder.photos.findIndex(p => p.id === photoId);
    if (photoIndex !== -1) {
        currentFolder.photos.splice(photoIndex, 1);
        updatePhotosGrid();
        await savePhotos(currentFolder.id, currentFolder.photos);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Starting initialization...');
    
    try {
        await openDB();
        await loadFolders();
        
        // Enable folder creation buttons
        const newFolderBtn = document.getElementById('newFolderBtn');
        const newSubfolderBtn = document.getElementById('newSubfolderBtn');
        const uploadBtn = document.getElementById('uploadBtn');
        const photoUpload = document.getElementById('photoUpload');
        
        newFolderBtn.disabled = false;
        newSubfolderBtn.disabled = false;
        
        // Initialize upload button state
        uploadBtn.disabled = true;
        uploadBtn.title = 'Please select a subfolder to upload photos';
        
        // Add event listener for file input change
        photoUpload.addEventListener('change', () => {
            if (photoUpload.files.length > 0 && !uploadBtn.disabled) {
                uploadBtn.style.opacity = '1';
                uploadBtn.style.cursor = 'pointer';
            } else {
                uploadBtn.style.opacity = '0.5';
                uploadBtn.style.cursor = 'not-allowed';
            }
        });
        
        const currentFolderId = localStorage.getItem('currentFolderId');
        if (currentFolderId) {
            currentFolder = folders.find(f => f.id === parseInt(currentFolderId));
            if (currentFolder) {
                currentFolder.photos = await loadPhotos(currentFolder.id);
                // Enable upload if it's a subfolder
                if (currentFolder.visualParentId) {
                    uploadBtn.disabled = false;
                    uploadBtn.title = 'Upload photos to this subfolder';
                    uploadBtn.style.opacity = '1';
                    uploadBtn.style.cursor = 'pointer';
                }
            }
        }
        
        updateFoldersList();
        if (currentFolder) {
            updatePhotosGrid();
        }
        
        console.log('Initialization complete');
    } catch (error) {
        console.error('Initialization error:', error);
        alert('Error initializing application. Please refresh the page.');
    }
}); 