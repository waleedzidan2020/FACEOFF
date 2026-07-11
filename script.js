const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const genderResult = document.getElementById('genderResult');
const confidenceResult = document.getElementById('confidenceResult');
const ageResult = document.getElementById('ageResult');

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
let stream = null;
let detectionTimer = null;
let modelsReady = false;

function setStatus(message) {
  statusEl.textContent = message;
}

function translatePresentation(value) {
  if (value === 'male') return 'مظهر ذكوري غالبًا';
  if (value === 'female') return 'مظهر أنثوي غالبًا';
  return 'غير واضح';
}

function getReadableCameraError(error) {
  const name = error?.name || 'UnknownError';

  const messages = {
    NotAllowedError: 'تم رفض إذن الكاميرا. اضغط على علامة القفل بجانب الرابط واسمح للكاميرا ثم اعمل Refresh.',
    PermissionDeniedError: 'تم رفض إذن الكاميرا. اضغط على علامة القفل بجانب الرابط واسمح للكاميرا ثم اعمل Refresh.',
    NotFoundError: 'لم يتم العثور على كاميرا متصلة بالجهاز.',
    DevicesNotFoundError: 'لم يتم العثور على كاميرا متصلة بالجهاز.',
    NotReadableError: 'الكاميرا مستخدمة في برنامج آخر مثل Zoom أو OBS أو تطبيق الكاميرا. اقفل البرامج وجرب تاني.',
    TrackStartError: 'الكاميرا مستخدمة في برنامج آخر أو الويندوز مانع الوصول لها.',
    OverconstrainedError: 'إعدادات الكاميرا المطلوبة غير مناسبة لجهازك. جرب متصفح Chrome أو Edge.',
    SecurityError: 'المتصفح منع الكاميرا. افتح الموقع من HTTPS وليس HTTP.',
    TypeError: 'المتصفح لا يسمح بالكاميرا هنا. تأكد أنك فاتح رابط GitHub Pages بـ HTTPS.'
  };

  return messages[name] || `تعذر تشغيل الكاميرا. نوع الخطأ: ${name}`;
}

async function loadModels() {
  if (modelsReady) return;
  setStatus('جاري تحميل نماذج الذكاء الاصطناعي...');

  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL)
    ]);

    modelsReady = true;
    setStatus('تم تحميل النماذج. شغّل الكاميرا.');
  } catch (error) {
    console.error('Model loading error:', error);
    throw new Error('فشل تحميل نماذج الذكاء الاصطناعي. تأكد من اتصال الإنترنت ثم اعمل Refresh.');
  }
}

async function requestCamera() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: false
    });
  } catch (error) {
    if (error?.name === 'OverconstrainedError') {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    throw error;
  }
}

async function startCamera() {
  try {
    if (!window.isSecureContext) {
      setStatus('لازم تفتح الموقع من HTTPS عشان الكاميرا تشتغل.');
      return;
    }

    startBtn.disabled = true;
    setStatus('جاري تجهيز الكاميرا...');

    await loadModels();
    stream = await requestCamera();

    video.srcObject = stream;
    stopBtn.disabled = false;
    setStatus('الكاميرا تعمل الآن...');

    video.addEventListener('loadedmetadata', startDetection, { once: true });
  } catch (error) {
    console.error('Camera error:', error);
    startBtn.disabled = false;
    stopBtn.disabled = true;

    if (error.message?.includes('فشل تحميل نماذج')) {
      setStatus(error.message);
    } else {
      setStatus(getReadableCameraError(error));
    }
  }
}

function stopCamera() {
  if (detectionTimer) {
    clearInterval(detectionTimer);
    detectionTimer = null;
  }

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  video.srcObject = null;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  genderResult.textContent = '—';
  confidenceResult.textContent = '—';
  ageResult.textContent = '—';
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus('تم إيقاف الكاميرا');
}

function resizeCanvasToVideo() {
  const displaySize = {
    width: video.clientWidth,
    height: video.clientHeight
  };

  faceapi.matchDimensions(canvas, displaySize);
  return displaySize;
}

async function detectFace() {
  if (!video.srcObject || video.readyState < 2) return;

  const displaySize = resizeCanvasToVideo();
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({
      inputSize: 416,
      scoreThreshold: 0.45
    }))
    .withAgeAndGender();

  if (!detection) {
    genderResult.textContent = 'لم يتم رصد وجه';
    confidenceResult.textContent = '—';
    ageResult.textContent = '—';
    return;
  }

  const resized = faceapi.resizeResults(detection, displaySize);
  const box = resized.detection.box;

  const drawBox = new faceapi.draw.DrawBox(box, {
    label: `${translatePresentation(detection.gender)} | ${Math.round(detection.genderProbability * 100)}%`
  });
  drawBox.draw(canvas);

  genderResult.textContent = translatePresentation(detection.gender);
  confidenceResult.textContent = `${Math.round(detection.genderProbability * 100)}%`;
  ageResult.textContent = `${Math.round(detection.age)} سنة تقريبًا`;
}

function startDetection() {
  resizeCanvasToVideo();
  detectionTimer = setInterval(detectFace, 350);
}

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);

window.addEventListener('beforeunload', stopCamera);
window.addEventListener('resize', () => {
  if (video.srcObject) resizeCanvasToVideo();
});

if (!navigator.mediaDevices?.getUserMedia) {
  startBtn.disabled = true;
  setStatus('المتصفح لا يدعم فتح الكاميرا. استخدم Chrome أو Edge حديث.');
} else if (!window.isSecureContext) {
  startBtn.disabled = true;
  setStatus('افتح الموقع من HTTPS عشان الكاميرا تشتغل.');
} else {
  setStatus('اضغط تشغيل الكاميرا للبدء');
}
