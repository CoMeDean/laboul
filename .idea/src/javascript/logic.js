const folderInput = document.getElementById('folder-input');
const selectFolderBtn = document.getElementById('select-folder-btn');
const fileSpace = document.getElementById('file-list');
const previewContainer = document.getElementById('sample-preview');

const tagNameInput = document.getElementById('tag-name-input');
const addTagButton = document.getElementById('add-tag-button');
const tagsContainer = document.getElementById('tags-container');

const saveBtn = document.getElementById('save-tagged-btn');

// --- 修改：哈希计算辅助函数，计算两个哈希 ---
async function calculateHashes(file) {
    const buffer = await file.arrayBuffer();
    // 第一个哈希 (SHA-256)
    const hashBuffer1 = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray1 = Array.from(new Uint8Array(hashBuffer1));
    const hash1 = hashArray1.map(b => b.toString(16).padStart(2, '0')).join('');
    // 第二个哈希 (SHA-1)
    const hashBuffer2 = await crypto.subtle.digest('SHA-1', buffer);
    const hashArray2 = Array.from(new Uint8Array(hashBuffer2));
    const hash2 = hashArray2.map(b => b.toString(16).padStart(2, '0')).join('');

    return { hash1, hash2 };
}

// 修改：数据结构，增加一个用于碰撞检测的Map
let imageCollection = new Map();
let firstHashCounts = new Map();


// --- 标签管理 (左侧面板) ---

addTagButton.addEventListener('click', () => {
    const tagName = tagNameInput.value.trim();
    if (tagName) {
        createTag(tagName);
        tagNameInput.value = '';
    }
});

tagNameInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') addTagButton.click();
});

function createTag(name) {
    if (document.querySelector(`.tag-item[data-tag-name="${name}"]`)) {
        return;
    }
    const tagElement = document.createElement('div');
    tagElement.className = 'tag-item';
    tagElement.dataset.tagName = name;
    tagElement.draggable = true;
    tagElement.textContent = name;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-tag-btn';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        tagElement.remove();
        removeTagFromAllImages(name);
    });

    tagElement.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', name);
        event.dataTransfer.effectAllowed = 'move';
    });

    tagElement.appendChild(deleteBtn);
    tagsContainer.appendChild(tagElement);
}

function removeTagFromAllImages(tagName) {
    document.querySelectorAll('.processed-file').forEach(container => {
        let tags = getTagsForContainer(container);
        if (tags.includes(tagName)) {
            tags = tags.filter(t => t !== tagName);
            updateTagsForContainer(container, tags);
        }
    });
}

// --- 图像处理 (右侧面板) ---

selectFolderBtn.addEventListener('click', () => folderInput.click());

// 修改：文件夹选择事件处理，实现双哈希处理
folderInput.addEventListener('change', async (event) => {
    // 1. 清理状态
    fileSpace.innerHTML = '';
    previewContainer.innerHTML = '<h2>预览图</h2>';
    tagsContainer.innerHTML = '';
    imageCollection.clear();
    firstHashCounts.clear();

    const files = Array.from(event.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    fileSpace.innerHTML = '<p>正在计算双哈希并处理图片，请稍候...</p>';

    // 2. 异步处理所有文件
    const processingPromises = files.map(async (file) => {
        const { hash1, hash2 } = await calculateHashes(file);
        const pathParts = file.webkitRelativePath.split('/');
        let tag = null;

        if (pathParts.length > 2) {
            const subfolder = pathParts[pathParts.length - 2];
            if (subfolder.toLowerCase() !== 'untagged') {
                tag = subfolder;
            }
        }
        return { hash1, hash2, file, tag };
    });

    const processedFilesInfo = await Promise.all(processingPromises);

    // 3. 根据双哈希整合图片和标签
    processedFilesInfo.forEach(({ hash1, hash2, file, tag }) => {
        const compositeKey = `${hash1}_${hash2}`; // 使用 "hash1_hash2" 作为唯一键
        if (!imageCollection.has(compositeKey)) {
            imageCollection.set(compositeKey, { file, tags: new Set(), hash1 });
        }
        if (tag) {
            imageCollection.get(compositeKey).tags.add(tag);
        }
    });

    // 4. 计算一级哈希的碰撞情况
    imageCollection.forEach((data) => {
        firstHashCounts.set(data.hash1, (firstHashCounts.get(data.hash1) || 0) + 1);
    });

    fileSpace.innerHTML = '';

    // 5. 创建UI元素
    const allTags = new Set();
    imageCollection.forEach((data, compositeKey) => {
        const initialTags = Array.from(data.tags);
        initialTags.forEach(t => allTags.add(t));
        createImageContainer(data.file, compositeKey, initialTags);
    });

    // 6. 创建标签列表
    allTags.forEach(name => createTag(name));
});


// 修改：createImageContainer，使用复合哈希键作为ID
function createImageContainer(file, compositeKey, initialTags) {
    const fileContainer = document.createElement('div');
    fileContainer.className = 'processed-file';
    fileContainer.dataset.imageKey = compositeKey; // 后台唯一ID

    const thumb = document.createElement('img');
    thumb.src = URL.createObjectURL(file);
    thumb.alt = file.name;

    const tagsDisplay = document.createElement('div');
    tagsDisplay.className = 'image-tags-container';
    
    // 不再显示文件名
    fileContainer.append(thumb, tagsDisplay);

    fileContainer.addEventListener('click', () => {
        document.querySelectorAll('.processed-file.active').forEach(el => el.classList.remove('active'));
        fileContainer.classList.add('active');
        const previewImg = document.createElement('img');
        previewImg.src = URL.createObjectURL(file);
        previewContainer.innerHTML = '<h2>预览图</h2>';
        previewContainer.appendChild(previewImg);
    });

    // 拖放事件
    fileContainer.addEventListener('dragenter', e => {
        e.preventDefault();
        fileContainer.classList.add('drag-over');
    });
    fileContainer.addEventListener('dragover', e => e.preventDefault());
    fileContainer.addEventListener('dragleave', () => fileContainer.classList.remove('drag-over'));
    fileContainer.addEventListener('drop', e => {
        e.preventDefault();
        fileContainer.classList.remove('drag-over');
        const newTagName = e.dataTransfer.getData('text/plain');
        
        const currentTags = getTagsForContainer(fileContainer);
        if (!currentTags.includes(newTagName)) {
            currentTags.push(newTagName);
            updateTagsForContainer(fileContainer, currentTags);
        }
    });

    fileSpace.appendChild(fileContainer);
    updateTagsForContainer(fileContainer, initialTags);
}


// --- 辅助函数，用于管理图像上的标签 ---

function getTagsForContainer(container) {
    const tagsStr = container.dataset.tags || '';
    return tagsStr ? tagsStr.split(',') : [];
}

function updateTagsForContainer(container, tags) {
    container.dataset.tags = tags.join(',');
    renderTagsOnImage(container);
}

function renderTagsOnImage(container) {
    const tagsDisplay = container.querySelector('.image-tags-container');
    tagsDisplay.innerHTML = '';
    const tags = getTagsForContainer(container);

    tags.forEach(tagName => {
        const tagPill = document.createElement('span');
        tagPill.className = 'image-tag-pill';
        tagPill.textContent = tagName;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-image-tag-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', e => {
            e.stopPropagation();
            let currentTags = getTagsForContainer(container);
            currentTags = currentTags.filter(t => t !== tagName);
            updateTagsForContainer(container, currentTags);
        });

        tagPill.appendChild(removeBtn);
        tagsDisplay.appendChild(tagPill);
    });
}

// --- 修改：保存功能，实现新的命名规则 ---
saveBtn.addEventListener('click', () => {
    if (typeof JSZip === 'undefined' || typeof saveAs === 'undefined') {
        alert('错误：保存功能所需的库未能加载。');
        return;
    }

    if (imageCollection.size === 0) {
        alert('请先选择一个主文件夹并加载图片。');
        return;
    }

    const zip = new JSZip();

    document.querySelectorAll('.processed-file').forEach(container => {
        const compositeKey = container.dataset.imageKey;
        const imageData = imageCollection.get(compositeKey);

        if (imageData) {
            const file = imageData.file;
            const tags = getTagsForContainer(container);
            const [hash1, hash2] = compositeKey.split('_');

            // 检查一级哈希是否有碰撞
            const isCollided = firstHashCounts.get(hash1) > 1;

            // 根据碰撞情况确定文件名
            const baseFileName = isCollided ? `${hash1}+${hash2}` : hash1;
            
            const originalName = file.name;
            const extension = originalName.slice(originalName.lastIndexOf('.'));
            const newFileName = `${baseFileName}${extension}`;

            if (tags.length > 0) {
                tags.forEach(tagName => {
                    zip.folder(tagName).file(newFileName, file);
                });
            } else {
                zip.folder('untagged').file(newFileName, file);
            }
        }
    });

    if (Object.keys(zip.files).length === 0) {
        alert('没有可以保存的图片。');
        return;
    }

    zip.generateAsync({ type: 'blob' })
       .then(content => {
           saveAs(content, 'processed_images.zip');
       });
});