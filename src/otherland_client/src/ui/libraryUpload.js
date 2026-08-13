import { loadLibraryObjects, generateObjectId, readFileAsDataURL } from '../library.js';

/** Library tab upload handlers. */
export function initLibraryUpload() {
    const libraryUploadBtn = document.getElementById('library-upload-btn');
    const libraryUpload = document.getElementById('library-upload-input');
    const libraryDescription = document.getElementById('library-description-input');

    if (!libraryUploadBtn || !libraryUpload || !libraryDescription) return;

    libraryUploadBtn.addEventListener('click', async () => {
        const files = libraryUpload.files;
        if (files.length === 0) {
            document.getElementById('library-upload-message').textContent = 'No File selected to upload';
            document.getElementById('library-upload-message').style.display = 'block';
            return;
        }

        const file = files[0];
        const description = libraryDescription.value.trim();
        const maxFileSize = 100 * 1024 * 1024;

        if (file.size > maxFileSize) {
            document.getElementById('library-upload-message').textContent = `File exceeds the 100MB size limit.`;
            document.getElementById('library-upload-message').style.display = 'block';
        } else {
            try {
                const objectId = generateObjectId();
                const fileData = await readFileAsDataURL(file);

                const libraryObject = {
                    id: objectId,
                    filename: file.name,
                    description: description || file.name,
                    data: fileData,
                    uploadedAt: new Date().toISOString()
                };

                const stored = localStorage.getItem('libraryObjects');
                const libraryObjects = stored ? JSON.parse(stored) : [];
                libraryObjects.push(libraryObject);
                localStorage.setItem('libraryObjects', JSON.stringify(libraryObjects));

                document.getElementById('library-upload-message').textContent = 'File uploaded successfully!';
                document.getElementById('library-upload-message').style.display = 'block';
                console.log(`Uploaded ${file.name} to library with ID: ${objectId}`);
            } catch (error) {
                console.error('Error uploading file:', error);
                document.getElementById('library-upload-message').textContent = `Error uploading File: ${error.message}`;
                document.getElementById('library-upload-message').style.display = 'block';
            }
        }

        libraryUpload.value = '';
        libraryDescription.value = '';
        loadLibraryObjects();
    });
}
