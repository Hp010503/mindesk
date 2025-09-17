/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality } from '@google/genai';

let ai: GoogleGenAI;

// --- DOM Elements ---

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
const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
const resultGallery = document.getElementById('result-gallery') as HTMLDivElement;
const undoButton = document.getElementById('undo-button') as HTMLButtonElement;
const redoButton = document.getElementById('redo-button') as HTMLButtonElement;

// API Key management
const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
const saveApiKeyButton = document.getElementById('save-api-key-button') as HTMLButtonElement;
const DEFAULT_API_KEY = "AIzaSyDb12dmxIo09j7ht5UCiMl9WH8AMQATlLM";

// Image Preview Modal
const imageModal = document.getElementById('image-modal') as HTMLDivElement;
const modalImage = document.getElementById('modal-image') as HTMLImageElement;
const modalCloseButton = imageModal.querySelector('.modal-close') as HTMLSpanElement;
const modalActionsContainer = document.getElementById('modal-actions') as HTMLDivElement;
const modalDimensions = document.getElementById('modal-dimensions') as HTMLParagraphElement;

// --- State Variables ---

type ImageData = { mimeType: string; data: string; };
type GeneratedImageData = ImageData & { url: string; width: number; height: number; };

let currentImages: ImageData[] = [];
let objectImage: ImageData | null = null;
let history: GeneratedImageData[][] = [[]];
let historyIndex = 0;
let isActionInProgress = false; // Global action lock

// --- API Key Handling ---

function initializeAndSaveApiKey(key: string) {
    if (!key) {
        alert("Khóa API không được để trống.");
        return;
    }
    ai = new GoogleGenAI({ apiKey: key });
    localStorage.setItem('gemini-api-key', key);
    apiKeyInput.value = key;
    // Optional: Add a small visual confirmation
    const originalButtonText = saveApiKeyButton.textContent;
    saveApiKeyButton.textContent = 'Đã lưu!';
    setTimeout(() => {
        saveApiKeyButton.textContent = originalButtonText;
    }, 2000);
}

saveApiKeyButton.addEventListener('click', () => {
    initializeAndSaveApiKey(apiKeyInput.value.trim());
});

// --- UI Helper Functions ---

function showLoading(container: HTMLElement, message: string) {
  container.innerHTML = `
    <div class="spinner" aria-hidden="true"></div>
    <p class="loading-message" aria-live="polite">${message}</p>
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

// --- Rendering and History ---

function renderCurrentHistoryState() {
    const currentResults = history[historyIndex];
    clearContainer(resultGallery);
    
    if (currentResults.length === 0) {
        clearContainer(resultGallery, 'Kết quả sẽ được hiển thị ở đây.');
    } else {
         currentResults.forEach((imageData, index) => {
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
    
    results.forEach(result => {
        const img = document.createElement('img');
        img.src = `data:${result.file.type};base64,${result.base64Data}`;
        img.classList.add('preview-image');
        img.alt = `Xem trước ${result.file.name}`;
        imagePreviewContainer.appendChild(img);
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
        const img = document.createElement('img');
        img.src = `data:${file.type};base64,${base64Data}`;
        img.classList.add('preview-image');
        img.alt = `Xem trước ${file.name}`;
        objectPreviewContainer.appendChild(img);
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

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> {
  let attempt = 0;
  let delay = initialDelay;

  while (attempt < maxRetries) {
    try {
      return await fn(); // Attempt the function
    } catch (error) {
      attempt++;
      const errorMessage = (error as Error).message.toLowerCase();
      const isServerError = errorMessage.includes('status: 50') || errorMessage.includes('internal error');

      if (isServerError && attempt < maxRetries) {
        console.warn(`Attempt ${attempt} failed with a server error. Retrying in ${delay}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
  throw new Error("Retry mechanism failed unexpectedly.");
}


async function processImages(prompt: string) {
  if (isActionInProgress) return;
  isActionInProgress = true;

  if (currentImages.length === 0) {
    showError(resultGallery, 'Vui lòng tải lên ít nhất một ảnh.');
    isActionInProgress = false;
    return;
  }
  if (!ai) {
    showError(resultGallery, 'Khóa API chưa được khởi tạo. Vui lòng nhập và lưu khóa.');
    isActionInProgress = false;
    return;
  }

  generateButton.disabled = true;
  undoButton.disabled = true;
  redoButton.disabled = true;
  clearContainer(resultGallery);
  
  const statusMessage = document.createElement('p');
  statusMessage.className = 'info-message';
  resultGallery.appendChild(statusMessage);

  const generatedImages: GeneratedImageData[] = [];
  const qualityInstruction = "Hãy chắc chắn rằng hình ảnh cuối cùng có chất lượng cao, siêu chi tiết, và sắc nét, với độ phân giải gần 2K (ví dụ: 1440x2560 cho ảnh dọc 9:16).";
  const finalPrompt = `${prompt} ${qualityInstruction}`;

  try {
    for (let i = 0; i < currentImages.length; i++) {
      const image = currentImages[i];
      statusMessage.textContent = `Đang xử lý ảnh ${i + 1} trên ${currentImages.length}...`;
      
      try {
        const parts: ( {text: string} | {inlineData: {mimeType: string, data: string}} )[] = [
            { inlineData: { mimeType: image.mimeType, data: image.data } }
        ];
        if (objectImage) {
            parts.push({ inlineData: { mimeType: objectImage.mimeType, data: objectImage.data } });
        }
        parts.push({ text: finalPrompt });

        const response = await withRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: parts },
            config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        }));

        if (response.promptFeedback?.blockReason) {
            console.error(`Prompt was blocked for image ${i + 1}:`, response.promptFeedback);
            continue; 
        }

        const candidate = response.candidates?.[0];
        if (!candidate) {
            console.error(`No candidates returned for image ${i + 1}:`, response);
            continue;
        }
        
        const imagePartResponse = candidate.content?.parts?.find(p => p.inlineData);

        if (imagePartResponse?.inlineData) {
            const url = `data:${imagePartResponse.inlineData.mimeType};base64,${imagePartResponse.inlineData.data}`;
            const { width, height } = await getImageDimensions(url);
            const imageData: GeneratedImageData = {
                mimeType: imagePartResponse.inlineData.mimeType,
                data: imagePartResponse.inlineData.data,
                url,
                width,
                height,
            };
            generatedImages.push(imageData);
        } else {
             console.error(`No image content returned for image ${i + 1}. Full candidate:`, candidate);
        }
      } catch (innerError) {
          console.error(`Error generating image ${i + 1} after retries:`, innerError);
      }
    }

    if (generatedImages.length > 0) {
        addHistoryState(generatedImages);
    } else {
        showError(resultGallery, 'Không thể tạo bất kỳ hình ảnh nào. Mô hình có thể không trả về hình ảnh cho chỉ dẫn này hoặc yêu cầu đã bị chặn.');
        renderCurrentHistoryState(); // show previous state if generation fails
    }
  } catch (error) {
    console.error("Error in image generation loop:", error);
    showError(resultGallery, 'Đã xảy ra lỗi không mong muốn. Vui lòng kiểm tra console.');
  } finally {
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
        const sharpenPrompt = "Xóa mờ, tăng độ nét, làm rõ các chi tiết và nâng cấp lên độ phân giải cao. Hãy chắc chắn rằng hình ảnh cuối cùng có chất lượng cao, siêu chi tiết, và sắc nét, với độ phân giải gần 2K.";
        const imagePart = { inlineData: { mimeType: imageToSharpen.mimeType, data: imageToSharpen.data } };
        const textPart = { text: sharpenPrompt };
        
        const response = await withRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [imagePart, textPart] },
            config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        }));

        if (response.promptFeedback?.blockReason) {
            console.error("Prompt was blocked during sharpening:", response.promptFeedback);
            throw new Error(`Yêu cầu làm nét ảnh đã bị chặn: ${response.promptFeedback.blockReason}`);
        }

        const candidate = response.candidates?.[0];
        if (!candidate) {
            console.error("No candidates returned from the model during sharpening:", response);
            throw new Error("Mô hình không trả về kết quả hợp lệ khi làm nét.");
        }

        const imagePartResponse = candidate.content?.parts?.find(p => p.inlineData);
        if (imagePartResponse?.inlineData) {
            const url = `data:${imagePartResponse.inlineData.mimeType};base64,${imagePartResponse.inlineData.data}`;
            const { width, height } = await getImageDimensions(url);
            const newImageData: GeneratedImageData = {
                mimeType: imagePartResponse.inlineData.mimeType,
                data: imagePartResponse.inlineData.data,
                url,
                width,
                height,
            };
            const newHistoryState = [...history[historyIndex]];
            newHistoryState[imageIndex] = newImageData;
            addHistoryState(newHistoryState);
        } else {
            const textPartResponse = candidate.content?.parts?.find(p => p.text);
            console.error("Model did not return a sharpened image. Full response candidate:", candidate);
            if (textPartResponse) {
                console.error("Model text response:", textPartResponse.text);
                throw new Error(`Mô hình không trả về ảnh. Phản hồi văn bản: "${textPartResponse.text}"`);
            } else {
                throw new Error("Mô hình không trả về ảnh được làm nét.");
            }
        }
    } catch (error) {
        console.error("Error sharpening image:", error);
        resultItemElement.innerHTML = originalContent;
        alert(`Không thể làm nét ảnh sau nhiều lần thử: ${error.message}`);
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
        const qualityInstruction = "Hãy chắc chắn rằng hình ảnh cuối cùng có chất lượng cao, siêu chi tiết, và sắc nét, với độ phân giải gần 2K.";

        if (ratio === 'custom') {
            const w = customWidthInput.value;
            const h = customHeightInput.value;
            if (!w || !h || parseInt(w) <= 0 || parseInt(h) <= 0) {
                alert('Vui lòng nhập chiều rộng và chiều cao hợp lệ.');
                return;
            }
            resizePrompt = `Mở rộng hoặc cắt ảnh để có kích thước chính xác là ${w} x ${h} pixels. Vẽ thêm chi tiết một cách tự nhiên vào các vùng được mở rộng nếu cần. ${qualityInstruction}`;
        } else {
            resizePrompt = `Mở rộng hoặc cắt ảnh để có tỷ lệ khung hình chính xác là ${ratio}. Vẽ thêm chi tiết một cách tự nhiên vào các vùng được mở rộng nếu cần. ${qualityInstruction}`;
        }
        await performResize(imageData, resultItemElement, index, resizePrompt);
    });
    
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

        const response = await withRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [imagePart, textPart] },
            config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        }));

        if (response.promptFeedback?.blockReason) {
             throw new Error(`Yêu cầu sửa kích thước đã bị chặn: ${response.promptFeedback.blockReason}`);
        }
        const candidate = response.candidates?.[0];
        const imagePartResponse = candidate?.content?.parts?.find(p => p.inlineData);

        if (imagePartResponse?.inlineData) {
            const url = `data:${imagePartResponse.inlineData.mimeType};base64,${imagePartResponse.inlineData.data}`;
            const { width, height } = await getImageDimensions(url);
            const newImageData: GeneratedImageData = {
                mimeType: imagePartResponse.inlineData.mimeType,
                data: imagePartResponse.inlineData.data,
                url,
                width,
                height,
            };
            const newHistoryState = [...history[historyIndex]];
            newHistoryState[index] = newImageData;
            addHistoryState(newHistoryState);
        } else {
            throw new Error("Mô hình không trả về ảnh sau khi sửa kích thước.");
        }
    } catch (error) {
        console.error("Error resizing image:", error);
        element.innerHTML = originalContent; // Restore
        alert(`Không thể sửa kích thước ảnh sau nhiều lần thử: ${error.message}`);
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

// --- Initialization ---
function initializeApp() {
    const savedApiKey = localStorage.getItem('gemini-api-key') || DEFAULT_API_KEY;
    initializeAndSaveApiKey(savedApiKey);
    renderCurrentHistoryState();
}

initializeApp();
