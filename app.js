;

// --- KONFIGURASI ---
const SUPABASE_URL = 'https://sbxtfqidotarniglzban.supabase.co'; // <--- ISI INI
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNieHRmcWlkb3Rhcm5pZ2x6YmFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMjgxODQsImV4cCI6MjA4MzgwNDE4NH0.MCiWNCcmQRBmAvAbsbcpdMbSOWAg7zPqJynpCLf1RKQ';                     // <--- ISI INI

// Tunggu HTML selesai dimuat baru jalankan script
document.addEventListener('DOMContentLoaded', () => {
    console.log("Aplikasi Siap & Modular");

    // --- 1. INISIALISASI SUPABASE ---
    let supabase = null;
    try {
        if (window.supabase) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        } else {
            console.error("Library Supabase gagal dimuat");
        }
    } catch (e) { console.error(e); }

    // --- 2. SELECTOR ELEMENT (Satu tempat biar rapi) ---
    const els = {
        video: document.getElementById('video'),
        canvas: document.getElementById('canvas'),
        fileInput: document.getElementById('file-input'),
        loader: document.getElementById('loader'),
        views: document.querySelectorAll('.view'),
        btnHome: document.getElementById('btn-home'),
        inputs: {
            name: document.getElementById('doc-name'),
            cat: document.getElementById('doc-category')
        }
    };
    
    const ctx = els.canvas.getContext('2d', { willReadFrequently: true });
    let stream = null;
    let originalData = null;

    // --- 3. FUNGSI NAVIGASI ---
    function navigateTo(viewId) {
        // Hide all views
        els.views.forEach(v => v.classList.remove('active'));
        // Show target
        document.getElementById(viewId).classList.add('active');
        
        // Atur tombol Home di header
        if (viewId === 'home-view') {
            els.btnHome.classList.add('hidden');
            stopCamera(); // Hemat baterai
        } else {
            els.btnHome.classList.remove('hidden');
        }
    }

    // --- 4. FUNGSI KAMERA ---
    async function startCamera() {
        try {
            navigateTo('camera-view');
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            els.video.srcObject = stream;
        } catch (err) {
            alert("Gagal kamera: " + err.message);
            // Fallback webcam
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                els.video.srcObject = stream;
            } catch (e) { navigateTo('home-view'); }
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
    }

    // --- 5. EVENT LISTENERS (Menghubungkan Tombol) ---
    
    // A. Navigasi Home
    document.getElementById('nav-camera').addEventListener('click', startCamera);
    els.btnHome.addEventListener('click', () => navigateTo('home-view'));
    document.getElementById('nav-cancel-cam').addEventListener('click', () => navigateTo('home-view'));
    document.getElementById('nav-cancel-edit').addEventListener('click', () => navigateTo('home-view'));

    // B. Upload File
    document.getElementById('nav-upload').addEventListener('click', () => els.fileInput.click());
    
    els.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                els.canvas.width = img.width;
                els.canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                originalData = ctx.getImageData(0, 0, els.canvas.width, els.canvas.height);
                navigateTo('editor-view');
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    // C. Capture Foto
    document.getElementById('btn-capture').addEventListener('click', () => {
        if (els.video.readyState === 4 || els.video.readyState === 3) { // Cek jika video siap
            els.canvas.width = els.video.videoWidth;
            els.canvas.height = els.video.videoHeight;
            ctx.drawImage(els.video, 0, 0);
            originalData = ctx.getImageData(0, 0, els.canvas.width, els.canvas.height);
            stopCamera();
            navigateTo('editor-view');
        } else {
            alert("Kamera belum siap sepenuhnya.");
        }
    });

    // D. Filter (Menggunakan Event Delegation agar lebih efisien)
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.dataset.filter; // Ambil dari data-filter="..."
            if (!originalData) return;
            
            ctx.putImageData(originalData, 0, 0); // Reset

            if (type === 'magic') {
                createImageBitmap(originalData).then(bmp => {
                    ctx.save();
                    ctx.filter = 'contrast(1.4) brightness(1.1) saturate(1.2)';
                    ctx.drawImage(bmp, 0, 0);
                    ctx.restore();
                });
            } else if (type === 'bw') {
                const d = ctx.getImageData(0, 0, els.canvas.width, els.canvas.height);
                for (let i = 0; i < d.data.length; i += 4) {
                    const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
                    const v = g < 128 ? 0 : 255;
                    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
                }
                ctx.putImageData(d, 0, 0);
            }
        });
    });

    // E. Simpan ke Supabase
    document.getElementById('btn-save').addEventListener('click', async () => {
        const name = els.inputs.name.value;
        if (!name) return alert("Isi nama dokumen!");

        els.loader.classList.remove('hidden');

        els.canvas.toBlob(async (blob) => {
            try {
                const fileName = Date.now() + '.jpg';
                
                // 1. Upload
                const { error: upErr } = await supabase.storage.from('scans').upload(fileName, blob);
                if (upErr) throw upErr;

                // 2. Get URL
                const { data } = supabase.storage.from('scans').getPublicUrl(fileName);

                // 3. Insert DB
                const { error: dbErr } = await supabase.from('documents').insert([{
                    name: name,
                    category: els.inputs.cat.value,
                    image_url: data.publicUrl
                }]);
                if (dbErr) throw dbErr;

                alert("Tersimpan! ✅");
                navigateTo('home-view');
                els.inputs.name.value = ""; // Reset form

            } catch (err) {
                alert("Gagal: " + err.message);
            } finally {
                els.loader.classList.add('hidden');
            }
        }, 'image/jpeg', 0.8);
    });

});
