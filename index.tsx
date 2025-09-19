/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality } from '@google/genai';

// IMPORTANT: The API key is sourced from the `process.env.API_KEY` environment variable.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Main image upload
const uploadButton = document.getElementById('upload-button') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const imagePreviewContainer = document.getElementById('image-preview-container') as HTMLDivElement;
const uploadPlaceholder = document.getElementById('upload-placeholder') as HTMLDivElement;

// Object/Item image upload
const objectUploadButton = document.getElementById('object-upload-button') as HTMLButtonElement;
const objectFileInput = document.getElementById('object-file-input') as HTMLInputElement;
const objectPreviewContainer = document.getElementById('object-preview-container') as HTMLDivElement;
const objectUploadPlaceholder = document.getElementById('object-upload-placeholder') as HTMLDivElement;

// Controls and results
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const versionCountInput = document.getElementById('version-count') as HTMLInputElement;
const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
const resultGallery = document.getElementById('result-gallery') as HTMLDivElement;
const undoButton = document.getElementById('undo-button') as HTMLButtonElement;
const redoButton = document.getElementById('redo-button') as HTMLButtonElement;

// Image Preview Modal
const imageModal = document.getElementById('image-modal') as HTMLDivElement;
const modalImage = document.getElementById('modal-image') as HTMLImageElement;
const modalCloseButton = imageModal.querySelector('.modal-close') as HTMLSpanElement;
const modalActionsContainer = document.getElementById('modal-actions') as HTMLDivElement;
const modalDimensions = document.getElementById('modal-dimensions') as HTMLParagraphElement;


type ImageData = { mimeType: string; data: string; };
type GeneratedImageData = ImageData & { url: string; width: number; height: number; };

let currentImages: ImageData[] = [];
let objectImage: ImageData | null = null;
let history: GeneratedImageData[][] = [[]];
let historyIndex = 0;

// A global flag to prevent multiple simultaneous AI actions.
let isActionInProgress = false;

function showLoading(container: HTMLElement, message: string) {
  container.innerHTML = `
    <div class="loading-indicator">
      <div class="spinner" aria-hidden="true"></div>
      <p class="loading-message" aria-live="polite">${message}</p>
    </div>
  `;
}

function showError(container: HTMLElement, message: string) {
  container.innerHTML = `<p class="error-message" aria-live="assertive">Lỗi: ${message}</p>`;
}

function clearContainer(container: HTMLElement, message?: string) {
    container.innerHTML = message ? `<p class="info-message">${message}</p>` : '';
}

function updateHistoryButtons() {
    undoButton.disabled = historyIndex <= 0;
    redoButton.disabled = historyIndex >= history.length - 1;
}

function createResultItem(imageData: GeneratedImageData, index: number): HTMLElement {
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';

    const img = new Image();
    img.src = imageData.url;
    img.alt = promptInput.value;
    img.addEventListener('click', () => openImagePreview(imageData, index));
    
    const dimensionsText = document.createElement('p');
    dimensionsText.className = 'image-dimensions';
    dimensionsText.textContent = `${imageData.width} x ${imageData.height}`;

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'result-item-actions';

    const downloadButton = document.createElement('button');
    downloadButton.textContent = 'Tải xuống';
    downloadButton.addEventListener('click', () => downloadImage(imageData));

    const sharpenBtn = document.createElement('button');
    sharpenBtn.textContent = 'Xóa mờ';
    sharpenBtn.className = 'secondary-button';
    sharpenBtn.addEventListener('click', () => sharpenImage(imageData, resultItem, index));

    const resizeBtn = document.createElement('button');
    resizeBtn.textContent = 'Sửa kích thước';
    resizeBtn.className = 'tertiary-button';
    resizeBtn.addEventListener('click', () => toggleResizeControls(imageData, resultItem, index));

    actionsContainer.appendChild(downloadButton);
    actionsContainer.appendChild(sharpenBtn);
    actionsContainer.appendChild(resizeBtn);
    
    resultItem.appendChild(img);
    resultItem.appendChild(dimensionsText);
    resultItem.appendChild(actionsContainer);
    
    return resultItem;
}

function renderCurrentHistoryState() {
    const currentResults = history[historyIndex];
    clearContainer(resultGallery);
    
    if (currentResults.length === 0) {
        clearContainer(resultGallery, 'Kết quả sẽ được hiển thị ở đây.');
    } else {
         currentResults.forEach((imageData, index) => {
            const resultItem = createResultItem(imageData, index);
            resultGallery.appendChild(resultItem);
        });
    }

    updateHistoryButtons();
}

function addHistoryState(newImages: GeneratedImageData[]) {
    history = history.slice(0, historyIndex + 1);
    history.push(newImages);
    historyIndex++;
    renderCurrentHistoryState();
}

// --- Image Preview Modal Functions ---

function openImagePreview(imageData: GeneratedImageData, index: number) {
    if (isActionInProgress) return;
    modalImage.src = imageData.url;
    modalDimensions.textContent = `${imageData.width} x ${imageData.height}`;
    modalActionsContainer.innerHTML = ''; // Clear previous actions

    // 1. Download Button
    const downloadButton = document.createElement('button');
    downloadButton.textContent = 'Tải xuống';
    downloadButton.addEventListener('click', () => downloadImage(imageData));

    // 2. Sharpen Button
    const sharpenBtn = document.createElement('button');
    sharpenBtn.textContent = 'Xóa mờ';
    sharpenBtn.className = 'secondary-button';
    sharpenBtn.addEventListener('click', () => {
        closeImagePreview();
        const galleryItems = resultGallery.querySelectorAll('.result-item');
        const itemToUpdate = galleryItems[index] as HTMLElement;
        if (itemToUpdate) {
            sharpenImage(imageData, itemToUpdate, index);
        }
    });

    // 3. Resize Button
    const resizeBtn = document.createElement('button');
    resizeBtn.textContent = 'Sửa kích thước';
    resizeBtn.className = 'tertiary-button';
    resizeBtn.addEventListener('click', () => {
        closeImagePreview();
        const galleryItems = resultGallery.querySelectorAll('.result-item');
        const itemToUpdate = galleryItems[index] as HTMLElement;
        if (itemToUpdate) {
            toggleResizeControls(imageData, itemToUpdate, index);
        }
    });

    modalActionsContainer.appendChild(downloadButton);
    modalActionsContainer.appendChild(sharpenBtn);
    modalActionsContainer.appendChild(resizeBtn);

    imageModal.classList.add('active');
}

function closeImagePreview() {
    imageModal.classList.remove('active');
    modalDimensions.textContent = '';
}

modalCloseButton.addEventListener('click', closeImagePreview);
imageModal.addEventListener('click', (event) => {
    // Close if the user clicks on the overlay itself, not the content inside
    if (event.target === imageModal) {
        closeImagePreview();
    }
});


// --- Event Listeners for File Inputs ---

uploadButton.addEventListener('click', () => fileInput.click());
objectUploadButton.addEventListener('click', () => objectFileInput.click());

fileInput.addEventListener('change', async (event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;
  
  generateButton.disabled = true;
  currentImages = [];
  imagePreviewContainer.innerHTML = '';
  uploadPlaceholder.classList.remove('hidden');

  const filePromises = Array.from(files).map(file => 
    new Promise<{ file: File; base64Data: string }>((resolve, reject) => {
        if (!file.type.startsWith('image/')) return reject(new Error('Chỉ chấp nhận tệp hình ảnh.'));
        const reader = new FileReader();
        reader.onload = () => resolve({ file, base64Data: (reader.result as string).split(',')[1]});
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    })
  );

  try {
    const results = await Promise.all(filePromises);
    currentImages = results.map(r => ({ mimeType: r.file.type, data: r.base64Data }));
    
    currentImages.forEach(imageData => {
        const previewWrapper = document.createElement('div');
        previewWrapper.className = 'preview-wrapper';

        const img = document.createElement('img');
        img.src = `data:${imageData.mimeType};base64,${imageData.data}`;
        img.classList.add('preview-image');
        img.alt = `Xem trước`;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.setAttribute('aria-label', 'Xóa ảnh');

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            const indexToRemove = currentImages.indexOf(imageData);
            if (indexToRemove > -1) {
                currentImages.splice(indexToRemove, 1);
            }
            
            previewWrapper.remove();

            if (currentImages.length === 0) {
                uploadPlaceholder.classList.remove('hidden');
                generateButton.disabled = true;
            }
        });

        previewWrapper.appendChild(img);
        previewWrapper.appendChild(deleteBtn);
        imagePreviewContainer.appendChild(previewWrapper);
    });

    if (currentImages.length > 0) {
        uploadPlaceholder.classList.add('hidden');
        generateButton.disabled = false;
    }
    
    history = [[]];
    historyIndex = 0;
    renderCurrentHistoryState();

  } catch (error) {
      console.error('Error reading files:', error);
      showError(resultGallery, 'Không thể đọc một hoặc nhiều tệp hình ảnh.');
      currentImages = [];
      generateButton.disabled = true;
  }
});

objectFileInput.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showError(objectPreviewContainer, 'Chỉ là ảnh.');
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        const base64Data = (reader.result as string).split(',')[1];
        objectImage = { mimeType: file.type, data: base64Data };

        objectPreviewContainer.innerHTML = '';
        
        const previewWrapper = document.createElement('div');
        previewWrapper.className = 'preview-wrapper';

        const img = document.createElement('img');
        img.src = `data:${file.type};base64,${base64Data}`;
        img.classList.add('preview-image');
        img.alt = `Xem trước ${file.name}`;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.setAttribute('aria-label', 'Xóa ảnh');
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            objectImage = null;
            objectPreviewContainer.innerHTML = '';
            objectUploadPlaceholder.classList.remove('hidden');
        });

        previewWrapper.appendChild(img);
        previewWrapper.appendChild(deleteBtn);
        objectPreviewContainer.appendChild(previewWrapper);

        objectUploadPlaceholder.classList.add('hidden');
    };
    reader.onerror = () => {
        showError(objectPreviewContainer, 'Lỗi đọc tệp.');
        objectImage = null;
    };
    reader.readAsDataURL(file);
});

// --- Helper Functions ---
function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = (err) => {
            console.error("Could not load image to get dimensions:", err);
            // Resolve with 0,0 so the app doesn't crash
            resolve({ width: 0, height: 0 });
        };
        img.src = url;
    });
}


// --- Core Image Processing Functions ---

/**
 * Generates an image using the Gemini API with a robust retry mechanism.
 * Uses exponential backoff for rate limit errors (429).
 * @param modelParams The parameters for the `generateContent` call.
 * @param context A context object for improved logging.
 * @returns The generated image data or null if all attempts fail.
 * @throws An error with message 'RATE_LIMIT' if all retries fail due to rate limiting.
 */
async function generateImageWithRetries(
    modelParams: any,
    context: { functionName: string; description: string }
): Promise<GeneratedImageData | null> {
    
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
        try {
            if (attempt > 0) {
                 console.log(`Retrying ${context.functionName} for "${context.description}" (attempt ${attempt + 1}/${maxAttempts})...`);
            }

            const response = await ai.models.generateContent(modelParams);

            if (response.promptFeedback?.blockReason) {
                console.error(`Prompt was blocked during ${context.functionName} for "${context.description}":`, response.promptFeedback);
                return null; // Non-retriable error.
            }

            const candidate = response.candidates?.[0];
            const imagePartResponse = candidate?.content?.parts?.find(p => p.inlineData);

            if (imagePartResponse?.inlineData) {
                const url = `data:${imagePartResponse.inlineData.mimeType};base64,${imagePartResponse.inlineData.data}`;
                const { width, height } = await getImageDimensions(url);
                return {
                    mimeType: imagePartResponse.inlineData.mimeType,
                    data: imagePartResponse.inlineData.data,
                    url,
                    width,
                    height,
                };
            } else {
                // This is a retriable failure. Throw an error to trigger the catch block.
                const textPartResponse = candidate?.content?.parts?.find(p => p.text);
                const errorMessage = `No image content returned during ${context.functionName} for "${context.description}".`;
                console.warn(`Attempt ${attempt + 1} failed: ${errorMessage}. Full candidate:`, JSON.stringify(candidate, null, 2));
                if (textPartResponse) {
                    console.warn(`Model text response: "${textPartResponse.text}"`);
                }
                throw new Error("NO_IMAGE_CONTENT");
            }
        } catch (error: any) {
            console.error(`An error occurred during attempt ${attempt + 1} for ${context.functionName} ("${context.description}"):`, error);
            
            if (attempt + 1 >= maxAttempts) {
                console.error(`Final attempt failed for "${context.description}".`);
                if (error.toString().includes('RESOURCE_EXHAUSTED')) {
                    throw new Error('RATE_LIMIT');
                }
                break; // Exit loop, will return null below
            }

            // Determine delay before next retry
            let delay = 1000 * (attempt + 1); // Default linear backoff for general errors
            if (error.toString().includes('RESOURCE_EXHAUSTED')) {
                // Exponential backoff for rate limit errors
                delay = (2 ** attempt) * 1000 + Math.floor(Math.random() * 1000);
                console.warn(`Rate limit hit. Waiting ${Math.round(delay/1000)}s before next attempt.`);
            }
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        attempt++;
    }

    console.error(`Failed to generate image for "${context.description}" after ${maxAttempts} attempts.`);
    return null;
}


async function processImages(prompt: string) {
  if (isActionInProgress) return;
  isActionInProgress = true;

  if (currentImages.length === 0) {
    showError(resultGallery, 'Vui lòng tải lên ít nhất một ảnh.');
    isActionInProgress = false;
    return;
  }

  const versionCount = Math.max(1, Math.min(4, parseInt(versionCountInput.value, 10) || 1));

  generateButton.disabled = true;
  undoButton.disabled = true;
  redoButton.disabled = true;
  clearContainer(resultGallery);
  
  const totalJobs = currentImages.length * versionCount;
  let jobsCompleted = 0;
  let successCount = 0;

  const progressTracker = document.createElement('div');
  progressTracker.className = 'progress-tracker';
  resultGallery.appendChild(progressTracker);

  const progressBar = document.createElement('progress') as HTMLProgressElement;
  progressBar.max = totalJobs;
  progressBar.value = 0;
  
  const progressText = document.createElement('p');
  progressText.className = 'info-message';
  
  const updateProgress = () => {
      progressBar.value = jobsCompleted;
      progressText.textContent = `Đã tạo ${successCount}/${jobsCompleted} ảnh (Tổng cộng ${totalJobs})...`;
  };
  
  progressTracker.appendChild(progressText);
  progressTracker.appendChild(progressBar);
  updateProgress();

  const newGeneratedImages: GeneratedImageData[] = [];
  const finalPrompt = `${prompt}, chất lượng 2K.`;

  try {
    for (let i = 0; i < currentImages.length; i++) {
      const image = currentImages[i];
      
      for (let j = 0; j < versionCount; j++) {
        const parts: ( {text: string} | {inlineData: {mimeType: string, data: string}} )[] = [
            { inlineData: { mimeType: image.mimeType, data: image.data } }
        ];
        if (objectImage) {
            parts.push({ inlineData: { mimeType: objectImage.mimeType, data: objectImage.data } });
        }
        parts.push({ text: finalPrompt });

        const modelParams = {
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: parts },
            config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        };

        const generatedImage = await generateImageWithRetries(modelParams, {
            functionName: 'processImages',
            description: `image ${i + 1}, version ${j + 1}`
        });
        
        jobsCompleted++;
        if (generatedImage) {
            successCount++;
            newGeneratedImages.push(generatedImage);
            const resultItem = createResultItem(generatedImage, newGeneratedImages.length - 1);
            resultGallery.appendChild(resultItem);
        }
        updateProgress();
      }
    }
    
    progressTracker.remove();

    if (newGeneratedImages.length > 0) {
        history = history.slice(0, historyIndex + 1);
        history.push(newGeneratedImages);
        historyIndex++;

        if (newGeneratedImages.length < totalJobs) {
            const warningMessage = document.createElement('p');
            warningMessage.className = 'warning-message';
            warningMessage.textContent = `Đã tạo ${newGeneratedImages.length}/${totalJobs} ảnh. Một số yêu cầu có thể đã bị chặn hoặc không thành công. Vui lòng kiểm tra console để biết chi tiết.`;
            resultGallery.prepend(warningMessage);
        }
    } else {
        showError(resultGallery, 'Không thể tạo bất kỳ hình ảnh nào. Mô hình có thể không trả về hình ảnh cho chỉ dẫn này hoặc yêu cầu đã bị chặn.');
    }
  } catch (error: any) {
    if (error.message === 'RATE_LIMIT') {
        showError(resultGallery, 'Dịch vụ hiện đang bận (đã đạt đến giới hạn tỷ lệ). Vui lòng đợi một lát và thử lại.');
    } else {
        console.error("Error in image generation loop:", error);
        showError(resultGallery, 'Đã xảy ra lỗi không mong muốn. Vui lòng kiểm tra console.');
    }
  } finally {
    progressTracker.remove();
    generateButton.disabled = false;
    updateHistoryButtons();
    isActionInProgress = false;
  }
}

async function sharpenImage(imageToSharpen: GeneratedImageData, resultItemElement: HTMLElement, imageIndex: number) {
    if (isActionInProgress) return;
    isActionInProgress = true;

    generateButton.disabled = true;
    undoButton.disabled = true;
    redoButton.disabled = true;
    
    const originalContent = resultItemElement.innerHTML;
    showLoading(resultItemElement, "Đang làm nét...");

    try {
        const sharpenPrompt = "Xóa mờ, tăng độ nét, làm rõ các chi tiết và nâng cấp lên độ phân giải cao, chất lượng 2K.";
        const imagePart = { inlineData: { mimeType: imageToSharpen.mimeType, data: imageToSharpen.data } };
        const textPart = { text: sharpenPrompt };
        
        const modelParams = {
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [imagePart, textPart] },
            config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        };

        const newImageData = await generateImageWithRetries(modelParams, {
            functionName: 'sharpenImage',
            description: `image index ${imageIndex}`
        });

        if (newImageData) {
            // Create a new history state with the updated image
            const newHistoryState = [...history[historyIndex]];
            newHistoryState[imageIndex] = newImageData;
            addHistoryState(newHistoryState);
        } else {
            throw new Error("Mô hình không trả về ảnh được làm nét sau nhiều lần thử.");
        }
    } catch (error: any) {
        console.error("Error sharpening image:", error);
        resultItemElement.innerHTML = originalContent; // Restore original content
        if (error.message === 'RATE_LIMIT') {
            alert('Không thể làm nét ảnh: Dịch vụ hiện đang bận. Vui lòng đợi và thử lại.');
        } else {
            alert(`Không thể làm nét ảnh: ${error.message}`);
        }
    } finally {
        generateButton.disabled = false;
        updateHistoryButtons();
        isActionInProgress = false;
    }
}

function downloadImage(imageData: GeneratedImageData) {
    const link = document.createElement('a');
    link.href = imageData.url;
    const extension = imageData.mimeType.split('/')[1] || 'png';
    
    const randomId = Math.floor(10000 + Math.random() * 90000);
    const today = new Date().toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    link.download = `${randomId}_${today}.${extension}`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- Inline Resize Functions ---

const ASPECT_RATIOS: { [key: string]: { w: number, h: number } } = {
    '16:9': { w: 1920, h: 1080 },
    '9:16': { w: 1080, h: 1920 },
    '4:3': { w: 1920, h: 1440 },
    '3:4': { w: 1440, h: 1920 },
    '1:1': { w: 1536, h: 1536 },
};

function toggleResizeControls(imageData: GeneratedImageData, resultItemElement: HTMLElement, index: number) {
    if (isActionInProgress) return;

    const existingControls = resultItemElement.querySelector('.inline-resize-controls');
    document.querySelectorAll('.inline-resize-controls').forEach(el => el.remove());

    if (existingControls) {
        return; // It was already open, and we just closed it.
    }

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'inline-resize-controls';
    controlsContainer.innerHTML = `
        <label for="aspect-ratio-select-${index}">Tỷ lệ:</label>
        <select id="aspect-ratio-select-${index}">
            <option value="16:9">16:9 (Ngang)</option>
            <option value="9:16">9:16 (Dọc)</option>
            <option value="4:3">4:3 (Ngang)</option>
            <option value="3:4">3:4 (Dọc)</option>
            <option value="1:1">1:1 (Vuông)</option>
            <option value="custom">Tùy chỉnh theo px</option>
        </select>
        <div class="inline-custom-dimensions">
            <div>
              <label for="custom-width-${index}">Rộng:</label>
              <input type="number" id="custom-width-${index}" placeholder="1920">
            </div>
            <div>
              <label for="custom-height-${index}">Cao:</label>
              <input type="number" id="custom-height-${index}" placeholder="1080">
            </div>
        </div>
        <div class="inline-resize-actions">
             <button id="resize-cancel-btn-${index}" class="tertiary-button">Hủy</button>
             <button id="resize-confirm-btn-${index}">Xác nhận</button>
        </div>
    `;
    
    resultItemElement.appendChild(controlsContainer);

    const aspectRatioSelect = document.getElementById(`aspect-ratio-select-${index}`) as HTMLSelectElement;
    const customWidthInput = document.getElementById(`custom-width-${index}`) as HTMLInputElement;
    const customHeightInput = document.getElementById(`custom-height-${index}`) as HTMLInputElement;
    const confirmButton = document.getElementById(`resize-confirm-btn-${index}`) as HTMLButtonElement;
    const cancelButton = document.getElementById(`resize-cancel-btn-${index}`) as HTMLButtonElement;

    const updateInputsFromRatio = () => {
        const ratio = aspectRatioSelect.value;
        if (ratio !== 'custom') {
            customWidthInput.value = ASPECT_RATIOS[ratio].w.toString();
            customHeightInput.value = ASPECT_RATIOS[ratio].h.toString();
        }
    };
    
    aspectRatioSelect.addEventListener('change', updateInputsFromRatio);
    customWidthInput.addEventListener('input', () => aspectRatioSelect.value = 'custom');
    customHeightInput.addEventListener('input', () => aspectRatioSelect.value = 'custom');

    cancelButton.addEventListener('click', () => controlsContainer.remove());
    confirmButton.addEventListener('click', async () => {
        let resizePrompt: string;
        const ratio = aspectRatioSelect.value;
        if (ratio === 'custom') {
            const w = customWidthInput.value;
            const h = customHeightInput.value;
            if (!w || !h || parseInt(w) <= 0 || parseInt(h) <= 0) {
                alert('Vui lòng nhập chiều rộng và chiều cao hợp lệ.');
                return;
            }
            resizePrompt = `Sửa kích thước ảnh thành ${w}x${h} pixels, chất lượng 2K.`;
        } else {
            resizePrompt = `Sửa kích thước ảnh theo tỷ lệ ${ratio}, chất lượng 2K.`;
        }
        await performResize(imageData, resultItemElement, index, resizePrompt);
    });
    
    // Set initial values
    updateInputsFromRatio();
}


async function performResize(imageData: GeneratedImageData, element: HTMLElement, index: number, resizePrompt: string) {
    if (isActionInProgress) return;
    isActionInProgress = true;
    
    generateButton.disabled = true;
    undoButton.disabled = true;
    redoButton.disabled = true;
    
    const originalContent = element.innerHTML;
    showLoading(element, "Đang sửa kích thước...");

    try {
        const imagePart = { inlineData: { mimeType: imageData.mimeType, data: imageData.data } };
        const textPart = { text: resizePrompt };

        const modelParams = {
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [imagePart, textPart] },
            config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        };

        const newImageData = await generateImageWithRetries(modelParams, {
            functionName: 'performResize',
            description: `image index ${index}`
        });

        if (newImageData) {
            const newHistoryState = [...history[historyIndex]];
            newHistoryState[index] = newImageData;
            addHistoryState(newHistoryState);
        } else {
            throw new Error("Mô hình không trả về ảnh sau khi sửa kích thước.");
        }
    } catch (error: any) {
        console.error("Error resizing image:", error);
        element.innerHTML = originalContent; // Restore
        if (error.message === 'RATE_LIMIT') {
            alert('Không thể sửa kích thước ảnh: Dịch vụ hiện đang bận. Vui lòng đợi và thử lại.');
        } else {
            alert(`Không thể sửa kích thước ảnh: ${error.message}`);
        }
    } finally {
        isActionInProgress = false;
        generateButton.disabled = false;
        updateHistoryButtons();
    }
}


// --- History and General Event Listeners ---

function handleUndo() {
    if (historyIndex > 0) {
        historyIndex--;
        renderCurrentHistoryState();
    }
}

function handleRedo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        renderCurrentHistoryState();
    }
}

generateButton.addEventListener('click', async () => {
    if (!promptInput.value) {
        showError(resultGallery, 'Vui lòng nhập chỉ dẫn.');
        return;
    }
    await processImages(promptInput.value);
});
undoButton.addEventListener('click', handleUndo);
redoButton.addEventListener('click', handleRedo);

// Initialize with default state
renderCurrentHistoryState();