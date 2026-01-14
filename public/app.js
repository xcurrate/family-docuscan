// --- KONFIGURASI SUPABASE ---
// Sebaiknya gunakan Environment Variables di Vercel, tapi untuk Client-Side Vanilla JS
// kita perlu inject variable ini saat build atau hardcode untuk prototyping.
// Ganti dengan URL & Key project Anda.
const SUPABASE_URL = 'https://sbxtfqidotarniglzban.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNieHRmcWlkb3Rhcm5pZ2x6YmFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMjgxODQsImV4cCI6MjA4MzgwNDE4NH0.MCiWNCcmQRBmAvAbsbcpdMbSOWAg7zPqJynpCLf1RKQ';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- DOM ELEMENTS ---
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const cameraView = document.getElementById('camera-view');
const editorView = document.getElementById('editor-view');
const loader = document.getElementById('loader');

// State
let originalImageData = null; // Menyimpan raw pixels asli

// --- 1. KAMERA SETUP ---
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment', // Kamera belakang
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        });
        video.srcObject = stream;
    } catch (err) {
        alert("Gagal akses kamera: " + err.message);
    }
}

// --- 2. CAPTURE & LOGIKA EDITOR ---
document.getElementById('btn-capture').addEventListener('click', () => {
    // Set ukuran canvas sesuai resolusi video asli
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Gambar frame video ke canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Simpan data asli untuk fitur "Undo" filter
    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Switch UI
    toggleView(true);
});

document.getElementById('btn-retake').addEventListener('click', () => {
    toggleView(false);
});

function toggleView(isEditing) {
    if (isEditing) {
        cameraView.classList.add('hidden');
        editorView.classList.remove('hidden');
    } else {
        cameraView.classList.remove('hidden');
        editorView.classList.add('hidden');
        // Reset canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// --- 3. FILTER LOGIC (INTI IMAGE PROCESSING) ---
window.applyFilter = (type) => {
    if (!originalImageData) return;

    // Reset ke gambar asli dulu sebelum filter baru
    ctx.putImageData(originalImageData, 0, 0);

    if (type === 'original') {
        // Sudah di-reset di atas
        return;
    }

    if (type === 'magic') {
        // MAGIC COLOR: Gunakan CSS Filter API di Canvas context
        // Simpan gambar saat ini ke temp image untuk di-draw ulang dengan filter
        createImageBitmap(originalImageData).then(imgBitmap => {
            ctx.save();
            ctx.filter = 'contrast(150%) brightness(110%) saturate(120%)';
            ctx.drawImage(imgBitmap, 0, 0);
            ctx.restore();
        });
    }

    if (type === 'bw') {
        // SUPER B&W: Manipulasi Pixel (Thresholding)
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data; // Array [R, G, B, A, R, G, B, A, ...]

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // 1. Ubah ke Grayscale (Luma method)
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // 2. Thresholding
            // Jika gelap (<128) jadi hitam pekat (0), jika terang jadi putih (255)
            const binary = gray < 128 ? 0 : 255;

            data[i] = binary;     // R
            data[i + 1] = binary; // G
            data[i + 2] = binary; // B
            // Alpha (data[i+3]) tetap 255
        }
        ctx.putImageData(imgData, 0, 0);
    }
};

// --- 4. UPLOAD KE SUPABASE ---
document.getElementById('btn-save').addEventListener('click', async () => {
    const name = document.getElementById('doc-name').value;
    const category = document.getElementById('doc-category').value;

    if (!name) return alert("Isi nama dokumen dulu!");

    loader.classList.remove('hidden');

    // 1. Convert Canvas ke Blob (JPG)
    canvas.toBlob(async (blob) => {
        const fileName = `${Date.now()}_${name.replace(/\s+/g, '-')}.jpg`;

        try {
            // 2. Upload ke Storage Bucket 'scans'
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('scans')
                .upload(fileName, blob, {
                    contentType: 'image/jpeg'
                });

            if (uploadError) throw uploadError;

            // 3. Dapatkan Public URL
            const { data: { publicUrl } } = supabase
                .storage
                .from('scans')
                .getPublicUrl(fileName);

            // 4. Simpan Metadata ke Database Table 'documents'
            const { error: dbError } = await supabase
                .from('documents')
                .insert([
                    { name: name, category: category, image_url: publicUrl }
                ]);

            if (dbError) throw dbError;

            alert("Berhasil disimpan!");
            location.reload(); // Reset aplikasi

        } catch (err) {
            console.error(err);
            alert("Gagal menyimpan: " + err.message);
            loader.classList.add('hidden');
        }
    }, 'image/jpeg', 0.8); // Quality 0.8
});

// Start App
startCamera();
