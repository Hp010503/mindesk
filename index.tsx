/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality, GenerateContentResponse } from '@google/genai';

// IMPORTANT: The API key is sourced from the `process.env.API_KEY` environment variable.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const uploadButton = document.getElementById('upload-button') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const imagePreviewContainer = document.getElementById('image-preview-container') as HTMLDivElement;
const uploadPlaceholder = document.getElementById('upload-placeholder') as HTMLDivElement;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
const resultGallery = document.getElementById('result-gallery') as HTMLDivElement;
const undoButton = document.getElementById('undo-button') as HTMLButtonElement;
const redoButton = document.getElementById('redo-button') as HTMLButtonElement;

// Video elements
const videoGenerationSection = document.getElementById('video-generation-section') as HTMLDivElement;
const videoPromptInput = document.getElementById('video-prompt-input') as HTMLTextAreaElement;
const generateVideoButton = document.getElementById('generate-video-button') as HTMLButtonElement;
const videoResultContainer = document.getElementById('video-result-container') as HTMLDivElement;

type ImageData = { mimeType: string; data: string; };
type GeneratedImageData = ImageData & { url: string };

let currentImages: ImageData[] = [];
let selectedGeneratedImage: GeneratedImageData | null = null;
let history: GeneratedImageData[][] = [[]];
let historyIndex = 0;

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

function renderCurrentHistoryState() {
    const currentResults = history[historyIndex];
    clearContainer(resultGallery);
    
    if (currentResults.length === 0) {
        clearContainer(resultGallery, 'Kết quả sẽ được hiển thị ở đây.');
    } else {
         currentResults.forEach(imageData => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';

            const img = new Image();
            img.src = imageData.url;
            img.alt = promptInput.value;
            img.addEventListener('click', () => selectImageForVideo(imageData, img));
            
            const downloadButton = document.createElement('button');
            downloadButton.textContent = 'Tải xuống';
            downloadButton.className = 'download-button';
            downloadButton.addEventListener('click', () => downloadImage(imageData));
            
            resultItem.appendChild(img);
            resultItem.appendChild(downloadButton);
            resultGallery.appendChild(resultItem);
        });
    }

    // Reset video section if no images are selected
    videoGenerationSection.classList.add('hidden');
    selectedGeneratedImage = null;

    updateHistoryButtons();
}

function addHistoryState(newImages: GeneratedImageData[]) {
    // Truncate future history if we've undone
    history = history.slice(0, historyIndex + 1);
    history.push(newImages);
    historyIndex++;
    renderCurrentHistoryState();
}

// Trigger file input when upload button is clicked
uploadButton.addEventListener('click', () => fileInput.click());

// Handle file selection
fileInput.addEventListener('change', async (event) => {
  const target = event.target as HTMLInputElement;
  const files = target.files;

  if (!files || files.length === 0) {
    return;
  }
  
  generateButton.disabled = true;
  currentImages = [];
  imagePreviewContainer.innerHTML = '';
  uploadPlaceholder.classList.remove('hidden');

  const filePromises = Array.from(files).map(file => {
    return new Promise<{ file: File; base64Data: string }>((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            console.warn(`Skipping non-image file: ${file.name}`);
            reject(new Error('Chỉ chấp nhận tệp hình ảnh.'));
            return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve({ file, base64Data: (reader.result as string).split(',')[1]});
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
  });

  try {
    const results = await Promise.all(filePromises);
    
    currentImages = results.map(result => ({
      mimeType: result.file.type,
      data: result.base64Data,
    }));
    
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
    
    // Reset history for new images
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

async function generateImage() {
  if (currentImages.length === 0 || !promptInput.value) {
    showError(resultGallery, 'Vui lòng tải lên ít nhất một ảnh và nhập chỉ dẫn.');
    return;
  }

  generateButton.disabled = true;
  undoButton.disabled = true;
  redoButton.disabled = true;
  generateVideoButton.disabled = true;
  videoGenerationSection.classList.add('hidden');
  clearContainer(resultGallery);
  clearContainer(videoResultContainer);
  selectedGeneratedImage = null;
  
  const statusMessage = document.createElement('p');
  statusMessage.className = 'info-message';
  resultGallery.appendChild(statusMessage);

  const generatedImages: GeneratedImageData[] = [];

  try {
    for (let i = 0; i < currentImages.length; i++) {
      const image = currentImages[i];
      statusMessage.textContent = `Đang xử lý ảnh ${i + 1} trên ${currentImages.length}...`;
      
      try {
        const imagePart = { inlineData: { mimeType: image.mimeType, data: image.data } };
        const textPart = { text: promptInput.value };
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [imagePart, textPart] },
            config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        });

        const imagePartResponse = response.candidates[0]?.content?.parts?.find(p => p.inlineData);
        if (imagePartResponse && imagePartResponse.inlineData) {
            const imageData: GeneratedImageData = {
                mimeType: imagePartResponse.inlineData.mimeType,
                data: imagePartResponse.inlineData.data,
                url: `data:${imagePartResponse.inlineData.mimeType};base64,${imagePartResponse.inlineData.data}`,
            };
            generatedImages.push(imageData);
        } else {
             console.error(`No image content returned for image ${i + 1}.`);
        }
      } catch (innerError) {
          console.error(`Error generating image ${i + 1}:`, innerError);
      }
    }

    if (generatedImages.length > 0) {
        addHistoryState(generatedImages);
    } else {
        showError(resultGallery, 'Không thể tạo bất kỳ hình ảnh nào. Mô hình có thể không trả về hình ảnh cho chỉ dẫn này.');
    }

  } catch (error) {
    console.error("Error in image generation loop:", error);
    showError(resultGallery, 'Đã xảy ra lỗi không mong muốn. Vui lòng kiểm tra console.');
  } finally {
    generateButton.disabled = false;
    updateHistoryButtons(); // Re-enable undo/redo if applicable
  }
}

function selectImageForVideo(imageData: GeneratedImageData, imgElement: HTMLImageElement) {
    document.querySelectorAll('#result-gallery .result-item img').forEach(img => {
        img.classList.remove('selected');
    });
    
    imgElement.classList.add('selected');
    selectedGeneratedImage = imageData;

    videoGenerationSection.classList.remove('hidden');
    generateVideoButton.disabled = false;
    clearContainer(videoResultContainer);
}

async function generateVideo() {
    if (!selectedGeneratedImage || !videoPromptInput.value) {
        showError(videoResultContainer, 'Vui lòng chọn một ảnh và nhập chỉ dẫn cho video trước.');
        return;
    }

    generateButton.disabled = true;
    generateVideoButton.disabled = true;
    undoButton.disabled = true;
    redoButton.disabled = true;
    showLoading(videoResultContainer, 'Đang tạo video... Quá trình này có thể mất vài phút.');

    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: videoPromptInput.value,
            image: {
                imageBytes: selectedGeneratedImage.data,
                mimeType: selectedGeneratedImage.mimeType,
            },
            config: { numberOfVideos: 1 }
        });

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
            throw new Error('Không tìm thấy URI video trong phản hồi.');
        }

        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        if (!response.ok) {
            throw new Error(`Lỗi khi tải video: ${response.statusText}`);
        }
        
        const videoBlob = await response.blob();
        const videoUrl = URL.createObjectURL(videoBlob);

        clearContainer(videoResultContainer);
        
        const videoElement = document.createElement('video');
        videoElement.src = videoUrl;
        videoElement.controls = true;
        videoResultContainer.appendChild(videoElement);

        const videoDownloadLink = document.createElement('a');
        videoDownloadLink.href = videoUrl;
        videoDownloadLink.textContent = 'Tải xuống video';
        videoDownloadLink.download = 'generated-video.mp4';
        videoDownloadLink.className = 'button';
        videoResultContainer.appendChild(videoDownloadLink);

    } catch (error) {
        console.error("Error generating video:", error);
        showError(videoResultContainer, 'Không thể tạo video. Vui lòng kiểm tra console để biết chi tiết.');
    } finally {
        generateButton.disabled = false;
        generateVideoButton.disabled = false;
        updateHistoryButtons();
    }
}

function downloadImage(imageData: GeneratedImageData) {
    const link = document.createElement('a');
    link.href = imageData.url;
    const extension = imageData.mimeType.split('/')[1] || 'png';
    link.download = `generated-image.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

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

generateButton.addEventListener('click', generateImage);
generateVideoButton.addEventListener('click', generateVideo);
undoButton.addEventListener('click', handleUndo);
redoButton.addEventListener('click', handleRedo);

// Initialize with default state
renderCurrentHistoryState();
