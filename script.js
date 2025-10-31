document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const uploadArea = document.getElementById('upload-area');
    const formatSelect = document.getElementById('format');
    const qualitySelect = document.getElementById('quality');
    const convertButton = document.getElementById('convert-button');
    const btnText = document.querySelector('.btn-text');
    const btnLoader = document.querySelector('.btn-loader');
    const progressContainer = document.getElementById('progress-container');
    const progressText = document.getElementById('progress-text');
    const progressFill = document.getElementById('progress-fill');
    const statusEl = document.getElementById('status');
    const resultDiv = document.getElementById('result');
    const downloadLink = document.getElementById('download-link');
    const newFileBtn = document.getElementById('new-file');
    const fileInfo = document.getElementById('file-info');
    const fileNameEl = document.getElementById('file-name');
    const fileSizeEl = document.getElementById('file-size');

    let mp3Encoder;

    function updateProgress(percent, text = '') {
        progressFill.style.width = `${percent}%`;
        progressText.textContent = text || `${percent}%`;
    }

    function showLoader() {
        btnText.style.display = 'none';
        btnLoader.style.display = 'block';
    }
    function hideLoader() {
        btnText.style.display = 'block';
        btnLoader.style.display = 'none';
    }

    function initLame() {
        if (typeof lamejs === 'undefined') {
            statusEl.textContent = 'Error: MP3 encoder failed to load.';
            statusEl.style.color = '#e74c3c';
            resultDiv.style.display = 'block';
            return false;
        }
        return true;
    }
    if (!initLame()) return;

    // Drag & Drop
    ['dragover', 'dragenter'].forEach(evt => {
        uploadArea.addEventListener(evt, e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    });
    ['dragleave', 'dragend', 'drop'].forEach(evt => {
        uploadArea.addEventListener(evt, e => { e.preventDefault(); uploadArea.classList.remove('dragover'); });
    });
    uploadArea.addEventListener('drop', e => {
        const files = e.dataTransfer.files;
        if (files.length > 0) { fileInput.files = files; showFileInfo(files[0]); }
    });
    uploadArea.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });

    // Show File Info + Estimated Time
    function showFileInfo(file) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        let estimate = '';
        if (sizeMB < 10) estimate = 'Fast';
        else if (sizeMB < 50) estimate = `~${Math.round(sizeMB / 2)} sec`;
        else estimate = `~${Math.round(sizeMB / 2.5)} sec`;

        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = `(${sizeMB} MB – ${estimate})`;
        fileInfo.style.display = 'flex';
        convertButton.disabled = false;
        convertButton.focus();
    }

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) showFileInfo(fileInput.files[0]);
    });

    // Format Duration
    function formatDuration(seconds) {
        if (seconds < 60) return `${seconds} sec`;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return h > 0 ? `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`
                     : `${m}:${s.toString().padStart(2,'0')}`;
    }

    // Convert
    async function convertToAudio() {
        const file = fileInput.files[0];
        if (!file) return alert('Please select a video file.');

        const format = formatSelect.value;
        const quality = parseInt(qualitySelect.value);
        const ext = format === 'wav' ? 'wav' : 'mp3';
        const filename = file.name.replace(/\.[^/.]+$/, '') + '.' + ext;

        convertButton.disabled = true;
        showLoader();
        progressContainer.style.display = 'block';
        resultDiv.style.display = 'none';
        fileInfo.style.display = 'none';
        updateProgress(0, 'Reading file...');

        try {
            const arrayBuffer = await file.arrayBuffer();
            updateProgress(15, 'Extracting audio...');

            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            updateProgress(40, 'Processing data...');

            const channelData = audioBuffer.getChannelData(0);
            const sampleRate = audioBuffer.sampleRate;
            const duration = Math.floor(audioBuffer.duration);

            let blob;
            if (format === 'mp3') {
                mp3Encoder = new lamejs.Mp3Encoder(1, sampleRate, quality);
                const pcmData = new Int16Array(channelData.length);
                for (let i = 0; i < channelData.length; i++) {
                    pcmData[i] = Math.max(-1, Math.min(1, channelData[i])) * 0x7FFF;
                }

                const mp3Data = [];
                const blockSize = 1152;
                for (let i = 0; i < pcmData.length; i += blockSize) {
                    const chunk = pcmData.subarray(i, i + blockSize);
                    const buf = mp3Encoder.encodeBuffer(chunk);
                    if (buf.length > 0) mp3Data.push(buf);
                    const progress = 40 + Math.floor((i / pcmData.length) * 50);
                    updateProgress(progress, 'Encoding MP3...');
                }
                const finalBuf = mp3Encoder.flush();
                if (finalBuf.length > 0) mp3Data.push(finalBuf);
                blob = new Blob(mp3Data, { type: 'audio/mp3' });
            } else {
                updateProgress(70, 'Creating WAV...');
                const wavBuffer = createWavFile(channelData, sampleRate);
                blob = new Blob([wavBuffer], { type: 'audio/wav' });
            }

            updateProgress(100, 'Done!');

            const url = URL.createObjectURL(blob);
            downloadLink.href = url;
            downloadLink.download = filename;
            statusEl.innerHTML = `Conversion complete!<br>
                                 Duration: <strong>${formatDuration(duration)}</strong> | 
                                 Size: <strong>${(blob.size / 1024 / 1024).toFixed(1)} MB</strong>`;
            statusEl.style.color = '#27ae60';
            resultDiv.style.display = 'block';

        } catch (error) {
            console.error(error);
            statusEl.textContent = 'Error: Invalid file or no audio track.';
            statusEl.style.color = '#e74c3c';
            resultDiv.style.display = 'block';
        } finally {
            hideLoader();
            convertButton.disabled = false;
            setTimeout(() => { progressContainer.style.display = 'none'; }, 1500);
        }
    }

    function createWavFile(channelData, sampleRate) {
        const buffer = new ArrayBuffer(44 + channelData.length * 2);
        const view = new DataView(buffer);
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + channelData.length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, channelData.length * 2, true);

        let offset = 44;
        for (let i = 0; i < channelData.length; i++) {
            view.setInt16(offset, channelData[i] * 0x7FFF, true);
            offset += 2;
        }
        return buffer;
    }

    // Events
    convertButton.addEventListener('click', convertToAudio);
    newFileBtn.addEventListener('click', () => location.reload());
});