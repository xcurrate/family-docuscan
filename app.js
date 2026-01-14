// --- KONFIGURASI SUPABASE ---
// GANTI DENGAN DATA PROYEK ANDA YANG SEBENARNYA!
const SUPABASE_URL = 'https://sbxtfqidotarniglzban.supabase.co'; // <--- ISI INI
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNieHRmcWlkb3Rhcm5pZ2x6YmFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMjgxODQsImV4cCI6MjA4MzgwNDE4NH0.MCiWNCcmQRBmAvAbsbcpdMbSOWAg7zPqJynpCLf1RKQ';      

// --- INISIALISASI ---
let supabase = null;
let cropper = null; // Variabel global untuk instance CropperJS

document.addEventListener('DOMContentLoaded', () => {
    // Cek Library
    if (!window.supabase || !window.Cropper || !window.jspdf) {
        alert("Gagal memuat library pendukung. Cek koneksi internet.");
        return;
    }
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("System Ready v3.0");
    } catch (e) { console.error("Supabase Init Error:", e); }

    // --- SELECTOR ELEMENT ---
    const els = {
        // Views & Nav
        views: document.querySelectorAll('.view'),
        btnHome: document.getElementById('btn-home'),
        // Camera
        video: document.getElementById('video'),
        // Editor Core
        canvas: document.getElementById('canvas'),
        imgForCropper: document.getElementById('image-for-cropper'), // Image tersembunyi untuk cropper
        // Editor Tools (Crop)
        btnStartCrop: document.getElementById('btn-start-crop'),
        cropActions: document.getElementById('crop-actions'),
        btnApplyCrop: document.getElementById('btn-apply-crop'),
        btnCancelCrop: document.getElementById('btn-cancel-crop'),
        // Editor Controls
        filterBtns: document.querySelectorAll('.tab-btn'),
        inputs: { name: document.getElementById('doc-name'), cat: document.getElementById('doc-category') },
        compression: document.getElementById('compression-level'),
        // Actions
        btnDownloadJpg: document.getElementById('btn-download-jpg'),
        btnDownloadPdf: document.getElementById('btn-download-pdf'),
        btnSaveCloud: document.getElementById('btn-save-cloud'),
        // Utils
        fileInput: document.getElementById('file-input'),
        loader: document.getElementById('loader'),
        loaderText: document.getElementById('loader-text')
    };

    const ctx = els.canvas.getContext('2d', { willReadFrequently: true });
    let stream = null;
    let originalData = null; // Menyimpan data pixel asli (sebelum filter, setelah crop)

    // --- FUNGSI UTILITAS ---
    function showLoader(text = "Memproses...") {
        els.loaderText.innerText = text;
        els.loader.classList.remove('hidden');
    }
    function hideLoader() { els.loader.classList.add('hidden'); }

    function navigateTo(viewId) {
        els.views.forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        
        if (viewId === 'home-view') {
            els.btnHome.classList.add('hidden');
            stopCamera();
            resetEditorState();
        } else {
            els.btnHome.classList.remove('hidden');
            els.btnHome.onclick = () => navigateTo('home-view');
        }
    }

    // Reset state editor saat keluar
    function resetEditorState() {
        if (cropper) { cropper.destroy(); cropper = null; }
        els.imgForCropper.classList.add('hidden');
        els.canvas.classList.remove('hidden');
        els.btnStartCrop.classList.remove('hidden');
        els.cropActions.classList.add('hidden');
        setActiveFilterTab('original');
    }

    function setActiveFilterTab(filterType) {
        els.filterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filterType);
        });
    }

    // --- 1. KAMERA & INPUT ---
    async function startCamera() {
        try {
            navigateTo('camera-view');
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            els.video.srcObject = stream;
        } catch (err) {
            alert("Gagal akses kamera belakang. Mencoba kamera depan.");
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                els.video.srcObject = stream;
            } catch (e) { 
                alert("Kamera tidak dapat diakses."); 
                navigateTo('home-view'); 
            }
        }
    }

    function stopCamera() {
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    }

    // Handler: Capture dari Kamera
    document.getElementById('btn-capture').addEventListener('click', () => {
        if (els.video.readyState < 2) return;
        // Set ukuran canvas sesuai resolusi video
        els.canvas.width = els.video.videoWidth;
        els.canvas.height = els.video.videoHeight;
        // Gambar frame video ke canvas
        ctx.drawImage(els.video, 0, 0);
        loadImageToEditor(); // Proses lanjut ke editor
        stopCamera();
    });

    // Handler: Upload File
    els.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        showLoader("Membuka file...");
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                els.canvas.width = img.width;
                els.canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                loadImageToEditor();
                hideLoader();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    // Fungsi Pusat Masuk Editor
    function loadImageToEditor() {
        // Simpan data asli untuk keperluan reset filter
        originalData = ctx.getImageData(0, 0, els.canvas.width, els.canvas.height);
        resetEditorState(); // Pastikan mode crop mati dulu
        navigateTo('editor-view');
    }


    // --- 2. FITUR CROP (CROPPER.JS) ---
    els.btnStartCrop.addEventListener('click', () => {
        // 1. Sembunyikan canvas, tampilkan image hidden
        els.canvas.classList.add('hidden');
        els.imgForCropper.classList.remove('hidden');
        
        // 2. Isi image hidden dengan data dari canvas saat ini
        els.imgForCropper.src = els.canvas.toDataURL('image/jpeg');
        
        // 3. Inisialisasi CropperJS pada image tersebut
        if (cropper) cropper.destroy();
        cropper = new Cropper(els.imgForCropper, {
            viewMode: 1, // Membatasi crop box agar tidak keluar area gambar
            dragMode: 'move', // Bisa geser gambar
            autoCropArea: 0.8,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
        });

        // 4. Update UI Toolbar
        els.btnStartCrop.classList.add('hidden');
        els.cropActions.classList.remove('hidden');
    });

    els.btnCancelCrop.addEventListener('click', () => {
        resetEditorState(); // Batalkan mode crop, kembali ke canvas awal
    });

    els.btnApplyCrop.addEventListener('click', () => {
        if (!cropper) return;
        showLoader("Memotong gambar...");
        
        // 1. Dapatkan hasil crop sebagai canvas dari CropperJS
        const croppedCanvas = cropper.getCroppedCanvas({
             // Opsi tambahan jika ingin membatasi ukuran maksimal hasil crop
             // maxWidth: 2048, maxHeight: 2048 
        });
        
        // 2. Update canvas utama kita dengan hasil crop
        els.canvas.width = croppedCanvas.width;
        els.canvas.height = croppedCanvas.height;
        ctx.drawImage(croppedCanvas, 0, 0);
        
        // 3. Update data asli (agar filter diterapkan pada gambar yang sudah dicrop)
        originalData = ctx.getImageData(0, 0, els.canvas.width, els.canvas.height);
        
        // 4. Kembali ke mode normal
        resetEditorState();
        hideLoader();
    });


    // --- 3. FITUR FILTER ---
    els.filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.dataset.filter;
            if (!originalData) return;
            
            showLoader("Menerapkan filter...");
            // Gunakan setTimeout agar UI loader sempat muncul sebelum proses berat
            setTimeout(() => {
                // Reset ke data asli (yang mungkin sudah dicrop)
                ctx.putImageData(originalData, 0, 0);
                setActiveFilterTab(type);

                if (type === 'magic') {
                    // Filter CSS pada Context (Lebih cepat di HP modern)
                    createImageBitmap(originalData).then(bmp => {
                        ctx.save();
                        ctx.filter = 'contrast(1.4) brightness(1.1) saturate(1.2)';
                        ctx.drawImage(bmp, 0, 0);
                        ctx.restore();
                        hideLoader();
                    });
                } else if (type === 'bw') {
                    // Manipulasi Pixel Manual (Thresholding)
                    const d = ctx.getImageData(0, 0, els.canvas.width, els.canvas.height);
                    const data = d.data;
                    for (let i = 0; i < data.length; i += 4) {
                        // Rumus Luma Grayscale
                        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                        // Threshold di 128
                        const v = gray < 128 ? 0 : 255;
                        data[i] = data[i + 1] = data[i + 2] = v; // Set RGB jadi hitam/putih
                    }
                    ctx.putImageData(d, 0, 0);
                    hideLoader();
                } else {
                    hideLoader(); // Original
                }
            }, 50);
        });
    });


    // --- 4. FITUR SIMPAN & UNDUH (Advanced) ---

    // Helper: Mendapatkan nama file yang aman
    function getSafeFilename(ext) {
        const name = els.inputs.name.value || 'Dokumen';
        const safeName = name.replace(/[^a-zA-Z0-9]/g, '_'); // Hapus karakter aneh
        return `DocuScan_${safeName}_${Date.now()}.${ext}`;
    }

    // Helper: Mendapatkan level kompresi
    function getCompression() {
        return parseFloat(els.compression.value) || 0.8;
    }

    // A. UNDUH JPG LOKAL
    els.btnDownloadJpg.addEventListener('click', () => {
        const quality = getCompression();
        // Convert canvas to data URL dengan kualitas tertentu
        const dataURL = els.canvas.toDataURL('image/jpeg', quality);
        
        // Buat link sementara untuk trigger download
        const link = document.createElement('a');
        link.download = getSafeFilename('jpg');
        link.href = dataURL;
        link.click();
    });

    // B. UNDUH SEBAGAI PDF (Menggunakan jsPDF)
    els.btnDownloadPdf.addEventListener('click', () => {
        showLoader("Membuat PDF...");
        const quality = getCompression();
        const imgData = els.canvas.toDataURL('image/jpeg', quality);

        // Inisialisasi jsPDF (Orientasi Portrait, Satuan mm, Ukuran A4)
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        // Dimensi A4 dalam mm
        const pdfWidth = 210;
        const pdfHeight = 297;
        
        // Hitung rasio aspek gambar agar pas di A4
        const imgProps = pdf.getImageProperties(imgData);
        const ratio = imgProps.width / imgProps.height;
        let renderedWidth = pdfWidth - 20; // Margin kiri kanan 10mm
        let renderedHeight = renderedWidth / ratio;

        // Jika tinggi melebihi satu halaman, sesuaikan berdasarkan tinggi
        if (renderedHeight > pdfHeight - 20) {
            renderedHeight = pdfHeight - 20; // Margin atas bawah 10mm
            renderedWidth = renderedHeight * ratio;
        }

        // Posisi tengah
        const x = (pdfWidth - renderedWidth) / 2;
        const y = (pdfHeight - renderedHeight) / 2;

        // Tambahkan gambar ke PDF
        pdf.addImage(imgData, 'JPEG', x, y, renderedWidth, renderedHeight);
        
        // Simpan PDF
        pdf.save(getSafeFilename('pdf'));
        hideLoader();
    });

    // C. SIMPAN KE CLOUD (Supabase)
    els.btnSaveCloud.addEventListener('click', async () => {
        const name = els.inputs.name.value;
        if (!name) return alert("Mohon isi nama dokumen terlebih dahulu.");

        showLoader("Mengunggah ke Cloud...");
        const quality = getCompression();

        // Konversi Canvas ke Blob (File object di memori)
        els.canvas.toBlob(async (blob) => {
            try {
                const fileName = getSafeFilename('jpg');
                
                // 1. Upload ke Supabase Storage bucket 'scans'
                const { error: uploadErr } = await supabase.storage
                    .from('scans').upload(fileName, blob, { contentType: 'image/jpeg' });
                if (uploadErr) throw uploadErr;

                // 2. Dapatkan URL Publik
                const { data: urlData } = supabase.storage
                    .from('scans').getPublicUrl(fileName);

                // 3. Simpan Metadata ke Tabel 'documents'
                const { error: dbErr } = await supabase.from('documents').insert([{
                    name: name,
                    category: els.inputs.cat.value,
                    image_url: urlData.publicUrl
                }]);
                if (dbErr) throw dbErr;

                alert("Berhasil tersimpan di database! ✅");
                navigateTo('home-view');
                els.inputs.name.value = ""; // Reset form

            } catch (err) {
                console.error(err);
                alert("Gagal menyimpan: " + (err.message || "Periksa koneksi/konfigurasi"));
            } finally {
                hideLoader();
            }
        }, 'image/jpeg', quality);
    });

    // --- Event Listeners Navigasi Home ---
    document.getElementById('nav-camera').addEventListener('click', startCamera);
    document.getElementById('nav-upload').addEventListener('click', () => els.fileInput.click());
    document.getElementById('nav-about').addEventListener('click', () => navigateTo('about-view'));
    document.getElementById('nav-cancel-cam').addEventListener('click', () => navigateTo('home-view'));
});
